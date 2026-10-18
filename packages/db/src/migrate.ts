import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createDb } from "./client.ts";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");

function prisma(args: string[], url: string): void {
  execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: process.env.PRISMA_MIGRATE_VERBOSE ? "inherit" : "pipe",
  });
}

/**
 * Applies pending Prisma migrations (prisma/migrations) to `url`.
 *
 * Databases created before the Prisma switch (by the old Drizzle migrations)
 * already have exactly the tables of `0_init`. Those are baselined first:
 * `0_init` is marked as applied without running it, so authored drafts survive.
 */
export async function runMigrations(url: string): Promise<void> {
  const handle = createDb(url);
  try {
    const [row] = await handle.db.$queryRaw<{ legacy: boolean; prisma: boolean }[]>`
      SELECT to_regclass('public.world_regions') IS NOT NULL AS legacy,
             to_regclass('public._prisma_migrations') IS NOT NULL AS prisma`;
    if (row?.legacy && !row.prisma) prisma(["migrate", "resolve", "--applied", "0_init"], url);
  } finally {
    await handle.close();
  }
  prisma(["migrate", "deploy"], url);
}
