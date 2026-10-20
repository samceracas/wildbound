import { listCreatures, type Database, type PlayerPositionModel, type SpawnModel } from "@wildbound/db";
import {
  GAME_RULES,
  type GameEnvironment,
  type GameStateResponse,
  type PositionReport,
  type PositionResponse,
  type SpawnView,
} from "@wildbound/shared";
import { canAct, checkMovement, distanceMeters, planSpawns, timeOfDayAt, type TrackedPosition } from "@wildbound/world";
import { HttpError } from "../http.ts";
import { resolveWorldContext } from "../resolve.ts";
import type { WeatherProvider } from "../weather.ts";

export interface GameDeps {
  db: Database;
  weather: WeatherProvider;
  /** Used when neither the weather service nor the client reported a time zone. */
  fallbackTimeZone: string;
  /** Injected so tests can control time and randomness. */
  now?: () => Date;
  random?: () => number;
}

const nowOf = (deps: GameDeps) => deps.now?.() ?? new Date();

function toTracked(row: PlayerPositionModel | null): TrackedPosition | null {
  return row
    ? { lat: row.lat, lng: row.lng, accuracyM: row.accuracyM, recordedAt: row.recordedAt, strikes: row.strikes, lockedUntil: row.lockedUntil }
    : null;
}

const positionView = (p: TrackedPosition | null): PositionResponse["position"] =>
  p ? { lat: p.lat, lng: p.lng, accuracyM: p.accuracyM, recordedAt: p.recordedAt.toISOString() } : null;

export async function getTracked(db: Database, playerId: string) {
  const row = await db.playerPosition.findUnique({ where: { playerId } });
  return { row, tracked: toTracked(row) };
}

// ------------------------------------------------------------------ position

/**
 * The only way a player's position changes. The movement check decides; the
 * client's coordinates are stored only if they are plausible.
 */
export async function reportPosition(deps: GameDeps, playerId: string, report: PositionReport): Promise<PositionResponse> {
  const now = nowOf(deps);
  const { tracked } = await getTracked(deps.db, playerId);
  const decision = checkMovement(tracked, { lat: report.lat, lng: report.lng, accuracyM: report.accuracy }, now);

  let stored = tracked;
  if (decision.next) {
    const data = {
      lat: decision.next.lat,
      lng: decision.next.lng,
      accuracyM: decision.next.accuracyM,
      recordedAt: decision.next.recordedAt,
      strikes: decision.next.strikes,
      lockedUntil: decision.next.lockedUntil,
    };
    await deps.db.playerPosition.upsert({
      where: { playerId },
      create: { playerId, ...data, timeZone: report.timeZone ?? null },
      // The client's zone is only a fallback; the weather lookup overwrites it with the location's real zone.
      update: { ...data, ...(report.timeZone ? { timeZone: report.timeZone } : {}) },
    });
    stored = decision.next;
  }

  if (decision.verdict === "accepted" || decision.verdict === "first-fix") {
    await deps.db.player.update({ where: { id: playerId }, data: { lastSeenAt: now } });
  }

  return {
    verdict: decision.verdict,
    position: positionView(stored),
    lockedUntil: stored?.lockedUntil && stored.lockedUntil > now ? stored.lockedUntil.toISOString() : null,
  };
}

// ------------------------------------------------------------------ environment

/** Time of day + weather at the player's server-side position. */
export async function environmentAt(deps: GameDeps, row: PlayerPositionModel): Promise<GameEnvironment> {
  const conditions = await deps.weather.current(row.lat, row.lng);
  const timeZone = conditions.timeZone ?? row.timeZone ?? deps.fallbackTimeZone;
  if (conditions.timeZone && conditions.timeZone !== row.timeZone) {
    await deps.db.playerPosition.update({ where: { playerId: row.playerId }, data: { timeZone: conditions.timeZone } });
  }
  return {
    timeOfDay: timeOfDayAt(nowOf(deps), timeZone),
    weather: conditions.weather,
    timeZone,
    temperatureC: conditions.temperatureC,
    weatherSource: conditions.source,
  };
}

// ------------------------------------------------------------------ spawns

function spawnView(spawn: SpawnModel, registryNumber: number, at: TrackedPosition): SpawnView {
  const distanceM = distanceMeters(at, spawn);
  return {
    id: spawn.id,
    creatureId: spawn.creatureId,
    registryNumber,
    lat: spawn.lat,
    lng: spawn.lng,
    distanceM,
    inRange: distanceM <= GAME_RULES.interactRadiusM,
    observed: spawn.observedAt !== null,
    expiresAt: spawn.expiresAt.toISOString(),
  };
}

/** New spawns per state request, so a cleared area refills gradually instead of instantly. */
const MAX_NEW_SPAWNS_PER_TICK = 2;

/**
 * Everything the radar needs, computed from the server's view of the player:
 * expires stale spawns, drops ones the player walked away from, tops up new
 * ones from the published encounter tables under live weather and time.
 */
export async function gameState(deps: GameDeps, playerId: string): Promise<GameStateResponse> {
  const now = nowOf(deps);
  const { row, tracked } = await getTracked(deps.db, playerId);
  const lockedUntil = tracked?.lockedUntil && tracked.lockedUntil > now ? tracked.lockedUntil.toISOString() : null;
  const empty = { position: positionView(tracked), lockedUntil, environment: null, region: null, habitat: null, spawns: [] };
  if (!row || !tracked || !canAct(tracked, now)) return empty;

  const environment = await environmentAt(deps, row);
  const context = await resolveWorldContext(
    deps.db,
    { lat: row.lat, lng: row.lng, radius: 300, stage: "published", timeOfDay: environment.timeOfDay, weather: environment.weather },
    { timeZone: environment.timeZone, now },
  );

  // Expire timed-out spawns and let ones far behind the player wander off.
  await deps.db.spawn.updateMany({ where: { playerId, status: "active", expiresAt: { lte: now } }, data: { status: "expired" } });
  const active = await deps.db.spawn.findMany({ where: { playerId, status: "active" }, orderBy: { createdAt: "asc" } });
  const tooFar = active.filter((s) => distanceMeters(tracked, s) > GAME_RULES.spawnRadiusM * 2).map((s) => s.id);
  if (tooFar.length) await deps.db.spawn.updateMany({ where: { id: { in: tooFar } }, data: { status: "fled" } });
  const remaining = active.filter((s) => !tooFar.includes(s.id));

  const creatures = await listCreatures(deps.db);
  if (context.region) {
    const planned = planSpawns({
      center: tracked,
      available: context.availableWildkin,
      modifiers: new Map(creatures.map((c) => [c.id, c.spawnModifiers])),
      env: environment,
      activeCount: remaining.length,
      maxActive: Math.min(GAME_RULES.maxActiveSpawns, remaining.length + MAX_NEW_SPAWNS_PER_TICK),
      radiusM: GAME_RULES.spawnRadiusM,
      random: deps.random ?? Math.random,
    });
    for (const p of planned) {
      remaining.push(
        await deps.db.spawn.create({
          data: {
            playerId,
            creatureId: p.creatureId,
            lat: p.lat,
            lng: p.lng,
            regionId: context.region.id,
            habitatId: context.habitat?.id ?? null,
            timeOfDay: environment.timeOfDay,
            weather: environment.weather,
            expiresAt: new Date(now.getTime() + GAME_RULES.spawnTtlMs),
          },
        }),
      );
    }
  }

  const numbers = new Map(creatures.map((c) => [c.id, c.registryNumber]));
  return {
    position: positionView(tracked),
    lockedUntil,
    environment,
    region: context.region ? { id: context.region.id, name: context.region.name } : null,
    habitat: context.habitat ? { id: context.habitat.id, name: context.habitat.name } : null,
    spawns: remaining.map((s) => spawnView(s, numbers.get(s.creatureId) ?? 0, tracked)),
  };
}

/**
 * Shared guard for observe/capture: the spawn must belong to this player, still
 * be active, and be within reach of the player's *server-side* position.
 */
export async function loadActionableSpawn(deps: GameDeps, playerId: string, spawnId: string) {
  const now = nowOf(deps);
  const { tracked } = await getTracked(deps.db, playerId);
  if (!tracked || !canAct(tracked, now)) {
    throw new HttpError(409, "location_unavailable", "Your location is unavailable or locked; wait for a fresh GPS fix");
  }
  const spawn = await deps.db.spawn.findFirst({ where: { id: spawnId, playerId } });
  if (!spawn) throw new HttpError(404, "not_found", "That Wildkin is not here");
  if (spawn.status !== "active" || spawn.expiresAt <= now) throw new HttpError(410, "gone", "That Wildkin has moved on");
  const distanceM = distanceMeters(tracked, spawn);
  if (distanceM > GAME_RULES.interactRadiusM) {
    throw new HttpError(409, "out_of_range", `Get closer: ${Math.round(distanceM)} m away (max ${GAME_RULES.interactRadiusM} m)`);
  }
  return { spawn, tracked, now };
}
