import { Router } from "express";
import { listCreatures } from "@wildbound/db";
import {
  BattleActionRequestSchema,
  CategorySchema,
  ITEMS,
  PARTY_SIZE,
  PositionReportSchema,
  RenameWildkinRequestSchema,
  StarterRequestSchema,
  UpdatePartyRequestSchema,
  UseItemRequestSchema,
  type CapturedWildkinView,
  type InventoryResponse,
  type ItemId,
  type PartyResponse,
  type RegistryResponse,
  type WildkinDetailResponse,
} from "@wildbound/shared";
import { z } from "zod";
import type { AppDeps } from "../app.ts";
import { requirePlayer } from "../auth.ts";
import { HttpError, notImplemented, parseOr400 } from "../http.ts";
import { actInBattle, currentBattle, getBattle, startBattle } from "../game/battle-service.ts";
import { chooseStarter, starterOptions, useItem, visitVet } from "../game/care-service.ts";
import { creatureMap, loadLicenses, nowOf, requirePosition, type GameDeps } from "../game/common.ts";
import { fieldKnowledge, licensesView, observeSpawn, takeAssessment } from "../game/research-service.ts";
import { gameState, reportPosition } from "../game/service.ts";
import { registryView } from "../game/views.ts";
import { capturedView, leadOf, loadWildkin, wildkinDetail } from "../game/wildkin.ts";

const IdParamsSchema = z.object({ id: z.uuid() });
const PoiParamsSchema = z.object({ poiId: z.uuid() });
const ItemParamsSchema = z.object({ itemId: z.string().max(64) });
const CategoryParamsSchema = z.object({ category: CategorySchema });

/**
 * Player game API. Every route needs a session (requirePlayer) and every action
 * is checked against the player's *server-side* position, never coordinates
 * sent with the request.
 */
export function gameRoutes(deps: AppDeps): Router {
  const { db } = deps;
  const game: GameDeps = {
    db,
    weather: deps.weather,
    fallbackTimeZone: deps.config.worldTimeZone,
    relaxWeather: deps.config.assessmentRelaxWeather,
    now: deps.now,
    random: deps.random,
  };
  const router = Router();
  router.use(requirePlayer(db));

  /** Report one GPS fix. The answer says whether the server accepted it. */
  router.post("/position", async (req, res) => {
    const report = parseOr400(PositionReportSchema, req.body, "Invalid position");
    res.json(await reportPosition(game, res.locals.player.id, report));
  });

  /** Radar state: environment, current region/habitat and nearby spawns. */
  router.get("/state", async (_req, res) => {
    res.json(await gameState(game, res.locals.player.id));
  });

  /**
   * Observe a spawn: unlocks the species' basic Registry entry (name,
   * description, habitat, registry number), reveals the spawn's level and
   * hints, and records research (researcher EXP, the lead's observation EXP).
   */
  router.post("/spawns/:id/observe", async (req, res) => {
    const { id } = parseOr400(IdParamsSchema, req.params, "Invalid spawn id");
    res.json(await observeSpawn(game, res.locals.player.id, id));
  });

  // ---------------------------------------------------------------- starter

  router.get("/starter", async (_req, res) => {
    res.json(await starterOptions(game));
  });

  /** A player with no Wildkin chooses Kawi, Mimu or Kantar at level 5. */
  router.post("/starter", async (req, res) => {
    const { creatureId } = parseOr400(StarterRequestSchema, req.body, "Invalid starter");
    res.json(await chooseStarter(game, res.locals.player.id, creatureId));
  });

  // ---------------------------------------------------------------- battles

  /** Start a wild battle with a spawn (capture happens inside the battle). */
  router.post("/spawns/:id/battle", async (req, res) => {
    const { id } = parseOr400(IdParamsSchema, req.params, "Invalid spawn id");
    res.json(await startBattle(game, res.locals.player.id, id));
  });

  router.get("/battles/current", async (_req, res) => {
    res.json(await currentBattle(game, res.locals.player.id));
  });

  router.get("/battles/:id", async (req, res) => {
    const { id } = parseOr400(IdParamsSchema, req.params, "Invalid battle id");
    res.json(await getBattle(game, res.locals.player.id, id));
  });

  /** One action per turn: `{ turn, action }` -> the new battle view and the events to play back. */
  router.post("/battles/:id/actions", async (req, res) => {
    const { id } = parseOr400(IdParamsSchema, req.params, "Invalid battle id");
    const body = parseOr400(BattleActionRequestSchema, req.body, "Invalid battle action");
    res.json(await actInBattle(game, res.locals.player.id, id, body));
  });

  // ---------------------------------------------------------------- care, stations, pickups

  /** Use a field item (Trail Ration) on one of your Wildkin. */
  router.post("/items/:itemId/use", async (req, res) => {
    const { itemId } = parseOr400(ItemParamsSchema, req.params, "Invalid item");
    const { wildkinId } = parseOr400(UseItemRequestSchema, req.body, "Invalid request");
    res.json(await useItem(game, res.locals.player.id, itemId, wildkinId));
  });

  /** The vet at a field station heals every Wildkin you own (restless ones excepted). */
  router.post("/stations/:poiId/heal", async (req, res) => {
    const { poiId } = parseOr400(PoiParamsSchema, req.params, "Invalid station id");
    res.json(await visitVet(game, res.locals.player.id, poiId));
  });

  /**
   * Search a POI for supplies, once per player per POI per day.
   *
   * ------------------------------------------------------------------------
   * TODO(you): implement the daily pickup (exercise #14). The guards below
   * already prove the player has a fresh, unlocked position. Then:
   *
   * 1. Load the POI with `poiById(game.db, poiId, at)` from ../game/pois.ts
   *    (published world only). Missing -> throw new HttpError(404, "not_found", "...").
   *    Farther than GAME_RULES.interactRadiusM -> throw conflict("out_of_range", "...")
   *    (see visitVet in ../game/care-service.ts for the same check).
   * 2. Work out today's key: `await playerDayKey(game, game.db, playerId, now)` (../game/common.ts).
   * 3. Roll the loot with `rollPickup(poi.type, game.random ?? Math.random)` from @wildbound/world.
   * 4. In ONE `game.db.$transaction(async (tx) => { ... })`:
   *    - create the PoiPickup row { playerId, poiId, dayKey, items: loot, collectedAt: now }.
   *      Its primary key (player, POI, day) is what makes this "once a day": a second
   *      request fails with Prisma error code "P2002". Catch it (outside the transaction)
   *      and throw conflict("already_collected", "You already searched here today").
   *    - add the items with `grantItems(tx, playerId, loot)` from ../game/care-service.ts.
   *      It caps every stack at ITEM_STACK_MAX (30) and reports what did not fit.
   * 5. Respond with PickupResponse (@wildbound/shared game.ts):
   *    { poi: { id, name }, items: <the ItemGrant[] from grantItems> }
   *
   * Why a unique key and not "check, then insert"? Two quick taps could both
   * pass a check before either inserts. The database refuses the second insert.
   * Test: apps/api/test/battle.test.ts ("daily pickups ... exercise #14").
   * ------------------------------------------------------------------------
   */
  router.post("/pois/:poiId/collect", async (req, res) => {
    const { poiId } = parseOr400(PoiParamsSchema, req.params, "Invalid POI id");
    await requirePosition(game, res.locals.player.id, nowOf(game));
    void poiId;
    void res;
    throw notImplemented("Searching for supplies");
  });

  // ---------------------------------------------------------------- licenses

  router.get("/licenses", async (_req, res) => {
    res.json(await licensesView(game, res.locals.player.id));
  });

  /** Take the next rank's assessment at a field station. */
  router.post("/licenses/:category/assessment", async (req, res) => {
    const { category } = parseOr400(CategoryParamsSchema, req.params, "Unknown license category");
    res.json(await takeAssessment(game, res.locals.player.id, category));
  });

  /**
   * Every species, with fields unlocked according to the player's progress.
   * Species deleted in the Creature Manager stay listed only for players who already met them.
   */
  router.get("/registry", async (_req, res) => {
    const playerId = res.locals.player.id;
    const [all, entries, knowledge] = await Promise.all([
      listCreatures(db, { includeDeleted: true }),
      db.registryEntry.findMany({ where: { playerId } }),
      fieldKnowledge(db, playerId),
    ]);
    const byCreature = new Map(entries.map((e) => [e.creatureId, e]));
    const live = new Set((await listCreatures(db)).map((c) => c.id));
    const creatures = all.filter((c) => live.has(c.id) || byCreature.has(c.id));
    const views = creatures.map((c) => registryView(c, byCreature.get(c.id) ?? null, knowledge));
    res.json({
      entries: views,
      observedCount: views.filter((v) => v.status !== "unknown").length,
      capturedCount: views.filter((v) => v.status === "captured").length,
      total: views.length,
    } satisfies RegistryResponse);
  });

  router.get("/inventory", async (_req, res) => {
    const rows = await db.inventoryItem.findMany({ where: { playerId: res.locals.player.id }, orderBy: { itemId: "asc" } });
    const items = rows
      .filter((r): r is typeof r & { itemId: ItemId } => r.itemId in ITEMS)
      .map((r) => ({ itemId: r.itemId, quantity: r.quantity, ...ITEMS[r.itemId] }));
    res.json({ items } satisfies InventoryResponse);
  });

  /** The player's Wildkin, as the game sees them right now (lazy recovery applied). */
  const ownedWildkin = async (playerId: string) => {
    const now = nowOf(game);
    return loadWildkin(db, playerId, await creatureMap(db), await loadLicenses(db, playerId), now);
  };

  /** Party (6 slots) plus everything in storage. */
  router.get("/party", async (_req, res) => {
    const all = await ownedWildkin(res.locals.player.id);
    const leadId = leadOf(all)?.row.id ?? null;
    const party: PartyResponse["party"] = Array.from({ length: PARTY_SIZE }, () => null);
    for (const w of all) if (w.row.partySlot !== null) party[w.row.partySlot] = capturedView(w, leadId);
    res.json({ party, storage: all.filter((w) => w.row.partySlot === null).map((w) => capturedView(w, leadId)) } satisfies PartyResponse);
  });

  /** One Wildkin in detail; what the scanner shows depends on your license rank in its category. */
  router.get("/wildkin/:id", async (req, res) => {
    const { id } = parseOr400(IdParamsSchema, req.params, "Invalid id");
    const all = await ownedWildkin(res.locals.player.id);
    const w = all.find((x) => x.row.id === id);
    if (!w) throw new HttpError(404, "not_found", "That Wildkin is not yours");
    const habitat = w.row.caughtHabitatId
      ? await db.habitat.findFirst({ where: { id: w.row.caughtHabitatId }, orderBy: { stage: "desc" }, select: { name: true } })
      : null;
    res.json({ wildkin: wildkinDetail(w, leadOf(all)?.row.id ?? null, habitat?.name ?? null) } satisfies WildkinDetailResponse);
  });

  /**
   * Rearrange the party.
   *
   * ------------------------------------------------------------------------
   * TODO(you): implement. The body is already validated (6 slots of id-or-null,
   * no duplicates). Then:
   * 1. Check every non-null id belongs to this player (db.capturedWildkin.count with
   *    `id: { in: ids }, playerId`); otherwise 400.
   * 2. In a transaction: clear all of this player's party slots
   *    (updateMany -> partySlot: null), then set partySlot = index for each id.
   *    (Clearing first avoids tripping the unique (playerId, partySlot) index.)
   * 3. Respond 204, or reuse the GET /party code to return the new PartyResponse.
   * ------------------------------------------------------------------------
   */
  router.put("/party", async (req, _res) => {
    const { slots } = parseOr400(UpdatePartyRequestSchema, req.body, "Invalid party");
    throw notImplemented("Updating the party");
  });

  /**
   * Give a captured Wildkin a nickname (null clears it).
   */
  router.patch("/wildkin/:id", async (req, res) => {
    const { id } = parseOr400(IdParamsSchema, req.params, "Invalid id");
    const { nickname } = parseOr400(RenameWildkinRequestSchema, req.body, "Invalid nickname");

    const capturedWildkin = await db.capturedWildkin.findFirst({
      where: {
        id,
        playerId: res.locals.player.id,
      }
    });

    if (!capturedWildkin) {
      throw new HttpError(404, "not_found", "Player wildkin not found")
    }

    const creatureEntry = await db.creature.findFirst({
      where: {
        id: capturedWildkin.creatureId,
      }
    });

    if (!creatureEntry) {
      throw new HttpError(404, "not_found", "Wildkin not found")
    }

    const [results] = await db.$transaction([
      db.capturedWildkin.update({
        where: {
          id,
          playerId: res.locals.player.id,
        },
        data: {
          nickname,
        }
      })
    ]);

    // v0.3.0: the view carries level, HP and condition too, so build it like GET /party does.
    const all = await ownedWildkin(res.locals.player.id);
    const view = capturedView(all.find((w) => w.row.id === results.id)!, leadOf(all)?.row.id ?? null);

    res.json(view satisfies CapturedWildkinView);
  });

  router.use((_req, _res, next) => next(new HttpError(404, "not_found", "Unknown game route")));
  return router;
}
