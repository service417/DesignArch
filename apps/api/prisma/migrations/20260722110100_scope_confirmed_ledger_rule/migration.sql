-- Teach the pricing ledger about SCOPE_CONFIRMED.
--
-- Separate from the migration that adds the enum value on purpose: PostgreSQL
-- will not let a newly added enum value be *used* in the same transaction that
-- adds it, and Prisma runs each migration file in one transaction. Folding these
-- together fails with "unsafe use of new value of enum type".
--
-- Without this the constraint would reject every scope confirmation: the old rule
-- allowed only PROPOSED/REVISED/ACCEPTED (which must carry an amount) or DECLINED
-- (which must not), so a SCOPE_CONFIRMED row satisfied neither branch.

ALTER TABLE "pricing_history"
  DROP CONSTRAINT IF EXISTS pricing_history_value_matches_action;

ALTER TABLE "pricing_history"
  ADD CONSTRAINT pricing_history_value_matches_action
  CHECK (
    ("action" IN ('PROPOSED', 'REVISED', 'ACCEPTED') AND "value" IS NOT NULL AND "value" > 0)
    OR
    -- Neither a decline nor a scope confirmation names a figure. A supervisor
    -- attests that the work changed; only the Admin sets the number.
    ("action" IN ('DECLINED', 'SCOPE_CONFIRMED') AND "value" IS NULL)
  );

-- A scope confirmation without an explanation is not evidence of anything, and
-- it sits on the path to a revised price someone gets paid.
ALTER TABLE "pricing_history"
  DROP CONSTRAINT IF EXISTS pricing_history_scope_change_has_reason;

ALTER TABLE "pricing_history"
  ADD CONSTRAINT pricing_history_scope_change_has_reason
  CHECK ("action" <> 'SCOPE_CONFIRMED' OR ("reason" IS NOT NULL AND length(btrim("reason")) >= 5));
