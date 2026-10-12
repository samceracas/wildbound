import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { WorldDocument } from "@wildbound/shared";
import { validateWorld } from "@wildbound/world";
import { CREATURE_IDS, IDS, sampleWorld, square } from "../../world/src/__fixtures__/world.ts";
import type { DbHandle } from "../src/client.ts";
import { openTestDb, resetTestData } from "../src/testing.ts";
import { findSpatialContext, getWorldStatus, loadWorld, publishDraft, saveDraft } from "../src/world-repo.ts";
import { seedMabunyiWorld } from "../src/seed-data.ts";

let handle: DbHandle;
beforeAll(async () => {
  handle = await openTestDb();
});
afterAll(async () => handle?.close());
beforeEach(async () => resetTestData(handle));

const at = (lng: number, lat: number, stage: "draft" | "published" = "draft", radiusMeters = 300) =>
  findSpatialContext(handle.db, { stage, lat, lng, radiusMeters });

describe("PostGIS spatial resolution", () => {
  it("resolves point-in-polygon for region and habitat", async () => {
    await saveDraft(handle.db, sampleWorld());
    const ctx = await at(120.998, 14.65);
    expect(ctx.region?.id).toBe(IDS.region);
    expect(ctx.habitat?.id).toBe(IDS.forest);
    expect((await at(121.2, 14.65)).region).toBeNull();
  });

  it("treats boundary points as inside (ST_Covers)", async () => {
    await saveDraft(handle.db, sampleWorld());
    expect((await at(120.995, 14.65)).region?.id).toBe(IDS.region); // exactly on the west edge
  });

  it("picks the smallest habitat where habitats overlap", async () => {
    const doc: WorldDocument = sampleWorld();
    doc.habitats.push({ ...doc.habitats[0]!, id: "20000000-0000-4000-8000-000000000003", slug: "fern-hollow", geometry: square(120.998, 14.65, 0.0003) });
    await saveDraft(handle.db, doc);
    expect((await at(120.998, 14.65)).habitat?.slug).toBe("fern-hollow");
    expect((await at(120.9972, 14.65)).habitat?.slug).toBe("forest-edge");
  });

  it("returns nearby POIs ordered by geodesic distance within the radius", async () => {
    const doc = sampleWorld();
    doc.pois.push({ ...doc.pois[0]!, id: "30000000-0000-4000-8000-000000000002", slug: "root-hollow", location: { type: "Point", coordinates: [120.998, 14.6503] } });
    await saveDraft(handle.db, doc);
    const ctx = await at(120.998, 14.65);
    expect(ctx.pois.map((p) => p.slug)).toEqual(["root-hollow", "east-research-gate"]);
    expect(ctx.pois[0]!.distanceMeters).toBeCloseTo(33.2, 0); // 0.0003° latitude ≈ 33 m
    expect((await at(120.998, 14.65, "draft", 20)).pois).toEqual([]);
  });

  it("only returns encounter tables for the region and resolved habitat", async () => {
    await saveDraft(handle.db, sampleWorld());
    const forest = await at(120.998, 14.65);
    expect(forest.tables.map((t) => t.id).sort()).toEqual([IDS.forestTable, IDS.regionTable].sort());
    const creek = await at(121.002, 14.65);
    expect(creek.tables.map((t) => t.id)).toEqual([IDS.regionTable]);
  });
});

describe("draft and publish storage", () => {
  it("round-trips the draft and normalizes regions to MultiPolygon", async () => {
    const doc = sampleWorld();
    doc.regions[0]!.geometry = square(121, 14.65, 0.005);
    await saveDraft(handle.db, doc);
    const loaded = await loadWorld(handle.db, "draft");
    expect(loaded.regions[0]!.geometry.type).toBe("MultiPolygon");
    expect(loaded.habitats).toHaveLength(2);
    expect(loaded.encounterTables.find((t) => t.id === IDS.forestTable)!.entries).toHaveLength(3);
  });

  it("publishes a copy that is isolated from later draft edits", async () => {
    await saveDraft(handle.db, sampleWorld());
    const result = await publishDraft(handle.db, (d) => validateWorld(d, CREATURE_IDS));
    expect(result.ok).toBe(true);
    await saveDraft(handle.db, { regions: [], habitats: [], pois: [], encounterTables: [] });
    expect((await loadWorld(handle.db, "draft")).regions).toHaveLength(0);
    expect((await loadWorld(handle.db, "published")).regions).toHaveLength(1);
    expect((await at(120.998, 14.65, "published")).version).toBe(1);
    expect((await getWorldStatus(handle.db)).hasUnpublishedChanges).toBe(true);
  });

  it("does not publish when validation fails", async () => {
    await saveDraft(handle.db, sampleWorld());
    const result = await publishDraft(handle.db, () => ({ ok: false, issues: [] }));
    expect(result.ok).toBe(false);
    expect((await loadWorld(handle.db, "published")).regions).toHaveLength(0);
    expect((await getWorldStatus(handle.db)).publishedVersion).toBeNull();
  });

  it("seed world (Mabunyi) saves, validates and resolves its habitats", async () => {
    const mabunyi = seedMabunyiWorld();
    expect(validateWorld(mabunyi, CREATURE_IDS).ok).toBe(true);
    await saveDraft(handle.db, mabunyi);
    const result = await publishDraft(handle.db, (d) => validateWorld(d, CREATURE_IDS));
    expect(result.ok).toBe(true);
    // One coordinate per habitat (Sunbreak, Zigzag trail, Silayan Creek POIs sit inside them).
    const expectations: [number, number, string][] = [
      [121.0444, 14.6518, "sunbreak-clearing"],
      [121.0418, 14.6512, "forest-edge"],
      [121.0447, 14.6494, "silayan-creekside"],
    ];
    for (const [lng, lat, slug] of expectations) {
      expect((await at(lng, lat, "published")).habitat?.slug).toBe(slug);
    }
  });
});
