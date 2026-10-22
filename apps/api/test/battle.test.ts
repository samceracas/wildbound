import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { DbHandle } from "@wildbound/db";
import { createTestWildkin, maxHpOf, openTestDb, resetTestData } from "@wildbound/db/testing";
import {
  BATTLE_RULES,
  BattleActionResponseSchema,
  BattleResponseSchema,
  BattleStateSchema,
  GAME_RULES,
  GameStateResponseSchema,
  LicensesResponseSchema,
  ObserveResponseSchema,
  PartyResponseSchema,
  RegistryResponseSchema,
  TYPICAL_GENOME,
  WildkinDetailResponseSchema,
  type BattleState,
  type Genome,
  type LicenseRequirement,
  type WorldDocument,
} from "@wildbound/shared";
import { publishDraft, saveDraft } from "@wildbound/db";
import { totalExpForLevel, validateWorld } from "@wildbound/world";
import { createApp } from "../src/app.ts";
import { StaticWeather } from "../src/weather.ts";
import { testConfig } from "./helpers.ts";
import { CREATURE_IDS, IDS, sampleWorld } from "../../../packages/world/src/__fixtures__/world.ts";

/**
 * Battles, capture, healing, research and licenses (v0.3.0) against real
 * PostGIS. Randomness is injected per test (`rand`), and every assertion holds
 * whether or not exercises #10 to #13 are solved: battles are set up so the
 * fallback and the real formulas agree (a wild Wildkin at 1 HP, rolls of 0 or
 * 0.99, no reliance on natural recovery or matchups).
 */

// Inside the fixture's forest habitat, ~54 m from East Research Gate (a field station).
const FOREST = { lat: 14.65, lng: 120.998 };
// Silayan Creekside: ~380 m from the gate.
const CREEK = { lat: 14.65, lng: 121.0015 };
const CLEARING_POI = "30000000-0000-4000-8000-000000000002";
const M_PER_DEG_LAT = 111_320;
const north = (p: { lat: number; lng: number }, meters: number) => ({ lat: p.lat + meters / M_PER_DEG_LAT, lng: p.lng });

let handle: DbHandle;
let app: Express;
let clock = new Date("2026-10-18T02:00:00Z"); // 10:00 in Manila: "day"
let rand = 0.5;
const tick = (seconds: number) => (clock = new Date(clock.getTime() + seconds * 1000));
const DAY = "2026-10-18";

/** The fixture world plus a non-station POI, optionally with a license-locked forest. */
function testWorld(forestLock: LicenseRequirement = null): WorldDocument {
  const world = sampleWorld();
  world.habitats[0]!.licenseRequirement = forestLock;
  world.pois.push({
    id: CLEARING_POI,
    regionId: IDS.region,
    slug: "fern-clearing",
    name: "Fern Clearing",
    description: "",
    type: "clearing",
    location: { type: "Point", coordinates: [120.998, 14.6503] },
    interactionId: null,
    unlockCondition: null,
  });
  return world;
}

async function publish(world: WorldDocument) {
  await saveDraft(handle.db, world);
  const result = await publishDraft(handle.db, (d) => validateWorld(d, CREATURE_IDS));
  expect(result.ok).toBe(true);
}

beforeAll(async () => {
  handle = await openTestDb();
  app = createApp({
    db: handle.db,
    config: testConfig(),
    weather: new StaticWeather({ weather: "clear", timeZone: "Asia/Manila", source: "live" }),
    now: () => clock,
    random: () => rand,
  });
});
afterAll(async () => handle?.close());
beforeEach(async () => {
  await resetTestData(handle);
  clock = new Date("2026-10-18T02:00:00Z");
  rand = 0.5;
  await publish(testWorld());
});

type Agent = ReturnType<typeof request.agent>;

async function login(username = "Sam_Field") {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ username });
  expect(res.status, res.text).toBe(200);
  return { agent, playerId: res.body.player.id as string };
}
const report = (agent: Agent, at: { lat: number; lng: number }, accuracy = 10) => agent.post("/api/game/position").send({ ...at, accuracy });

/** A player standing in the forest with the given Wildkin (slot order). */
async function fieldPlayer(team: { creatureId: string; level?: number; hp?: number | "full"; slot?: number | null }[] = [{ creatureId: "kawi", level: 12 }]) {
  const { agent, playerId } = await login();
  await report(agent, FOREST);
  const wildkin = [];
  for (const [i, w] of team.entries()) {
    wildkin.push(
      await createTestWildkin(handle.db, { playerId, creatureId: w.creatureId, level: w.level, hp: w.hp, partySlot: w.slot === undefined ? i : w.slot, hpUpdatedAt: clock }),
    );
  }
  return { agent, playerId, wildkin };
}

/** A spawn placed by hand next to the player (10 m north of the forest point by default). */
function spawnFor(playerId: string, opts: { creatureId?: string; level?: number; at?: { lat: number; lng: number }; observed?: boolean; genome?: Genome; habitatId?: string | null } = {}) {
  const at = opts.at ?? north(FOREST, 10);
  return handle.db.spawn.create({
    data: {
      playerId,
      creatureId: opts.creatureId ?? "mimu",
      lat: at.lat,
      lng: at.lng,
      regionId: IDS.region,
      habitatId: opts.habitatId === undefined ? IDS.forest : opts.habitatId,
      timeOfDay: "day",
      weather: "clear",
      level: opts.level ?? 4,
      genome: opts.genome ?? TYPICAL_GENOME,
      observedAt: opts.observed ? clock : null,
      expiresAt: new Date(clock.getTime() + GAME_RULES.spawnTtlMs),
      movedAt: clock,
    },
  });
}

async function startBattle(agent: Agent, spawnId: string) {
  const res = await agent.post(`/api/game/spawns/${spawnId}/battle`);
  expect(res.status, res.text).toBe(200);
  return BattleResponseSchema.parse(res.body).battle;
}

async function patchState(battleId: string, edit: (s: BattleState) => void) {
  const row = await handle.db.battle.findUniqueOrThrow({ where: { id: battleId } });
  const state = BattleStateSchema.parse(row.state);
  edit(state);
  await handle.db.battle.update({ where: { id: battleId }, data: { state } });
}

const act = (agent: Agent, battleId: string, turn: number, action: object) =>
  agent.post(`/api/game/battles/${battleId}/actions`).send({ turn, action });

const expEvents = (playerId: string, where: object = {}) =>
  handle.db.expEvent.findMany({ where: { playerId, ...where }, orderBy: { createdAt: "asc" } });

// ------------------------------------------------------------------ starter

describe("starter", () => {
  it("lets a new player choose Kawi, Mimu or Kantar at level 5, once", async () => {
    const { agent } = await login();
    await report(agent, FOREST);
    expect(GameStateResponseSchema.parse((await agent.get("/api/game/state")).body)).toMatchObject({ needsStarter: true, hasUsableWildkin: false });

    const options = await agent.get("/api/game/starter");
    expect(options.status).toBe(200);
    expect(options.body.level).toBe(5);
    expect(options.body.options.map((o: { creatureId: string }) => o.creatureId)).toEqual(["kawi", "mimu", "kantar"]);
    expect(options.body.options[0].statShape).toHaveLength(4);

    const chosen = await agent.post("/api/game/starter").send({ creatureId: "mimu" });
    expect(chosen.status, chosen.text).toBe(200);
    expect(chosen.body.wildkin).toMatchObject({ creatureId: "mimu", level: 5, partySlot: 0, lead: true, condition: "healthy", hpFraction: 1 });

    expect((await agent.post("/api/game/starter").send({ creatureId: "kawi" })).body.error).toBe("already_has_wildkin");
    expect((await agent.post("/api/game/starter").send({ creatureId: "lumae" })).status).toBe(400);
    expect(GameStateResponseSchema.parse((await agent.get("/api/game/state")).body)).toMatchObject({ needsStarter: false, hasUsableWildkin: true });
  });
});

// ------------------------------------------------------------------ battle guards

describe("starting a battle", () => {
  it("checks range, a running battle, license locks and usable Wildkin, in that order", async () => {
    const { agent, playerId } = await fieldPlayer();

    const far = await spawnFor(playerId, { at: north(FOREST, 100) });
    const outOfRange = await agent.post(`/api/game/spawns/${far.id}/battle`);
    expect(outOfRange.status).toBe(409);
    expect(outOfRange.body.error).toBe("out_of_range");

    const first = await spawnFor(playerId);
    const second = await spawnFor(playerId, { creatureId: "kawi" });
    const battle = await startBattle(agent, first.id);
    const busy = await agent.post(`/api/game/spawns/${second.id}/battle`);
    expect(busy.status).toBe(409);
    expect(busy.body).toMatchObject({ error: "battle_in_progress", details: { battleId: battle.id } });

    // A spawn in a battle cannot be observed or battled by a second request.
    const again = await agent.post(`/api/game/spawns/${first.id}/battle`);
    expect(again.body.error).toBe("in_battle");
    expect((await agent.post(`/api/game/spawns/${first.id}/observe`)).body.error).toBe("in_battle");
  });

  it("refuses with no usable Wildkin: fainted or restless", async () => {
    // A level 25 Kawi is above the rank 1 Aerial cap (20): restless.
    const { agent, playerId, wildkin } = await fieldPlayer([{ creatureId: "mimu", level: 6, hp: 0 }, { creatureId: "kawi", level: 25 }]);
    const spawn = await spawnFor(playerId);
    const res = await agent.post(`/api/game/spawns/${spawn.id}/battle`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("no_usable_wildkin");

    const party = PartyResponseSchema.parse((await agent.get("/api/game/party")).body);
    expect(party.party[0]).toMatchObject({ id: wildkin[0]!.id, condition: "fainted", lead: false });
    expect(party.party[1]).toMatchObject({ condition: "restless", restless: true, restlessReason: "Needs Aerial rank 2 to cooperate." });
    const state = GameStateResponseSchema.parse((await agent.get("/api/game/state")).body);
    expect(state.hasUsableWildkin).toBe(false);
    expect(state.spawns.find((s) => s.id === spawn.id)?.battleLocked).toMatch(/needs rest/);
  });

  it("refuses battles in a license-locked habitat but still allows observing", async () => {
    await publish(testWorld({ category: "terrestrial", rank: 2 }));
    const { agent, playerId } = await fieldPlayer();
    const spawn = await spawnFor(playerId);

    const state = GameStateResponseSchema.parse((await agent.get("/api/game/state")).body);
    expect(state.habitat?.licenseRequirement).toEqual({ category: "terrestrial", rank: 2 });
    expect(state.habitatLocked).toBe("Restricted research zone: Terrestrial rank 2");
    expect(state.spawns.find((s) => s.id === spawn.id)?.battleLocked).toBe("Restricted research zone: Terrestrial rank 2");

    const locked = await agent.post(`/api/game/spawns/${spawn.id}/battle`);
    expect(locked.status).toBe(409);
    expect(locked.body).toMatchObject({ error: "habitat_locked", details: { requirement: { category: "terrestrial", rank: 2 } } });
    expect((await agent.post(`/api/game/spawns/${spawn.id}/observe`)).status).toBe(200);

    await handle.db.researcherLicense.update({ where: { playerId_category: { playerId, category: "terrestrial" } }, data: { rank: 2 } });
    await startBattle(agent, spawn.id);
  });
});

// ------------------------------------------------------------------ turns and outcomes

describe("battle turns", () => {
  it("builds the battle from the spawn and the lead, hiding the wild side's numbers", async () => {
    const { agent, playerId, wildkin } = await fieldPlayer([{ creatureId: "kawi", level: 12 }, { creatureId: "kantar", level: 8 }]);
    const spawn = await spawnFor(playerId, { creatureId: "mimu", level: 4 });
    const battle = await startBattle(agent, spawn.id);
    expect(battle).toMatchObject({ turn: 0, awaiting: "action", outcome: null, activeId: wildkin[0]!.id, spawnId: spawn.id });
    expect(battle.wild).toEqual({ creatureId: "mimu", name: "Mimu", registryNumber: 2, level: 4, hpFraction: 1, status: null, bodyTraits: ["soft-bodied"] });
    expect(battle.attacks.map((a) => a.name)).toEqual(["Peck", "Wing Buffet"]);
    expect(battle.attacks[0]).toMatchObject({ approach: "pierce", powerWord: "Moderate" });
    expect(battle.party.map((p) => p.active)).toEqual([true, false]);
    expect(battle.items.find((i) => i.itemId === "field-capsule")?.quantity).toBe(10);
    expect(JSON.stringify(battle)).not.toMatch(/"(atk|def|spd|genome|vigor)"/);

    expect((await agent.get("/api/game/battles/current")).body.battle.id).toBe(battle.id);
    expect((await agent.get(`/api/game/battles/${battle.id}`)).status).toBe(200);
    const state = GameStateResponseSchema.parse((await agent.get("/api/game/state")).body);
    expect(state.activeBattleId).toBe(battle.id);
    expect(state.spawns.find((s) => s.id === spawn.id)).toMatchObject({ inBattle: true });
  });

  it("wins when the wild Wildkin faints: spawn retreats, battle and shared EXP are logged", async () => {
    const { agent, playerId, wildkin } = await fieldPlayer([{ creatureId: "kawi", level: 12 }, { creatureId: "kantar", level: 6 }]);
    // No rested charge: the last battle EXP was just now.
    await handle.db.player.update({ where: { id: playerId }, data: { lastBattleExpAt: clock } });
    const spawn = await spawnFor(playerId, { level: 4 });
    const battle = await startBattle(agent, spawn.id);
    await patchState(battle.id, (s) => void (s.wild.hp = 1));

    rand = 0.99; // no dodge
    const res = await act(agent, battle.id, 0, { type: "attack", attackIndex: 0 });
    expect(res.status, res.text).toBe(200);
    const { battle: after, events } = BattleActionResponseSchema.parse(res.body);
    expect(after.outcome).toBe("won");
    expect(events.at(-1)).toMatchObject({ type: "battle-end", outcome: "won" });
    expect(events.some((e) => e.type === "faint" && e.side === "wild")).toBe(true);

    expect((await handle.db.spawn.findUniqueOrThrow({ where: { id: spawn.id } })).status).toBe("fled");
    expect((await handle.db.battle.findUniqueOrThrow({ where: { id: battle.id } })).status).toBe("won");

    const log = await expEvents(playerId, { track: "wildkin" });
    const main = log.find((e) => e.source === "battle")!;
    const shared = log.find((e) => e.source === "battle-shared")!;
    // battleExp(4, 12) = floor(60 x 4 / 7 x 0.333) = 11; Kantar is 6 levels below: 75% catch-up share.
    expect(main).toMatchObject({ capturedWildkinId: wildkin[0]!.id, amount: 11, dayKey: DAY, meta: { rested: false, opponentLevel: 4 } });
    expect(shared).toMatchObject({ capturedWildkinId: wildkin[1]!.id, amount: 8 });
    expect(after.expGained.map((g) => g.amount).sort()).toEqual([11, 8].sort());
    expect(events.filter((e) => e.type === "exp")).toHaveLength(2);
    // Matchups are recorded only when a hit was weak or resisted (exercise #11); the log and the table agree either way.
    const recorded = events.filter((e) => e.type === "matchup-recorded");
    expect(await handle.db.matchupRecord.count({ where: { playerId } })).toBe(recorded.length);

    // Over: no more actions; the radar no longer reports it.
    expect((await act(agent, battle.id, 1, { type: "escape" })).body.error).toBe("battle_over");
    expect((await agent.get("/api/game/battles/current")).status).toBe(404);
  });

  it("doubles a won battle's EXP with a rested charge and spends it", async () => {
    const { agent, playerId } = await fieldPlayer([{ creatureId: "kawi", level: 12 }]);
    await handle.db.player.update({ where: { id: playerId }, data: { lastBattleExpAt: new Date(clock.getTime() - 5 * 3600_000), restedCharges: 0 } });
    const spawn = await spawnFor(playerId, { level: 4 });
    const battle = await startBattle(agent, spawn.id);
    await patchState(battle.id, (s) => void (s.wild.hp = 1));
    rand = 0.99;
    await act(agent, battle.id, 0, { type: "attack", attackIndex: 0 });

    const [main] = await expEvents(playerId, { source: "battle" });
    expect(main).toMatchObject({ amount: 22, meta: { rested: true } });
    const player = await handle.db.player.findUniqueOrThrow({ where: { id: playerId } });
    expect(player.restedCharges).toBe(1); // 2 charges earned in 5 h, 1 spent
    expect(player.lastBattleExpAt?.getTime()).toBe(clock.getTime());
  });

  it("captures with a capsule: new Wildkin with the spawn's genome, level and HP, Registry, EXP and records", async () => {
    const { agent, playerId, wildkin } = await fieldPlayer([{ creatureId: "kawi", level: 12 }]);
    const genome: Genome = { build: ["L", "L"], temperament: ["B", "B"], marking: ["+", "m"] };
    const spawn = await spawnFor(playerId, { creatureId: "mimu", level: 5, observed: true, genome });
    const battle = await startBattle(agent, spawn.id);
    await patchState(battle.id, (s) => void (s.wild.hp = 7));

    rand = 0; // the capsule holds
    const res = await act(agent, battle.id, 0, { type: "capsule", itemId: "field-capsule" });
    expect(res.status, res.text).toBe(200);
    const { battle: after, events } = BattleActionResponseSchema.parse(res.body);
    expect(after.outcome).toBe("captured");
    expect(events[0]).toMatchObject({ type: "capsule", success: true });

    const caught = await handle.db.capturedWildkin.findUniqueOrThrow({ where: { id: after.capturedWildkinId! } });
    expect(caught).toMatchObject({
      creatureId: "mimu",
      level: 5,
      exp: totalExpForLevel(5),
      currentHp: 7,
      partySlot: 1,
      caughtLevel: 5,
      caughtHabitatId: IDS.forest,
      caughtAtTimeOfDay: "day",
      caughtAtWeather: "clear",
    });
    expect(caught.genome).toEqual(genome);
    expect((await handle.db.spawn.findUniqueOrThrow({ where: { id: spawn.id } })).status).toBe("captured");
    expect((await handle.db.inventoryItem.findUniqueOrThrow({ where: { playerId_itemId: { playerId, itemId: "field-capsule" } } })).quantity).toBe(9);

    const entry = await handle.db.registryEntry.findUniqueOrThrow({ where: { playerId_creatureId: { playerId, creatureId: "mimu" } } });
    expect(entry.timesCaptured).toBe(1);
    expect(entry.firstCapturedAt?.getTime()).toBe(clock.getTime());

    const sources = (await expEvents(playerId)).map((e) => e.source).sort();
    expect(sources).toEqual(["battle", "capture", "first-capture", "phenotype-record", "phenotype-record"].sort());
    const capture = (await expEvents(playerId, { source: "capture" }))[0]!;
    expect(capture.capturedWildkinId).toBe(wildkin[0]!.id);
    expect(await handle.db.phenotypeRecord.count({ where: { playerId, creatureId: "mimu" } })).toBe(2); // large + bold
    expect(events.some((e) => e.type === "researcher-exp" && e.reason === "First capture of Mimu")).toBe(true);

    const registry = RegistryResponseSchema.parse((await agent.get("/api/game/registry")).body);
    const mimu = registry.entries.find((e) => e.creatureId === "mimu")!;
    expect(mimu.status).toBe("captured");
    expect(mimu.statShape).toHaveLength(4);
    // Terrestrial rank 1 records Temperament without naming it (scanner depth).
    expect(mimu.fieldNotes?.phenotypes.sort()).toEqual(["Large seen", "Temperament variant seen"]);
  });

  it("a capture above the license cap arrives restless", async () => {
    const { agent, playerId } = await fieldPlayer([{ creatureId: "kawi", level: 12 }]);
    const spawn = await spawnFor(playerId, { creatureId: "mimu", level: 24 });
    const battle = await startBattle(agent, spawn.id);
    rand = 0;
    const { battle: after } = BattleActionResponseSchema.parse((await act(agent, battle.id, 0, { type: "capsule", itemId: "field-capsule" })).body);
    const party = PartyResponseSchema.parse((await agent.get("/api/game/party")).body);
    expect(party.party.find((p) => p?.id === after.capturedWildkinId)).toMatchObject({ restless: true, restlessReason: "Needs Terrestrial rank 2 to cooperate." });
  });

  it("loses when the last usable Wildkin faints: the spawn stays wild with a fresh TTL and HP is persisted", async () => {
    const { agent, playerId, wildkin } = await fieldPlayer([{ creatureId: "kawi", level: 5, hp: 1 }]);
    const spawn = await spawnFor(playerId, { level: 6 });
    const battle = await startBattle(agent, spawn.id);

    tick(30);
    await report(agent, FOREST);
    rand = 0.99; // the escape fails, no dodge: the wild attack lands
    const res = await act(agent, battle.id, 0, { type: "escape" });
    const { battle: after, events } = BattleActionResponseSchema.parse(res.body);
    expect(after.outcome).toBe("lost");
    expect(events.map((e) => e.type)).toEqual(["escape", "attack", "faint", "battle-end"]);

    const s = await handle.db.spawn.findUniqueOrThrow({ where: { id: spawn.id } });
    expect(s.status).toBe("active");
    expect(s.expiresAt.getTime()).toBe(clock.getTime() + GAME_RULES.spawnTtlMs);
    const w = await handle.db.capturedWildkin.findUniqueOrThrow({ where: { id: wildkin[0]!.id } });
    expect(w.currentHp).toBe(0);
    expect(w.hpUpdatedAt.getTime()).toBe(clock.getTime());
    expect(await handle.db.expEvent.count({ where: { playerId, track: "wildkin" } })).toBe(0);
  });

  it("asks for a free replacement after a faint when another Wildkin can battle", async () => {
    const { agent, playerId, wildkin } = await fieldPlayer([{ creatureId: "kawi", level: 5, hp: 1 }, { creatureId: "kantar", level: 8 }]);
    const spawn = await spawnFor(playerId, { level: 6 });
    const battle = await startBattle(agent, spawn.id);
    rand = 0.99;
    const fainted = BattleActionResponseSchema.parse((await act(agent, battle.id, 0, { type: "escape" })).body).battle;
    expect(fainted).toMatchObject({ awaiting: "replace", outcome: null, turn: 1 });
    expect((await act(agent, battle.id, 1, { type: "attack", attackIndex: 0 })).body.error).toBe("invalid_action");
    expect((await act(agent, battle.id, 1, { type: "replace", wildkinId: wildkin[0]!.id })).body.error).toBe("invalid_action");

    const replaced = BattleActionResponseSchema.parse((await act(agent, battle.id, 1, { type: "replace", wildkinId: wildkin[1]!.id })).body);
    expect(replaced.events.map((e) => e.type)).toEqual(["replace"]); // free: no wild action
    expect(replaced.battle).toMatchObject({ awaiting: "action", activeId: wildkin[1]!.id, turn: 2 });
  });

  it("escapes on a successful roll and when the player walks away", async () => {
    const { agent, playerId } = await fieldPlayer();
    const spawn = await spawnFor(playerId);
    const battle = await startBattle(agent, spawn.id);
    rand = 0;
    const escaped = BattleActionResponseSchema.parse((await act(agent, battle.id, 0, { type: "escape" })).body);
    expect(escaped.battle.outcome).toBe("escaped");
    expect((await handle.db.spawn.findUniqueOrThrow({ where: { id: spawn.id } })).status).toBe("fled");

    // Walk more than spawnRadiusM away from the next one, plausibly.
    const other = await spawnFor(playerId, { creatureId: "kawi" });
    const second = await startBattle(agent, other.id);
    for (let i = 0; i < 3; i++) {
      tick(30);
      expect((await report(agent, north(FOREST, -50 * (i + 1)))).body.verdict).toBe("accepted");
    }
    const moved = BattleActionResponseSchema.parse((await act(agent, second.id, 0, { type: "attack", attackIndex: 0 })).body);
    expect(moved.battle.outcome).toBe("escaped");
    expect(moved.events[0]).toMatchObject({ type: "escape", success: true, reason: "moved-away" });
    expect((await handle.db.spawn.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("fled");
  });

  it("refuses a stale turn (double tap) and missing items", async () => {
    const { agent, playerId } = await fieldPlayer([{ creatureId: "kawi", level: 12 }]);
    const spawn = await spawnFor(playerId);
    const battle = await startBattle(agent, spawn.id);
    rand = 0.99;
    const [a, b] = await Promise.all([
      act(agent, battle.id, 0, { type: "escape" }),
      act(agent, battle.id, 0, { type: "escape" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a.body.error, b.body.error]).toContain("stale_turn");
    expect((await handle.db.battle.findUniqueOrThrow({ where: { id: battle.id } })).turn).toBe(1);

    await handle.db.inventoryItem.update({ where: { playerId_itemId: { playerId, itemId: "field-capsule" } }, data: { quantity: 0 } });
    const none = await act(agent, battle.id, 1, { type: "capsule", itemId: "field-capsule" });
    expect(none.body.error).toBe("invalid_action");
    const unknownCapsule = await act(agent, battle.id, 1, { type: "capsule", itemId: "bloom-capsule" });
    expect(unknownCapsule.body.error).toBe("invalid_action");
  });

  it("heals with a Trail Ration in battle (uses the turn and the item)", async () => {
    const { agent, playerId, wildkin } = await fieldPlayer([{ creatureId: "kawi", level: 12, hp: 5 }]);
    const spawn = await spawnFor(playerId, { level: 2 });
    const battle = await startBattle(agent, spawn.id);
    rand = 0.99;
    const res = BattleActionResponseSchema.parse((await act(agent, battle.id, 0, { type: "item", itemId: "trail-ration", wildkinId: wildkin[0]!.id })).body);
    expect(res.events[0]).toMatchObject({ type: "item", itemId: "trail-ration" });
    expect((await handle.db.inventoryItem.findUniqueOrThrow({ where: { playerId_itemId: { playerId, itemId: "trail-ration" } } })).quantity).toBe(2);
    const hp = (await handle.db.capturedWildkin.findUniqueOrThrow({ where: { id: wildkin[0]!.id } })).currentHp;
    expect(hp).toBeGreaterThan(5);
  });

  it("abandons an idle battle lazily and releases the spawn; the spawn is frozen meanwhile", async () => {
    const { agent, playerId } = await fieldPlayer();
    const spawn = await spawnFor(playerId);
    const battle = await startBattle(agent, spawn.id);

    // Past the spawn's TTL but within the idle timeout: frozen, still listed.
    for (let i = 0; i < 9; i++) {
      tick(60);
      await report(agent, FOREST);
    }
    expect(clock.getTime()).toBeLessThan(Date.parse(battle.createdAt) + BATTLE_RULES.idleTimeoutMs);
    let state = GameStateResponseSchema.parse((await agent.get("/api/game/state")).body);
    const frozen = await handle.db.spawn.findUniqueOrThrow({ where: { id: spawn.id } });
    expect(frozen.status).toBe("in_battle");
    expect(frozen.lat).toBe(spawn.lat);
    expect(state.spawns.find((s) => s.id === spawn.id)).toMatchObject({ inBattle: true, battleLocked: "In battle" });

    tick(120);
    await report(agent, FOREST);
    state = GameStateResponseSchema.parse((await agent.get("/api/game/state")).body);
    expect(state.activeBattleId).toBeNull();
    expect((await handle.db.battle.findUniqueOrThrow({ where: { id: battle.id } })).status).toBe("abandoned");
    expect((await handle.db.spawn.findUniqueOrThrow({ where: { id: spawn.id } })).status).toBe("fled");
  });

  it("only shows a player their own battles", async () => {
    const { agent, playerId } = await fieldPlayer();
    const battle = await startBattle(agent, (await spawnFor(playerId)).id);
    const other = (await login("bravo")).agent;
    expect((await other.get(`/api/game/battles/${battle.id}`)).status).toBe(404);
    expect((await act(other, battle.id, 0, { type: "escape" })).status).toBe(404);
  });
});

// ------------------------------------------------------------------ EXP and research

describe("EXP and research", () => {
  it("observing records conditions and phenotypes and awards researcher and lead EXP with daily caps", async () => {
    const { agent, playerId, wildkin } = await fieldPlayer([{ creatureId: "kantar", level: 5 }]);
    const genome: Genome = { build: ["S", "S"], temperament: ["W", "W"], marking: ["+", "+"] };
    const spawn = await spawnFor(playerId, { creatureId: "kawi", level: 3, genome });

    const res = await agent.post(`/api/game/spawns/${spawn.id}/observe`);
    expect(res.status, res.text).toBe(200);
    const observed = ObserveResponseSchema.parse(res.body);
    expect(observed.firstObservation).toBe(true);
    expect(observed.spawn).toMatchObject({ level: 3, hints: { build: "Smaller than typical", marking: null, temperament: null } });
    expect(observed.researcherExp.map((g) => g.amount).sort((x, y) => x - y)).toEqual([30, 30, 40, 40, 100]);
    expect(observed.researcherExp.every((g) => g.category === "aerial")).toBe(true);
    expect(observed.leadExp).toMatchObject({ wildkinId: wildkin[0]!.id, amount: 2 }); // 3% of 91, floor, min 1
    expect(observed.entry.fieldNotes).toMatchObject({ category: "aerial", timesOfDay: ["day"], weathers: ["clear"] });

    const license = await handle.db.researcherLicense.findUniqueOrThrow({ where: { playerId_category: { playerId, category: "aerial" } } });
    expect(license.exp).toBe(240);

    // Repeats: 10 each, at most 5 per species per day; the lead's observation EXP only once per species per day.
    for (let i = 0; i < 6; i++) await agent.post(`/api/game/spawns/${spawn.id}/observe`);
    expect(await handle.db.expEvent.count({ where: { playerId, source: "repeat-observation" } })).toBe(5);
    expect(await handle.db.expEvent.count({ where: { playerId, source: "observation" } })).toBe(1);
    expect(await handle.db.conditionRecord.count({ where: { playerId } })).toBe(2);
  });

  it("records Temperament below license rank 2 without naming it", async () => {
    const { agent, playerId } = await fieldPlayer([{ creatureId: "kantar", level: 5 }]);
    const wary = await spawnFor(playerId, { creatureId: "kawi", level: 3, genome: { build: ["S", "L"], temperament: ["W", "W"], marking: ["+", "+"] } });
    const observed = ObserveResponseSchema.parse((await agent.post(`/api/game/spawns/${wary.id}/observe`)).body);
    const reasons = observed.researcherExp.map((g) => g.reason);
    expect(reasons).toContain("Temperament variant of Kawi recorded");
    expect(reasons.some((r) => r.includes("Wary"))).toBe(false);
    expect(observed.entry.fieldNotes?.phenotypes).toEqual(["Temperament variant seen"]);
    expect(await handle.db.phenotypeRecord.count({ where: { playerId, creatureId: "kawi", trait: "wary" } })).toBe(1);

    // From Aerial rank 2 the same records are named.
    await handle.db.researcherLicense.update({ where: { playerId_category: { playerId, category: "aerial" } }, data: { rank: 2 } });
    const bold = await spawnFor(playerId, { creatureId: "kawi", level: 3, genome: { build: ["S", "L"], temperament: ["B", "B"], marking: ["+", "+"] } });
    const again = ObserveResponseSchema.parse((await agent.post(`/api/game/spawns/${bold.id}/observe`)).body);
    expect(again.researcherExp.map((g) => g.reason)).toContain("Bold Kawi recorded");
    const registry = RegistryResponseSchema.parse((await agent.get("/api/game/registry")).body);
    expect(registry.entries.find((e) => e.creatureId === "kawi")?.fieldNotes?.phenotypes).toEqual(["Bold seen", "Wary seen"]);
  });

  it("records habitat visits once a day, splitting researcher EXP by category, with exploration EXP for the lead", async () => {
    const { agent, playerId } = await fieldPlayer([{ creatureId: "kawi", level: 5 }]);
    await agent.get("/api/game/state");
    await agent.get("/api/game/state");
    expect(await handle.db.habitatVisit.count({ where: { playerId } })).toBe(1);
    const visits = await expEvents(playerId, { source: "habitat-first-visit" });
    // Forest Edge by day: Kawi 40 (aerial), Mimu 35 + Kantar 25 (terrestrial).
    expect(Object.fromEntries(visits.map((v) => [v.category, v.amount]))).toEqual({ aerial: 20, terrestrial: 30 });
    expect(await handle.db.expEvent.count({ where: { playerId, source: "exploration" } })).toBe(1);

    // The next day it is a daily visit.
    clock = new Date("2026-10-19T02:00:00Z");
    await report(agent, FOREST);
    await agent.get("/api/game/state");
    const daily = await expEvents(playerId, { source: "habitat-daily-visit" });
    expect(daily.reduce((s, v) => s + v.amount, 0)).toBe(10);
  });

  it("awards walking EXP to the lead for slow movement only", async () => {
    const { agent, playerId, wildkin } = await fieldPlayer([{ creatureId: "kawi", level: 5 }]);
    for (let i = 1; i <= 3; i++) {
      tick(30);
      await report(agent, north(FOREST, 45 * i)); // 1.5 m/s
    }
    const walking = await expEvents(playerId, { source: "walking" });
    expect(walking).toHaveLength(1);
    expect(walking[0]).toMatchObject({ capturedWildkinId: wildkin[0]!.id, amount: 1, meta: { units: 1 } });
    expect((await handle.db.player.findUniqueOrThrow({ where: { id: playerId } })).walkMeterM).toBeCloseTo(135, 0);

    // Driving (5 m/s) does not count.
    tick(60);
    await report(agent, north(FOREST, 135 + 300));
    expect(await handle.db.expEvent.count({ where: { playerId, source: "walking" } })).toBe(1);
  });

  it("stops gaining EXP at the license cap (decision 2) and logs nothing there", async () => {
    const { agent, playerId, wildkin } = await fieldPlayer([{ creatureId: "kawi", level: 20 }]);
    const spawn = await spawnFor(playerId, { level: 20 });
    const battle = await startBattle(agent, spawn.id);
    await patchState(battle.id, (s) => void (s.wild.hp = 1));
    rand = 0.99;
    const { events } = BattleActionResponseSchema.parse((await act(agent, battle.id, 0, { type: "attack", attackIndex: 0 })).body);
    expect(events.find((e) => e.type === "exp")).toMatchObject({ amount: 0, heldAtCap: true });
    expect(await handle.db.expEvent.count({ where: { playerId, track: "wildkin" } })).toBe(0);
    const w = await handle.db.capturedWildkin.findUniqueOrThrow({ where: { id: wildkin[0]!.id } });
    expect(w).toMatchObject({ level: 20, exp: totalExpForLevel(20) });
  });

  it("levels up and raises current HP by the max-HP increase", async () => {
    const { agent, playerId, wildkin } = await fieldPlayer([{ creatureId: "kawi", level: 5 }]);
    await handle.db.capturedWildkin.update({ where: { id: wildkin[0]!.id }, data: { exp: totalExpForLevel(6) - 1 } });
    await handle.db.player.update({ where: { id: playerId }, data: { lastBattleExpAt: clock } });
    const spawn = await spawnFor(playerId, { level: 5 });
    const battle = await startBattle(agent, spawn.id);
    await patchState(battle.id, (s) => void (s.wild.hp = 1));
    rand = 0.99;
    const { events } = BattleActionResponseSchema.parse((await act(agent, battle.id, 0, { type: "attack", attackIndex: 0 })).body);
    expect(events.find((e) => e.type === "exp")).toMatchObject({ newLevel: 6 });
    const w = await handle.db.capturedWildkin.findUniqueOrThrow({ where: { id: wildkin[0]!.id } });
    const max5 = await maxHpOf(handle.db, "kawi", 5);
    const max6 = await maxHpOf(handle.db, "kawi", 6);
    const hpAfterBattle = BattleStateSchema.parse((await handle.db.battle.findUniqueOrThrow({ where: { id: battle.id } })).state).party[0]!.hp;
    expect(w.level).toBe(6);
    expect(w.currentHp).toBe(Math.min(max6, hpAfterBattle + (max6 - max5)));
  });

  it("shows matchup records per body trait in the Registry's field notes", async () => {
    const { agent, playerId } = await fieldPlayer();
    await spawnFor(playerId, { creatureId: "kantar" }).then((s) => agent.post(`/api/game/spawns/${s.id}/observe`));
    await handle.db.matchupRecord.create({ data: { playerId, bodyTrait: "plated", approach: "crush", effect: "weak" } });
    const kantar = RegistryResponseSchema.parse((await agent.get("/api/game/registry")).body).entries.find((e) => e.creatureId === "kantar")!;
    expect(kantar.fieldNotes?.bodyTraits).toEqual([{ trait: "plated", weakTo: "crush", resists: null }]);
    expect(kantar.statShape).toBeNull(); // captured only
  });
});

// ------------------------------------------------------------------ healing

describe("healing", () => {
  it("vets heal every non-restless Wildkin to full, at a field station in range", async () => {
    const { agent, wildkin } = await fieldPlayer([
      { creatureId: "kawi", level: 8, hp: 0 },
      { creatureId: "mimu", level: 6, hp: 3, slot: null },
      { creatureId: "kawi", level: 25, hp: 4 },
    ]);
    const res = await agent.post(`/api/game/stations/${IDS.gate}/heal`);
    expect(res.status, res.text).toBe(200);
    expect(res.body).toMatchObject({ station: { name: "East Research Gate" }, healed: 2 });
    expect(res.body.untreated).toEqual([{ wildkinId: wildkin[2]!.id, name: "Kawi", reason: "Cannot be treated yet: needs Aerial rank 2" }]);
    expect((await handle.db.capturedWildkin.findUniqueOrThrow({ where: { id: wildkin[0]!.id } })).currentHp).toBe(await maxHpOf(handle.db, "kawi", 8));
    expect((await handle.db.capturedWildkin.findUniqueOrThrow({ where: { id: wildkin[2]!.id } })).currentHp).toBe(4);

    expect((await agent.post(`/api/game/stations/${CLEARING_POI}/heal`)).body.error).toBe("not_a_station");
    tick(60);
    await report(agent, CREEK);
    expect((await agent.post(`/api/game/stations/${IDS.gate}/heal`)).body.error).toBe("out_of_range");
  });

  it("uses a Trail Ration from the satchel: 25% of max HP, not on restless or full Wildkin", async () => {
    const { agent, playerId, wildkin } = await fieldPlayer([
      { creatureId: "kawi", level: 10, hp: 2 },
      { creatureId: "kawi", level: 25, hp: 4 },
    ]);
    const max = await maxHpOf(handle.db, "kawi", 10);
    const used = await agent.post("/api/game/items/trail-ration/use").send({ wildkinId: wildkin[0]!.id });
    expect(used.status, used.text).toBe(200);
    expect(used.body.quantityLeft).toBe(2);
    expect((await handle.db.capturedWildkin.findUniqueOrThrow({ where: { id: wildkin[0]!.id } })).currentHp).toBe(2 + Math.floor(max / 4));

    expect((await agent.post("/api/game/items/trail-ration/use").send({ wildkinId: wildkin[1]!.id })).body.error).toBe("restless");
    await handle.db.capturedWildkin.update({ where: { id: wildkin[0]!.id }, data: { currentHp: max } });
    expect((await agent.post("/api/game/items/trail-ration/use").send({ wildkinId: wildkin[0]!.id })).body.error).toBe("full_hp");
    await handle.db.capturedWildkin.update({ where: { id: wildkin[0]!.id }, data: { currentHp: 1 } });
    await handle.db.inventoryItem.update({ where: { playerId_itemId: { playerId, itemId: "trail-ration" } }, data: { quantity: 0 } });
    expect((await agent.post("/api/game/items/trail-ration/use").send({ wildkinId: wildkin[0]!.id })).body.error).toBe("no_items");
  });

  it("shows Wildkin details by scanner depth", async () => {
    const { agent, playerId, wildkin } = await fieldPlayer([{ creatureId: "kawi", level: 10, hp: 3 }]);
    let detail = WildkinDetailResponseSchema.parse((await agent.get(`/api/game/wildkin/${wildkin[0]!.id}`)).body).wildkin;
    expect(detail).toMatchObject({ scannerRank: 1, category: "aerial", licenseNeeded: "Aerial rank 1", temperament: null, genotype: null, build: "Typical", cannotBeTreated: false });
    expect(detail.stats.every((s) => s.grade === null && s.vigor === null)).toBe(true);
    expect(detail.stats.map((s) => s.descriptor)).toEqual(["Modest", "Modest", "Weak point", "Signature strength"]);
    expect(detail.recoveryMs).toBeGreaterThan(0);
    expect(detail.exp).toMatchObject({ intoLevel: 0, levelSize: 331, heldAtCap: false });

    await handle.db.researcherLicense.update({ where: { playerId_category: { playerId, category: "aerial" } }, data: { rank: 4 } });
    detail = WildkinDetailResponseSchema.parse((await agent.get(`/api/game/wildkin/${wildkin[0]!.id}`)).body).wildkin;
    expect(detail).toMatchObject({ scannerRank: 4, temperament: "Steady", genotype: { build: "S/L", temperament: "B/W", marking: "+/+" } });
    expect(detail.stats.every((s) => s.grade !== null && s.vigor === "Average")).toBe(true);
    expect((await agent.get("/api/game/wildkin/00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});

// ------------------------------------------------------------------ licenses

describe("licenses and assessments", () => {
  /** Everything the Aerial 1 -> 2 checklist asks for, clamped to the fixture world. */
  async function completeAerialChecklist(playerId: string) {
    await handle.db.registryEntry.create({ data: { playerId, creatureId: "kawi", timesCaptured: 1, firstCapturedAt: clock } });
    for (const value of ["dawn", "day", "dusk", "night"]) {
      await handle.db.conditionRecord.create({ data: { playerId, creatureId: "kawi", kind: "time_of_day", value } });
    }
  }

  it("lists four licenses with progress and the station in reach", async () => {
    const { agent } = await fieldPlayer();
    const res = LicensesResponseSchema.parse((await agent.get("/api/game/licenses")).body);
    expect(res.licenses.map((l) => l.category)).toEqual(["aerial", "aquatic", "terrestrial", "verdant"]);
    expect(res.station).toEqual({ id: IDS.gate, name: "East Research Gate" });
    const aerial = res.licenses[0]!;
    expect(aerial).toMatchObject({ rank: 1, obedienceCap: 20, nextRank: 2, nextThreshold: 600, expMet: false, atStation: true, canTakeAssessment: false });
    // Only Kawi is Aerial in the fixture: "observe 2 species" is clamped to 1.
    expect(aerial.requirements.find((r) => r.type === "observeDistinctSpecies")).toMatchObject({ required: 1, current: 0 });
  });

  it("refuses with every failure code, then ranks up, grants items and calms restless Wildkin", async () => {
    const { agent, playerId, wildkin } = await fieldPlayer([
      { creatureId: "kawi", level: 12 },
      { creatureId: "kawi", level: 25, hp: 4 },
    ]);
    const restlessSince = new Date(clock.getTime() - 3600_000);
    await handle.db.capturedWildkin.update({ where: { id: wildkin[1]!.id }, data: { hpUpdatedAt: restlessSince } });

    expect((await agent.post("/api/game/licenses/aerial/assessment")).body.error).toBe("exp_too_low");
    await handle.db.researcherLicense.update({ where: { playerId_category: { playerId, category: "aerial" } }, data: { exp: 650 } });
    const incomplete = await agent.post("/api/game/licenses/aerial/assessment");
    expect(incomplete.body.error).toBe("assessment_incomplete");
    expect(incomplete.body.details.requirements).toHaveLength(3);

    await completeAerialChecklist(playerId);
    tick(60);
    await report(agent, CREEK);
    expect((await agent.post("/api/game/licenses/aerial/assessment")).body.error).toBe("not_at_station");
    tick(60);
    await report(agent, FOREST);
    await handle.db.inventoryItem.update({ where: { playerId_itemId: { playerId, itemId: "field-capsule" } }, data: { quantity: 29 } });

    const res = await agent.post("/api/game/licenses/aerial/assessment");
    expect(res.status, res.text).toBe(200);
    expect(res.body.license).toMatchObject({ rank: 2, obedienceCap: 40 });
    expect(res.body.granted).toEqual([
      { itemId: "canopy-capsule", quantity: 5 },
      { itemId: "field-capsule", quantity: 1 },
    ]);
    expect(res.body.summary).toContain("1 Wildkin is no longer restless");
    expect(res.body.summary).toContain("2 Field Capsule did not fit in your satchel");
    expect(await handle.db.assessmentCompletion.count({ where: { playerId, category: "aerial", rank: 2 } })).toBe(1);

    const calmed = await handle.db.capturedWildkin.findUniqueOrThrow({ where: { id: wildkin[1]!.id } });
    expect(calmed.hpUpdatedAt.getTime()).toBe(clock.getTime());
    const party = PartyResponseSchema.parse((await agent.get("/api/game/party")).body);
    expect(party.party[1]).toMatchObject({ restless: false });

    // Twice for the same rank is impossible; the next one needs more EXP.
    expect((await agent.post("/api/game/licenses/aerial/assessment")).body.error).toBe("exp_too_low");
    await handle.db.researcherLicense.update({ where: { playerId_category: { playerId, category: "aerial" } }, data: { rank: 5 } });
    expect((await agent.post("/api/game/licenses/aerial/assessment")).body.error).toBe("max_rank");
    expect((await agent.post("/api/game/licenses/fungal/assessment")).status).toBe(400);
  });
});

// ------------------------------------------------------------------ radar extras

describe("radar extras", () => {
  it("lists POIs within 300 m with their services", async () => {
    const { agent } = await fieldPlayer();
    const state = GameStateResponseSchema.parse((await agent.get("/api/game/state")).body);
    const gate = state.pois.find((p) => p.id === IDS.gate)!;
    expect(gate).toMatchObject({ name: "East Research Gate", inRange: true, services: ["pickup", "vet", "assessment"], pickedUpToday: false });
    expect(state.pois.find((p) => p.id === CLEARING_POI)).toMatchObject({ services: ["pickup"], inRange: true });
  });

  it("daily pickups are left to implement (exercise #14: 501)", async () => {
    const { agent } = await fieldPlayer();
    const res = await agent.post(`/api/game/pois/${CLEARING_POI}/collect`);
    // TODO(you) exercise #14: once POST /pois/:poiId/collect is implemented, assert instead:
    // - 200 with a PickupResponse: 2 or 3 field-capsule, maybe a trail-ration or a bloom-capsule (rollPickup);
    //   with `rand = 0` the loot is exactly 3 Field Capsules, 1 Trail Ration and 1 Bloom Capsule.
    // - the inventory went up by those amounts, never above ITEM_STACK_MAX (set a stack to 29 first);
    // - a second collect the same day is 409 "already_collected" (two parallel requests: one 200, one 409);
    // - GET /state shows pickedUpToday: true for that POI;
    // - from CREEK (far away) it is 409 "out_of_range".
    expect(res.status).toBe(501);
  });
});
