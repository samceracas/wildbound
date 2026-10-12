import { describe, expect, it } from "vitest";
import type { WorldDocument } from "@wildbound/shared";
import { CREATURE_IDS, IDS, sampleWorld, square } from "./__fixtures__/world.ts";
import { checkIntegrity, schemaIssues, validateWorld } from "./validation.ts";

const codes = (doc: WorldDocument) => validateWorld(doc, CREATURE_IDS).issues.map((i) => `${i.severity}:${i.code}`);

describe("validateWorld", () => {
  it("accepts the sample world without errors", () => {
    const report = validateWorld(sampleWorld(), CREATURE_IDS);
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("flags a habitat clearly outside its region as an error", () => {
    const doc = sampleWorld();
    doc.habitats[0]!.geometry = square(121.1, 14.75, 0.001);
    expect(codes(doc)).toContain("error:habitat-outside-region");
  });

  it("warns when a habitat only partially leaves its region", () => {
    const doc = sampleWorld();
    // Straddles the west edge: roughly a third outside.
    doc.habitats[0]!.geometry = square(120.9955, 14.65, 0.0015);
    const c = codes(doc);
    expect(c).toContain("warning:habitat-partially-outside-region");
    expect(c).not.toContain("error:habitat-outside-region");
  });

  it("rejects POIs outside their region", () => {
    const doc = sampleWorld();
    doc.pois[0]!.location = { type: "Point", coordinates: [121.2, 14.65] };
    expect(codes(doc)).toContain("error:poi-outside-region");
  });

  it("rejects active empty encounter tables but allows inactive ones", () => {
    const doc = sampleWorld();
    doc.encounterTables[0]!.entries = [];
    expect(codes(doc)).toContain("error:empty-encounter-table");
    doc.encounterTables[0]!.active = false;
    expect(codes(doc)).not.toContain("error:empty-encounter-table");
  });

  it("warns about overlapping habitats and missing encounter tables", () => {
    const doc = sampleWorld();
    doc.habitats[1]!.geometry = square(120.999, 14.65, 0.0015);
    expect(codes(doc)).toContain("warning:habitats-overlap");
    expect(codes(doc)).toContain("warning:habitat-without-encounters");
  });

  it("warns when nothing is active", () => {
    const doc = sampleWorld();
    doc.regions[0]!.active = false;
    expect(codes(doc)).toContain("warning:no-active-region");
  });
});

describe("checkIntegrity", () => {
  it("requires parent regions for habitats and POIs", () => {
    const doc = sampleWorld();
    doc.habitats[0]!.regionId = "10000000-0000-4000-8000-0000000000ff";
    doc.pois[0]!.regionId = "10000000-0000-4000-8000-0000000000ff";
    const issues = checkIntegrity(doc, CREATURE_IDS);
    expect(issues.filter((i) => i.code === "missing-region").map((i) => i.entityType).sort()).toEqual(["habitat", "poi"]);
  });

  it("requires encounter entries to reference known Wildkin", () => {
    const doc = sampleWorld();
    doc.encounterTables[0]!.entries[0]!.creatureId = "missingno";
    expect(checkIntegrity(doc, CREATURE_IDS).map((i) => i.code)).toContain("unknown-creature");
  });

  it("requires table habitats to exist and belong to the table's region", () => {
    const doc = sampleWorld();
    doc.encounterTables[0]!.habitatId = "20000000-0000-4000-8000-0000000000ff";
    expect(checkIntegrity(doc, CREATURE_IDS).map((i) => i.code)).toContain("missing-habitat");

    const doc2 = sampleWorld();
    doc2.regions.push({ ...doc2.regions[0]!, id: "10000000-0000-4000-8000-000000000002", slug: "other" });
    doc2.encounterTables[0]!.regionId = "10000000-0000-4000-8000-000000000002";
    expect(checkIntegrity(doc2, CREATURE_IDS).map((i) => i.code)).toContain("habitat-region-mismatch");
  });

  it("rejects duplicate slugs within scope but allows the same slug in different regions", () => {
    const doc = sampleWorld();
    doc.habitats[1]!.slug = doc.habitats[0]!.slug;
    expect(checkIntegrity(doc, CREATURE_IDS).map((i) => i.code)).toContain("duplicate-slug");

    const doc2 = sampleWorld();
    const otherRegion = { ...doc2.regions[0]!, id: "10000000-0000-4000-8000-000000000002", slug: "other-region" };
    doc2.regions.push(otherRegion);
    doc2.habitats[1]!.slug = doc2.habitats[0]!.slug;
    doc2.habitats[1]!.regionId = otherRegion.id;
    doc2.encounterTables = doc2.encounterTables.filter((t) => t.habitatId !== IDS.creek);
    expect(checkIntegrity(doc2, CREATURE_IDS)).toEqual([]);

    const doc3 = sampleWorld();
    doc3.regions.push({ ...doc3.regions[0]!, id: "10000000-0000-4000-8000-000000000002" });
    expect(checkIntegrity(doc3, CREATURE_IDS).map((i) => i.code)).toContain("duplicate-slug");
  });

  it("rejects duplicate ids and self-intersecting boundaries", () => {
    const doc = sampleWorld();
    doc.pois.push({ ...doc.pois[0]!, slug: "copy" });
    expect(checkIntegrity(doc, CREATURE_IDS).map((i) => i.code)).toContain("duplicate-id");

    const bowtie = sampleWorld();
    bowtie.habitats[0]!.geometry = {
      type: "Polygon",
      coordinates: [[[120.997, 14.649], [120.999, 14.651], [120.999, 14.649], [120.997, 14.651], [120.997, 14.649]]],
    };
    expect(checkIntegrity(bowtie, CREATURE_IDS).map((i) => i.code)).toContain("invalid-geometry");
  });
});

describe("schemaIssues", () => {
  it("turns malformed payloads into issues", () => {
    const { doc, issues } = schemaIssues({ regions: [{ id: "nope" }], habitats: [], pois: [], encounterTables: [] });
    expect(doc).toBeNull();
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.code).toBe("schema");
  });
  it("passes valid documents through", () => {
    expect(schemaIssues(sampleWorld()).doc).not.toBeNull();
  });
});
