import type { AvailableWildkin, SpawnModifiers } from "@wildbound/shared";
import type { Environment } from "./conditions.ts";
import { rollEncounter } from "./encounters.ts";
import type { LatLng } from "./movement.ts";

export interface SpawnCandidate {
  creatureId: string;
  weight: number;
}

/**
 * Scales each candidate's encounter weight by its species' spawn modifiers for
 * the current weather and time of day. This is how weather and time make some
 * Wildkin more common, rarer, or absent:
 *
 *   effectiveWeight = weight * weather[env.weather] * timeOfDay[env.timeOfDay]
 *
 * - A missing modifier (or a missing species) counts as 1.
 * - Candidates whose effective weight is 0 are removed.
 * - Order is preserved.
 *
 * Example: Kawi has weight 60 and modifiers { weather: { rain: 0.5 }, timeOfDay: { day: 1.5 } }.
 * In rain during the day its effective weight is 60 * 0.5 * 1.5 = 45.
 *
 * ------------------------------------------------------------------------
 * TODO(you): implement this. Right now weather and time only act through the
 * yes/no conditions authored in the editor; species modifiers are ignored.
 * The exercise tests in spawning.exercise.test.ts describe the exact behaviour:
 *   pnpm test:exercises
 * Hints: `modifiers.get(c.creatureId)?.weather[env.weather] ?? 1`, then
 * `.map(...)` and `.filter(...)`.
 * ------------------------------------------------------------------------
 */
export function applySpawnModifiers(
  candidates: readonly SpawnCandidate[],
  modifiers: ReadonlyMap<string, SpawnModifiers>,
  env: Environment,
): SpawnCandidate[] {
  void modifiers;
  void env;
  return candidates.map((c) => ({ ...c }));
}

/** Uniformly random point within `radiusM` of `center` (small-distance approximation). */
export function randomPointNear(center: LatLng, radiusM: number, random: () => number): LatLng {
  const r = radiusM * Math.sqrt(random());
  const theta = random() * 2 * Math.PI;
  const dLat = (r * Math.cos(theta)) / 111_320;
  const dLng = (r * Math.sin(theta)) / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  return { lat: center.lat + dLat, lng: center.lng + dLng };
}

export interface PlannedSpawn extends LatLng {
  creatureId: string;
}

/**
 * Decides which new Wildkin to place around a player: tops the player up to
 * `maxActive` spawns, picking species by modified weight and placing each at a
 * random point within `radiusM`. Pure: persistence happens in the API.
 */
export function planSpawns(args: {
  center: LatLng;
  available: readonly AvailableWildkin[];
  modifiers: ReadonlyMap<string, SpawnModifiers>;
  env: Environment;
  activeCount: number;
  maxActive: number;
  radiusM: number;
  random: () => number;
}): PlannedSpawn[] {
  const slots = Math.max(0, args.maxActive - args.activeCount);
  const pool = applySpawnModifiers(
    args.available.map((w) => ({ creatureId: w.creatureId, weight: w.weight })),
    args.modifiers,
    args.env,
  );
  const planned: PlannedSpawn[] = [];
  for (let i = 0; i < slots; i++) {
    const creatureId = rollEncounter(pool, args.random);
    if (!creatureId) break;
    planned.push({ creatureId, ...randomPointNear(args.center, args.radiusM, args.random) });
  }
  return planned;
}

/** Default modifiers object (no effect), handy for tests and missing data. */
export const NEUTRAL_MODIFIERS: SpawnModifiers = { weather: {}, timeOfDay: {} };
