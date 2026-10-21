import type {
  EncounterTable,
  Habitat,
  PointOfInterest,
  PublicationStage,
  ResolvedPoi,
  WorldContext,
  WorldRegion,
} from "@wildbound/shared";
import { conditionsMatch, type Environment } from "./conditions.ts";
import { combineAvailableWildkin, evaluateEncounterTable } from "./encounters.ts";

/** Spatial lookups done elsewhere (PostGIS) produce these inputs. */
export interface ContextInputs {
  coordinate: { lat: number; lng: number };
  stage: PublicationStage;
  version: number | null;
  environment: Environment;
  region: Omit<WorldRegion, "geometry"> | null;
  habitat: Omit<Habitat, "geometry"> | null;
  nearbyPois: (Omit<PointOfInterest, "location" | "regionId"> & { lat: number; lng: number; distanceMeters: number })[];
  /** Active tables for the region (region-wide) and the resolved habitat. */
  encounterTables: EncounterTable[];
  creatureNames: ReadonlyMap<string, string>;
}

/**
 * Assembles the world context returned to clients. Pure and deterministic:
 * all spatial work has already happened; this applies WILDBOUND rules.
 *
 * Rules:
 * - No region → empty context (not an error).
 * - Habitat-scoped tables apply only when the habitat's own condition rules pass.
 * - Region-wide tables (habitatId null) always participate, subject to their conditions.
 * - Habitat tables are listed before region tables; each group sorted by name then id.
 */
export function assembleWorldContext(input: ContextInputs): WorldContext {
  const { region, habitat, environment } = input;
  const base = {
    coordinate: input.coordinate,
    stage: input.stage,
    version: input.version,
  };

  if (!region) {
    return {
      ...base,
      environment: { ...environment, tags: [] },
      region: null,
      habitat: null,
      nearbyPois: [],
      encounterTables: [],
      availableWildkin: [],
    };
  }

  const habitatOpen = habitat ? conditionsMatch(habitat.conditionRules, environment) : false;
  const byName = (a: EncounterTable, b: EncounterTable) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

  const habitatTables = habitat
    ? input.encounterTables.filter((t) => t.habitatId === habitat.id && t.active).sort(byName)
    : [];
  const regionTables = input.encounterTables
    .filter((t) => t.habitatId === null && t.regionId === region.id && t.active)
    .sort(byName);

  const tables = [
    ...habitatTables.map((t) => evaluateEncounterTable(t, "habitat", environment, input.creatureNames, habitatOpen)),
    ...regionTables.map((t) => evaluateEncounterTable(t, "region", environment, input.creatureNames)),
  ];

  const tags = [...new Set([...region.biomeTags, ...(habitat?.habitatTags ?? [])])];

  const nearbyPois: ResolvedPoi[] = [...input.nearbyPois]
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id))
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      type: p.type,
      lat: p.lat,
      lng: p.lng,
      distanceMeters: Math.round(p.distanceMeters * 10) / 10,
      interactionId: p.interactionId,
      unlockCondition: p.unlockCondition,
    }));

  return {
    ...base,
    environment: { ...environment, tags },
    region: {
      id: region.id,
      slug: region.slug,
      name: region.name,
      description: region.description,
      biomeTags: region.biomeTags,
      storyStateRequirements: region.storyStateRequirements,
      unlockCondition: region.unlockCondition,
    },
    habitat: habitat
      ? {
          id: habitat.id,
          slug: habitat.slug,
          name: habitat.name,
          description: habitat.description,
          habitatTags: habitat.habitatTags,
          conditionRules: habitat.conditionRules,
          conditionsMet: habitatOpen,
          licenseRequirement: habitat.licenseRequirement ?? null,
        }
      : null,
    nearbyPois,
    encounterTables: tables,
    availableWildkin: combineAvailableWildkin(tables),
  };
}
