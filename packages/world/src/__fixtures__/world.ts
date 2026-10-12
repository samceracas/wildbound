import type { Polygon, WorldDocument } from "@wildbound/shared";
import { EMPTY_CONDITIONS } from "@wildbound/shared";

/** Axis-aligned square polygon around [lng, lat] with half-size `d` degrees. */
export const square = (lng: number, lat: number, d: number): Polygon => ({
  type: "Polygon",
  coordinates: [[[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]],
});

export const IDS = {
  region: "10000000-0000-4000-8000-000000000001",
  forest: "20000000-0000-4000-8000-000000000001",
  creek: "20000000-0000-4000-8000-000000000002",
  gate: "30000000-0000-4000-8000-000000000001",
  forestTable: "40000000-0000-4000-8000-000000000001",
  regionTable: "40000000-0000-4000-8000-000000000002",
  e1: "50000000-0000-4000-8000-000000000001",
  e2: "50000000-0000-4000-8000-000000000002",
  e3: "50000000-0000-4000-8000-000000000003",
  e4: "50000000-0000-4000-8000-000000000004",
} as const;

export const CREATURE_IDS = new Set(["kawi", "mimu", "lumae", "kantar", "riverkin"]);

/**
 * Small valid world: region is a 0.01° square at (121, 14.65); forest habitat
 * on the west side, creek habitat on the east, one POI, two encounter tables.
 */
export function sampleWorld(): WorldDocument {
  return {
    regions: [
      {
        id: IDS.region,
        slug: "mabunyi-nature-reserve",
        name: "Mabunyi Nature Reserve",
        description: "",
        geometry: { type: "MultiPolygon", coordinates: [square(121, 14.65, 0.005).coordinates] },
        biomeTags: ["tropical-forest"],
        unlockCondition: null,
        storyStateRequirements: [],
        active: true,
      },
    ],
    habitats: [
      {
        id: IDS.forest,
        regionId: IDS.region,
        slug: "forest-edge",
        name: "Forest Edge",
        description: "",
        geometry: square(120.998, 14.65, 0.0015),
        habitatTags: ["forest-edge", "canopy"],
        conditionRules: EMPTY_CONDITIONS,
      },
      {
        id: IDS.creek,
        regionId: IDS.region,
        slug: "silayan-creekside",
        name: "Silayan Creekside",
        description: "",
        geometry: square(121.002, 14.65, 0.0015),
        habitatTags: ["freshwater"],
        conditionRules: { timeOfDay: [], weather: ["rain", "cloudy", "clear"] },
      },
    ],
    pois: [
      {
        id: IDS.gate,
        regionId: IDS.region,
        slug: "east-research-gate",
        name: "East Research Gate",
        description: "",
        type: "gate",
        location: { type: "Point", coordinates: [120.9985, 14.65] },
        interactionId: "research-gate-checkin",
        unlockCondition: null,
      },
    ],
    encounterTables: [
      {
        id: IDS.forestTable,
        name: "Forest Edge Encounters",
        regionId: IDS.region,
        habitatId: IDS.forest,
        conditionRules: EMPTY_CONDITIONS,
        active: true,
        entries: [
          { id: IDS.e1, creatureId: "kawi", weight: 40, conditions: EMPTY_CONDITIONS },
          { id: IDS.e2, creatureId: "mimu", weight: 35, conditions: EMPTY_CONDITIONS },
          { id: IDS.e3, creatureId: "kantar", weight: 25, conditions: { timeOfDay: ["day"], weather: [] } },
        ],
      },
      {
        id: IDS.regionTable,
        name: "Reserve-wide Encounters",
        regionId: IDS.region,
        habitatId: null,
        conditionRules: { timeOfDay: [], weather: ["rain"] },
        active: true,
        entries: [{ id: IDS.e4, creatureId: "riverkin", weight: 10, conditions: EMPTY_CONDITIONS }],
      },
    ],
  };
}
