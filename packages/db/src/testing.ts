import { sql } from "drizzle-orm";
import { createDb, type DbHandle } from "./client.ts";
import { requireEnv } from "./env.ts";
import { runMigrations } from "./migrate.ts";
import { seedCreatures } from "./seed-data.ts";
import { upsertCreatures } from "./world-repo.ts";

/**
 * Test-only helpers. Connects to DATABASE_URL_TEST (never the dev database),
 * migrates it, and wipes world data between tests.
 */
export async function openTestDb(): Promise<DbHandle> {
  const url = requireEnv("DATABASE_URL_TEST");
  if (url === process.env.DATABASE_URL) throw new Error("DATABASE_URL_TEST must differ from DATABASE_URL");
  const handle = createDb(url);
  await runMigrations(handle.db);
  return handle;
}

export async function resetTestData(handle: DbHandle): Promise<void> {
  await handle.db.execute(
    sql`TRUNCATE encounter_entries, encounter_tables, points_of_interest, habitats, world_regions, world_meta, publications, creatures RESTART IDENTITY CASCADE`,
  );
  await upsertCreatures(handle.db, seedCreatures());
}
