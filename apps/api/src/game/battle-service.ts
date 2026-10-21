import { randomUUID } from "node:crypto";
import type { BattleModel, SpawnModel } from "@wildbound/db";
import {
  BATTLE_RULES,
  BattleStateSchema,
  CAPSULE_ITEM_IDS,
  GAME_RULES,
  ITEMS,
  LicenseRequirementSchema,
  RESEARCH_RULES,
  licenseRequirementLabel,
  powerWord,
  type BattleAction,
  type BattleActionResponse,
  type BattleEvent,
  type BattleOutcome,
  type BattleResponse,
  type BattleState,
  type BattleView,
  type Combatant,
  type ItemId,
  type LicenseRequirement,
  type ResearcherExpGain,
} from "@wildbound/shared";
import {
  BattleActionError,
  activeOf,
  attacksOf,
  battleExp,
  captureExp,
  distanceMeters,
  endBattle,
  individualStats,
  isUsable,
  resolveTurn,
  restedCharges,
  sharedBattleExp,
  totalExpForLevel,
} from "@wildbound/world";
import { HttpError, conflict } from "../http.ts";
import {
  creatureMap,
  getTracked,
  loadLicenses,
  nowOf,
  playerDayKey,
  randomOf,
  type Creatures,
  type GameDeps,
  type Licenses,
  type Tx,
} from "./common.ts";
import { spendItem } from "./care-service.ts";
import { grantResearcherExp, recordMatchup, recordPhenotypes } from "./research-service.ts";
import { loadActionableSpawn } from "./service.ts";
import { genomeOf, grantWildkinExp, loadWildkin, partyOf, vigorOf, type WildkinExpResult, type WildkinInfo } from "./wildkin.ts";

/**
 * Wild battles: server-authoritative and turn-based over HTTP. The pure engine
 * (resolveTurn in @wildbound/world) decides each turn; this service loads the
 * state, guards the request, and persists the result, item use, party HP,
 * EXP, records and the spawn's fate in one transaction per turn.
 */

// ------------------------------------------------------------------ license-locked habitats

/** The published habitat's license requirement, if any. */
export async function habitatRequirement(db: Tx, habitatId: string | null): Promise<LicenseRequirement> {
  if (!habitatId) return null;
  const habitat = await db.habitat.findUnique({ where: { id_stage: { id: habitatId, stage: "published" } }, select: { licenseRequirement: true } });
  return LicenseRequirementSchema.safeParse(habitat?.licenseRequirement ?? null).data ?? null;
}

/** "Restricted research zone: Aquatic rank 3" when the player's license is below the requirement, else null. */
export function lockReason(requirement: LicenseRequirement, licenses: Licenses): string | null {
  if (!requirement || licenses[requirement.category].rank >= requirement.rank) return null;
  return `Restricted research zone: ${licenseRequirementLabel(requirement)}`;
}

// ------------------------------------------------------------------ state

function combatantOf(w: WildkinInfo): Combatant {
  return {
    id: w.row.id,
    creatureId: w.creature.id,
    name: w.row.nickname ?? w.creature.name,
    registryNumber: w.creature.registryNumber,
    level: w.row.level,
    stats: w.stats,
    hp: w.hp,
    status: null,
    attacks: w.creature.attacks,
    bodyTraits: w.creature.bodyTraits,
    category: w.creature.category,
    restless: w.restless,
  };
}

function wildOf(spawn: SpawnModel, creatures: Creatures): BattleState["wild"] {
  const creature = creatures.get(spawn.creatureId)!;
  const stats = individualStats(creature.baseStats, spawn.level, genomeOf(spawn.genome), vigorOf(spawn.vigor));
  return {
    id: spawn.id,
    creatureId: creature.id,
    name: creature.name,
    registryNumber: creature.registryNumber,
    level: spawn.level,
    stats,
    hp: stats.hp,
    status: null,
    attacks: creature.attacks,
    bodyTraits: creature.bodyTraits,
    category: creature.category,
    restless: false,
    rarity: creature.rarity,
    observed: spawn.observedAt !== null,
  };
}

const stateOf = (row: BattleModel): BattleState => BattleStateSchema.parse(row.state);

/** Where the spawn goes when a battle ends. */
function spawnAfter(outcome: BattleOutcome, now: Date) {
  switch (outcome) {
    case "captured":
      return { status: "captured" as const };
    case "lost":
      // It stays wild: back on the radar with a fresh TTL.
      return { status: "active" as const, expiresAt: new Date(now.getTime() + GAME_RULES.spawnTtlMs), movedAt: now };
    default:
      return { status: "fled" as const };
  }
}

// ------------------------------------------------------------------ views

async function battleView(tx: Tx, row: BattleModel, state: BattleState): Promise<BattleView> {
  const active = activeOf(state);
  const [inventory, expRows] = await Promise.all([
    tx.inventoryItem.findMany({ where: { playerId: row.playerId, itemId: { in: ["trail-ration", ...CAPSULE_ITEM_IDS] }, quantity: { gt: 0 } } }),
    tx.expEvent.findMany({ where: { playerId: row.playerId, track: "wildkin", meta: { path: ["battleId"], equals: row.id } } }),
  ]);
  const names = new Map(state.party.map((p) => [p.id, p.name]));
  const gained = new Map<string, number>();
  for (const e of expRows) if (e.capturedWildkinId) gained.set(e.capturedWildkinId, (gained.get(e.capturedWildkinId) ?? 0) + e.amount);

  return {
    id: row.id,
    kind: state.kind,
    spawnId: row.spawnId,
    turn: state.turn,
    awaiting: state.awaiting,
    outcome: state.outcome,
    wild: {
      creatureId: state.wild.creatureId,
      name: state.wild.name,
      registryNumber: state.wild.registryNumber,
      level: state.wild.level,
      hpFraction: state.wild.hp / state.wild.stats.hp,
      status: state.wild.status?.id ?? null,
      bodyTraits: state.wild.bodyTraits,
    },
    activeId: state.activeId,
    attacks: attacksOf(active).map((a, index) => ({ index, name: a.name, approach: a.approach, powerWord: powerWord(a.power), description: a.description })),
    party: state.party.map((p) => {
      const fainted = p.hp <= 0;
      const isActive = p.id === state.activeId;
      const usable = isUsable(p) && !isActive;
      return {
        id: p.id,
        creatureId: p.creatureId,
        registryNumber: p.registryNumber,
        name: p.name,
        level: p.level,
        hpFraction: p.hp / p.stats.hp,
        status: p.status?.id ?? null,
        fainted,
        restless: p.restless,
        usable,
        unusableReason: usable ? null : isActive ? "Already out" : p.restless ? "Restless: it will not battle" : "Fainted",
        active: isActive,
      };
    }),
    items: inventory
      .filter((i): i is typeof i & { itemId: ItemId } => i.itemId in ITEMS)
      .map((i) => ({ itemId: i.itemId, name: ITEMS[i.itemId].name, quantity: i.quantity })),
    expGained: [...gained].map(([wildkinId, amount]) => ({ wildkinId, name: names.get(wildkinId) ?? "Wildkin", amount })),
    capturedWildkinId: state.capturedWildkinId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ------------------------------------------------------------------ lazy endings

/**
 * Ends a battle without a player action: abandoned after the idle timeout, or
 * escaped when the player walked more than spawnRadiusM from the spawn. The
 * spawn is released ("fled"), so it can never be held forever.
 */
async function closeBattle(deps: GameDeps, row: BattleModel, outcome: "abandoned" | "escaped", now: Date) {
  const ended = endBattle(stateOf(row), outcome);
  const events: BattleEvent[] =
    outcome === "escaped" ? [{ type: "escape", success: true, reason: "moved-away" }, ended.event] : [ended.event];
  const updated = await deps.db.$transaction(async (tx) => {
    const { count } = await tx.battle.updateMany({
      where: { id: row.id, status: "active", turn: row.turn },
      data: { status: outcome, state: ended.state, updatedAt: now },
    });
    if (count === 1) await tx.spawn.update({ where: { id: row.spawnId }, data: spawnAfter(outcome, now) });
    return tx.battle.findUniqueOrThrow({ where: { id: row.id } });
  });
  return { row: updated, events };
}

/** Why an active battle should end by itself right now, if it should. */
async function lazyEnding(deps: GameDeps, row: BattleModel, now: Date): Promise<"abandoned" | "escaped" | null> {
  if (row.status !== "active") return null;
  if (now.getTime() - row.updatedAt.getTime() > BATTLE_RULES.idleTimeoutMs) return "abandoned";
  const [{ tracked }, spawn] = await Promise.all([getTracked(deps.db, row.playerId), deps.db.spawn.findUnique({ where: { id: row.spawnId } })]);
  if (tracked && spawn && distanceMeters(tracked, spawn) > GAME_RULES.spawnRadiusM) return "escaped";
  return null;
}

/** Applies lazy endings to the player's active battle; returns the battle still running, if any. */
export async function settleActiveBattle(deps: GameDeps, playerId: string, now: Date): Promise<BattleModel | null> {
  const row = await deps.db.battle.findFirst({ where: { playerId, status: "active" } });
  if (!row) return null;
  const ending = await lazyEnding(deps, row, now);
  if (!ending) return row;
  await closeBattle(deps, row, ending, now);
  return null;
}

// ------------------------------------------------------------------ start

export async function startBattle(deps: GameDeps, playerId: string, spawnId: string): Promise<BattleResponse> {
  // 1. The usual spawn guard: fresh position, own spawn, active, in range.
  const { spawn, now } = await loadActionableSpawn(deps, playerId, spawnId);

  // 2. One battle at a time.
  const running = await settleActiveBattle(deps, playerId, now);
  if (running) throw conflict("battle_in_progress", "Finish your current battle first", { battleId: running.id });

  // 3. License-locked habitat.
  const licenses = await loadLicenses(deps.db, playerId);
  const requirement = await habitatRequirement(deps.db, spawn.habitatId);
  const locked = lockReason(requirement, licenses);
  if (locked) throw conflict("habitat_locked", `${locked}. You can still observe here.`, { requirement });

  // 4. Someone who can battle.
  const creatures = await creatureMap(deps.db);
  const party = partyOf(await loadWildkin(deps.db, playerId, creatures, licenses, now));
  const lead = party.find((w) => isUsable(w));
  if (!lead) throw conflict("no_usable_wildkin", "Your party needs rest: visit a vet or let first aid work");

  const state: BattleState = {
    kind: "wild",
    turn: 0,
    awaiting: "action",
    outcome: null,
    escapeAttempts: 0,
    wild: wildOf(spawn, creatures),
    party: party.map(combatantOf),
    activeId: lead.row.id,
    participants: [lead.row.id],
  };

  const row = await deps.db
    .$transaction(async (tx) => {
      const { count } = await tx.spawn.updateMany({ where: { id: spawn.id, status: "active" }, data: { status: "in_battle" } });
      if (count !== 1) throw new HttpError(410, "gone", "That Wildkin has moved on");
      return tx.battle.create({ data: { playerId, spawnId: spawn.id, kind: "wild", turn: 0, state, createdAt: now, updatedAt: now } });
    })
    .catch(async (e: unknown) => {
      // The partial unique index allows one active battle per player, even for simultaneous requests.
      if ((e as { code?: string }).code === "P2002") {
        const other = await deps.db.battle.findFirst({ where: { playerId, status: "active" }, select: { id: true } });
        throw conflict("battle_in_progress", "Finish your current battle first", { battleId: other?.id });
      }
      throw e;
    });

  return { battle: await battleView(deps.db, row, state) };
}

// ------------------------------------------------------------------ read

export async function currentBattle(deps: GameDeps, playerId: string): Promise<BattleResponse> {
  const row = await settleActiveBattle(deps, playerId, nowOf(deps));
  if (!row) throw new HttpError(404, "not_found", "No battle is running");
  return { battle: await battleView(deps.db, row, stateOf(row)) };
}

export async function getBattle(deps: GameDeps, playerId: string, battleId: string): Promise<BattleResponse> {
  let row = await deps.db.battle.findFirst({ where: { id: battleId, playerId } });
  if (!row) throw new HttpError(404, "not_found", "No such battle");
  const now = nowOf(deps);
  const ending = await lazyEnding(deps, row, now);
  if (ending) row = (await closeBattle(deps, row, ending, now)).row;
  return { battle: await battleView(deps.db, row, stateOf(row)) };
}

// ------------------------------------------------------------------ act

const BATTLE_ITEM: Partial<Record<BattleAction["type"], true>> = { item: true, capsule: true };

export async function actInBattle(
  deps: GameDeps,
  playerId: string,
  battleId: string,
  request: { turn: number; action: BattleAction },
): Promise<BattleActionResponse> {
  const now = nowOf(deps);
  let row = await deps.db.battle.findFirst({ where: { id: battleId, playerId } });
  if (!row) throw new HttpError(404, "not_found", "No such battle");
  if (row.status !== "active") throw conflict("battle_over", "This battle is over");

  const ending = await lazyEnding(deps, row, now);
  if (ending === "abandoned") {
    await closeBattle(deps, row, ending, now);
    throw conflict("battle_over", "The wild Wildkin lost interest and wandered off");
  }
  if (ending === "escaped") {
    const closed = await closeBattle(deps, row, ending, now);
    return { battle: await battleView(deps.db, closed.row, stateOf(closed.row)), events: closed.events };
  }
  if (request.turn !== row.turn) throw conflict("stale_turn", "That turn already happened; refresh the battle", { turn: row.turn });

  const action = request.action;
  const itemId = "itemId" in action ? action.itemId : null;
  if (itemId && BATTLE_ITEM[action.type]) {
    const stack = await deps.db.inventoryItem.findUnique({ where: { playerId_itemId: { playerId, itemId } } });
    if (!stack || stack.quantity <= 0) throw conflict("invalid_action", `You have no ${ITEMS[itemId].name} left`);
  }

  const input = stateOf(row);
  let result;
  try {
    result = resolveTurn(input, action, { random: randomOf(deps) });
  } catch (e) {
    if (e instanceof BattleActionError) throw conflict(e.code, e.message);
    throw e;
  }
  const { state, discoveries } = result;
  // The end line is played last, after the field notes and EXP added below.
  const events: BattleEvent[] = result.events.filter((e) => e.type !== "battle-end");
  const endEvent = result.events.find((e) => e.type === "battle-end");
  const outcome = state.outcome;
  const capturedId = outcome === "captured" ? randomUUID() : null;
  if (capturedId) state.capturedWildkinId = capturedId;
  const day = await playerDayKey(deps, deps.db, playerId, now);
  const finished = row;

  row = await deps.db.$transaction(async (tx) => {
    // Double taps: only the request that saw the current turn gets through.
    const { count } = await tx.battle.updateMany({
      where: { id: finished.id, status: "active", turn: request.turn },
      data: { turn: state.turn, state, status: outcome ?? "active", updatedAt: now },
    });
    if (count !== 1) throw conflict("stale_turn", "That turn already happened; refresh the battle");

    if (itemId && !(await spendItem(tx, playerId, itemId))) throw conflict("invalid_action", `You have no ${ITEMS[itemId].name} left`);

    // HP is written back every turn, so every outcome leaves the party as the battle did.
    const before = new Map(input.party.map((p) => [p.id, p.hp]));
    for (const p of state.party) {
      if (before.get(p.id) !== p.hp) await tx.capturedWildkin.update({ where: { id: p.id }, data: { currentHp: p.hp, hpUpdatedAt: now } });
    }

    for (const d of discoveries) {
      const recorded = await recordMatchup(tx, { playerId, ...d, dayKey: day, now });
      if (!recorded) continue;
      events.push({ type: "matchup-recorded", bodyTrait: d.bodyTrait, approach: d.approach, effect: d.effect, line: recorded.line });
      if (recorded.gain) events.push({ type: "researcher-exp", ...recorded.gain });
    }

    if (outcome) {
      await tx.spawn.update({ where: { id: finished.spawnId }, data: spawnAfter(outcome, now) });
      if (outcome === "won" || outcome === "captured") {
        const creatures = await creatureMap(tx);
        const licenses = await loadLicenses(tx, playerId);
        let gains: ResearcherExpGain[] = [];
        let expResults: WildkinExpResult[] = [];
        if (outcome === "captured") {
          ({ gains, expResults } = await captureWildkin(tx, { playerId, battleId: finished.id, spawnId: finished.spawnId, state, capturedId: capturedId!, creatures, licenses, day, now }));
        }
        expResults = [...(await awardBattleExp(tx, { playerId, battleId: finished.id, state, creatures, licenses, day, now })), ...expResults];
        for (const r of mergeExp(expResults)) events.push({ type: "exp", ...r });
        for (const g of gains) events.push({ type: "researcher-exp", ...g });
      }
    }
    return tx.battle.findUniqueOrThrow({ where: { id: finished.id } });
  });
  if (endEvent) events.push(endEvent);

  return { battle: await battleView(deps.db, row, stateOf(row)), events };
}

/** One "exp" event per Wildkin (a capture can award battle and capture EXP to the same one). */
function mergeExp(results: WildkinExpResult[]): WildkinExpResult[] {
  const out = new Map<string, WildkinExpResult>();
  for (const r of results) {
    const prev = out.get(r.wildkinId);
    out.set(
      r.wildkinId,
      prev ? { ...r, amount: prev.amount + r.amount, newLevel: r.newLevel ?? prev.newLevel, heldAtCap: r.heldAtCap || prev.heldAtCap } : r,
    );
  }
  return [...out.values()].filter((r) => r.amount > 0 || r.heldAtCap);
}

/**
 * Battle EXP for a win or a capture: the active Wildkin gets `battle`, every
 * other non-fainted party member `battle-shared` (more when well below the
 * active one). A rested charge, if any, is spent and doubles both.
 */
async function awardBattleExp(
  tx: Tx,
  args: { playerId: string; battleId: string; state: BattleState; creatures: Creatures; licenses: Licenses; day: string; now: Date },
): Promise<WildkinExpResult[]> {
  const { playerId, state, now } = args;
  const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
  const charges = restedCharges(player.restedCharges, player.lastBattleExpAt ?? player.createdAt, now);
  const rested = charges > 0;
  await tx.player.update({ where: { id: playerId }, data: { restedCharges: rested ? charges - 1 : charges, lastBattleExpAt: now } });

  const all = new Map((await loadWildkin(tx, playerId, args.creatures, args.licenses, now)).map((w) => [w.row.id, w]));
  const active = activeOf(state);
  const multiplier = rested ? 2 : 1;
  const base = battleExp(state.wild.level, active.level);
  const meta = { battleId: args.battleId, opponentLevel: state.wild.level, rested };
  const results: WildkinExpResult[] = [];
  const activeInfo = all.get(active.id);
  if (activeInfo) {
    results.push(await grantWildkinExp(tx, { info: activeInfo, amount: base * multiplier, source: "battle", dayKey: args.day, now, meta }));
  }
  for (const member of state.party) {
    const info = all.get(member.id);
    if (member.id === active.id || member.hp <= 0 || !info) continue;
    const amount = sharedBattleExp(base, member.level, active.level) * multiplier;
    results.push(await grantWildkinExp(tx, { info, amount, source: "battle-shared", dayKey: args.day, now, meta }));
  }
  return results;
}

/**
 * A successful capture: the new captured_wildkin row (first free party slot,
 * else storage), the Registry entry, researcher EXP for the capture and its
 * phenotypes, and the lead's capture EXP. Runs inside the turn's transaction.
 */
async function captureWildkin(
  tx: Tx,
  args: {
    playerId: string;
    battleId: string;
    spawnId: string;
    state: BattleState;
    capturedId: string;
    creatures: Creatures;
    licenses: Licenses;
    day: string;
    now: Date;
  },
): Promise<{ gains: ResearcherExpGain[]; expResults: WildkinExpResult[] }> {
  const { playerId, state, now } = args;
  const spawn = await tx.spawn.findUniqueOrThrow({ where: { id: args.spawnId } });
  const creature = args.creatures.get(spawn.creatureId)!;
  const owned = await loadWildkin(tx, playerId, args.creatures, args.licenses, now);
  // Party HP from this turn is already written, so the lead reflects the battle.
  const lead = partyOf(owned).find(isUsable);

  const used = new Set(owned.map((w) => w.row.partySlot).filter((s) => s !== null));
  const slot = [0, 1, 2, 3, 4, 5].find((s) => !used.has(s)) ?? null;
  await tx.capturedWildkin.create({
    data: {
      id: args.capturedId,
      playerId,
      creatureId: creature.id,
      partySlot: slot,
      capturedAt: now,
      level: spawn.level,
      exp: totalExpForLevel(spawn.level),
      genome: genomeOf(spawn.genome),
      vigor: vigorOf(spawn.vigor),
      currentHp: Math.max(0, state.wild.hp),
      hpUpdatedAt: now,
      caughtLevel: spawn.level,
      caughtHabitatId: spawn.habitatId,
      caughtAtTimeOfDay: spawn.timeOfDay,
      caughtAtWeather: spawn.weather,
    },
  });

  const previous = await tx.registryEntry.findUnique({ where: { playerId_creatureId: { playerId, creatureId: creature.id } } });
  await tx.registryEntry.upsert({
    where: { playerId_creatureId: { playerId, creatureId: creature.id } },
    create: { playerId, creatureId: creature.id, firstObservedAt: now, firstCapturedAt: now, timesCaptured: 1 },
    update: { timesCaptured: { increment: 1 }, firstCapturedAt: previous?.firstCapturedAt ?? now },
  });

  const first = !previous?.firstCapturedAt;
  const gains: ResearcherExpGain[] = [];
  const gain = await grantResearcherExp(tx, {
    playerId,
    category: creature.category,
    source: first ? "first-capture" : "repeat-capture",
    amount: first ? RESEARCH_RULES.firstCapture : RESEARCH_RULES.repeatCapture,
    dayKey: args.day,
    now,
    reason: first ? `First capture of ${creature.name}` : `Captured ${creature.name}`,
    meta: { creatureId: creature.id, battleId: args.battleId },
  });
  if (gain) gains.push(gain);
  gains.push(...(await recordPhenotypes(tx, { playerId, creature, genome: genomeOf(spawn.genome), dayKey: args.day, now })));

  const expResults: WildkinExpResult[] = [];
  if (lead) {
    expResults.push(
      await grantWildkinExp(tx, {
        info: lead,
        amount: captureExp(lead.row.level),
        source: "capture",
        dayKey: args.day,
        now,
        meta: { battleId: args.battleId, creatureId: creature.id },
      }),
    );
  }
  return { gains, expResults };
}
