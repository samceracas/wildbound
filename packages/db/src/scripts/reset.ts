import "../env.ts";
import { createDb } from "../client.ts";
import { requireEnv } from "../env.ts";
import { runMigrations } from "../migrate.ts";
import { runScript } from "./cli.ts";

/** Drops all WILDBOUND tables (keeps the PostGIS extension) and re-runs migrations. */
const url = process.argv.includes("--test") ? requireEnv("DATABASE_URL_TEST") : requireEnv("DATABASE_URL");
await runScript("Reset", url, async () => {
  const handle = createDb(url);
  try {
    await handle.db.$executeRawUnsafe(`
      DROP TABLE IF EXISTS encounter_entries, encounter_tables, points_of_interest, habitats, world_regions,
        creatures, world_meta, publications, players, player_sessions, player_positions, spawns,
        registry_entries, inventory_items, captured_wildkin, wildkin_art, wildkin_entries,
        battles, researcher_licenses, assessment_completions, exp_events, matchup_records, condition_records,
        phenotype_records, habitat_visits, poi_pickups, _prisma_migrations CASCADE`);
    await handle.db.$executeRawUnsafe(`DROP TYPE IF EXISTS publication_stage, spawn_status, wildkin_entry_status, battle_status`);
    await handle.db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  } finally {
    await handle.close();
  }
  await runMigrations(url);
  console.log("Database reset.");
});
