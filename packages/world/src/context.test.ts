import { describe, expect, it } from "vitest";
import { WorldContextSchema } from "@wildbound/shared";
import { IDS, sampleWorld } from "./__fixtures__/world.ts";
import { assembleWorldContext, type ContextInputs } from "./context.ts";

const names = new Map([
  ["kawi", "Kawi"],
  ["mimu", "Mimu"],
  ["kantar", "Kantar"],
  ["riverkin", "Riverkin"],
]);

function inputs(overrides: Partial<ContextInputs> = {}): ContextInputs {
  const w = sampleWorld();
  const { geometry: _r, ...region } = w.regions[0]!;
  const { geometry: _h, ...habitat } = w.habitats[0]!;
  return {
    coordinate: { lat: 14.65, lng: 120.998 },
    stage: "published",
    version: 3,
    environment: { timeOfDay: "day", weather: "clear" },
    region,
    habitat,
    nearbyPois: [
      { id: "b", slug: "far", name: "Far", description: "", type: "trail", lat: 0, lng: 0, distanceMeters: 120.04, interactionId: null, unlockCondition: null },
      { id: "a", slug: "near", name: "Near", description: "", type: "gate", lat: 0, lng: 0, distanceMeters: 5.55, interactionId: null, unlockCondition: null },
    ],
    encounterTables: w.encounterTables,
    creatureNames: names,
    ...overrides,
  };
}

describe("assembleWorldContext", () => {
  it("returns a schema-valid context with region, habitat, sorted POIs and merged tags", () => {
    const ctx = assembleWorldContext(inputs());
    expect(WorldContextSchema.parse(ctx)).toEqual(ctx);
    expect(ctx.region?.slug).toBe("mabunyi-nature-reserve");
    expect(ctx.habitat?.slug).toBe("forest-edge");
    expect(ctx.nearbyPois.map((p) => [p.slug, p.distanceMeters])).toEqual([
      ["near", 5.6],
      ["far", 120],
    ]);
    expect(ctx.environment.tags).toEqual(["tropical-forest", "forest-edge", "canopy"]);
  });

  it("lists habitat tables before region tables and only merges applicable entries", () => {
    const ctx = assembleWorldContext(inputs());
    expect(ctx.encounterTables.map((t) => [t.id, t.scope, t.applicable])).toEqual([
      [IDS.forestTable, "habitat", true],
      [IDS.regionTable, "region", false], // needs rain
    ]);
    expect(ctx.availableWildkin.map((w) => [w.creatureId, w.weight])).toEqual([
      ["kawi", 40],
      ["mimu", 35],
      ["kantar", 25],
    ]);
  });

  it("changes results with environment, without code changes", () => {
    const night = assembleWorldContext(inputs({ environment: { timeOfDay: "night", weather: "rain" } }));
    expect(night.availableWildkin.map((w) => w.creatureId)).toEqual(["kawi", "mimu", "riverkin"]);
    const kawi = night.availableWildkin.find((w) => w.creatureId === "kawi")!;
    expect(kawi.probability).toBeCloseTo(40 / 85);
  });

  it("closes habitat tables when habitat conditions fail but keeps region-wide tables", () => {
    const base = inputs();
    const ctx = assembleWorldContext({
      ...base,
      environment: { timeOfDay: "day", weather: "rain" },
      habitat: { ...base.habitat!, conditionRules: { timeOfDay: ["night"], weather: [] } },
    });
    expect(ctx.habitat?.conditionsMet).toBe(false);
    expect(ctx.availableWildkin.map((w) => w.creatureId)).toEqual(["riverkin"]);
  });

  it("returns an empty context when no region matches", () => {
    const ctx = assembleWorldContext(inputs({ region: null, habitat: null }));
    expect(ctx.region).toBeNull();
    expect(ctx.nearbyPois).toEqual([]);
    expect(ctx.encounterTables).toEqual([]);
    expect(ctx.availableWildkin).toEqual([]);
    expect(WorldContextSchema.safeParse(ctx).success).toBe(true);
  });

  it("ignores inactive tables", () => {
    const base = inputs();
    const ctx = assembleWorldContext({ ...base, encounterTables: base.encounterTables.map((t) => ({ ...t, active: false })) });
    expect(ctx.encounterTables).toEqual([]);
  });
});
