import type { PlayerPositionModel, SpawnModel } from "@wildbound/db";
import {
  EXP_RULES,
  FIELD_STATION_TYPES,
  GAME_RULES,
  type CreatureDefinition,
  type GameEnvironment,
  type GameStateResponse,
  type PoiService,
  type PositionReport,
  type PositionResponse,
  type TimeOfDay,
} from "@wildbound/shared";
import {
  advanceWalkMeter,
  canAct,
  checkMovement,
  distanceMeters,
  isActivePeriod,
  isUsable,
  planSpawns,
  rollGenome,
  rollVigor,
  timeOfDayAt,
  wander,
  walkingExp,
  type TrackedPosition,
} from "@wildbound/world";
import { HttpError } from "../http.ts";
import { resolveWorldContext } from "../resolve.ts";
import { habitatRequirement, lockReason, settleActiveBattle } from "./battle-service.ts";
import {
  creatureMap,
  getTracked,
  loadLicenses,
  nowOf,
  playerDayKey,
  randomOf,
  rankFor,
  requirePosition,
  type GameDeps,
} from "./common.ts";
import { recordHabitatVisit } from "./research-service.ts";
import { spawnView } from "./views.ts";
import { grantWildkinExp, leadOf, loadWildkin, partyOf } from "./wildkin.ts";

export type { GameDeps } from "./common.ts";
export { getTracked } from "./common.ts";

const positionView = (p: TrackedPosition | null): PositionResponse["position"] =>
  p ? { lat: p.lat, lng: p.lng, accuracyM: p.accuracyM, recordedAt: p.recordedAt.toISOString() } : null;

// ------------------------------------------------------------------ position

/**
 * The only way a player's position changes. The movement check decides; the
 * client's coordinates are stored only if they are plausible. Accepted moves
 * also advance the walking meter (walking EXP for the lead).
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
  if (decision.verdict === "accepted" && tracked && decision.next) {
    await walk(deps, playerId, tracked, decision.next, now);
  }

  return {
    verdict: decision.verdict,
    position: positionView(stored),
    lockedUntil: stored?.lockedUntil && stored.lockedUntil > now ? stored.lockedUntil.toISOString() : null,
  };
}

/**
 * Walking EXP: the distance between consecutive accepted fixes, counting only
 * segments slower than 3 m/s (no EXP from driving). One unit per full 100 m,
 * up to 30 units a day (the meter itself is the daily cap).
 */
async function walk(deps: GameDeps, playerId: string, from: TrackedPosition, to: TrackedPosition, now: Date) {
  const day = await playerDayKey(deps, deps.db, playerId, now);
  await deps.db.$transaction(async (tx) => {
    const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
    const meter = { meterM: player.walkMeterM, day: player.walkMeterDay };
    const startM = meter.day === day ? meter.meterM : 0;
    const segment = { distanceM: distanceMeters(from, to), durationMs: to.recordedAt.getTime() - from.recordedAt.getTime() };
    const next = advanceWalkMeter(meter, segment, day);
    await tx.player.update({ where: { id: playerId }, data: { walkMeterM: next.meter.meterM, walkMeterDay: next.meter.day } });

    const unitsSoFar = Math.floor(startM / EXP_RULES.walkingUnitM);
    const units = Math.min(next.units, Math.max(0, EXP_RULES.walkingUnitsPerDay - unitsSoFar));
    if (units <= 0) return;
    const lead = leadOf(await loadWildkin(tx, playerId, await creatureMap(tx), await loadLicenses(tx, playerId), now));
    if (!lead) return;
    await grantWildkinExp(tx, { info: lead, amount: walkingExp(lead.row.level) * units, source: "walking", dayKey: day, now, meta: { units } });
  });
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

/** New spawns per state request, so a cleared area refills gradually instead of instantly. */
const MAX_NEW_SPAWNS_PER_TICK = 2;

/**
 * Everything the radar needs, computed from the server's view of the player:
 * ends battles that were abandoned or walked away from, records habitat
 * visits, expires stale spawns, drops ones the player walked away from, tops
 * up new ones (level, genome and vigor rolled here) from the published
 * encounter tables under live weather and time. Spawns in a battle are frozen:
 * they neither expire nor wander.
 */
export async function gameState(deps: GameDeps, playerId: string): Promise<GameStateResponse> {
  const now = nowOf(deps);
  const random = randomOf(deps);
  const { row, tracked } = await getTracked(deps.db, playerId);
  const lockedUntil = tracked?.lockedUntil && tracked.lockedUntil > now ? tracked.lockedUntil.toISOString() : null;

  const battle = await settleActiveBattle(deps, playerId, now);
  const creatures = await creatureMap(deps.db);
  const licenses = await loadLicenses(deps.db, playerId);
  const owned = await loadWildkin(deps.db, playerId, creatures, licenses, now);
  const hasUsableWildkin = partyOf(owned).some(isUsable);
  const base = {
    position: positionView(tracked),
    lockedUntil,
    activeBattleId: battle?.id ?? null,
    needsStarter: owned.length === 0,
    hasUsableWildkin,
  };
  if (!row || !tracked || !canAct(tracked, now)) {
    return { ...base, environment: null, region: null, habitat: null, habitatLocked: null, spawns: [], pois: [] };
  }

  const environment = await environmentAt(deps, row);
  const context = await resolveWorldContext(
    deps.db,
    {
      lat: row.lat,
      lng: row.lng,
      radius: GAME_RULES.poiRadiusM,
      stage: "published",
      timeOfDay: environment.timeOfDay,
      weather: environment.weather,
    },
    { timeZone: environment.timeZone, now },
  );
  const live = await creatureMap(deps.db, { includeDeleted: false });
  // Soft-deleted species (Creature Manager) never spawn, even if a published table still lists them.
  const available = context.availableWildkin.filter((w) => live.has(w.creatureId));
  if (context.habitat) {
    await recordHabitatVisit(deps, { playerId, habitat: context.habitat, available, creatures: live, now });
  }

  // Expire timed-out spawns and let ones far behind the player wander off.
  await deps.db.spawn.updateMany({ where: { playerId, status: "active", expiresAt: { lte: now } }, data: { status: "expired" } });
  const active = await deps.db.spawn.findMany({ where: { playerId, status: "active" }, orderBy: { createdAt: "asc" } });
  const tooFar = active.filter((s) => distanceMeters(tracked, s) > GAME_RULES.spawnRadiusM * 2).map((s) => s.id);
  if (tooFar.length) await deps.db.spawn.updateMany({ where: { id: { in: tooFar } }, data: { status: "fled" } });

  const remaining = await wanderSpawns(deps, active.filter((s) => !tooFar.includes(s.id)), {
    center: tracked,
    creatures: live,
    timeOfDay: environment.timeOfDay,
    now,
  });
  const frozen = await deps.db.spawn.findMany({ where: { playerId, status: "in_battle" }, orderBy: { createdAt: "asc" } });

  if (context.region) {
    const shown = remaining.length + frozen.length;
    const planned = planSpawns({
      center: tracked,
      available,
      modifiers: new Map([...live.values()].map((c) => [c.id, c.spawnModifiers])),
      env: environment,
      activeCount: shown,
      maxActive: Math.min(GAME_RULES.maxActiveSpawns, shown + MAX_NEW_SPAWNS_PER_TICK),
      radiusM: GAME_RULES.spawnRadiusM,
      random,
    });
    for (const p of planned) {
      const creature = live.get(p.creatureId)!;
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
            level: p.level,
            genome: rollGenome(creature.genePool, context.habitat?.habitatTags ?? [], random),
            vigor: rollVigor(random),
            expiresAt: new Date(now.getTime() + GAME_RULES.spawnTtlMs),
            // A random phase, so spawns created together do not take their first step together.
            movedAt: new Date(now.getTime() - random() * GAME_RULES.spawnWanderStepMs),
          },
        }),
      );
    }
  }

  // Why a battle cannot start, per spawn (habitat locks are per spawn habitat).
  const requirements = new Map<string | null, Awaited<ReturnType<typeof habitatRequirement>>>();
  const spawns = [...frozen, ...remaining];
  for (const s of spawns) if (!requirements.has(s.habitatId)) requirements.set(s.habitatId, await habitatRequirement(deps.db, s.habitatId));
  const battleLocked = (s: SpawnModel) =>
    lockReason(requirements.get(s.habitatId) ?? null, licenses) ??
    (battle ? (s.id === battle.spawnId ? "In battle" : "A battle is already running") : null) ??
    (hasUsableWildkin ? null : "Your party needs rest: visit a vet or let first aid work");

  const day = await playerDayKey(deps, deps.db, playerId, now);
  const picked = new Set(
    (
      await deps.db.poiPickup.findMany({
        where: { playerId, dayKey: day, poiId: { in: context.nearbyPois.map((p) => p.id) } },
        select: { poiId: true },
      })
    ).map((p) => p.poiId),
  );
  const pois = context.nearbyPois.map((p) => {
    const station = (FIELD_STATION_TYPES as readonly string[]).includes(p.type);
    const services: PoiService[] = station ? ["pickup", "vet", "assessment"] : ["pickup"];
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      type: p.type,
      lat: p.lat,
      lng: p.lng,
      distanceM: p.distanceMeters,
      inRange: p.distanceMeters <= GAME_RULES.interactRadiusM,
      services,
      pickedUpToday: picked.has(p.id),
    };
  });

  return {
    ...base,
    environment,
    region: context.region ? { id: context.region.id, name: context.region.name } : null,
    habitat: context.habitat
      ? { id: context.habitat.id, name: context.habitat.name, licenseRequirement: context.habitat.licenseRequirement }
      : null,
    habitatLocked: lockReason(context.habitat?.licenseRequirement ?? null, licenses),
    spawns: spawns.map((s) => {
      const creature = creatures.get(s.creatureId);
      return spawnView(s, creature, tracked, { rank: creature ? rankFor(licenses, creature.category) : 1, battleLocked: battleLocked(s) });
    }),
    pois,
  };
}

/**
 * Lets active spawns wander (one step per GAME_RULES.spawnWanderStepMs since
 * they last moved). A spawn that wanders outside the spawn radius around the
 * player is despawned ("fled"); so is one whose species was deleted.
 */
async function wanderSpawns(
  deps: GameDeps,
  spawns: SpawnModel[],
  args: { center: TrackedPosition; creatures: Map<string, CreatureDefinition>; timeOfDay: TimeOfDay; now: Date },
): Promise<SpawnModel[]> {
  const random = deps.random ?? Math.random;
  const kept: SpawnModel[] = [];
  for (const spawn of spawns) {
    const creature = args.creatures.get(spawn.creatureId);
    if (!creature) {
      await deps.db.spawn.update({ where: { id: spawn.id }, data: { status: "fled" } });
      continue;
    }
    const result = wander(
      { lat: spawn.lat, lng: spawn.lng, heading: spawn.heading },
      {
        style: creature.movementStyle,
        active: isActivePeriod(creature.activityPattern, args.timeOfDay),
        elapsedMs: args.now.getTime() - spawn.movedAt.getTime(),
        stepMs: GAME_RULES.spawnWanderStepMs,
        maxSteps: GAME_RULES.spawnWanderMaxSteps,
        center: args.center,
        radiusM: GAME_RULES.spawnRadiusM,
        random,
      },
    );
    if (result.steps === 0) {
      kept.push(spawn);
      continue;
    }
    // Keep the unused time so slow polling does not slow Wildkin down.
    const movedAt = new Date(spawn.movedAt.getTime() + result.usedMs);
    const data = {
      lat: result.lat,
      lng: result.lng,
      heading: result.heading,
      movedAt: result.steps === GAME_RULES.spawnWanderMaxSteps ? args.now : movedAt,
      ...(result.outOfBounds ? { status: "fled" as const } : {}),
    };
    const updated = await deps.db.spawn.update({ where: { id: spawn.id }, data });
    if (!result.outOfBounds) kept.push(updated);
  }
  return kept;
}

/**
 * Shared guard for observe and battle: the spawn must belong to this player,
 * still be active (not in a battle), and be within reach of the player's
 * *server-side* position.
 */
export async function loadActionableSpawn(deps: GameDeps, playerId: string, spawnId: string) {
  const now = nowOf(deps);
  const tracked = await requirePosition(deps, playerId, now);
  const spawn = await deps.db.spawn.findFirst({ where: { id: spawnId, playerId } });
  if (!spawn) throw new HttpError(404, "not_found", "That Wildkin is not here");
  if (spawn.status === "in_battle") throw new HttpError(409, "in_battle", "That Wildkin is in a battle with you");
  if (spawn.status !== "active" || spawn.expiresAt <= now) throw new HttpError(410, "gone", "That Wildkin has moved on");
  const distanceM = distanceMeters(tracked, spawn);
  if (distanceM > GAME_RULES.interactRadiusM) {
    throw new HttpError(409, "out_of_range", `Get closer: ${Math.round(distanceM)} m away (max ${GAME_RULES.interactRadiusM} m)`);
  }
  return { spawn, tracked, now };
}
