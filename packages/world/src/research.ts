import {
  ASSESSMENT_REQUIREMENT_LABELS,
  ASSESSMENT_REQUIREMENT_TYPES,
  CATEGORIES,
  RESEARCH_RULES,
  TIME_OF_DAY,
  WEATHER,
  type AssessmentRequirement,
  type AssessmentRequirementType,
  type Category,
  type CategoryOrTbd,
  type ConditionRules,
  type CreatureDefinition,
  type Phenotype,
  type PhenotypeRecordTrait,
  type RequirementProgress,
  type TimeOfDay,
  type Weather,
  type WorldDocument,
} from "@wildbound/shared";

/**
 * Field Registry research: researcher EXP, phenotype records and assessment
 * progress. Pure; the API reads the counts from its tables.
 */

// ---------------------------------------------------------------- researcher EXP

/**
 * Splits a researcher EXP amount between categories by weight (habitat
 * visits: each category's share of the habitat's available encounter weight).
 * Amounts are rounded down; the remainder goes to the largest shares first,
 * so the parts always add up to `amount`. Categories with no weight get nothing.
 */
export function splitResearcherExp(
  amount: number,
  weights: Partial<Record<CategoryOrTbd, number>>,
): { category: Category; amount: number }[] {
  const entries = CATEGORIES.map((category) => ({ category, weight: Math.max(0, weights[category] ?? 0) })).filter((e) => e.weight > 0);
  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (total <= 0 || amount <= 0) return [];
  const parts = entries.map((e) => ({ ...e, exact: (amount * e.weight) / total, amount: Math.floor((amount * e.weight) / total) }));
  let left = amount - parts.reduce((s, p) => s + p.amount, 0);
  for (const p of [...parts].sort((a, b) => b.exact - b.amount - (a.exact - a.amount) || b.weight - a.weight)) {
    if (left <= 0) break;
    p.amount++;
    left--;
  }
  return parts.filter((p) => p.amount > 0).map((p) => ({ category: p.category, amount: p.amount }));
}

/** Encounter weight per category from a resolved habitat's available Wildkin. */
export function categoryWeights(
  available: readonly { creatureId: string; weight: number }[],
  categoryOf: ReadonlyMap<string, CategoryOrTbd>,
): Partial<Record<CategoryOrTbd, number>> {
  const out: Partial<Record<CategoryOrTbd, number>> = {};
  for (const w of available) {
    const category = categoryOf.get(w.creatureId);
    if (category) out[category] = (out[category] ?? 0) + w.weight;
  }
  return out;
}

/** Observation researcher EXP: first ever, else repeat (up to 5 per species per day). */
export function observationResearcherExp(firstEver: boolean, repeatsToday: number): number {
  if (firstEver) return RESEARCH_RULES.firstObservation;
  return repeatsToday < RESEARCH_RULES.repeatObservationsPerSpeciesPerDay ? RESEARCH_RULES.repeatObservation : 0;
}

/** Visible phenotypes an observer can record. Typical and Steady record nothing. */
export function phenotypeRecordTraits(p: Phenotype): PhenotypeRecordTrait[] {
  const out: PhenotypeRecordTrait[] = [];
  if (p.build === "small" || p.build === "large") out.push(p.build);
  if (p.temperament === "bold" || p.temperament === "wary") out.push(p.temperament);
  if (p.marked) out.push("marking");
  return out;
}

export const phenotypeRecordExp = (trait: PhenotypeRecordTrait) =>
  trait === "marking" ? RESEARCH_RULES.markingRecord : RESEARCH_RULES.phenotypeRecord;

// ---------------------------------------------------------------- assessments

export type RequirementCounts = Record<AssessmentRequirementType, number>;

/** No limit (a count the world never caps, e.g. battles won when the category has species). */
export const UNLIMITED = Number.POSITIVE_INFINITY;

const allowed = <T extends string>(all: readonly T[], ...lists: readonly (readonly T[])[]): T[] =>
  all.filter((v) => lists.every((l) => l.length === 0 || l.includes(v)));

/** Where and when a category's species can be met in a world (see achievableAssessmentLimits). */
export interface CategoryPresence {
  species: Set<string>;
  timesOfDay: Set<TimeOfDay>;
  weathers: Set<Weather>;
  habitatIds: Set<string>;
  bodyTraits: Set<string>;
}

export function categoryPresence(
  world: WorldDocument,
  creatures: readonly CreatureDefinition[],
  category: Category,
): CategoryPresence {
  const species = new Map(creatures.filter((c) => c.category === category).map((c) => [c.id, c]));
  const habitats = new Map(world.habitats.map((h) => [h.id, h]));
  const activeRegions = new Set(world.regions.filter((r) => r.active).map((r) => r.id));
  const present = new Set<string>();
  const times = new Set<TimeOfDay>();
  const weathers = new Set<Weather>();
  const habitatIds = new Set<string>();

  for (const table of world.encounterTables) {
    if (!table.active || !activeRegions.has(table.regionId)) continue;
    const habitatRules: ConditionRules = table.habitatId
      ? (habitats.get(table.habitatId)?.conditionRules ?? { timeOfDay: [], weather: [] })
      : { timeOfDay: [], weather: [] };
    for (const entry of table.entries) {
      const creature = species.get(entry.creatureId);
      if (!creature) continue;
      const tods = allowed(TIME_OF_DAY, table.conditionRules.timeOfDay, entry.conditions.timeOfDay, habitatRules.timeOfDay).filter(
        (t) => (creature.spawnModifiers.timeOfDay[t] ?? 1) > 0,
      );
      const ws = allowed(WEATHER, table.conditionRules.weather, entry.conditions.weather, habitatRules.weather).filter(
        (w) => (creature.spawnModifiers.weather[w] ?? 1) > 0,
      );
      if (tods.length === 0 || ws.length === 0) continue;
      present.add(creature.id);
      tods.forEach((t) => times.add(t));
      ws.forEach((w) => weathers.add(w));
      if (table.habitatId) habitatIds.add(table.habitatId);
      else world.habitats.filter((h) => h.regionId === table.regionId).forEach((h) => habitatIds.add(h.id));
    }
  }

  const bodyTraits = new Set([...present].flatMap((id) => species.get(id)!.bodyTraits));
  return { species: present, timesOfDay: times, weathers, habitatIds, bodyTraits };
}

/**
 * The most of each requirement a player can achieve in the current published
 * world for one category: with only five species, "observe 3 distinct Aquatic
 * species" would be impossible, so every requirement count is clamped to this.
 *
 * - species: published species of the category listed in an active table
 * - times of day / weathers: in which any of them can spawn (the table, entry
 *   and habitat conditions allow it and the species' spawn modifier is above 0)
 * - matchups: 2 per distinct body trait of those species
 * - phenotypes: 4 per species (Small, Large, Bold, Wary; markings not counted)
 * - habitats: where they appear (a region-wide table covers every habitat of its region)
 * - captures and battles: unlimited when the category has any species, else 0
 */
export function achievableAssessmentLimits(
  world: WorldDocument,
  creatures: readonly CreatureDefinition[],
  category: Category,
): RequirementCounts {
  const p = categoryPresence(world, creatures, category);
  const any = p.species.size > 0 ? UNLIMITED : 0;
  return {
    observeDistinctSpecies: p.species.size,
    observeTimesOfDay: p.timesOfDay.size,
    observeWeathers: p.weathers.size,
    captureCount: any,
    winBattles: any,
    recordMatchups: p.bodyTraits.size * 2,
    recordPhenotypes: p.species.size * 4,
    visitHabitats: p.habitatIds.size,
  };
}

/**
 * Progress on an assessment checklist. Each count is clamped to the achievable
 * limit; weather counts are clamped to 1 while `relaxWeather` is on (live
 * weather is always "clear" until exercise #1 is done).
 */
export function assessmentProgress(
  requirements: readonly AssessmentRequirement[],
  counts: RequirementCounts,
  limits: RequirementCounts,
  opts: { relaxWeather: boolean },
): RequirementProgress[] {
  return requirements.map((r) => {
    let required = Math.min(r.count, limits[r.type]);
    if (opts.relaxWeather && r.type === "observeWeathers") required = Math.min(required, 1);
    const current = counts[r.type];
    return {
      type: r.type,
      label: ASSESSMENT_REQUIREMENT_LABELS[r.type].replace("{n}", String(required)),
      required,
      current: Math.min(current, required),
      met: current >= required,
    };
  });
}

export const emptyRequirementCounts = (): RequirementCounts =>
  Object.fromEntries(ASSESSMENT_REQUIREMENT_TYPES.map((t) => [t, 0])) as RequirementCounts;

/** Cumulative researcher EXP needed for a rank (0 for rank 1). */
export const rankThreshold = (rank: number) => (rank <= 1 ? 0 : (RESEARCH_RULES.rankThresholds[rank] ?? Number.POSITIVE_INFINITY));
