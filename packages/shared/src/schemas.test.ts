import { describe, expect, it } from "vitest";
import {
  AreaGeometrySchema,
  ConditionRulesSchema,
  ResolveQuerySchema,
  SlugSchema,
  WorldContextSchema,
  toMultiPolygon,
} from "./index.ts";

describe("SlugSchema", () => {
  it.each(["forest-edge", "a", "zone-2", "mabunyi-nature-reserve"])("accepts %s", (s) => {
    expect(SlugSchema.safeParse(s).success).toBe(true);
  });
  it.each(["", "Forest", "forest_edge", "-edge", "edge-", "a--b", "with space", "x".repeat(65)])("rejects %j", (s) => {
    expect(SlugSchema.safeParse(s).success).toBe(false);
  });
});

describe("geometry schemas", () => {
  const ring = [[121, 14], [121.01, 14], [121.01, 14.01], [121, 14]];

  it("accepts a closed polygon", () => {
    expect(AreaGeometrySchema.safeParse({ type: "Polygon", coordinates: [ring] }).success).toBe(true);
  });
  it("rejects an open ring", () => {
    expect(AreaGeometrySchema.safeParse({ type: "Polygon", coordinates: [ring.slice(0, 3)] }).success).toBe(false);
    const open = [[121, 14], [121.01, 14], [121.01, 14.01], [121.0, 14.02]];
    expect(AreaGeometrySchema.safeParse({ type: "Polygon", coordinates: [open] }).success).toBe(false);
  });
  it("rejects degenerate rings and out-of-range coordinates", () => {
    const degenerate = [[121, 14], [121.01, 14], [121, 14], [121, 14]];
    expect(AreaGeometrySchema.safeParse({ type: "Polygon", coordinates: [degenerate] }).success).toBe(false);
    const bad = [[200, 14], [121.01, 14], [121.01, 14.01], [200, 14]];
    expect(AreaGeometrySchema.safeParse({ type: "Polygon", coordinates: [bad] }).success).toBe(false);
  });
  it("normalizes polygons to multipolygons", () => {
    const multi = toMultiPolygon({ type: "Polygon", coordinates: [ring as [number, number][]] });
    expect(multi.type).toBe("MultiPolygon");
    expect(multi.coordinates).toHaveLength(1);
  });
});

describe("ConditionRulesSchema", () => {
  it("parses known values and rejects unknown ones", () => {
    expect(ConditionRulesSchema.parse({ timeOfDay: ["dawn"], weather: [] })).toEqual({ timeOfDay: ["dawn"], weather: [] });
    expect(ConditionRulesSchema.safeParse({ timeOfDay: ["noon"], weather: [] }).success).toBe(false);
  });
});

describe("ResolveQuerySchema", () => {
  it("coerces query strings and applies defaults", () => {
    expect(ResolveQuerySchema.parse({ lat: "14.65", lng: "121.04" })).toEqual({
      lat: 14.65,
      lng: 121.04,
      radius: 300,
      stage: "published",
    });
  });
  it.each([
    [{ lat: "91", lng: "0" }],
    [{ lat: "0", lng: "-181" }],
    [{ lat: "abc", lng: "0" }],
    [{ lng: "0" }],
    [{ lat: "0", lng: "0", radius: "999999" }],
    [{ lat: "0", lng: "0", stage: "staging" }],
    [{ lat: "0", lng: "0", weather: "snow" }],
  ])("rejects malformed query %j", (q) => {
    expect(ResolveQuerySchema.safeParse(q).success).toBe(false);
  });
});

describe("WorldContextSchema", () => {
  it("accepts an empty context", () => {
    const empty = {
      coordinate: { lat: 0, lng: 0 },
      stage: "published",
      version: null,
      environment: { timeOfDay: "day", weather: "clear", tags: [] },
      region: null,
      habitat: null,
      nearbyPois: [],
      encounterTables: [],
      availableWildkin: [],
    };
    expect(WorldContextSchema.safeParse(empty).success).toBe(true);
  });
});
