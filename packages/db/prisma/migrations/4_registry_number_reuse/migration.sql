-- v0.2.0: a deleted Wildkin no longer holds on to its registry number.
-- Registry numbers stay unique, but only among rows that are not soft-deleted
-- (partial unique indexes; Prisma cannot express these, so the schema has no @unique).
DROP INDEX IF EXISTS "creatures_registry_number_key";
CREATE UNIQUE INDEX "creatures_registry_number_live_key" ON "creatures"("registry_number") WHERE "deleted_at" IS NULL;

DROP INDEX IF EXISTS "wildkin_entries_registry_number_key";
CREATE UNIQUE INDEX "wildkin_entries_registry_number_live_key" ON "wildkin_entries"("registry_number") WHERE "deleted_at" IS NULL;
