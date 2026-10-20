import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { DbHandle } from "@wildbound/db";
import { listCreatures, seedWildkinBible, seedWildkinEntries } from "@wildbound/db";
import { openTestDb, resetTestData } from "@wildbound/db/testing";
import {
  AssistResponseSchema,
  GenerateArtResponseSchema,
  WildkinEntrySchema,
  WildkinListResponseSchema,
  WildkinStatsSchema,
  type ArtBalance,
  type AssistRequest,
} from "@wildbound/shared";
import { createApp } from "../src/app.ts";
import type { ArtGenerator } from "../src/manager/art.ts";
import type { AssistContext, RawSuggestion, WildkinAssistant } from "../src/manager/assistant.ts";
import { StaticWeather } from "../src/weather.ts";
import { testConfig } from "./helpers.ts";

const TOKEN = "test-editor-token";
// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

class FakeAssistant implements WildkinAssistant {
  readonly model = "fake-model";
  last: { request: AssistRequest; context: AssistContext } | null = null;
  next: RawSuggestion = { entry: {}, notes: [] };
  async suggest(request: AssistRequest, context: AssistContext) {
    this.last = { request, context };
    return this.next;
  }
}

class FakeArt implements ArtGenerator {
  readonly model = "fake-pixen";
  balanceValue: ArtBalance = { generations: 10, usd: 0 };
  calls: { description: string; size: number }[] = [];
  async balance() {
    return this.balanceValue;
  }
  async generate(args: { description: string; size: number }) {
    this.calls.push(args);
    this.balanceValue = { ...this.balanceValue, generations: (this.balanceValue.generations ?? 0) - 1 };
    return PNG;
  }
}

let handle: DbHandle;
let app: Express;
let bare: Express;
const assistant = new FakeAssistant();
const art = new FakeArt();

const auth = { Authorization: `Bearer ${TOKEN}` };
const api = (method: "get" | "post" | "put" | "delete", path: string, target = app) =>
  request(target)[method](`/api/manager${path}`).set(auth);

const draft = (over: Record<string, unknown> = {}) => ({
  id: "lampyra",
  registryNumber: 6,
  name: "Lampyra",
  classification: "Glowing Moth Wildkin",
  identity: "A soft-winged moth Wildkin whose wing spots glow faintly at dusk.",
  physicalDescription: "A palm-sized moth with dusty violet wings and two pale glowing eye-spots.",
  habitatTags: ["forest-edge", "flowering"],
  habitatSummary: "Flowering forest edges at dusk.",
  activityPattern: "crepuscular",
  rarity: "uncommon",
  movementStyle: "darter",
  ...over,
});

beforeAll(async () => {
  handle = await openTestDb();
  const base = {
    db: handle.db,
    config: testConfig({ editorToken: TOKEN }),
    weather: new StaticWeather(),
  };
  app = createApp({ ...base, assistant, art });
  bare = createApp(base);
});
afterAll(async () => handle?.close());
beforeEach(async () => {
  await resetTestData(handle);
  await seedWildkinEntries(handle.db, seedWildkinBible());
  art.balanceValue = { generations: 10, usd: 0 };
  art.calls = [];
});

describe("auth", () => {
  it("requires the editor token", async () => {
    expect((await request(app).get("/api/manager/stats")).status).toBe(401);
  });
});

describe("encyclopedia CRUD + publish", () => {
  it("lists the seeded Bible entries as published", async () => {
    const res = await api("get", "/wildkin");
    expect(res.status).toBe(200);
    const { wildkin } = WildkinListResponseSchema.parse(res.body);
    expect(wildkin.map((w) => w.id)).toEqual(["kawi", "mimu", "lumae", "kantar", "riverkin"]);
    expect(wildkin.every((w) => w.status === "published")).toBe(true);
    const stats = WildkinStatsSchema.parse((await api("get", "/stats")).body);
    expect(stats).toMatchObject({ total: 5, published: 5, drafts: 0, nextRegistryNumber: 6 });
  });

  it("creates a draft that is not in the game until published", async () => {
    const created = await api("post", "/wildkin").send(draft());
    expect(created.status, created.text).toBe(201);
    expect(WildkinEntrySchema.parse(created.body)).toMatchObject({ status: "draft", publishedAt: null });
    expect((await listCreatures(handle.db)).some((c) => c.id === "lampyra")).toBe(false);

    const published = await api("post", "/wildkin/lampyra/publish");
    expect(published.status, published.text).toBe(200);
    expect(published.body).toMatchObject({ status: "published", hasUnpublishedChanges: false });
    const creature = (await listCreatures(handle.db)).find((c) => c.id === "lampyra");
    expect(creature).toMatchObject({
      registryNumber: 6,
      description: draft().identity,
      habitatAffinity: ["forest-edge", "flowering"],
      movementStyle: "darter",
      rarity: "uncommon",
    });

    // The editor sees it right away.
    const world = await request(app).get("/api/editor/world").set(auth);
    expect(world.body.creatures.map((c: { id: string }) => c.id)).toContain("lampyra");
  });

  it("tracks edits made after publishing", async () => {
    await api("post", "/wildkin").send(draft());
    await api("post", "/wildkin/lampyra/publish");
    await new Promise((r) => setTimeout(r, 5));
    const updated = await api("put", "/wildkin/lampyra").send(draft({ name: "Lampyra Moth" }));
    expect(updated.body).toMatchObject({ status: "published", hasUnpublishedChanges: true });
    expect((await listCreatures(handle.db)).find((c) => c.id === "lampyra")?.name).toBe("Lampyra");
  });

  it("rejects duplicate ids/registry numbers, id changes and incomplete publishes", async () => {
    expect((await api("post", "/wildkin").send(draft({ id: "kawi" }))).status).toBe(409);
    expect((await api("post", "/wildkin").send(draft({ registryNumber: 1 }))).status).toBe(409);
    await api("post", "/wildkin").send(draft({ physicalDescription: "", habitatSummary: "" }));
    expect((await api("put", "/wildkin/lampyra").send(draft({ id: "other" }))).status).toBe(400);
    const res = await api("post", "/wildkin/lampyra/publish");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("publish_incomplete");
    expect(res.body.issues).toHaveLength(2);
  });

  it("soft deletes and restores, removing the species from the game meanwhile", async () => {
    expect((await api("delete", "/wildkin/mimu")).status).toBe(204);
    expect(WildkinListResponseSchema.parse((await api("get", "/wildkin")).body).wildkin.map((w) => w.id)).not.toContain("mimu");
    expect((await api("get", "/wildkin?deleted=only")).body.wildkin.map((w: { id: string }) => w.id)).toEqual(["mimu"]);
    expect((await listCreatures(handle.db)).map((c) => c.id)).not.toContain("mimu");
    expect((await listCreatures(handle.db, { includeDeleted: true })).map((c) => c.id)).toContain("mimu");
    expect((await api("get", "/stats")).body).toMatchObject({ total: 4, deleted: 1 });
    expect((await api("put", "/wildkin/mimu").send({ ...draft(), id: "mimu", registryNumber: 2 })).status).toBe(409);

    expect((await api("post", "/wildkin/mimu/restore")).status).toBe(200);
    expect((await listCreatures(handle.db)).map((c) => c.id)).toContain("mimu");
  });
});

describe("AI assistant", () => {
  it("is unavailable without a key", async () => {
    expect((await api("post", "/assist", bare).send({ prompt: "a moth" })).status).toBe(503);
    expect((await api("get", "/config", bare)).body).toMatchObject({ assistant: { enabled: false }, art: { enabled: false } });
  });

  it("passes lore context and the roster, and drops invalid fields", async () => {
    assistant.next = {
      entry: {
        id: "Lampyra Moth",
        name: "Lampyra",
        rarity: "Uncommon",
        activityPattern: "sheltering by day",
        habitatTags: ["Forest Edge", "flowering"],
        movementStyle: "teleporter",
        spawnModifiers: { timeOfDay: { night: 2 }, weather: { rain: 0.5 } },
        skills: [{ name: "Dust Veil", description: "Raises evasion." }],
        registryNumber: 99,
        bogus: true,
      },
      notes: ["Overlaps slightly with Lumae (flowers)."],
    };
    const res = await api("post", "/assist").send({ prompt: "a shy glowing moth", current: { name: "Lampyra" } });
    expect(res.status, res.text).toBe(200);
    const body = AssistResponseSchema.parse(res.body);
    expect(body.suggestion).toMatchObject({
      id: "lampyra-moth",
      rarity: "uncommon",
      activityPattern: "sheltering_by_day",
      habitatTags: ["forest-edge", "flowering"],
      skills: [{ name: "Dust Veil", canon: "proposed" }],
    });
    expect(body.suggestion.movementStyle).toBeUndefined();
    expect(body.dropped).toEqual(expect.arrayContaining(["movementStyle", "bogus"]));
    expect(body.notes).toHaveLength(1);
    expect(body.model).toBe("fake-model");
    expect(assistant.last?.context.roster.map((r) => r.id)).toContain("kawi");
    expect(assistant.last?.context.identities.kawi).toMatch(/canopy bird/i);
  });
});

describe("art generation", () => {
  it("checks the balance, stores the PNGs and serves them publicly", async () => {
    const res = await api("post", "/wildkin/kawi/art").send({ kinds: ["icon", "sprite"] });
    expect(res.status, res.text).toBe(200);
    const body = GenerateArtResponseSchema.parse(res.body);
    expect(body.generated).toEqual(["icon", "sprite"]);
    expect(body.balanceBefore.generations).toBe(10);
    expect(body.art).toMatchObject({ icon: true, sprite: true });
    expect(art.calls.map((c) => c.size)).toEqual([64, 128]);
    expect(art.calls[0]!.description).toMatch(/^Headshot of Kawi/);
    expect(art.calls[1]!.description).toMatch(/^Full body of Kawi.*Pose: /);

    // Regenerating the sprite picks a different pose than the stored one.
    const again = await api("post", "/wildkin/kawi/art").send({ kinds: ["sprite"] });
    expect(again.status).toBe(200);
    const pose = (p: string) => p.match(/Pose: ([^.]+)\./)?.[1];
    expect(pose(art.calls[2]!.description)).not.toBe(pose(art.calls[1]!.description));

    const png = await request(app).get(`/api/art/wildkin/kawi/icon.png?v=${body.art.version}`);
    expect(png.status).toBe(200);
    expect(png.headers["content-type"]).toBe("image/png");
    expect(Buffer.compare(png.body as Buffer, PNG)).toBe(0);
    expect((await request(app).get("/api/art/wildkin/mimu/icon.png")).status).toBe(404);
  });

  it("refuses when the balance is too low", async () => {
    art.balanceValue = { generations: 1, usd: 0 };
    const res = await api("post", "/wildkin/kawi/art").send({ kinds: ["icon", "sprite"] });
    expect(res.status).toBe(402);
    expect(art.calls).toHaveLength(0);
  });
});
