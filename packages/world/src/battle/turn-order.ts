import { BATTLE_RULES } from "@wildbound/shared";

/**
 * Speed decides turn order, escape and dodge. Faster has better odds, never
 * certainty.
 */

/**
 * Who attacks first when both sides attack, re-rolled every turn:
 *
 *   P(A first) = SPD_A^k / (SPD_A^k + SPD_B^k)       k = BATTLE_RULES.turnOrderExponent (1)
 *
 * Equal speed is 50%, twice as fast is 67%. Return "a" when random() < P(A first).
 *
 * ------------------------------------------------------------------------
 * TODO(you): implement this (exercise #10, together with escapeChance below).
 * Until then the faster side always goes first (ties: "a", the player), which
 * makes Speed far too decisive. Tests: turn-order.exercise.test.ts
 * (pnpm test:exercises).
 * Hints: `Math.pow(spdA, k)`; call `random()` exactly once.
 * ------------------------------------------------------------------------
 */
export function attackOrder(spdA: number, spdB: number, random: () => number): "a" | "b" {
  void random;
  return spdA >= spdB ? "a" : "b";
}

/**
 * Chance that an escape attempt succeeds:
 *
 *   escape = min(0.95, 0.20 + SPD_self / (SPD_self + SPD_wild) x 0.60 + 0.10 x escapeAttempts)
 *
 * (constants in BATTLE_RULES: escapeBase, escapeSpeedWeight, escapePerAttempt, escapeMax).
 * Each failed attempt adds 10%, so a slow Wildkin is never trapped forever.
 *
 * ------------------------------------------------------------------------
 * TODO(you): implement this (exercise #10). Until then escape is a flat 50%.
 * ------------------------------------------------------------------------
 */
export function escapeChance(spdSelf: number, spdWild: number, escapeAttempts: number): number {
  void spdSelf;
  void spdWild;
  void escapeAttempts;
  return 0.5;
}

/** dodge = defender faster ? min(0.10, (SPD_def - SPD_att) / SPD_def x 0.20) : 0. Kept low: being dodged is less fun than hitting. */
export function dodgeChance(spdDefender: number, spdAttacker: number): number {
  if (spdDefender <= spdAttacker || spdDefender <= 0) return 0;
  return Math.min(BATTLE_RULES.dodgeMax, ((spdDefender - spdAttacker) / spdDefender) * BATTLE_RULES.dodgeWeight);
}
