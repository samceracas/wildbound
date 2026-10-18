import "../env.ts";
import { createDb } from "../client.ts";
import { requireEnv } from "../env.ts";
import { runMigrations } from "../migrate.ts";

/** Drops all WILDBOUND tables (keeps the PostGIS extension) and re-runs migrations. */
const url = process.argv.includes("--test") ? requireEnv("DATABASE_URL_TEST") : requireEnv("DATABASE_URL");
const handle = createDb(url);
try {
  await handle.db.$executeRawUnsafe(`
    DROP TABLE IF EXISTS encounter_entries, encounter_tables, points_of_interest, habitats, world_regions,
      creatures, world_meta, publications, players, player_sessions, player_positions, spawns,
      registry_entries, inventory_items, captured_wildkin, _prisma_migrations CASCADE`);
  await handle.db.$executeRawUnsafe(`DROP TYPE IF EXISTS publication_stage, spawn_status`);
  await handle.db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS drizzle CASCADE`);
} finally {
  await handle.close();
}
await runMigrations(url);
console.log("Database reset.");
