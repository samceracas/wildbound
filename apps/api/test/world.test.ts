import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { DbHandle } from "@wildbound/db";
import { openTestDb, resetTestData } from "@wildbound/db/testing";
import { EditorWorldResponseSchema, PublishedWorldResponseSchema, WorldContextSchema, type WorldDocument } from "@wildbound/shared";
import { buildApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
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
let app: FastifyInstance;

beforeAll(async () => {
  handle = await openTestDb();
  const config: ApiConfig = {
    databaseUrl: "",
    port: 0,
    host: "127.0.0.1",
    editorToken: TOKEN,
    corsOrigins: [],
    worldTimeZone: "Asia/Manila",
  };
  app = await buildApp({ db: handle.db, config });
});

afterAll(async () => {
  await app?.close();
  await handle?.close();
});

beforeEach(async () => {
  await resetTestData(handle);
});

const saveDraft = (doc: unknown) => app.inject({ method: "PUT", url: "/api/editor/draft", headers: auth, payload: doc as object });
const publish = () => app.inject({ method: "POST", url: "/api/editor/publish", headers: auth });
async function resolve(c: { lat: number; lng: number }, extra: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const query = new URLSearchParams({ lat: String(c.lat), lng: String(c.lng), timeOfDay: "day", weather: "clear", ...extra });
  const res = await app.inject({ method: "GET", url: `/api/world/resolve?${query}`, headers });
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
    ] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(401);
      expect((await app.inject({ method, url, headers: { authorization: "Bearer wrong" } })).statusCode).toBe(401);
    }
  });

  it("only lets editors resolve against the draft", async () => {
    const url = `/api/world/resolve?lat=${FOREST.lat}&lng=${FOREST.lng}&stage=draft`;
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url, headers: auth })).statusCode).toBe(200);
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

    const draft = await resolve(FOREST, { stage: "draft" }, auth);
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
    expect((await resolve(FOREST, { stage: "draft" }, auth)).region).toBeNull();
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

describe("GET /api/world/published", () => {
  const getPublished = () => app.inject({ method: "GET", url: "/api/world/published" });

  it("is public and empty before anything is published", async () => {
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
      const res = await app.inject({ method: "GET", url: `/api/world/resolve?${q}` });
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
