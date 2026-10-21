import {
  MATCHUP_RESIST,
  MATCHUP_WEAK,
  MATCHUPS,
  type Approach,
  type BodyTrait,
  type MatchupEffect,
} from "@wildbound/shared";

/** How one body trait takes an approach: "weak", "resist" or null (neutral). Strike is always neutral. */
export function traitEffect(trait: BodyTrait, approach: Approach): MatchupEffect | null {
  const m = MATCHUPS[trait];
  return m.weak === approach ? "weak" : m.resist === approach ? "resist" : null;
}

/**
 * Damage multiplier of an attack approach against a target's body traits:
 * x1.5 (MATCHUP_WEAK) for each trait weak to it, x0.67 (MATCHUP_RESIST) for
 * each trait that resists it, x1 otherwise. With two traits both factors multiply.
 *
 * Examples: crush on ["plated"] = 1.5; pierce on ["plated"] = 0.67;
 * toxin on ["leafy", "slick"] = 1.5 x 1.5 = 2.25; strike on anything = 1.
 *
 * ------------------------------------------------------------------------
 * TODO(you): implement this (exercise #11). Until then every hit is neutral,
 * so battles have no weaknesses and there is nothing to discover: the
 * Registry's matchup "?" never fills in and no matchup researcher EXP is
 * awarded. The exercise tests live in matchups.exercise.test.ts:
 *   pnpm test:exercises
 * Hints: look each trait up in MATCHUPS (from @wildbound/shared), or reuse
 * traitEffect above, then fold the list with
 * `traits.reduce((product, trait) => product * factor(trait), 1)`.
 * ------------------------------------------------------------------------
 */
export function matchupMultiplier(approach: Approach, traits: readonly BodyTrait[]): number {
  void approach;
  void traits;
  void MATCHUP_WEAK;
  void MATCHUP_RESIST;
  return 1;
}

export interface MatchupOutcome {
  multiplier: number;
  /** Overall effect for the battle log (null when neutral). */
  effect: MatchupEffect | null;
  /** Field-note line for the log. */
  line: string | null;
  /** Per-trait discoveries to record (neutral traits are never recorded). */
  discoveries: { trait: BodyTrait; effect: MatchupEffect }[];
}

/**
 * Everything one hit reveals. Discoveries follow the multiplier: when it is
 * exactly 1 (neutral, or exercise #11 still open) nothing is recorded.
 */
export function evaluateMatchup(approach: Approach, traits: readonly BodyTrait[]): MatchupOutcome {
  const multiplier = matchupMultiplier(approach, traits);
  if (multiplier === 1) return { multiplier, effect: null, line: null, discoveries: [] };
  const discoveries = traits.flatMap((trait) => {
    const effect = traitEffect(trait, approach);
    return effect ? [{ trait, effect }] : [];
  });
  const effect: MatchupEffect = multiplier > 1 ? "weak" : "resist";
  const lineFrom = discoveries.find((d) => d.effect === effect) ?? discoveries[0];
  const line = lineFrom ? (lineFrom.effect === "weak" ? MATCHUPS[lineFrom.trait].weakLine : MATCHUPS[lineFrom.trait].resistLine) : null;
  return { multiplier, effect, line, discoveries };
}
