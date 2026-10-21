import { LEVEL_MAX, LEVEL_MIN, obedienceCap, rankForLevel } from "@wildbound/shared";

/**
 * Levels 1 to 100 (the level is the bond). EXP is cumulative:
 *
 *   totalExpForLevel(L) = L === 1 ? 0 : L^3      (level 100 = 1,000,000 EXP)
 *   levelForExp(exp)    = the largest L in 1..100 with totalExpForLevel(L) <= exp
 *   nextLevelGap(L)     = totalExpForLevel(L + 1) - totalExpForLevel(L)   (0 at level 100)
 */

export const totalExpForLevel = (level: number) => (level <= LEVEL_MIN ? 0 : Math.min(level, LEVEL_MAX) ** 3);

export function levelForExp(exp: number): number {
  let level = Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, Math.floor(Math.cbrt(Math.max(0, exp)))));
  // Correct float error of cbrt at exact cubes.
  while (level < LEVEL_MAX && totalExpForLevel(level + 1) <= exp) level++;
  while (level > LEVEL_MIN && totalExpForLevel(level) > exp) level--;
  return level;
}

export const nextLevelGap = (level: number) => (level >= LEVEL_MAX ? 0 : totalExpForLevel(level + 1) - totalExpForLevel(level));

export interface ExpGainResult {
  exp: number;
  level: number;
  /** EXP actually added (what gets logged). */
  gained: number;
  /** The new level when it rose, else null. */
  newLevel: number | null;
  /** The Wildkin is at its license cap: it gains no more EXP until the license ranks up. */
  heldAtCap: boolean;
}

/**
 * Adds EXP to a Wildkin under its license cap (open decision 2, as decided):
 * a Wildkin at its cap stops gaining EXP and anything beyond the cap is lost.
 * EXP is clamped to totalExpForLevel(cap). Level 100 gains nothing.
 *
 * Callers pass `cap` already resolved for the Wildkin (see expCapFor).
 */
export function applyExpGain(current: { exp: number; level: number }, amount: number, cap: number): ExpGainResult {
  const ceiling = totalExpForLevel(Math.min(LEVEL_MAX, Math.max(cap, LEVEL_MIN)));
  const atCap = current.level >= Math.min(cap, LEVEL_MAX) && current.exp >= ceiling;
  if (amount <= 0 || atCap || current.level >= LEVEL_MAX) {
    return { exp: current.exp, level: current.level, gained: 0, newLevel: null, heldAtCap: atCap && current.level < LEVEL_MAX };
  }
  const exp = Math.min(current.exp + Math.floor(amount), ceiling);
  const level = Math.max(current.level, levelForExp(exp));
  return {
    exp,
    level,
    gained: exp - current.exp,
    newLevel: level > current.level ? level : null,
    heldAtCap: exp >= ceiling && level < LEVEL_MAX,
  };
}

/**
 * The level a Wildkin may grow to. Normally its license cap. A restless
 * Wildkin (captured above the cap) still gains EXP "normally" (it travels with
 * the player), up to the top of its own license band (a level 25 Wildkin can
 * grow to 40, the rank 2 cap), so it never needs an even higher rank.
 */
export const expCapFor = (level: number, licenseCap: number) =>
  level > licenseCap ? obedienceCap(rankForLevel(level)) : licenseCap;

/** EXP into the current level and the size of the level, for the EXP bar. */
export function levelProgress(exp: number, level: number): { intoLevel: number; levelSize: number } {
  const size = nextLevelGap(level);
  return { intoLevel: size === 0 ? 0 : Math.max(0, Math.min(size, exp - totalExpForLevel(level))), levelSize: size };
}
