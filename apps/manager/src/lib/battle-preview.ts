import {
  APPROACH_NAMES,
  BODY_TRAIT_NAMES,
  BUILD_NAMES,
  LEVEL_MAX,
  MATCHUPS,
  STAT_KEYS,
  STAT_NAMES,
  TEMPERAMENT_NAMES,
  type BaseStats,
  type BodyTrait,
  type GenePool,
  type Genome,
  type Phenotype,
  type StatBlock,
  type StatDescriptor,
  type StatGrade,
  type StatKey,
  type Vigor,
  type VigorWord,
} from "@wildbound/shared";

import {
  computeStats,
  FALLBACK_BASE_STATS,
  genotypeText,
  individualMultiplier,
  phenotype,
  rollGenome,
  rollVigor,
  statDescriptor,
  statGrade,
  traitModifiers,
  vigorWord,
} from "@wildbound/world";

/**
 * Pure helpers behind the Game preview's "Battle & genetics" block (no React,
 * unit-tested in battle-preview.test.ts). Raw numbers are fine here: the
 * manager is an authoring tool, the game itself only shows words and bars.
 */

export const SAMPLE_LEVEL = 50;

export interface StatShapeRow {
  key: StatKey;
  label: string;
  base: number;
  descriptor: StatDescriptor;
  /** 0..1 bar width, relative to the highest possible base stat. */
  fraction: number;
}

/** The species' stat shape as bar rows with their descriptors; null while base stats are not set. */
export function statShape(base: BaseStats | null, barMax = 150): StatShapeRow[] | null {
  if (!base) return null;
  return STAT_KEYS.map((key) => {
    const value = Number.isFinite(base[key]) ? base[key] : 0;
    return {
      key,
      label: STAT_NAMES[key],
      base: value,
      descriptor: statDescriptor(value),
      fraction: Math.max(0, Math.min(1, value / barMax)),
    };
  });
}

export interface TraitMatchupRow {
  trait: BodyTrait;
  label: string;
  weakTo: string;
  resists: string;
  reason: string;
}

/** Each body trait with what it is weak to and what it resists. */
export const traitMatchups = (traits: readonly BodyTrait[]): TraitMatchupRow[] =>
  traits.map((trait) => ({
    trait,
    label: BODY_TRAIT_NAMES[trait],
    weakTo: APPROACH_NAMES[MATCHUPS[trait].weak],
    resists: APPROACH_NAMES[MATCHUPS[trait].resist],
    reason: MATCHUPS[trait].reason,
  }));

export interface SampleStatRow {
  key: StatKey;
  label: string;
  value: number;
  vigor: number;
  vigorWord: VigorWord;
  grade: StatGrade;
}

export interface SampleIndividual {
  level: number;
  genome: Genome;
  genotype: ReturnType<typeof genotypeText>;
  phenotype: Phenotype;
  buildName: string;
  temperamentName: string;
  /** The marking variant's name when the individual expresses it (mm). */
  marking: string | null;
  vigor: Vigor;
  stats: StatBlock;
  rows: SampleStatRow[];
  /** Base stats were not set, so the even 75 / 75 / 75 / 75 fallback was used (like the game does). */
  usedFallbackStats: boolean;
}

/**
 * Rolls one wild individual the way the server does for a spawn with no
 * habitat (region-wide tables): genome from the gene pool defaults, vigor 0..5
 * per stat, stats at `level`.
 */
export function rollSample(
  base: BaseStats | null,
  genePool: GenePool,
  random: () => number = Math.random,
  level = SAMPLE_LEVEL,
): SampleIndividual {
  const lvl = Math.max(1, Math.min(LEVEL_MAX, Math.round(level)));
  const genome = rollGenome(genePool, [], random);
  const vigor = rollVigor(random);
  const p = phenotype(genome);
  const mods = traitModifiers(p);
  const usable = base && STAT_KEYS.every((k) => Number.isFinite(base[k])) ? base : null;
  const stats = computeStats(usable ?? FALLBACK_BASE_STATS, lvl, mods, vigor);
  return {
    level: lvl,
    genome,
    genotype: genotypeText(genome),
    phenotype: p,
    buildName: BUILD_NAMES[p.build],
    temperamentName: TEMPERAMENT_NAMES[p.temperament],
    marking: p.marked ? genePool.marking?.name || "Marked" : null,
    vigor,
    stats,
    rows: STAT_KEYS.map((key) => ({
      key,
      label: STAT_NAMES[key],
      value: stats[key],
      vigor: vigor[key],
      vigorWord: vigorWord(vigor[key]),
      grade: statGrade(individualMultiplier(mods[key], vigor[key])),
    })),
    usedFallbackStats: usable === null,
  };
}
