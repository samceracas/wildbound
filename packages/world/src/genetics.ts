import {
  STAT_BUDGET,
  TRAIT_MODIFIERS,
  VIGOR_MAX,
  type AlleleOdds,
  type BaseStats,
  type StatBlock,
  type Build,
  type GenePool,
  type Genome,
  type Phenotype,
  type StatKey,
  type Temperament,
  type Vigor,
} from "@wildbound/shared";
import { computeStats, type TraitModifiers } from "./stats.ts";

/**
 * Individual genetics. Two inherited trait genes with tradeoffs (Build S/L,
 * Temperament B/W), one recessive cosmetic Marking gene, and a non-inherited
 * vigor roll per stat. The phenotype is always derived from the genome on
 * read, never stored. Rolls happen on the server at spawn time.
 */

/** The allele chance for a spawn habitat: first `byHabitatTag` match in authored order, else the default. */
export function alleleChance(odds: AlleleOdds, habitatTags: readonly string[]): number {
  return odds.byHabitatTag.find((o) => habitatTags.includes(o.tag))?.pAllele ?? odds.pAllele;
}

/** A spawn with no habitat (region-wide tables only) passes `[]` and gets the defaults. */
export function rollGenome(pool: GenePool, habitatTags: readonly string[], random: () => number): Genome {
  const pBuild = alleleChance(pool.build, habitatTags);
  const pTemperament = alleleChance(pool.temperament, habitatTags);
  const pMarking = pool.marking?.frequency ?? 0;
  const build = (): "S" | "L" => (random() < pBuild ? "L" : "S");
  const temperament = (): "B" | "W" => (random() < pTemperament ? "W" : "B");
  const marking = (): "+" | "m" => (pool.marking && random() < pMarking ? "m" : "+");
  return { build: [build(), build()], temperament: [temperament(), temperament()], marking: [marking(), marking()] };
}

/** Four integers 0..5, uniform. Not inherited: it reflects how the individual developed. */
export function rollVigor(random: () => number): Vigor {
  const roll = () => Math.min(VIGOR_MAX, Math.floor(random() * (VIGOR_MAX + 1)));
  return { hp: roll(), atk: roll(), def: roll(), spd: roll() };
}

const count = <T>(pair: readonly [T, T], allele: T) => (pair[0] === allele ? 1 : 0) + (pair[1] === allele ? 1 : 0);

export function phenotype(genome: Genome): Phenotype {
  const large = count(genome.build, "L");
  const wary = count(genome.temperament, "W");
  const build: Build = large === 2 ? "large" : large === 1 ? "typical" : "small";
  const temperament: Temperament = wary === 2 ? "wary" : wary === 1 ? "steady" : "bold";
  return { build, temperament, marked: count(genome.marking, "m") === 2 };
}

/** Build and Temperament modifiers multiplied together (a Large, Wary individual has SPD 0.90 x 1.10). */
export function traitModifiers(p: Phenotype): TraitModifiers {
  const out: TraitModifiers = {};
  for (const mods of [TRAIT_MODIFIERS.build[p.build], TRAIT_MODIFIERS.temperament[p.temperament]]) {
    for (const [key, value] of Object.entries(mods) as [StatKey, number][]) out[key] = (out[key] ?? 1) * value;
  }
  return out;
}

/**
 * Breeding groundwork (breeding itself is deferred): each parent passes one
 * random allele per locus. Nothing calls this yet.
 */
export function inheritGenome(a: Genome, b: Genome, random: () => number): Genome {
  const pick = <T>(pair: readonly [T, T]): T => pair[random() < 0.5 ? 0 : 1];
  return {
    build: [pick(a.build), pick(b.build)],
    temperament: [pick(a.temperament), pick(b.temperament)],
    marking: [pick(a.marking), pick(b.marking)],
  };
}

/** "S/L" style genotype text (scanner depth 4+). */
export const genotypeText = (genome: Genome) => ({
  build: genome.build.join("/"),
  temperament: genome.temperament.join("/"),
  marking: genome.marking.join("/"),
});

/** Stats used for a species whose base stats are not authored yet (an even split of the budget). */
export const FALLBACK_BASE_STATS: BaseStats = { hp: STAT_BUDGET / 4, atk: STAT_BUDGET / 4, def: STAT_BUDGET / 4, spd: STAT_BUDGET / 4 };

/** An individual's stats at a level, from its species' base stats (or the fallback) and its genome and vigor. */
export function individualStats(base: BaseStats | null, level: number, genome: Genome, vigor: Vigor): StatBlock {
  return computeStats(base ?? FALLBACK_BASE_STATS, level, traitModifiers(phenotype(genome)), vigor);
}
