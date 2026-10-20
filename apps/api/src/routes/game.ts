import { Router } from "express";
import { listCreatures } from "@wildbound/db";
import {
  ITEMS,
  PARTY_SIZE,
  PositionReportSchema,
  RenameWildkinRequestSchema,
  UpdatePartyRequestSchema,
  type CapturedWildkinView,
  type InventoryResponse,
  type ItemId,
  type ObserveResponse,
  type PartyResponse,
  type RegistryResponse,
} from "@wildbound/shared";
import { z } from "zod";
import type { AppDeps } from "../app.ts";
import { requirePlayer } from "../auth.ts";
import { HttpError, notImplemented, parseOr400 } from "../http.ts";
import { gameState, loadActionableSpawn, reportPosition, type GameDeps } from "../game/service.ts";
import { registryView } from "../game/views.ts";

const SpawnParamsSchema = z.object({ id: z.uuid() });

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
   * description, habitat, registry number). Repeat observations are counted.
   */
  router.post("/spawns/:id/observe", async (req, res) => {
    const { id } = parseOr400(SpawnParamsSchema, req.params, "Invalid spawn id");
    const playerId = res.locals.player.id;
    const { spawn, now } = await loadActionableSpawn(game, playerId, id);

    const previous = await db.registryEntry.findUnique({ where: { playerId_creatureId: { playerId, creatureId: spawn.creatureId } } });
    const [entry] = await db.$transaction([
      db.registryEntry.upsert({
        where: { playerId_creatureId: { playerId, creatureId: spawn.creatureId } },
        create: { playerId, creatureId: spawn.creatureId, firstObservedAt: now },
        update: { timesObserved: { increment: 1 } },
      }),
      db.spawn.update({ where: { id: spawn.id }, data: { observedAt: spawn.observedAt ?? now } }),
    ]);

    const creature = (await listCreatures(db)).find((c) => c.id === spawn.creatureId)!;
    res.json({ entry: registryView(creature, entry), firstObservation: previous === null } satisfies ObserveResponse);
  });

  /**
   * Capture a spawn.
   *
   * ------------------------------------------------------------------------
   * TODO(you): implement capture. The guard below already proves the spawn is
   * the player's, active and in range. Then:
   *
   * 1. Load the player's "field-capsule" stack (db.inventoryItem.findUnique with the
   *    playerId_itemId compound key). No capsules -> throw new HttpError(409, "no_capsules", "...").
   * 2. Roll success with captureChance(rarity, spawn.observedAt !== null) from
   *    @wildbound/world (use `game.random?.() ?? Math.random()` so tests can control it).
   *    On failure, roll FLEE_CHANCE_ON_FAIL to decide whether the spawn flees.
   * 3. In ONE db.$transaction(async (tx) => { ... }):
   *    - decrement the capsule (tx.inventoryItem.update with { quantity: { decrement: 1 } })
   *    - on success: set the spawn status to "captured"; create a CapturedWildkin row
   *      (put it in the first free party slot 0..5, else partySlot null = storage);
   *      upsert the RegistryEntry: create with firstObservedAt + firstCapturedAt = now and
   *      timesCaptured 1, or update timesCaptured +1 and firstCapturedAt if it was null.
   *    - on failure + flee: set the spawn status to "fled".
   * 4. Respond with CaptureResponse (see @wildbound/shared game.ts):
   *    { success, fled, capsulesLeft, entry: registryView(creature, entry), wildkinId }
   *
   * Why a transaction? Two quick taps must not spend one capsule twice or create
   * two Wildkin from one spawn. Bonus: make step 3 also re-check `status: "active"`
   * (tx.spawn.updateMany({ where: { id, status: "active" } }) and look at `count`).
   * ------------------------------------------------------------------------
   */
  router.post("/spawns/:id/capture", async (req, res) => {
    const { id } = parseOr400(SpawnParamsSchema, req.params, "Invalid spawn id");
    await loadActionableSpawn(game, res.locals.player.id, id);
    void res;
    throw notImplemented("Capture");
  });

  /** Every species, with fields unlocked according to the player's progress. */
  router.get("/registry", async (_req, res) => {
    const playerId = res.locals.player.id;
    const [creatures, entries] = await Promise.all([listCreatures(db), db.registryEntry.findMany({ where: { playerId } })]);
    const byCreature = new Map(entries.map((e) => [e.creatureId, e]));
    const views = creatures.map((c) => registryView(c, byCreature.get(c.id) ?? null));
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

  /** Party (6 slots) plus everything in storage. */
  router.get("/party", async (_req, res) => {
    const [rows, creatures] = await Promise.all([
      db.capturedWildkin.findMany({ where: { playerId: res.locals.player.id }, orderBy: { capturedAt: "asc" } }),
      listCreatures(db),
    ]);
    const species = new Map(creatures.map((c) => [c.id, c]));
    const view = (r: (typeof rows)[number]): CapturedWildkinView => ({
      id: r.id,
      creatureId: r.creatureId,
      registryNumber: species.get(r.creatureId)?.registryNumber ?? 0,
      speciesName: species.get(r.creatureId)?.name ?? r.creatureId,
      nickname: r.nickname,
      partySlot: r.partySlot,
      capturedAt: r.capturedAt.toISOString(),
    });
    const party: PartyResponse["party"] = Array.from({ length: PARTY_SIZE }, () => null);
    for (const r of rows) if (r.partySlot !== null) party[r.partySlot] = view(r);
    res.json({ party, storage: rows.filter((r) => r.partySlot === null).map(view) } satisfies PartyResponse);
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
    const { id } = parseOr400(SpawnParamsSchema, req.params, "Invalid id");
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

    const view: CapturedWildkinView = {
      ...results,
      registryNumber: creatureEntry.registryNumber ?? 0,
      speciesName: creatureEntry.name ?? results.creatureId,
      capturedAt: results.capturedAt.toISOString(),
    }

    res.json(view satisfies CapturedWildkinView);
  });

  router.use((_req, _res, next) => next(new HttpError(404, "not_found", "Unknown game route")));
  return router;
}
