import { sql } from "drizzle-orm";
import "../env.ts";
import { createDb } from "../client.ts";
import { requireEnv } from "../env.ts";
import { runMigrations } from "../migrate.ts";

/** Drops all WILDBOUND tables (keeps the PostGIS extension) and re-runs migrations. */
const url = process.argv.includes("--test") ? requireEnv("DATABASE_URL_TEST") : requireEnv("DATABASE_URL");
const handle = createDb(url);
try {
  await handle.db.execute(sql`
    DROP TABLE IF EXISTS encounter_entries, encounter_tables, points_of_interest, habitats,
      world_regions, creatures, world_meta, publications CASCADE;
    DROP TYPE IF EXISTS publication_stage;
    DROP SCHEMA IF EXISTS drizzle CASCADE;`);
  await runMigrations(handle.db);
  console.log("Database reset.");
} finally {
  await handle.close();
}
