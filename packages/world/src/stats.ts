import {
  STAT_DESCRIPTORS,
  STAT_GRADES,
  STAT_KEYS,
  VIGOR_MAX,
  VIGOR_WORDS,
  type BaseStats,
  type StatBlock,
  type StatDescriptor,
  type StatGrade,
  type StatKey,
  type Vigor,
  type VigorWord,
} from "@wildbound/shared";

/** Stat multipliers from the phenotype; missing keys are 1. */
export type TraitModifiers = Partial<Record<StatKey, number>>;

/**
 * An individual's stats at a level:
 *
 *   hp    = round( (floor(base.hp x 2 x level / 100) + level + 10) x traitMod.hp x (1 + vigor.hp / 100) )
 *   other = round( (floor(base.X  x 2 x level / 100) + 5)          x traitMod.X  x (1 + vigor.X  / 100) )
 *
 * Every stat is at least 1. At level 50 a stat is about base + 5, at 100 about 2 x base + 5.
 */
export function computeStats(base: BaseStats, level: number, traitMods: TraitModifiers, vigor: Vigor): StatBlock {
  const out = {} as StatBlock;
  for (const key of STAT_KEYS) {
    const grown = Math.floor((base[key] * 2 * level) / 100) + (key === "hp" ? level + 10 : 5);
    out[key] = Math.max(1, Math.round(grown * (traitMods[key] ?? 1) * (1 + vigor[key] / 100)));
  }
  return out;
}

/** The individual multiplier the grade is read from: traitMod x (1 + vigor / 100). */
export const individualMultiplier = (traitMod: number | undefined, vigor: number) => (traitMod ?? 1) * (1 + vigor / 100);

/** "Signature strength", "Solid", "Modest" or "Weak point" for a base value. */
export const statDescriptor = (base: number): StatDescriptor => STAT_DESCRIPTORS.find((d) => base >= d.min)!.label;

/** "Low" to "Exceptional" for an individual multiplier. Thresholds have a tiny epsilon for float noise. */
export const statGrade = (multiplier: number): StatGrade => STAT_GRADES.find((g) => multiplier >= g.min - 1e-9)!.label;

export const vigorWord = (vigor: number): VigorWord => VIGOR_WORDS[Math.max(0, Math.min(VIGOR_MAX, Math.round(vigor)))]!;
