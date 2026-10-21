import {
  BATTLE_RULES,
  GAME_RULES,
  ITEMS,
  ITEM_STACK_MAX,
  STARTER_LEVEL,
  STARTER_SPECIES,
  type ItemGrant,
  type ItemId,
  type StarterOptionsResponse,
  type StarterResponse,
  type UseItemResponse,
  type VetResponse,
} from "@wildbound/shared";
import { distanceMeters, individualStats, rollGenome, rollVigor, totalExpForLevel } from "@wildbound/world";
import { HttpError, conflict } from "../http.ts";
import { creatureMap, loadLicenses, nowOf, randomOf, requirePosition, type GameDeps, type Tx } from "./common.ts";
import { isFieldStation, poiById } from "./pois.ts";
import { capturedView, displayName, leadOf, licenseNeeded, loadWildkin, statShape, wildkinInfo } from "./wildkin.ts";

/**
 * Looking after Wildkin outside battles: the starter, Trail Rations and vets
 * at field stations. Item grants (rank-ups, pickups) live here too.
 */

/** Adds items up to ITEM_STACK_MAX per stack; the rest is reported as truncated. */
export async function grantItems(tx: Tx, playerId: string, items: Partial<Record<ItemId, number>>): Promise<ItemGrant[]> {
  const out: ItemGrant[] = [];
  for (const [itemId, quantity] of Object.entries(items) as [ItemId, number][]) {
    if (!quantity) continue;
    const row = await tx.inventoryItem.findUnique({ where: { playerId_itemId: { playerId, itemId } } });
    const have = row?.quantity ?? 0;
    const added = Math.max(0, Math.min(quantity, ITEM_STACK_MAX - have));
    if (added > 0) {
      await tx.inventoryItem.upsert({
        where: { playerId_itemId: { playerId, itemId } },
        create: { playerId, itemId, quantity: added },
        update: { quantity: { increment: added } },
      });
    }
    out.push({ itemId, name: ITEMS[itemId].name, quantity: added, truncated: quantity - added });
  }
  return out;
}

/** Spends one item; false when the player has none (checked and spent in one statement). */
export async function spendItem(tx: Tx, playerId: string, itemId: string): Promise<boolean> {
  const { count } = await tx.inventoryItem.updateMany({ where: { playerId, itemId, quantity: { gt: 0 } }, data: { quantity: { decrement: 1 } } });
  return count === 1;
}

/** Healing outside a battle would be overwritten by the battle's own HP, so it waits until the battle ends. */
async function assertNoActiveBattle(tx: Tx, playerId: string) {
  const battle = await tx.battle.findFirst({ where: { playerId, status: "active" }, select: { id: true } });
  if (battle) throw conflict("battle_in_progress", "Finish your battle first", { battleId: battle.id });
}

// ------------------------------------------------------------------ starter

export async function starterOptions(deps: GameDeps): Promise<StarterOptionsResponse> {
  const creatures = await creatureMap(deps.db, { includeDeleted: false });
  const options = STARTER_SPECIES.flatMap((id) => {
    const c = creatures.get(id);
    return c
      ? [{ creatureId: c.id, registryNumber: c.registryNumber, name: c.name, description: c.description, category: c.category, statShape: statShape(c) }]
      : [];
  });
  return { options, level: STARTER_LEVEL };
}

/** The ranger's gift (decision 1): one of the starter species at level 5, only for a player with no Wildkin. */
export async function chooseStarter(deps: GameDeps, playerId: string, creatureId: string): Promise<StarterResponse> {
  const now = nowOf(deps);
  const random = randomOf(deps);
  const creature = (await creatureMap(deps.db, { includeDeleted: false })).get(creatureId);
  if (!creature) throw new HttpError(404, "not_found", "That Wildkin is not available");
  const genome = rollGenome(creature.genePool, [], random);
  const vigor = rollVigor(random);
  const maxHp = individualStats(creature.baseStats, STARTER_LEVEL, genome, vigor).hp;

  const row = await deps.db
    .$transaction(async (tx) => {
      if ((await tx.capturedWildkin.count({ where: { playerId } })) > 0) {
        throw conflict("already_has_wildkin", "You already have Wildkin; the starter is for new license holders");
      }
      return tx.capturedWildkin.create({
        data: {
          playerId,
          creatureId,
          partySlot: 0,
          level: STARTER_LEVEL,
          exp: totalExpForLevel(STARTER_LEVEL),
          genome,
          vigor,
          currentHp: maxHp,
          hpUpdatedAt: now,
          caughtLevel: STARTER_LEVEL,
          capturedAt: now,
        },
      });
    })
    .catch((e: unknown) => {
      // Two quick taps: the (player, party slot 0) unique key lets only one through.
      if ((e as { code?: string }).code === "P2002") throw conflict("already_has_wildkin", "You already have Wildkin");
      throw e;
    });

  const info = wildkinInfo(row, creature, await loadLicenses(deps.db, playerId), now);
  return { wildkin: capturedView(info, row.id) };
}

// ------------------------------------------------------------------ Trail Ration

export async function useItem(deps: GameDeps, playerId: string, itemId: string, wildkinId: string): Promise<UseItemResponse> {
  if (itemId !== "trail-ration") throw new HttpError(400, "bad_request", "Only Trail Rations can be used outside a battle");
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await assertNoActiveBattle(tx, playerId);
    const creatures = await creatureMap(tx);
    const licenses = await loadLicenses(tx, playerId);
    const all = await loadWildkin(tx, playerId, creatures, licenses, now);
    const target = all.find((w) => w.row.id === wildkinId);
    if (!target) throw new HttpError(404, "not_found", "That Wildkin is not yours");
    if (target.restless) throw conflict("restless", `${displayName(target)} is restless and will not accept treatment yet`);
    if (target.hp >= target.maxHp) throw conflict("full_hp", `${displayName(target)} is already at full strength`);
    if (!(await spendItem(tx, playerId, itemId))) throw conflict("no_items", "You have no Trail Rations left");

    const heal = Math.max(1, Math.floor(target.maxHp * BATTLE_RULES.trailRationHeal));
    const row = await tx.capturedWildkin.update({
      where: { id: target.row.id },
      data: { currentHp: Math.min(target.maxHp, target.hp + heal), hpUpdatedAt: now },
    });
    const left = await tx.inventoryItem.findUnique({ where: { playerId_itemId: { playerId, itemId } } });
    const updated = wildkinInfo(row, target.creature, licenses, now);
    const lead = leadOf(all.map((w) => (w.row.id === row.id ? updated : w)));
    return { wildkin: capturedView(updated, lead?.row.id ?? null), quantityLeft: left?.quantity ?? 0 };
  });
}

// ------------------------------------------------------------------ vets

/** A vet at a field station heals every Wildkin the player owns to full, except restless ones. */
export async function visitVet(deps: GameDeps, playerId: string, poiId: string): Promise<VetResponse> {
  const now = nowOf(deps);
  const at = await requirePosition(deps, playerId, now);
  const poi = await poiById(deps.db, poiId, at);
  if (!poi) throw new HttpError(404, "not_found", "There is no such place");
  if (!isFieldStation(poi.type)) throw conflict("not_a_station", `There is no vet at ${poi.name}`);
  const distanceM = distanceMeters(at, poi);
  if (distanceM > GAME_RULES.interactRadiusM) {
    throw conflict("out_of_range", `Get closer: ${Math.round(distanceM)} m away (max ${GAME_RULES.interactRadiusM} m)`);
  }

  return deps.db.$transaction(async (tx) => {
    await assertNoActiveBattle(tx, playerId);
    const all = await loadWildkin(tx, playerId, await creatureMap(tx), await loadLicenses(tx, playerId), now);
    const untreated: VetResponse["untreated"] = [];
    let healed = 0;
    for (const w of all) {
      if (w.restless) {
        untreated.push({ wildkinId: w.row.id, name: displayName(w), reason: `Cannot be treated yet: needs ${licenseNeeded(w)}` });
        continue;
      }
      if (w.hp < w.maxHp) healed++;
      await tx.capturedWildkin.update({ where: { id: w.row.id }, data: { currentHp: w.maxHp, hpUpdatedAt: now } });
    }
    return { station: { id: poi.id, name: poi.name }, healed, untreated };
  });
}
