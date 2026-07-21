-- DesignArc — database-level business rules that Prisma's schema language
-- cannot express. Apply AFTER the baseline Prisma migration:
--
--   psql "$DATABASE_URL" -f prisma/constraints.sql
--
-- Each constraint here exists so that a rule the business calls critical cannot
-- be broken even by a bug in application code. Defence in depth: the service
-- layer checks these too, but the database is the last line.

-- ---------------------------------------------------------------------------
-- BR-3 / FR-6.1 — no price exists on a stage before Supervisor approval.
-- accepted_price may only be non-null once the worker has accepted.
-- ---------------------------------------------------------------------------
ALTER TABLE "stage"
  DROP CONSTRAINT IF EXISTS stage_accepted_price_requires_acceptance;
ALTER TABLE "stage"
  ADD CONSTRAINT stage_accepted_price_requires_acceptance
  CHECK (
    ("accepted_price" IS NULL AND "status" NOT IN ('PRICE_ACCEPTED', 'COMPLETED'))
    OR
    ("accepted_price" IS NOT NULL AND "status" IN ('PRICE_ACCEPTED', 'COMPLETED'))
  );

-- Money is always a positive integer in minor units (LKR cents).
ALTER TABLE "stage"
  DROP CONSTRAINT IF EXISTS stage_accepted_price_positive;
ALTER TABLE "stage"
  ADD CONSTRAINT stage_accepted_price_positive
  CHECK ("accepted_price" IS NULL OR "accepted_price" > 0);

-- A rejection must carry a reason (FR-5.5).
ALTER TABLE "stage"
  DROP CONSTRAINT IF EXISTS stage_rejection_requires_reason;
ALTER TABLE "stage"
  ADD CONSTRAINT stage_rejection_requires_reason
  CHECK ("status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);

-- Carpentry is always sequence 1, painting always sequence 2 — the sequence gate
-- (BR-3.2) depends on this ordering being trustworthy.
ALTER TABLE "stage"
  DROP CONSTRAINT IF EXISTS stage_type_sequence_agreement;
ALTER TABLE "stage"
  ADD CONSTRAINT stage_type_sequence_agreement
  CHECK (
    ("type" = 'CARPENTRY' AND "sequence_no" = 1)
    OR ("type" = 'PAINTING' AND "sequence_no" = 2)
  );

-- ---------------------------------------------------------------------------
-- BR-9 / FR-6.6 — pricing_history is append-only.
-- A PROPOSED/REVISED row must carry an amount; a DECLINED row must not.
-- ---------------------------------------------------------------------------
ALTER TABLE "pricing_history"
  DROP CONSTRAINT IF EXISTS pricing_history_value_matches_action;
ALTER TABLE "pricing_history"
  ADD CONSTRAINT pricing_history_value_matches_action
  CHECK (
    ("action" IN ('PROPOSED', 'REVISED', 'ACCEPTED') AND "value" IS NOT NULL AND "value" > 0)
    OR
    ("action" = 'DECLINED' AND "value" IS NULL)
  );

-- Block UPDATE and DELETE outright. A rule that raises makes the ledger
-- tamper-evident even against a compromised application account.
CREATE OR REPLACE FUNCTION pricing_history_is_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'pricing_history is append-only: % is not permitted (BR-9)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pricing_history_no_update ON "pricing_history";
CREATE TRIGGER pricing_history_no_update
  BEFORE UPDATE ON "pricing_history"
  FOR EACH ROW EXECUTE FUNCTION pricing_history_is_append_only();

DROP TRIGGER IF EXISTS pricing_history_no_delete ON "pricing_history";
CREATE TRIGGER pricing_history_no_delete
  BEFORE DELETE ON "pricing_history"
  FOR EACH ROW EXECUTE FUNCTION pricing_history_is_append_only();

-- ---------------------------------------------------------------------------
-- BR-8 / FR-8.4 — an earning may exist only for a stage whose price the worker
-- has accepted. The unique constraint on stage_id (in schema.prisma) already
-- guarantees one earning per stage; this guarantees it is never premature.
-- ---------------------------------------------------------------------------
ALTER TABLE "earning"
  DROP CONSTRAINT IF EXISTS earning_amount_positive;
ALTER TABLE "earning"
  ADD CONSTRAINT earning_amount_positive CHECK ("amount" > 0);

-- Paid status and paid metadata must agree (FR-8.3).
ALTER TABLE "earning"
  DROP CONSTRAINT IF EXISTS earning_paid_metadata_agreement;
ALTER TABLE "earning"
  ADD CONSTRAINT earning_paid_metadata_agreement
  CHECK (
    ("status" = 'UNPAID' AND "paid_date" IS NULL AND "paid_by" IS NULL)
    OR
    ("status" = 'PAID' AND "paid_date" IS NOT NULL AND "paid_by" IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION earning_requires_completed_stage()
RETURNS TRIGGER AS $$
DECLARE
  stage_status TEXT;
  stage_price  BIGINT;
BEGIN
  SELECT "status"::TEXT, "accepted_price"
    INTO stage_status, stage_price
    FROM "stage" WHERE "id" = NEW."stage_id";

  IF stage_status NOT IN ('PRICE_ACCEPTED', 'COMPLETED') THEN
    RAISE EXCEPTION
      'earning cannot be created for stage % in status % (BR-8)', NEW."stage_id", stage_status
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF stage_price IS DISTINCT FROM NEW."amount" THEN
    RAISE EXCEPTION
      'earning amount % must equal the accepted stage price % (BR-6.4)', NEW."amount", stage_price
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS earning_guard ON "earning";
CREATE TRIGGER earning_guard
  BEFORE INSERT ON "earning"
  FOR EACH ROW EXECUTE FUNCTION earning_requires_completed_stage();

-- The amount is immutable once written; only payment status may change.
CREATE OR REPLACE FUNCTION earning_amount_is_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."stage_id" IS DISTINCT FROM OLD."stage_id"
     OR NEW."worker_id" IS DISTINCT FROM OLD."worker_id" THEN
    RAISE EXCEPTION 'earning amount/stage/worker are immutable once recorded'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS earning_immutable ON "earning";
CREATE TRIGGER earning_immutable
  BEFORE UPDATE ON "earning"
  FOR EACH ROW EXECUTE FUNCTION earning_amount_is_immutable();

-- ---------------------------------------------------------------------------
-- FR-2.5 — a project with recorded payments can be archived, never deleted.
-- ON DELETE RESTRICT on the FK chain already blocks this; this makes the
-- intent explicit and the error message useful.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION project_with_payments_cannot_be_deleted()
RETURNS TRIGGER AS $$
DECLARE
  payment_count INT;
BEGIN
  SELECT COUNT(*) INTO payment_count
    FROM "earning" e
    JOIN "stage" s     ON s."id" = e."stage_id"
    JOIN "job_card" jc ON jc."id" = s."job_card_id"
   WHERE jc."project_id" = OLD."id";

  IF payment_count > 0 THEN
    RAISE EXCEPTION
      'project % has % recorded earning(s) and cannot be deleted — archive it instead (FR-2.5)',
      OLD."id", payment_count
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS project_delete_guard ON "project";
CREATE TRIGGER project_delete_guard
  BEFORE DELETE ON "project"
  FOR EACH ROW EXECUTE FUNCTION project_with_payments_cannot_be_deleted();

-- ---------------------------------------------------------------------------
-- Partial index: the Admin action queues ("approved, awaiting price" and
-- "declined, awaiting revision") are the pinned daily entry point, so they get
-- a dedicated index rather than relying on the general status index.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS stage_awaiting_admin_action
  ON "stage" ("status", "updated_at")
  WHERE "status" IN ('APPROVED', 'PRICE_DECLINED');

CREATE INDEX IF NOT EXISTS earning_unpaid
  ON "earning" ("worker_id", "created_at")
  WHERE "status" = 'UNPAID';
