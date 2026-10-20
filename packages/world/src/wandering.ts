import type { ActivityPattern, MovementStyleName, TimeOfDay } from "@wildbound/shared";
import { distanceMeters, type LatLng } from "./movement.ts";

/**
 * Spawn wandering. Every `stepMs` the server moves each active spawn a little,
 * like an animal going about its business: it keeps a heading with some drift,
 * pauses now and then, and moves faster or slower depending on its species'
 * movement style and whether it is in its active period. A spawn that wanders
 * outside the player's spawn radius is despawned by the API.
 *
 * Pure and deterministic given `random`, so it is easy to test.
 */

export interface WanderProfile {
  /** Typical speed while moving, meters per second. */
  speedMps: number;
  /** Chance per step to stay put. */
  pauseChance: number;
  /** Largest heading change per step, radians. */
  maxTurn: number;
}

export const WANDER_PROFILES: Record<MovementStyleName, WanderProfile> = {
  still: { speedMps: 0.05, pauseChance: 0.85, maxTurn: Math.PI },
  skulker: { speedMps: 0.35, pauseChance: 0.6, maxTurn: Math.PI / 1.5 },
  forager: { speedMps: 0.4, pauseChance: 0.35, maxTurn: Math.PI / 2 },
  roamer: { speedMps: 0.7, pauseChance: 0.2, maxTurn: Math.PI / 5 },
  darter: { speedMps: 1.2, pauseChance: 0.5, maxTurn: Math.PI },
};

/** Times of day a pattern counts as "active". Outside them a Wildkin moves at a fraction of its speed. */
const ACTIVE_TIMES: Record<ActivityPattern, readonly TimeOfDay[]> = {
  diurnal: ["dawn", "day"],
  nocturnal: ["dusk", "night"],
  crepuscular: ["dawn", "dusk"],
  cathemeral: ["dawn", "day", "dusk", "night"],
  sheltering_by_day: ["dusk", "night"],
  seasonal: ["dawn", "day", "dusk", "night"],
  TBD: ["dawn", "day", "dusk", "night"],
};

/** Speed multiplier outside the active period (resting, sheltering). */
export const INACTIVE_SPEED_FACTOR = 0.35;

export function isActivePeriod(pattern: ActivityPattern, timeOfDay: TimeOfDay): boolean {
  return ACTIVE_TIMES[pattern].includes(timeOfDay);
}

export interface WanderState extends LatLng {
  /** Radians, 0 = north, clockwise. null = no heading yet (picked at random). */
  heading: number | null;
}

/** Moves `from` by `meters` along `heading` (small-distance approximation). */
export function offsetMeters(from: LatLng, heading: number, meters: number): LatLng {
  const dLat = (meters * Math.cos(heading)) / 111_320;
  const dLng = (meters * Math.sin(heading)) / (111_320 * Math.cos((from.lat * Math.PI) / 180));
  return { lat: from.lat + dLat, lng: from.lng + dLng };
}

/** One wandering step of `stepMs`. */
export function wanderStep(
  state: WanderState,
  args: { style: MovementStyleName; active: boolean; stepMs: number; random: () => number },
): WanderState {
  const profile = WANDER_PROFILES[args.style];
  const heading = state.heading ?? args.random() * 2 * Math.PI;
  if (args.random() < profile.pauseChance) return { lat: state.lat, lng: state.lng, heading };

  const turned = heading + (args.random() * 2 - 1) * profile.maxTurn;
  const nextHeading = ((turned % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const speed = profile.speedMps * (args.active ? 1 : INACTIVE_SPEED_FACTOR);
  // Vary each stride between 50% and 150% of the typical distance.
  const meters = speed * (args.stepMs / 1000) * (0.5 + args.random());
  return { ...offsetMeters(state, nextHeading, meters), heading: nextHeading };
}

export interface WanderResult extends WanderState {
  /** Steps actually taken. */
  steps: number;
  /** Ended farther than `radiusM` from `center`. */
  outOfBounds: boolean;
}

/**
 * Advances a spawn by however many whole steps fit into `elapsedMs` (capped at
 * `maxSteps`, so a player returning after a long break does not see Wildkin
 * teleport). Stops early once the spawn leaves the radius around `center`.
 */
export function wander(
  state: WanderState,
  args: {
    style: MovementStyleName;
    active: boolean;
    elapsedMs: number;
    stepMs: number;
    maxSteps: number;
    center: LatLng;
    radiusM: number;
    random: () => number;
  },
): WanderResult {
  const steps = Math.min(args.maxSteps, Math.floor(args.elapsedMs / args.stepMs));
  let current = state;
  for (let i = 0; i < steps; i++) {
    current = wanderStep(current, args);
    if (distanceMeters(args.center, current) > args.radiusM) return { ...current, steps: i + 1, outOfBounds: true };
  }
  return { ...current, steps, outOfBounds: false };
}
