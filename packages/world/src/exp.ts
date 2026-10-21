import { EXP_RULES } from "@wildbound/shared";
import { nextLevelGap } from "./levels.ts";

/**
 * Wildkin EXP yields. All amounts are placeholders in EXP_RULES. Amounts are
 * rounded down with a minimum of 1; daily caps are enforced by the caller
 * (from the exp_events log) with `remainingToday`.
 */

const atLeastOne = (n: number) => Math.max(1, Math.floor(n));

/** gap = clamp(L_opp / L_self, 0.2, 1.5): beating much weaker Wildkin gives very little. */
export const levelGapFactor = (opponentLevel: number, selfLevel: number) =>
  Math.min(EXP_RULES.gapMax, Math.max(EXP_RULES.gapMin, opponentLevel / Math.max(1, selfLevel)));

/** For the Wildkin that was active when the wild one fainted or was captured: floor(60 x L_opp / 7 x gap). */
export const battleExp = (opponentLevel: number, selfLevel: number) =>
  atLeastOne(((EXP_RULES.battleBase * opponentLevel) / EXP_RULES.battleDivisor) * levelGapFactor(opponentLevel, selfLevel));

/** Every other non-fainted party member: 50% of the battle amount, 75% if 5+ levels below the lead. */
export const sharedBattleExp = (battleAmount: number, memberLevel: number, leadLevel: number) =>
  atLeastOne(
    battleAmount *
      (leadLevel - memberLevel >= EXP_RULES.catchUpLevelGap ? EXP_RULES.catchUpShare : EXP_RULES.sharedShare),
  );

/** A share of the lead's nextLevelGap (walking, observation, exploration, capture). 0 at level 100. */
export const gapShareExp = (level: number, share: number) => (nextLevelGap(level) === 0 ? 0 : atLeastOne(nextLevelGap(level) * share));

export const walkingExp = (level: number) => gapShareExp(level, EXP_RULES.walkingShare);
export const observationExp = (level: number) => gapShareExp(level, EXP_RULES.observationShare);
export const explorationExp = (level: number) => gapShareExp(level, EXP_RULES.explorationShare);
export const captureExp = (level: number) => gapShareExp(level, EXP_RULES.captureShare);

/** How many more awards a daily cap allows. */
export const remainingToday = (cap: number, usedToday: number) => Math.max(0, cap - usedToday);

// ---------------------------------------------------------------- rested bonus

/**
 * Rested charges, computed lazily: one per 2 hours since the last battle EXP
 * (or since `since` when the player never earned any), up to 10.
 */
export function restedCharges(stored: number, since: Date, now: Date): number {
  const earned = Math.floor(Math.max(0, now.getTime() - since.getTime()) / EXP_RULES.restedChargeMs);
  return Math.min(EXP_RULES.restedMaxCharges, stored + earned);
}

// ---------------------------------------------------------------- walking

export interface WalkMeter {
  /** Meters walked today (counted segments only). */
  meterM: number;
  /** Day key the meter belongs to; null = never walked. */
  day: string | null;
}

/**
 * Adds one accepted movement segment to the day's walking meter. Segments at
 * 3 m/s or faster (vehicles) do not count. A new day starts a fresh meter.
 * Returns the new meter and how many full 100 m units this segment completed.
 */
export function advanceWalkMeter(
  meter: WalkMeter,
  segment: { distanceM: number; durationMs: number },
  today: string,
): { meter: WalkMeter; units: number } {
  const start = meter.day === today ? meter.meterM : 0;
  const speed = segment.durationMs > 0 ? segment.distanceM / (segment.durationMs / 1000) : Infinity;
  if (!(segment.distanceM > 0) || speed >= EXP_RULES.walkingMaxSpeedMps) {
    return { meter: { meterM: start, day: today }, units: 0 };
  }
  const meterM = start + segment.distanceM;
  const units = Math.floor(meterM / EXP_RULES.walkingUnitM) - Math.floor(start / EXP_RULES.walkingUnitM);
  return { meter: { meterM, day: today }, units };
}

// ---------------------------------------------------------------- day boundaries

/** "YYYY-MM-DD" in the player's time zone (daily caps, pickups, habitat visits). */
export function dayKey(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
