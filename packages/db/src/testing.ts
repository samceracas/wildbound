import {
  AVERAGE_VIGOR,
  CATEGORIES,
  GenomeSchema,
  TYPICAL_GENOME,
  VigorSchema,
  type BattleState,
  type Category,
  type Genome,
  type Vigor,
} from "@wildbound/shared";
import { individualStats, totalExpForLevel } from "@wildbound/world";
import { createDb, type Database, type DbHandle } from "./client.ts";
import { requireEnv } from "./env.ts";
import { runMigrations } from "./migrate.ts";
import { seedCreatures } from "./seed-data.ts";
import { listCreatures, upsertCreatures } from "./world-repo.ts";

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
      battles, researcher_licenses, assessment_completions, exp_events, matchup_records, condition_records,
      phenotype_records, habitat_visits, poi_pickups,
      wildkin_art, wildkin_entries, creatures RESTART IDENTITY CASCADE`,
  );
  await upsertCreatures(handle.db, seedCreatures());
}

/** A player with all four licenses (rank 1 unless overridden). */
export async function createTestPlayer(
  db: Database,
  opts: { username?: string; licenses?: Partial<Record<Category, { rank?: number; exp?: number }>> } = {},
) {
  const username = opts.username ?? `tester${Math.floor(Math.random() * 1e9)}`;
  const player = await db.player.create({ data: { username: username.toLowerCase(), displayName: username } });
  await db.researcherLicense.createMany({
    data: CATEGORIES.map((category) => ({
      playerId: player.id,
      category,
      rank: opts.licenses?.[category]?.rank ?? 1,
      exp: opts.licenses?.[category]?.exp ?? 0,
    })),
  });
  return player;
}

/** Max HP of an individual of a species (seeded or authored stats). */
export async function maxHpOf(db: Database, creatureId: string, level: number, genome: Genome = TYPICAL_GENOME, vigor: Vigor = AVERAGE_VIGOR) {
  const creature = (await listCreatures(db, { includeDeleted: true })).find((c) => c.id === creatureId);
  if (!creature) throw new Error(`Unknown creature ${creatureId}`);
  return individualStats(creature.baseStats, level, genome, vigor).hp;
}

/** A captured Wildkin at a given level and HP (default: full), in a party slot or storage. */
export async function createTestWildkin(
  db: Database,
  opts: {
    playerId: string;
    creatureId: string;
    level?: number;
    /** Absolute HP, or "full". */
    hp?: number | "full";
    partySlot?: number | null;
    genome?: Genome;
    vigor?: Vigor;
    exp?: number;
    hpUpdatedAt?: Date;
    capturedAt?: Date;
  },
) {
  const level = opts.level ?? 5;
  const genome = GenomeSchema.parse(opts.genome ?? TYPICAL_GENOME);
  const vigor = VigorSchema.parse(opts.vigor ?? AVERAGE_VIGOR);
  const maxHp = await maxHpOf(db, opts.creatureId, level, genome, vigor);
  return db.capturedWildkin.create({
    data: {
      playerId: opts.playerId,
      creatureId: opts.creatureId,
      partySlot: opts.partySlot === undefined ? 0 : opts.partySlot,
      level,
      exp: opts.exp ?? totalExpForLevel(level),
      genome,
      vigor,
      currentHp: opts.hp === undefined || opts.hp === "full" ? maxHp : opts.hp,
      hpUpdatedAt: opts.hpUpdatedAt ?? new Date(),
      caughtLevel: level,
      ...(opts.capturedAt ? { capturedAt: opts.capturedAt } : {}),
    },
  });
}

/** A battle row in a given engine state (the spawn is set to in_battle unless the state is over). */
export async function createTestBattle(db: Database, opts: { playerId: string; spawnId: string; state: BattleState; updatedAt?: Date }) {
  if (!opts.state.outcome) await db.spawn.update({ where: { id: opts.spawnId }, data: { status: "in_battle" } });
  return db.battle.create({
    data: {
      playerId: opts.playerId,
      spawnId: opts.spawnId,
      kind: opts.state.kind,
      status: opts.state.outcome ?? "active",
      turn: opts.state.turn,
      state: opts.state,
      ...(opts.updatedAt ? { updatedAt: opts.updatedAt, createdAt: opts.updatedAt } : {}),
    },
  });
}
