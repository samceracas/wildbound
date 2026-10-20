import { createDb, type DbHandle } from "./client.ts";
import { requireEnv } from "./env.ts";
import { runMigrations } from "./migrate.ts";
import { seedCreatures } from "./seed-data.ts";
import { upsertCreatures } from "./world-repo.ts";

/**
 * Test-only helpers. Connects to DATABASE_URL_TEST (never the dev database),
 * migrates it, and wipes world and player data between tests.
 */
export async function openTestDb(): Promise<DbHandle> {
  const url = requireEnv("DATABASE_URL_TEST");
  if (url === process.env.DATABASE_URL) throw new Error("DATABASE_URL_TEST must differ from DATABASE_URL");
  await runMigrations(url);
  return createDb(url);
}

export async function resetTestData(handle: DbHandle): Promise<void> {
  await handle.db.$executeRawUnsafe(
    `TRUNCATE encounter_entries, encounter_tables, points_of_interest, habitats, world_regions, world_meta, publications,
      players, player_sessions, player_positions, spawns, registry_entries, inventory_items, captured_wildkin,
      wildkin_art, wildkin_entries, creatures RESTART IDENTITY CASCADE`,
  );
  await upsertCreatures(handle.db, seedCreatures());
}
