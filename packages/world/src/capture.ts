import type { Rarity } from "@wildbound/shared";

const BASE_CHANCE: Record<Rarity, number> = { common: 0.7, uncommon: 0.5, rare: 0.3, TBD: 0.6 };

/**
 * Probability that one capture attempt succeeds. Observing first is rewarded,
 * matching the Bible's "observation precedes capture" principle.
 */
export function captureChance(rarity: Rarity, observedFirst: boolean): number {
  return Math.min(0.95, BASE_CHANCE[rarity] + (observedFirst ? 0.15 : 0));
}

/** After a failed attempt the Wildkin may slip away. */
export const FLEE_CHANCE_ON_FAIL = 0.25;
