import { describe, expect, it } from "vitest";
import type { Polygon, Position } from "@wildbound/shared";
import { EMPTY_WORLD } from "@wildbound/shared";
import {
  changedFields,
  createEncounterTable,
  createHabitat,
  createPoi,
  createRegion,
  deleteEntity,
  editableRings,
  insertVertex,
  isSelfIntersecting,
  moveVertex,
  polygonFromVertices,
  regionAt,
  removeVertex,
  slugify,
  uniqueSlug,
  updateEncounterTable,
  updateHabitat,
} from "./world-edit.ts";

const sq = (lng: number, lat: number, d: number): Position[] => [
  [lng - d, lat - d],
  [lng + d, lat - d],
  [lng + d, lat + d],
  [lng - d, lat + d],
];

function buildWorld() {
  let { world, region } = createRegion(EMPTY_WORLD, polygonFromVertices(sq(121, 14.65, 0.01)));
  const h = createHabitat(world, region.id, polygonFromVertices(sq(121, 14.65, 0.002)));
  world = h.world;
  const p = createPoi(world, region.id, [121.001, 14.651]);
  world = p.world;
  const t = createEncounterTable(world, region.id, h.habitat.id);
  world = t.world;
  return { world, region, habitat: h.habitat, poi: p.poi, table: t.table };
}

describe("slugs", () => {
  it("slugifies names", () => {
    expect(slugify("Mabunyi Nature Reserve")).toBe("mabunyi-nature-reserve");
    expect(slugify("  Sunbreak!! Clearing  ")).toBe("sunbreak-clearing");
    expect(slugify("Ñipa Grove")).toBe("nipa-grove");
    expect(slugify("***")).toBe("item");
  });
  it("generates unique slugs", () => {
    expect(uniqueSlug("Forest Edge", ["forest-edge", "forest-edge-2"])).toBe("forest-edge-3");
    expect(uniqueSlug("Creek", [])).toBe("creek");
  });
});

describe("creating entities", () => {
  it("creates linked region → habitat → POI → encounter table", () => {
    const { world, region, habitat, poi, table } = buildWorld();
    expect(world.regions).toHaveLength(1);
    expect(habitat.regionId).toBe(region.id);
    expect(poi.regionId).toBe(region.id);
    expect(table).toMatchObject({ regionId: region.id, habitatId: habitat.id, entries: [], active: true });
    expect(table.name).toBe("New Habitat Encounters");
  });
  it("gives new siblings unique names and slugs", () => {
    const { world, region } = buildWorld();
    const second = createHabitat(world, region.id, polygonFromVertices(sq(121.005, 14.65, 0.001)));
    expect(second.habitat.name).toBe("New Habitat 2");
    expect(second.habitat.slug).toBe("new-habitat-2");
  });
});

describe("deleting", () => {
  it("cascades a region delete to its habitats, POIs and tables", () => {
    const { world, region } = buildWorld();
    expect(deleteEntity(world, { kind: "region", id: region.id })).toEqual(EMPTY_WORLD);
  });
  it("cascades a habitat delete to its tables only", () => {
    const { world, habitat } = buildWorld();
    const next = deleteEntity(world, { kind: "habitat", id: habitat.id });
    expect(next.habitats).toHaveLength(0);
    expect(next.encounterTables).toHaveLength(0);
    expect(next.pois).toHaveLength(1);
  });
});

describe("relationship-preserving updates", () => {
  it("moves a habitat's tables when the habitat changes region", () => {
    const built = buildWorld();
    const other = createRegion(built.world, polygonFromVertices(sq(122, 14.65, 0.01)));
    const next = updateHabitat(other.world, built.habitat.id, { regionId: other.region.id });
    expect(next.encounterTables[0]!.regionId).toBe(other.region.id);
  });
  it("pins a table to its habitat's region", () => {
    const built = buildWorld();
    const other = createRegion(built.world, polygonFromVertices(sq(122, 14.65, 0.01)));
    const regionTable = createEncounterTable(other.world, other.region.id, null);
    const next = updateEncounterTable(regionTable.world, regionTable.table.id, { habitatId: built.habitat.id });
    expect(next.encounterTables.find((t) => t.id === regionTable.table.id)!.regionId).toBe(built.region.id);
  });
});

describe("vertex editing", () => {
  const poly = polygonFromVertices(sq(0, 0, 1));
  const ref = { part: 0, ring: 0, index: 0 };

  it("keeps rings closed after edits", () => {
    const moved = moveVertex(poly, ref, [-2, -2]);
    const ring = moved.coordinates[0]!;
    expect(ring[0]).toEqual([-2, -2]);
    expect(ring[ring.length - 1]).toEqual([-2, -2]);
  });
  it("inserts and removes vertices but never below three", () => {
    const inserted = insertVertex(poly, ref, [0, -1.5]);
    expect(editableRings(inserted)[0]![0]).toHaveLength(5);
    expect(editableRings(inserted)[0]![0]![1]).toEqual([0, -1.5]);
    const tri: Polygon = polygonFromVertices([[0, 0], [1, 0], [0, 1]]);
    expect(removeVertex(tri, ref)).toBe(tri);
    expect(editableRings(removeVertex(poly, ref))[0]![0]).toHaveLength(3);
  });
  it("edits multipolygon parts independently", () => {
    const multi = { type: "MultiPolygon" as const, coordinates: [poly.coordinates, polygonFromVertices(sq(5, 5, 1)).coordinates] };
    const moved = moveVertex(multi, { part: 1, ring: 0, index: 2 }, [9, 9]);
    expect(moved.coordinates[0]).toEqual(poly.coordinates);
    expect(moved.coordinates[1]![0]![2]).toEqual([9, 9]);
  });
  it("detects self-intersecting drawings", () => {
    expect(isSelfIntersecting([[0, 0], [1, 1], [1, 0], [0, 1]])).toBe(true);
    expect(isSelfIntersecting(sq(0, 0, 1))).toBe(false);
    expect(() => polygonFromVertices([[0, 0], [1, 1]])).toThrow();
  });
});

describe("regionAt", () => {
  it("prefers the smallest containing region, like the resolver", () => {
    const big = createRegion(EMPTY_WORLD, polygonFromVertices(sq(121, 14.65, 0.05)));
    const small = createRegion(big.world, polygonFromVertices(sq(121, 14.65, 0.01)));
    expect(regionAt(small.world, [121, 14.65])?.id).toBe(small.region.id);
    expect(regionAt(small.world, [121.03, 14.65])?.id).toBe(big.region.id);
    expect(regionAt(small.world, [130, 10])).toBeUndefined();
  });
});

describe("changedFields", () => {
  const habitat = { name: "Forest", habitatTags: ["canopy"], conditionRules: { timeOfDay: [], weather: ["rain"] } };

  it("keeps only the fields whose value changed (deep)", () => {
    expect(
      changedFields(habitat, { name: "Forest", habitatTags: ["canopy", "fern"], conditionRules: { timeOfDay: [], weather: ["rain"] } }),
    ).toEqual({ habitatTags: ["canopy", "fern"] });
  });

  it("is empty when nothing changed, so no undo step is recorded", () => {
    expect(changedFields(habitat, { ...habitat, habitatTags: [...habitat.habitatTags] })).toEqual({});
  });

  it("treats null and a value as different", () => {
    expect(changedFields<{ interactionId: string | null }>({ interactionId: null }, { interactionId: "gate" })).toEqual({ interactionId: "gate" });
  });
});
