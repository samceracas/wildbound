import {
  BODY_TRAIT_NAMES,
  BUILD_HINTS,
  BUILD_NAMES,
  GAME_RULES,
  MATCHUPS,
  TEMPERAMENT_HINTS,
  TEMPERAMENT_NAMES,
  scannerShows,
  type BodyTrait,
  type CreatureDefinition,
  type FieldNotes,
  type PhenotypeRecordTrait,
  type RegistryEntryView,
  type SpawnView,
  type TimeOfDay,
  type Weather,
} from "@wildbound/shared";
import type { RegistryEntryModel, SpawnModel } from "@wildbound/db";
import { distanceMeters, phenotype } from "@wildbound/world";
import { genomeOf, statShape } from "./wildkin.ts";

/** What the player has learned about species, across the Registry tables. */
export interface FieldKnowledge {
  /** bodyTrait -> approach -> effect */
  matchups: Map<string, Map<string, "weak" | "resist">>;
  /** creatureId -> recorded times of day / weathers / phenotypes */
  timesOfDay: Map<string, Set<string>>;
  weathers: Map<string, Set<string>>;
  phenotypes: Map<string, Set<string>>;
}

const PHENOTYPE_LINES: Record<Exclude<PhenotypeRecordTrait, "marking">, string> = {
  small: `${BUILD_NAMES.small} seen`,
  large: `${BUILD_NAMES.large} seen`,
  bold: `${TEMPERAMENT_NAMES.bold} seen`,
  wary: `${TEMPERAMENT_NAMES.wary} seen`,
};

function fieldNotes(creature: CreatureDefinition, k: FieldKnowledge): FieldNotes {
  const recorded = (trait: BodyTrait, effect: "weak" | "resist") => {
    const approach = MATCHUPS[trait][effect];
    return k.matchups.get(trait)?.get(approach) === effect ? approach : null;
  };
  const phenotypes = [...(k.phenotypes.get(creature.id) ?? [])]
    .sort()
    .map((t) =>
      t === "marking" ? `${creature.genePool.marking?.name ?? "Unusual"} markings seen` : PHENOTYPE_LINES[t as keyof typeof PHENOTYPE_LINES],
    )
    .filter(Boolean);
  return {
    category: creature.category,
    bodyTraits: creature.bodyTraits.map((trait) => ({ trait, weakTo: recorded(trait, "weak"), resists: recorded(trait, "resist") })),
    timesOfDay: [...(k.timesOfDay.get(creature.id) ?? [])] as TimeOfDay[],
    weathers: [...(k.weathers.get(creature.id) ?? [])] as Weather[],
    phenotypes,
  };
}

export const NO_KNOWLEDGE: FieldKnowledge = { matchups: new Map(), timesOfDay: new Map(), weathers: new Map(), phenotypes: new Map() };

/**
 * Builds what a player may see about one species. Observe unlocks the basics
 * and field notes; capture unlocks the rest. Anything locked is sent as null,
 * never hidden in CSS.
 */
export function registryView(creature: CreatureDefinition, entry: RegistryEntryModel | null, knowledge: FieldKnowledge = NO_KNOWLEDGE): RegistryEntryView {
  const status = !entry ? "unknown" : entry.firstCapturedAt ? "captured" : "observed";
  const observed = status !== "unknown";
  const captured = status === "captured";
  return {
    creatureId: creature.id,
    registryNumber: creature.registryNumber,
    status,
    name: observed ? creature.name : null,
    description: observed ? creature.description : null,
    habitatSummary: observed ? creature.habitatSummary : null,
    rarity: captured ? creature.rarity : null,
    activityPattern: captured ? creature.activityPattern : null,
    skills: captured ? creature.skills : null,
    fieldNotes: observed ? fieldNotes(creature, knowledge) : null,
    statShape: captured ? statShape(creature) : null,
    timesObserved: entry?.timesObserved ?? 0,
    timesCaptured: entry?.timesCaptured ?? 0,
    firstObservedAt: entry?.firstObservedAt.toISOString() ?? null,
    firstCapturedAt: entry?.firstCapturedAt?.toISOString() ?? null,
  };
}

/** A trait's name for battle text ("Plated"). */
export const traitName = (t: BodyTrait) => BODY_TRAIT_NAMES[t];

/**
 * One spawn on the radar. Level and hints are revealed by observing; the
 * Temperament hint needs license rank 2 in the species' category.
 */
export function spawnView(
  spawn: SpawnModel,
  creature: CreatureDefinition | undefined,
  at: { lat: number; lng: number },
  opts: { rank: number; battleLocked: string | null },
): SpawnView {
  const distanceM = distanceMeters(at, spawn);
  const observed = spawn.observedAt !== null;
  let hints: SpawnView["hints"] = null;
  if (observed && creature) {
    const p = phenotype(genomeOf(spawn.genome));
    const marking = p.marked && creature.genePool.marking ? `${creature.genePool.marking.name} markings` : null;
    const temperament = scannerShows("temperament", opts.rank) ? TEMPERAMENT_HINTS[p.temperament] : null;
    const build = BUILD_HINTS[p.build];
    hints = build || marking || temperament ? { build, marking, temperament } : null;
  }
  return {
    id: spawn.id,
    creatureId: spawn.creatureId,
    registryNumber: creature?.registryNumber ?? 0,
    lat: spawn.lat,
    lng: spawn.lng,
    distanceM,
    inRange: distanceM <= GAME_RULES.interactRadiusM,
    observed,
    expiresAt: spawn.expiresAt.toISOString(),
    inBattle: spawn.status === "in_battle",
    level: observed ? spawn.level : null,
    hints,
    battleLocked: opts.battleLocked,
  };
}
