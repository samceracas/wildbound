import {
  BATTLE_RULES,
  CATEGORY_CAPSULES,
  type CategoryOrTbd,
  type Rarity,
  type StatusState,
} from "@wildbound/shared";
import { statusCaptureBonus } from "./statuses.ts";

/** +0.15 when a category capsule matches the wild species' category, else 0 (Field Capsules never add a bonus). */
export function capsuleBonus(itemId: string, category: CategoryOrTbd): number {
  return category !== "TBD" && CATEGORY_CAPSULES[category] === itemId ? BATTLE_RULES.categoryCapsuleBonus : 0;
}

export interface CaptureInputs {
  rarity: Rarity;
  /** The spawn was observed before the battle (observation precedes capture). */
  observed: boolean;
  hp: number;
  maxHp: number;
  status: StatusState | null;
  /** From capsuleBonus(). */
  capsuleBonus: number;
}

/** The parts every capture chance has (also the exercise fallback). */
export const captureBase = (rarity: Rarity, observed: boolean) =>
  BATTLE_RULES.captureRarityBase[rarity] + (observed ? BATTLE_RULES.captureObservedBonus : 0);

/**
 * In-battle capture chance (never sent to the client):
 *
 *   chance = min(0.95, rarityBase + observedBonus + 0.45 x (1 - hp / maxHp) + statusBonus + capsuleBonus)
 *
 * - rarityBase: common 0.25, uncommon 0.15, rare 0.08, TBD 0.20 (BATTLE_RULES.captureRarityBase)
 * - observedBonus: 0.10 when observed (captureBase above already adds both)
 * - the HP part: up to 0.45 at near-zero HP (BATTLE_RULES.captureHpWeight)
 * - statusBonus: statusCaptureBonus(status) from ./statuses.ts
 * - capsuleBonus: given
 * - clamp with BATTLE_RULES.captureMax (0.95)
 *
 * Worked examples: an observed common at 20% HP in a Field Capsule:
 * 0.25 + 0.10 + 0.36 = 0.71. A full-HP common, not observed: 0.25.
 *
 * ------------------------------------------------------------------------
 * TODO(you): implement this (exercise #12). Until then only rarity and
 * observing count: weakening the Wildkin and statuses do not help yet, so
 * capture is possible but hard. Tests: capture.exercise.test.ts
 * (pnpm test:exercises).
 * Hint: guard against maxHp 0, then `Math.min(BATTLE_RULES.captureMax, ...)`.
 * ------------------------------------------------------------------------
 */
export function battleCaptureChance(inputs: CaptureInputs): number {
  return Math.min(BATTLE_RULES.captureMax, captureBase(inputs.rarity, inputs.observed));
}
