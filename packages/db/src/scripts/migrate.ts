import "../env.ts";
import { requireEnv } from "../env.ts";
import { runMigrations } from "../migrate.ts";

const url = process.argv.includes("--test") ? requireEnv("DATABASE_URL_TEST") : requireEnv("DATABASE_URL");
await runMigrations(url);
console.log(`Migrations applied to ${new URL(url).pathname.slice(1)}`);
