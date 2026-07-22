-- Actually drop the uniqueness that blocked parallel assignment.
--
-- The previous migration used ALTER TABLE ... DROP CONSTRAINT IF EXISTS, which
-- silently did nothing: Prisma implements `@@unique` as a bare UNIQUE INDEX, not
-- a table constraint, so there was no constraint of that name to drop and
-- IF EXISTS turned the miss into a success. Creating a second assignment then
-- failed at runtime with P2002 rather than at migration time.
--
-- DROP INDEX is the matching verb. Verified afterwards by inserting two
-- assignments of the same type on one job card.

DROP INDEX IF EXISTS "stage_job_card_id_type_key";
