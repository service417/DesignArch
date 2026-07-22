-- Parallel assignment, supervisor scope confirmation, and attachment filenames.
--
-- The big change is that a job card may now be worked by several people at once.
-- A `stage` row already carried everything a job assignment needs — job card,
-- worker, stage type, status, price, plus its own evidence, pricing history and
-- earning — so it becomes the assignment record rather than a new table being
-- introduced alongside it. That avoids repointing three foreign keys
-- (pricing_history, inspection_photo, earning) and leaving `stage` a shell.

-- ---------------------------------------------------------------------------
-- 1. Allow several workers on the same stage type of one job card.
--
-- This uniqueness is precisely what made parallel assignment impossible.
-- Everything downstream is already per-stage, so dropping it is sufficient:
-- each assignment keeps its own status, photographs, prices and earning.
-- ---------------------------------------------------------------------------
ALTER TABLE "stage" DROP CONSTRAINT IF EXISTS "stage_job_card_id_type_key";

-- The old unique index served lookups by (job_card_id, type); replace it with a
-- plain index so those queries stay fast without enforcing uniqueness.
CREATE INDEX IF NOT EXISTS stage_job_card_type ON "stage" ("job_card_id", "type");

-- ---------------------------------------------------------------------------
-- 2. Assignment acceptance and declining.
--
-- A worker may refuse a job. Declining clears the assignee so the row returns to
-- the Admin's reassignment queue, and records why — without touching any other
-- worker's assignment on the same card.
-- ---------------------------------------------------------------------------
ALTER TABLE "stage" ADD COLUMN IF NOT EXISTS "assignment_accepted_at" TIMESTAMPTZ(6);
ALTER TABLE "stage" ADD COLUMN IF NOT EXISTS "assignment_declined_at" TIMESTAMPTZ(6);
ALTER TABLE "stage" ADD COLUMN IF NOT EXISTS "assignment_decline_reason" VARCHAR(500);

-- Existing assignments predate the accept step. Treat them as already accepted
-- rather than stranding in-flight work behind a button nobody was asked to press.
UPDATE "stage"
   SET "assignment_accepted_at" = COALESCE("assignment_accepted_at", "created_at")
 WHERE "assignee_id" IS NOT NULL
   AND "assignment_accepted_at" IS NULL;

-- A declined assignment must not still name the worker who refused it.
ALTER TABLE "stage" DROP CONSTRAINT IF EXISTS stage_declined_assignment_is_unassigned;
ALTER TABLE "stage"
  ADD CONSTRAINT stage_declined_assignment_is_unassigned
  CHECK ("assignment_declined_at" IS NULL OR "assignee_id" IS NULL);

-- Work cannot begin on an assignment nobody has accepted. ASSIGNED is the only
-- status reachable before acceptance.
ALTER TABLE "stage" DROP CONSTRAINT IF EXISTS stage_progress_requires_accepted_assignment;
ALTER TABLE "stage"
  ADD CONSTRAINT stage_progress_requires_accepted_assignment
  CHECK ("status" = 'ASSIGNED' OR "assignment_accepted_at" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 3. Supervisor scope confirmation in the pricing ledger.
--
-- SCOPE_CONFIRMED records that a supervisor verified on site that the work
-- genuinely changed. It carries no amount — the supervisor attests to facts, the
-- Admin still sets the number, and the worker still has to accept it. That keeps
-- the three-way separation of duties intact.
-- ---------------------------------------------------------------------------
ALTER TYPE "PricingAction" ADD VALUE IF NOT EXISTS 'SCOPE_CONFIRMED';

-- ---------------------------------------------------------------------------
-- 4. Attachment display name.
--
-- The stored key is a UUID we mint; a client-supplied name must never reach the
-- filesystem. This column is for the file carousel only.
-- ---------------------------------------------------------------------------
ALTER TABLE "attachment" ADD COLUMN IF NOT EXISTS "filename" VARCHAR(160);
