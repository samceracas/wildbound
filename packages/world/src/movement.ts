import { GAME_RULES, type MovementVerdict } from "@wildbound/shared";

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in meters (haversine). Accurate to well under a meter at game scales. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface TrackedPosition extends LatLng {
  accuracyM: number;
  recordedAt: Date;
  strikes: number;
  lockedUntil: Date | null;
}

export interface PositionFix extends LatLng {
  accuracyM: number;
}

export interface MovementDecision {
  verdict: MovementVerdict;
  /** What to store. null = keep the previous row untouched. */
  next: TrackedPosition | null;
}

type Rules = Pick<
  typeof GAME_RULES,
  "maxSpeedMps" | "maxAccuracyM" | "jitterSlackM" | "strikesBeforeLock" | "lockMs"
>;

/**
 * Server-side plausibility check for one position report. This is what stops a
 * client from "teleporting" by sending arbitrary coordinates:
 *
 * - Locked players are ignored until the lock expires.
 * - Low-accuracy fixes are ignored (not accepted, not punished).
 * - A move is plausible if distance <= maxSpeed * elapsed + both accuracies + jitter slack.
 *   The server's clock is used for `elapsed`; the client's timestamp is never trusted.
 * - Implausible moves are rejected and count as a strike; enough strikes in a row lock the player.
 * - Any accepted move resets the strike counter.
 *
 * Browsers cannot prove a fix is real, so this is plausibility checking, not proof.
 */
export function checkMovement(
  previous: TrackedPosition | null,
  fix: PositionFix,
  now: Date,
  rules: Rules = GAME_RULES,
): MovementDecision {
  if (previous?.lockedUntil && previous.lockedUntil > now) return { verdict: "locked", next: null };
  if (fix.accuracyM > rules.maxAccuracyM) return { verdict: "low-accuracy", next: null };

  const accepted = (verdict: MovementVerdict): MovementDecision => ({
    verdict,
    next: { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM, recordedAt: now, strikes: 0, lockedUntil: null },
  });

  if (!previous) return accepted("first-fix");

  const elapsedS = Math.max(0, (now.getTime() - previous.recordedAt.getTime()) / 1000);
  const allowedM = rules.maxSpeedMps * elapsedS + previous.accuracyM + fix.accuracyM + rules.jitterSlackM;
  if (distanceMeters(previous, fix) <= allowedM) return accepted("accepted");

  const strikes = previous.strikes + 1;
  const lockedUntil = strikes >= rules.strikesBeforeLock ? new Date(now.getTime() + rules.lockMs) : null;
  // Keep the old position; only the strike bookkeeping changes.
  return { verdict: lockedUntil ? "locked" : "too-fast", next: { ...previous, strikes, lockedUntil } };
}

/** True when the tracked position is recent and not locked, i.e. game actions are allowed. */
export function canAct(position: TrackedPosition | null, now: Date, staleMs: number = GAME_RULES.positionStaleMs): boolean {
  if (!position) return false;
  if (position.lockedUntil && position.lockedUntil > now) return false;
  return now.getTime() - position.recordedAt.getTime() <= staleMs;
}
