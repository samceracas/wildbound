import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { DbHandle } from "@wildbound/db";
import { openTestDb, resetTestData } from "@wildbound/db/testing";
import { GAME_RULES, GameStateResponseSchema, RegistryResponseSchema, PositionResponseSchema } from "@wildbound/shared";
import { publishDraft, saveDraft } from "@wildbound/db";
import { seededRandom, validateWorld } from "@wildbound/world";
import { createApp } from "../src/app.ts";
import { StaticWeather } from "../src/weather.ts";
import { testConfig } from "./helpers.ts";
import { CREATURE_IDS, sampleWorld } from "../../../packages/world/src/__fixtures__/world.ts";

// Inside the fixture's forest habitat (kawi, mimu, kantar during the day).
const FOREST = { lat: 14.65, lng: 120.998 };
const FAR_AWAY = { lat: 14.7, lng: 121.1 }; // ~11 km

let handle: DbHandle;
let app: Express;
let clock = new Date("2026-10-18T02:00:00Z"); // 10:00 in Manila: "day"
const tick = (seconds: number) => (clock = new Date(clock.getTime() + seconds * 1000));

beforeAll(async () => {
  handle = await openTestDb();
  app = createApp({
    db: handle.db,
    config: testConfig(),
    weather: new StaticWeather({ weather: "clear", timeZone: "Asia/Manila", source: "live" }),
    now: () => clock,
    random: seededRandom(42),
  });
});
afterAll(async () => handle?.close());
beforeEach(async () => {
  await resetTestData(handle);
  clock = new Date("2026-10-18T02:00:00Z");
  await saveDraft(handle.db, sampleWorld());
  await publishDraft(handle.db, (d) => validateWorld(d, CREATURE_IDS));
});

async function login(username = "Sam_Field") {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ username });
  expect(res.status, res.text).toBe(200);
  return agent;
}
const report = (agent: ReturnType<typeof request.agent>, at: { lat: number; lng: number }, accuracy = 10) =>
  agent.post("/api/game/position").send({ ...at, accuracy });

describe("username login", () => {
  it("creates a player with starter items and resumes it case-insensitively", async () => {
    const a = await login("Sam_Field");
    const me = await a.get("/api/auth/me");
    expect(me.body.player).toMatchObject({ username: "sam_field", displayName: "Sam_Field" });
    const inventory = await a.get("/api/game/inventory");
    expect(inventory.body.items.find((i: { itemId: string }) => i.itemId === "field-capsule").quantity).toBe(10);

    const b = await login("SAM_FIELD");
    expect((await b.get("/api/auth/me")).body.player.id).toBe(me.body.player.id);
  });

  it("rejects bad usernames and unauthenticated game calls", async () => {
    expect((await request(app).post("/api/auth/login").send({ username: "a b" })).status).toBe(400);
    expect((await request(app).get("/api/game/state")).status).toBe(401);
    expect((await request(app).post("/api/game/position").send({ ...FOREST, accuracy: 5 })).status).toBe(401);
  });

  it("logs out", async () => {
    const a = await login();
    expect((await a.post("/api/auth/logout")).status).toBe(204);
    expect((await a.get("/api/auth/me")).status).toBe(401);
  });
});

describe("server-side movement checks (anti-teleport)", () => {
  it("accepts plausible movement and rejects a jump", async () => {
    const a = await login();
    expect((await report(a, FOREST)).body.verdict).toBe("first-fix");
    tick(30);
    const jump = PositionResponseSchema.parse((await report(a, FAR_AWAY)).body);
    expect(jump.verdict).toBe("too-fast");
    expect(jump.position).toMatchObject(FOREST); // server position unchanged
  });

  it("locks the player after repeated jumps and refuses to play", async () => {
    const a = await login();
    await report(a, FOREST);
    let last;
    for (let i = 0; i < GAME_RULES.strikesBeforeLock; i++) {
      tick(5);
      last = (await report(a, FAR_AWAY)).body;
    }
    expect(last.verdict).toBe("locked");
    const state = GameStateResponseSchema.parse((await a.get("/api/game/state")).body);
    expect(state.lockedUntil).not.toBeNull();
    expect(state.spawns).toEqual([]);

    tick(GAME_RULES.lockMs / 1000 + 1);
    expect((await report(a, FOREST)).body.verdict).toBe("accepted");
  });

  it("ignores low-accuracy fixes", async () => {
    const a = await login();
    expect((await report(a, FOREST, GAME_RULES.maxAccuracyM + 50)).body).toMatchObject({ verdict: "low-accuracy", position: null });
  });

  it("has no state without a fresh position", async () => {
    const a = await login();
    expect((await a.get("/api/game/state")).body).toMatchObject({ position: null, environment: null, spawns: [] });
  });
});

describe("spawns, observe and the Registry", () => {
  it("spawns Wildkin around the server-side position using live weather and local time", async () => {
    const a = await login();
    await report(a, FOREST);
    const state = GameStateResponseSchema.parse((await a.get("/api/game/state")).body);
    expect(state.environment).toMatchObject({ timeOfDay: "day", weather: "clear", timeZone: "Asia/Manila" });
    expect(state.habitat?.name).toBe("Forest Edge");
    expect(state.spawns.length).toBeGreaterThan(0);
    for (const s of state.spawns) {
      expect(["kawi", "mimu", "kantar"]).toContain(s.creatureId);
      expect(s.distanceM).toBeLessThanOrEqual(GAME_RULES.spawnRadiusM + 1);
    }
  });

  it("only lets a player observe their own spawns, in range of their tracked position", async () => {
    const a = await login("alpha");
    const b = await login("bravo");
    await report(a, FOREST);
    const [spawn] = GameStateResponseSchema.parse((await a.get("/api/game/state")).body).spawns;
    expect(spawn).toBeDefined();

    // Someone else's spawn id is useless.
    await report(b, FOREST);
    expect((await b.post(`/api/game/spawns/${spawn!.id}/observe`)).status).toBe(404);

    // Walk (plausibly) to the spawn, then observe.
    tick(60);
    expect((await report(a, spawn!)).body.verdict).toBe("accepted");
    const observed = await a.post(`/api/game/spawns/${spawn!.id}/observe`);
    expect(observed.status, observed.text).toBe(200);
    expect(observed.body.firstObservation).toBe(true);
    expect(observed.body.entry).toMatchObject({ creatureId: spawn!.creatureId, status: "observed", skills: null });
    expect(observed.body.entry.name).toBeTruthy();

    const registry = RegistryResponseSchema.parse((await a.get("/api/game/registry")).body);
    expect(registry.total).toBe(5);
    expect(registry.observedCount).toBe(1);
    const unknown = registry.entries.find((e) => e.status === "unknown")!;
    expect(unknown).toMatchObject({ name: null, description: null });
    expect(unknown.registryNumber).toBeGreaterThan(0);
  });

  it("refuses to observe from out of range", async () => {
    const a = await login();
    await report(a, FOREST);
    const { spawns } = GameStateResponseSchema.parse((await a.get("/api/game/state")).body);
    const far = spawns.find((s) => !s.inRange);
    if (far) expect((await a.post(`/api/game/spawns/${far.id}/observe`)).status).toBe(409);
  });

  it("party updates are left to implement (501); capture moved into battles", async () => {
    const a = await login();
    await report(a, FOREST);
    const [spawn] = GameStateResponseSchema.parse((await a.get("/api/game/state")).body).spawns;
    tick(60);
    await report(a, spawn!);
    // Exercise #3 is retired: capture now happens inside a battle (see battle.test.ts).
    expect((await a.post(`/api/game/spawns/${spawn!.id}/capture`)).status).toBe(404);
    expect((await a.put("/api/game/party").send({ slots: [null, null, null, null, null, null] })).status).toBe(501);
    expect((await a.get("/api/game/party")).body.party).toHaveLength(6);
  });
});

describe("wandering spawns", () => {
  it("moves spawns between state polls and despawns ones that leave the spawn radius", async () => {
    const a = await login();
    await report(a, FOREST);
    const first = GameStateResponseSchema.parse((await a.get("/api/game/state")).body).spawns;
    expect(first.length).toBeGreaterThan(0);

    // No time passed: nothing moves (spawns start with a random phase of up to one step, so even a
    // few seconds may let one take its first step).
    tick(0);
    await report(a, FOREST);
    const still = GameStateResponseSchema.parse((await a.get("/api/game/state")).body).spawns;
    for (const s of first) expect(still.find((t) => t.id === s.id)).toMatchObject({ lat: s.lat, lng: s.lng });

    // A minute later (6 steps) at least one has moved, and none is outside the radius.
    tick(60);
    await report(a, FOREST);
    const later = GameStateResponseSchema.parse((await a.get("/api/game/state")).body).spawns;
    const moved = first.filter((s) => {
      const now = later.find((t) => t.id === s.id);
      return now && (now.lat !== s.lat || now.lng !== s.lng);
    });
    const gone = first.filter((s) => !later.some((t) => t.id === s.id));
    expect(moved.length + gone.length).toBeGreaterThan(0);
    for (const s of later) expect(s.distanceM).toBeLessThanOrEqual(GAME_RULES.spawnRadiusM);

    // Spawns pushed to the edge of the radius wander out and are despawned.
    await handle.db.spawn.updateMany({
      where: { status: "active" },
      data: { lat: FOREST.lat + (GAME_RULES.spawnRadiusM - 0.5) / 111_320, lng: FOREST.lng, heading: 0 },
    });
    const edgeIds = (await handle.db.spawn.findMany({ where: { status: "active" } })).map((s) => s.id);
    for (let i = 0; i < 10; i++) {
      tick(60);
      await report(a, FOREST);
      await a.get("/api/game/state");
    }
    const fled = await handle.db.spawn.count({ where: { id: { in: edgeIds }, status: "fled" } });
    expect(fled).toBeGreaterThan(0);
  });

  it("never spawns a species deleted in the Creature Manager", async () => {
    await handle.db.creature.updateMany({ where: { id: { in: ["kawi", "mimu"] } }, data: { deletedAt: new Date() } });
    const a = await login();
    await report(a, FOREST);
    for (let i = 0; i < 5; i++) {
      const { spawns } = GameStateResponseSchema.parse((await a.get("/api/game/state")).body);
      for (const s of spawns) expect(s.creatureId).toBe("kantar");
      tick(20);
      await report(a, FOREST);
    }
    const registry = RegistryResponseSchema.parse((await a.get("/api/game/registry")).body);
    expect(registry.total).toBe(3);
  });
});
