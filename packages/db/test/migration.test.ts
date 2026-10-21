import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "../src/client.ts";
import { requireEnv } from "../src/env.ts";

/**
 * Migration 5_battle_system on a database with v0.2.0 data: applies migrations
 * 0 to 4 by hand on a scratch database, inserts old rows, then applies 5 and
 * checks the backfills.
 */
const testUrl = requireEnv("DATABASE_URL_TEST");
const scratchName = `${new URL(testUrl).pathname.slice(1)}_migration`;
const scratchUrl = (() => {
  const u = new URL(testUrl);
  u.pathname = `/${scratchName}`;
  return u.toString();
})();

const migration = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url)), "utf8");

/** Splits a migration into statements (our migrations have no function bodies or DO blocks). */
const statements = (sql: string) =>
  sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);

async function apply(handle: DbHandle, name: string) {
  for (const s of statements(migration(name))) await handle.db.$executeRawUnsafe(s);
}

let admin: DbHandle;
let scratch: DbHandle;

beforeAll(async () => {
  admin = createDb(testUrl);
  await admin.db.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
  await admin.db.$executeRawUnsafe(`CREATE DATABASE "${scratchName}"`);
  scratch = createDb(scratchUrl);
  await scratch.db.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS postgis`);
  for (const name of ["0_init", "1_players", "2_wildkin_manager", "3_registry_description", "4_registry_number_reuse"]) {
    await apply(scratch, name);
  }
  // v0.2.0 data: two species without stats, a player with two captured Wildkin and an active spawn.
  await scratch.db.$executeRawUnsafe(`
    INSERT INTO creatures (id, registry_number, name) VALUES ('kantar', 4, 'Kantar'), ('lampyra', 9, 'Lampyra')`);
  await scratch.db.$executeRawUnsafe(`
    INSERT INTO players (id, username, display_name) VALUES ('c0000000-0000-4000-8000-000000000001', 'old', 'Old')`);
  await scratch.db.$executeRawUnsafe(`
    INSERT INTO captured_wildkin (id, player_id, creature_id, party_slot) VALUES
      ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'kantar', 0),
      ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'lampyra', NULL)`);
  await scratch.db.$executeRawUnsafe(`
    INSERT INTO spawns (id, player_id, creature_id, lat, lng, time_of_day, weather, expires_at) VALUES
      ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'kantar', 14.65, 121.04, 'day', 'clear', now() + interval '1 hour')`);
  await apply(scratch, "5_battle_system");
}, 60_000);

afterAll(async () => {
  await scratch?.close();
  await admin?.db.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
  await admin?.close();
});

describe("migration 5_battle_system on v0.2.0 data", () => {
  it("backfills captured Wildkin at level 5 with full HP and a typical genome", async () => {
    const rows = await scratch.db.$queryRawUnsafe<
      { creature_id: string; level: number; exp: number; current_hp: number; caught_level: number; genome: unknown; vigor: unknown }[]
    >(`SELECT creature_id, level, exp, current_hp, caught_level, genome, vigor FROM captured_wildkin ORDER BY creature_id`);
    expect(rows).toEqual([
      // Kantar: round((floor(70 x 10 / 100) + 15) x 1.02) = 22
      { creature_id: "kantar", level: 5, exp: 125, current_hp: 22, caught_level: 5, genome: { build: ["S", "L"], temperament: ["B", "W"], marking: ["+", "+"] }, vigor: { hp: 2, atk: 2, def: 2, spd: 2 } },
      // Unknown species: base HP 75 -> round(22 x 1.02) = 22
      { creature_id: "lampyra", level: 5, exp: 125, current_hp: 22, caught_level: 5, genome: { build: ["S", "L"], temperament: ["B", "W"], marking: ["+", "+"] }, vigor: { hp: 2, atk: 2, def: 2, spd: 2 } },
    ]);
  });

  it("expires spawns from before genetics and gives every player rank 1 licenses", async () => {
    const spawns = await scratch.db.$queryRawUnsafe<{ status: string; level: number }[]>(`SELECT status::text, level FROM spawns`);
    expect(spawns).toEqual([{ status: "expired", level: 5 }]);
    const licenses = await scratch.db.$queryRawUnsafe<{ category: string; rank: number; exp: number }[]>(
      `SELECT category, rank, exp FROM researcher_licenses ORDER BY category`,
    );
    expect(licenses).toEqual(["aerial", "aquatic", "terrestrial", "verdant"].map((category) => ({ category, rank: 1, exp: 0 })));
  });

  it("gives old creatures and tables the defaults", async () => {
    const [c] = await scratch.db.$queryRawUnsafe<{ category: string; body_traits: string[]; base_stats: unknown; attacks: unknown }[]>(
      `SELECT category, body_traits, base_stats, attacks FROM creatures WHERE id = 'kantar'`,
    );
    expect(c).toEqual({ category: "TBD", body_traits: [], base_stats: null, attacks: [] });
  });

  it("allows one active battle per player and enforces the level checks", async () => {
    const insert = (status: string) =>
      scratch.db.$executeRawUnsafe(
        `INSERT INTO battles (player_id, spawn_id, status, state) VALUES ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', '${status}', '{}')`,
      );
    await insert("won");
    await insert("active");
    await expect(insert("active")).rejects.toThrow();
    await insert("lost");
    await expect(
      scratch.db.$executeRawUnsafe(`UPDATE captured_wildkin SET level = 101 WHERE creature_id = 'kantar'`),
    ).rejects.toThrow();
  });
});
