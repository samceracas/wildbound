import { listCreatures, type Database, type Executor, type PlayerPositionModel } from "@wildbound/db";
import { CATEGORIES, type Category, type CategoryOrTbd, type CreatureDefinition } from "@wildbound/shared";
import { canAct, dayKey, type TrackedPosition } from "@wildbound/world";
import { HttpError } from "../http.ts";
import type { WeatherProvider } from "../weather.ts";

export interface GameDeps {
  db: Database;
  weather: WeatherProvider;
  /** Used when neither the weather service nor the client reported a time zone. */
  fallbackTimeZone: string;
  /** Clamp weather assessment requirements to 1 (exercise #1 is open; live weather is always clear). */
  relaxWeather: boolean;
  /** Injected so tests can control time and randomness. */
  now?: () => Date;
  random?: () => number;
}

/** A Prisma interactive transaction client (or the database itself). */
export type Tx = Executor;

export const nowOf = (deps: GameDeps) => deps.now?.() ?? new Date();
export const randomOf = (deps: GameDeps) => deps.random ?? Math.random;

/** The player's local day ("YYYY-MM-DD"): their last known zone, else the world zone. */
export async function playerDayKey(deps: GameDeps, db: Tx, playerId: string, now: Date): Promise<string> {
  const position = await db.playerPosition.findUnique({ where: { playerId }, select: { timeZone: true } });
  return dayKey(now, position?.timeZone ?? deps.fallbackTimeZone);
}

/**
 * Inserts one row unless its primary key exists (ON CONFLICT DO NOTHING) and
 * says whether it was new. Every "only once" rule goes through a unique key
 * like this, so concurrent requests cannot both win, and a duplicate does not
 * abort the surrounding transaction the way a failed INSERT would.
 */
export async function insertOnce(create: Promise<{ count: number }>): Promise<boolean> {
  return (await create).count === 1;
}

export async function creatureMap(db: Executor, opts: { includeDeleted?: boolean } = { includeDeleted: true }) {
  return new Map((await listCreatures(db, opts)).map((c) => [c.id, c] as const));
}

export type Licenses = Record<Category, { rank: number; exp: number }>;

/** The four licenses (rank 1 and no EXP for any row that is missing). */
export async function loadLicenses(db: Executor, playerId: string): Promise<Licenses> {
  const rows = await db.researcherLicense.findMany({ where: { playerId } });
  const out = Object.fromEntries(CATEGORIES.map((c) => [c, { rank: 1, exp: 0 }])) as Licenses;
  for (const r of rows) if ((CATEGORIES as readonly string[]).includes(r.category)) out[r.category as Category] = { rank: r.rank, exp: r.exp };
  return out;
}

/** Makes sure a player has all four license rows (new players, or rows lost to hand edits). */
export async function ensureLicenses(db: Executor, playerId: string): Promise<void> {
  await db.researcherLicense.createMany({ data: CATEGORIES.map((category) => ({ playerId, category })), skipDuplicates: true });
}

/** Rank in a species' category; TBD species count as rank 1. */
export const rankFor = (licenses: Licenses, category: CategoryOrTbd) => (category === "TBD" ? 1 : licenses[category].rank);

export const isCategory = (c: CategoryOrTbd): c is Category => c !== "TBD";

export type Creatures = Map<string, CreatureDefinition>;

// ------------------------------------------------------------------ position

export function toTracked(row: PlayerPositionModel | null): TrackedPosition | null {
  return row
    ? { lat: row.lat, lng: row.lng, accuracyM: row.accuracyM, recordedAt: row.recordedAt, strikes: row.strikes, lockedUntil: row.lockedUntil }
    : null;
}

export async function getTracked(db: Executor, playerId: string) {
  const row = await db.playerPosition.findUnique({ where: { playerId } });
  return { row, tracked: toTracked(row) };
}

/** The player's server-side position, or 409 when it is missing, stale or locked. */
export async function requirePosition(deps: GameDeps, playerId: string, now: Date): Promise<TrackedPosition> {
  const { tracked } = await getTracked(deps.db, playerId);
  if (!tracked || !canAct(tracked, now)) {
    throw new HttpError(409, "location_unavailable", "Your location is unavailable or locked; wait for a fresh GPS fix");
  }
  return tracked;
}
