import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { DbHandle } from "@wildbound/db";
import { openTestDb, resetTestData } from "@wildbound/db/testing";
import { EditorWorldResponseSchema, PublishedWorldResponseSchema, WorldContextSchema, type WorldDocument } from "@wildbound/shared";
import { createApp } from "../src/app.ts";
import { StaticWeather } from "../src/weather.ts";
import { testConfig } from "./helpers.ts";
// Shared fixture: region square at (121, 14.65); forest west, creek east.
import { IDS, sampleWorld, square } from "../../../packages/world/src/__fixtures__/world.ts";

const TOKEN = "test-editor-token";
const auth = { authorization: `Bearer ${TOKEN}` };

// Coordinates inside the fixture world.
const FOREST = { lat: 14.65, lng: 120.998 };
const CREEK = { lat: 14.65, lng: 121.002 };
const OPEN_GROUND = { lat: 14.654, lng: 121.0 }; // in region, outside both habitats
const OUTSIDE = { lat: 14.7, lng: 121.1 };

let handle: DbHandle;
let express: Express;

/** Small adapter so the assertions read like the original Fastify `app.inject` tests. */
const app = {
  async inject(opts: { method: string; url: string; headers?: Record<string, string>; payload?: object }) {
    let req = request(express)[opts.method.toLowerCase() as "get" | "put" | "post"](opts.url);
    for (const [k, v] of Object.entries(opts.headers ?? {})) req = req.set(k, v);
    const res = opts.payload === undefined ? await req : await req.send(opts.payload);
    return { statusCode: res.status, body: res.text, json: () => res.body };
  },
};

beforeAll(async () => {
  handle = await openTestDb();
  express = createApp({ db: handle.db, config: testConfig({ editorToken: TOKEN }), weather: new StaticWeather() });
});

afterAll(async () => {
  await handle?.close();
});

beforeEach(async () => {
  await resetTestData(handle);
});

const saveDraft = (doc: unknown) => app.inject({ method: "PUT", url: "/api/editor/draft", headers: auth, payload: doc as object });
const publish = () => app.inject({ method: "POST", url: "/api/editor/publish", headers: auth });
async function resolve(c: { lat: number; lng: number }, extra: Record<string, string> = {}) {
  const query = new URLSearchParams({ lat: String(c.lat), lng: String(c.lng), timeOfDay: "day", weather: "clear", ...extra });
  const res = await app.inject({ method: "GET", url: `/api/editor/resolve?${query}`, headers: auth });
  expect(res.statusCode, res.body).toBe(200);
  return WorldContextSchema.parse(res.json());
}

describe("authorization", () => {
  it("rejects editor routes without a valid token", async () => {
    for (const [method, url] of [
      ["GET", "/api/editor/world"],
      ["PUT", "/api/editor/draft"],
      ["POST", "/api/editor/validate"],
      ["POST", "/api/editor/publish"],
      ["GET", "/api/editor/published"],
      ["GET", `/api/editor/resolve?lat=${FOREST.lat}&lng=${FOREST.lng}`],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(401);
      expect((await app.inject({ method, url, headers: { authorization: "Bearer wrong" } })).statusCode).toBe(401);
    }
  });

  it("no longer exposes coordinate resolution or the whole world publicly", async () => {
    // These used to be public, which let anyone look up any coordinate ("teleport").
    for (const url of [`/api/world/resolve?lat=${FOREST.lat}&lng=${FOREST.lng}`, "/api/world/published", "/api/creatures"]) {
      expect((await app.inject({ method: "GET", url })).statusCode, url).toBe(404);
    }
    const draft = `/api/editor/resolve?lat=${FOREST.lat}&lng=${FOREST.lng}&stage=draft`;
    expect((await app.inject({ method: "GET", url: draft, headers: auth })).statusCode).toBe(200);
  });
});

describe("authoring workflow: region → habitat → POI → encounter table → publish → resolve", () => {
  it("persists each step and resolves simulated coordinates", async () => {
    const full = sampleWorld();
    const steps: WorldDocument[] = [
      { regions: full.regions, habitats: [], pois: [], encounterTables: [] },
      { regions: full.regions, habitats: full.habitats, pois: [], encounterTables: [] },
      { regions: full.regions, habitats: full.habitats, pois: full.pois, encounterTables: [] },
      full,
    ];
    for (const step of steps) {
      const res = await saveDraft(step);
      expect(res.statusCode, res.body).toBe(200);
    }

    // Reopen: the draft round-trips (regions come back as MultiPolygon).
    const reopened = EditorWorldResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/editor/world", headers: auth })).json(),
    );
    expect(reopened.draft.habitats.map((h) => h.slug).sort()).toEqual(["forest-edge", "silayan-creekside"]);
    expect(reopened.draft.pois[0]!.location.coordinates).toEqual([120.9985, 14.65]);
    expect(reopened.draft.encounterTables.find((t) => t.id === IDS.forestTable)!.entries.map((e) => e.creatureId)).toEqual([
      "kawi",
      "mimu",
      "kantar",
    ]);
    expect(reopened.creatures.map((c) => c.id).sort()).toEqual(["kantar", "kawi", "lumae", "mimu", "riverkin"]);
    expect(reopened.status.hasUnpublishedChanges).toBe(true);

    // Nothing is published yet: resolution is empty, not an error.
    expect((await resolve(FOREST)).region).toBeNull();

    const pub = await publish();
    expect(pub.statusCode, pub.body).toBe(200);
    expect(pub.json().version).toBe(1);

    const forest = await resolve(FOREST);
    expect(forest.version).toBe(1);
    expect(forest.region?.slug).toBe("mabunyi-nature-reserve");
    expect(forest.habitat?.slug).toBe("forest-edge");
    expect(forest.nearbyPois.map((p) => p.slug)).toEqual(["east-research-gate"]);
    expect(forest.nearbyPois[0]!.distanceMeters).toBeGreaterThan(40);
    expect(forest.nearbyPois[0]!.distanceMeters).toBeLessThan(70);
    expect(forest.availableWildkin.map((w) => w.creatureId)).toEqual(["kawi", "mimu", "kantar"]);
    expect(forest.environment.tags).toEqual(["tropical-forest", "forest-edge", "canopy"]);

    const creek = await resolve(CREEK);
    expect(creek.habitat?.slug).toBe("silayan-creekside");
    expect(creek.nearbyPois).toEqual([]); // gate is ~380 m away, beyond the default 300 m
    expect(creek.availableWildkin).toEqual([]);

    const open = await resolve(OPEN_GROUND);
    expect(open.region?.slug).toBe("mabunyi-nature-reserve");
    expect(open.habitat).toBeNull();

    const outside = await resolve(OUTSIDE);
    expect(outside).toMatchObject({ region: null, habitat: null, nearbyPois: [], encounterTables: [], availableWildkin: [] });
  });

  it("applies time-of-day and weather rules without code changes", async () => {
    await saveDraft(sampleWorld());
    await publish();

    const night = await resolve(FOREST, { timeOfDay: "night" });
    expect(night.availableWildkin.map((w) => w.creatureId)).toEqual(["kawi", "mimu"]); // kantar is day-only

    const rain = await resolve(CREEK, { weather: "rain" });
    expect(rain.availableWildkin.map((w) => w.creatureId)).toEqual(["riverkin"]); // region-wide rain table

    const wide = await resolve(CREEK, { radius: "1000" });
    expect(wide.nearbyPois.map((p) => p.slug)).toEqual(["east-research-gate"]);
  });
});

describe("draft / published isolation", () => {
  it("keeps published data stable while the draft changes", async () => {
    await saveDraft(sampleWorld());
    await publish();

    const edited = sampleWorld();
    edited.habitats[0]!.name = "Renamed Forest";
    edited.pois = [];
    edited.regions[0]!.active = true;
    expect((await saveDraft(edited)).statusCode).toBe(200);

    const status = (await app.inject({ method: "GET", url: "/api/editor/world", headers: auth })).json().status;
    expect(status.hasUnpublishedChanges).toBe(true);

    const published = await resolve(FOREST);
    expect(published.habitat?.name).toBe("Forest Edge");
    expect(published.nearbyPois).toHaveLength(1);

    const draft = await resolve(FOREST, { stage: "draft" });
    expect(draft.habitat?.name).toBe("Renamed Forest");
    expect(draft.nearbyPois).toHaveLength(0);
    expect(draft.version).toBeNull();

    expect((await publish()).json().version).toBe(2);
    expect((await resolve(FOREST)).habitat?.name).toBe("Renamed Forest");
  });

  it("deleting a region in the draft does not remove it from the published world", async () => {
    await saveDraft(sampleWorld());
    await publish();
    await saveDraft({ regions: [], habitats: [], pois: [], encounterTables: [] });
    expect((await resolve(FOREST)).region?.slug).toBe("mabunyi-nature-reserve");
    expect((await resolve(FOREST, { stage: "draft" })).region).toBeNull();
  });

  it("refuses to publish an invalid draft and leaves the published world untouched", async () => {
    await saveDraft(sampleWorld());
    await publish();

    const bad = sampleWorld();
    bad.habitats[0]!.geometry = square(121.2, 14.8, 0.001); // clearly outside the region
    const saved = await saveDraft(bad);
    expect(saved.statusCode).toBe(200); // saving drafts with publish errors is allowed…
    expect(saved.json().report.ok).toBe(false);

    const res = await publish(); // …publishing is not
    expect(res.statusCode).toBe(409);
    expect(res.json().issues.map((i: { code: string }) => i.code)).toContain("habitat-outside-region");
    expect((await resolve(FOREST)).habitat?.slug).toBe("forest-edge");
  });

  it("inactive regions are not resolvable", async () => {
    const doc = sampleWorld();
    doc.regions[0]!.active = false;
    await saveDraft(doc);
    await publish();
    expect((await resolve(FOREST)).region).toBeNull();
  });
});

describe("GET /api/editor/published", () => {
  const getPublished = () => app.inject({ method: "GET", url: "/api/editor/published", headers: auth });

  it("is empty before anything is published", async () => {
    await saveDraft(sampleWorld());
    const body = PublishedWorldResponseSchema.parse((await getPublished()).json());
    expect(body.version).toBeNull();
    expect(body.world).toEqual({ regions: [], habitats: [], pois: [], encounterTables: [] });
    expect(body.creatures).toHaveLength(5);
  });

  it("returns the published world and ignores later draft edits", async () => {
    await saveDraft(sampleWorld());
    await publish();
    const edited = sampleWorld();
    edited.habitats = [];
    edited.encounterTables = [];
    await saveDraft(edited);

    const res = await getPublished();
    expect(res.statusCode).toBe(200);
    const body = PublishedWorldResponseSchema.parse(res.json());
    expect(body.version).toBe(1);
    expect(body.world.regions.map((r) => r.slug)).toEqual(["mabunyi-nature-reserve"]);
    expect(body.world.habitats).toHaveLength(2);
    expect(body.world.pois).toHaveLength(1);
    expect(body.world.encounterTables).toHaveLength(2);
  });

  it("leaves out inactive regions and their children", async () => {
    const doc = sampleWorld();
    doc.regions[0]!.active = false;
    await saveDraft(doc);
    await publish();
    expect(PublishedWorldResponseSchema.parse((await getPublished()).json()).world.regions).toEqual([]);
  });
});

describe("payload validation", () => {
  it("rejects malformed world documents", async () => {
    const res = await saveDraft({ regions: [{ id: "x" }] });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues.length).toBeGreaterThan(0);
  });

  it("rejects unknown Wildkin, broken references and duplicate slugs", async () => {
    const unknown = sampleWorld();
    unknown.encounterTables[0]!.entries[0]!.creatureId = "missingno";
    expect((await saveDraft(unknown)).json().issues[0].code).toBe("unknown-creature");

    const orphan = sampleWorld();
    orphan.pois[0]!.regionId = "10000000-0000-4000-8000-0000000000ff";
    expect((await saveDraft(orphan)).statusCode).toBe(400);

    const dup = sampleWorld();
    dup.habitats[1]!.slug = "forest-edge";
    const res = await saveDraft(dup);
    expect(res.statusCode).toBe(400);
    expect(res.json().issues.map((i: { code: string }) => i.code)).toContain("duplicate-slug");
  });

  it("rejects self-intersecting geometry and leaves the previous draft intact", async () => {
    await saveDraft(sampleWorld());
    const bowtie = sampleWorld();
    bowtie.habitats[0]!.geometry = {
      type: "Polygon",
      coordinates: [[[120.997, 14.649], [120.999, 14.651], [120.999, 14.649], [120.997, 14.651], [120.997, 14.649]]],
    };
    expect((await saveDraft(bowtie)).statusCode).toBe(400);
    const world = (await app.inject({ method: "GET", url: "/api/editor/world", headers: auth })).json();
    expect(world.draft.habitats).toHaveLength(2);
  });

  it("rejects malformed coordinates", async () => {
    for (const q of ["lat=95&lng=121", "lat=14&lng=200", "lat=abc&lng=121", "lng=121", "lat=14&lng=121&radius=0"]) {
      const res = await app.inject({ method: "GET", url: `/api/editor/resolve?${q}`, headers: auth });
      expect(res.statusCode, q).toBe(400);
    }
  });

  it("validates unsaved documents without persisting them", async () => {
    const bad = sampleWorld();
    bad.pois[0]!.location = { type: "Point", coordinates: [121.3, 14.65] };
    const res = await app.inject({ method: "POST", url: "/api/editor/validate", headers: auth, payload: bad });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(false);
    const world = (await app.inject({ method: "GET", url: "/api/editor/world", headers: auth })).json();
    expect(world.draft.pois).toHaveLength(0);
  });
});

describe("wild levels and license requirements (v0.3.0)", () => {
  it("saves and publishes table level ranges, entry overrides and habitat license requirements", async () => {
    const doc = sampleWorld();
    doc.encounterTables[0]!.minLevel = 3;
    doc.encounterTables[0]!.maxLevel = 8;
    doc.encounterTables[0]!.entries[0]!.minLevel = 5;
    doc.encounterTables[0]!.entries[0]!.maxLevel = 12;
    doc.habitats[1]!.licenseRequirement = { category: "aquatic", rank: 3 };
    const saved = await saveDraft(doc);
    expect(saved.statusCode, saved.body).toBe(200);

    const draft = EditorWorldResponseSchema.parse((await app.inject({ method: "GET", url: "/api/editor/world", headers: auth })).json()).draft;
    const table = draft.encounterTables.find((t) => t.id === IDS.forestTable)!;
    expect(table).toMatchObject({ minLevel: 3, maxLevel: 8 });
    expect(table.entries.find((e) => e.id === IDS.e1)).toMatchObject({ minLevel: 5, maxLevel: 12 });
    expect(table.entries.find((e) => e.id === IDS.e2)).toMatchObject({ minLevel: null, maxLevel: null });
    expect(draft.habitats.find((h) => h.id === IDS.creek)?.licenseRequirement).toEqual({ category: "aquatic", rank: 3 });

    expect((await publish()).statusCode).toBe(200);
    const published = PublishedWorldResponseSchema.parse((await app.inject({ method: "GET", url: "/api/editor/published", headers: auth })).json()).world;
    expect(published.encounterTables.find((t) => t.id === IDS.forestTable)?.entries[0]).toMatchObject({ minLevel: 5, maxLevel: 12 });
    expect(published.habitats.find((h) => h.id === IDS.creek)?.licenseRequirement).toEqual({ category: "aquatic", rank: 3 });

    // Resolution carries the effective ranges and the requirement.
    const forest = await resolve(FOREST, { stage: "published" });
    expect(forest.availableWildkin.find((w) => w.creatureId === "kawi")?.levelBands).toEqual([{ minLevel: 5, maxLevel: 12, weight: 40 }]);
    expect(forest.availableWildkin.find((w) => w.creatureId === "mimu")?.levelBands).toEqual([{ minLevel: 3, maxLevel: 8, weight: 35 }]);
    expect((await resolve(CREEK, { stage: "published" })).habitat?.licenseRequirement).toEqual({ category: "aquatic", rank: 3 });
  });

  it("refuses invalid level ranges and warns about ranges crossing a license band", async () => {
    const bad = sampleWorld();
    bad.encounterTables[0]!.minLevel = 9;
    bad.encounterTables[0]!.maxLevel = 4;
    const refused = await saveDraft(bad);
    expect(refused.statusCode).toBe(400);
    expect(refused.body).toMatch(/level/i);

    const oneBound = sampleWorld() as unknown as { encounterTables: { entries: { minLevel: number | null }[] }[] };
    oneBound.encounterTables[0]!.entries[0]!.minLevel = 4;
    expect((await saveDraft(oneBound)).statusCode).toBe(400);

    const crossing = sampleWorld();
    crossing.encounterTables[0]!.minLevel = 18;
    crossing.encounterTables[0]!.maxLevel = 24;
    const saved = await saveDraft(crossing);
    expect(saved.statusCode, saved.body).toBe(200);
    const codes = saved.json().report.issues.map((i: { code: string }) => i.code);
    expect(codes).toContain("level-range-crosses-band");
  });
});
