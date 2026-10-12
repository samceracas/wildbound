import "../env.ts";
import { createDb } from "../client.ts";
import { requireEnv } from "../env.ts";
import { runMigrations } from "../migrate.ts";

const url = process.argv.includes("--test") ? requireEnv("DATABASE_URL_TEST") : requireEnv("DATABASE_URL");
const handle = createDb(url);
try {
  await runMigrations(handle.db);
  console.log(`Migrations applied to ${new URL(url).pathname.slice(1)}`);
} finally {
  await handle.close();
}
