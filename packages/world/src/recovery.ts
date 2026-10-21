import { BATTLE_RULES } from "@wildbound/shared";

/** What captured_wildkin stores about HP. */
export interface StoredHp {
  currentHp: number;
  hpUpdatedAt: Date;
}

/**
 * Natural recovery, computed lazily on read (the same pattern as wandering's
 * moved_at). Every injured or fainted Wildkin gets first aid and heals slowly
 * in its capsule: empty to full in BATTLE_RULES.naturalRecoveryFullMs (8 h).
 *
 *   restless: hp = currentHp                       (frozen: they cannot receive first aid)
 *   else:     hp = min(maxHp, currentHp + maxHp x (now - hpUpdatedAt) / naturalRecoveryFullMs)
 *
 * Round down to a whole number. Never return less than the stored HP, and
 * treat a clock that went backwards (now before hpUpdatedAt) as no time passed.
 *
 * ------------------------------------------------------------------------
 * TODO(you): implement this (exercise #13). Until then it returns the stored
 * HP: there is no natural recovery and only vets (and Trail Rations) heal.
 * Tests: recovery.exercise.test.ts (pnpm test:exercises).
 * Hints: `now.getTime() - row.hpUpdatedAt.getTime()`, `Math.max(0, ...)`,
 * `Math.floor`, `Math.min(maxHp, ...)`.
 * ------------------------------------------------------------------------
 */
export function currentHp(row: StoredHp, maxHp: number, now: Date, restless: boolean): number {
  void now;
  void restless;
  return Math.min(maxHp, row.currentHp);
}

/** Milliseconds until full by natural recovery (0 when full). Assumes exercise #13's formula. */
export function msUntilFull(hp: number, maxHp: number): number {
  if (maxHp <= 0 || hp >= maxHp) return 0;
  return Math.ceil(((maxHp - hp) / maxHp) * BATTLE_RULES.naturalRecoveryFullMs);
}
