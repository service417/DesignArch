-- Store the idempotent response as text rather than JSONB.
--
-- JSONB normalises object key order, so replaying a stored response returned
-- the same content in a different byte sequence — and a replay that is not
-- byte-identical is not really a replay. Nothing queries inside this column, so
-- JSONB's only real feature was unused.
--
-- Written by hand rather than generated: the column is NOT NULL and rows already
-- exist, so the existing values have to be carried across instead of the table
-- being rewritten. `::text` on a jsonb value yields its serialised form.

ALTER TABLE "idempotency_record" ADD COLUMN "response_body" TEXT;

UPDATE "idempotency_record" SET "response_body" = "response"::text;

ALTER TABLE "idempotency_record" ALTER COLUMN "response_body" SET NOT NULL;

ALTER TABLE "idempotency_record" DROP COLUMN "response";
