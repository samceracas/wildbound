import {
  BATTLE_END_LINES,
  BATTLE_RULES,
  type Attack,
  type BattleAction,
  type BattleEvent,
  type BattleOutcome,
  type BattleSide,
  type BattleState,
  type BodyTrait,
  type Approach,
  type CategoryOrTbd,
  type Combatant,
  type MatchupEffect,
} from "@wildbound/shared";
import { battleCaptureChance, capsuleBonus } from "./capture.ts";
import { damage } from "./damage.ts";
import { evaluateMatchup } from "./matchups.ts";
import { statusAtkMultiplier, statusSkipsAttack, statusTraps, tickStatus } from "./statuses.ts";
import { attackOrder, dodgeChance, escapeChance } from "./turn-order.ts";

/**
 * The wild battle engine: one pure function per turn. The API loads the
 * state, calls resolveTurn, and persists the result (plus EXP, records and
 * items) in one transaction. The engine is written in terms of two sides so a
 * trainer side (NPC friendly battles, 0.4.0) can be added without rewriting it.
 *
 * Turn order:
 * 1. Validate the action.
 * 2. Priority phase: the player's switch, item, capsule or escape resolves first.
 * 3. Status check for each side about to attack.
 * 4. Attack phase: weighted roll on Speed when both attack.
 * 5. Faint handling: wild faints = won (a fainted Wildkin cannot be captured);
 *    the player's active faints = wait for a free `replace`, or lost.
 * 6. End of turn: statuses tick down, turn + 1.
 */

export interface TurnDeps {
  random: () => number;
}

export class BattleActionError extends Error {
  constructor(
    readonly code: "invalid_action" | "battle_over",
    message: string,
  ) {
    super(message);
  }
}

/** Something a hit revealed about a body trait (the API records first discoveries). */
export interface MatchupDiscovery {
  bodyTrait: BodyTrait;
  approach: Approach;
  effect: MatchupEffect;
  /** Category of the species that was hit (the researcher EXP goes there). */
  category: CategoryOrTbd;
}

export interface TurnResult {
  state: BattleState;
  events: BattleEvent[];
  discoveries: MatchupDiscovery[];
}

/** Used when a species has no authored attack yet. */
export const FALLBACK_ATTACK: Attack = {
  name: "Lunge",
  approach: "strike",
  power: 35,
  description: "A plain, untrained lunge.",
  canon: "proposed",
  priority: false,
};

export const attacksOf = (c: Pick<Combatant, "attacks">): Attack[] => (c.attacks.length ? c.attacks : [FALLBACK_ATTACK]);

/** Can battle: not fainted and not restless. */
export const isUsable = (c: Pick<Combatant, "hp" | "restless">) => c.hp > 0 && !c.restless;

export const activeOf = (state: BattleState): Combatant => state.party.find((p) => p.id === state.activeId)!;

export const hasReplacement = (state: BattleState) => state.party.some((p) => p.id !== state.activeId && isUsable(p));

/**
 * The lead: party slot 0 when usable, else the first usable party member by
 * slot order. Pass the members already sorted by slot. Null when none can battle.
 */
export function pickLead<T extends { hp: number; restless: boolean }>(membersBySlot: readonly T[]): T | null {
  return membersBySlot.find(isUsable) ?? null;
}

const invalid = (message: string) => new BattleActionError("invalid_action", message);

function validate(state: BattleState, action: BattleAction): void {
  if (state.outcome) throw new BattleActionError("battle_over", "This battle is over");
  const active = activeOf(state);
  if (state.awaiting === "replace") {
    if (action.type !== "replace") throw invalid("Choose who goes next");
  } else if (action.type === "replace") {
    throw invalid("Nobody needs replacing");
  }
  const member = "wildkinId" in action ? state.party.find((p) => p.id === action.wildkinId) : undefined;
  switch (action.type) {
    case "attack":
      if (action.attackIndex >= attacksOf(active).length) throw invalid("Unknown attack");
      return;
    case "switch":
    case "replace":
      if (!member) throw invalid("That Wildkin is not in your party");
      if (member.id === state.activeId) throw invalid("That Wildkin is already out");
      if (member.restless) throw invalid(`${member.name} is restless and will not battle`);
      if (member.hp <= 0) throw invalid(`${member.name} has fainted`);
      if (action.type === "switch" && statusTraps(active.status)) throw invalid(`${active.name} is entangled and cannot switch out`);
      return;
    case "item":
      if (!member) throw invalid("That Wildkin is not in your party");
      if (member.restless) throw invalid(`${member.name} is restless and will not accept treatment`);
      if (member.hp <= 0) throw invalid(`${member.name} has fainted`);
      if (member.hp >= member.stats.hp) throw invalid(`${member.name} is already at full strength`);
      return;
    case "capsule":
      if (state.wild.hp <= 0) throw invalid("A fainted Wildkin cannot be captured");
      return;
    case "escape":
      if (statusTraps(active.status)) throw invalid(`${active.name} is entangled and cannot get away`);
      return;
  }
}

/** Marks the battle over with an outcome (also used by the API for moved-away and abandoned battles). */
export function endBattle(state: BattleState, outcome: BattleOutcome): { state: BattleState; event: BattleEvent } {
  return {
    state: { ...state, outcome },
    event: { type: "battle-end", outcome, line: BATTLE_END_LINES[outcome].replaceAll("{name}", state.wild.name) },
  };
}

export function resolveTurn(input: BattleState, action: BattleAction, deps: TurnDeps): TurnResult {
  validate(input, action);
  const state: BattleState = structuredClone(input);
  const events: BattleEvent[] = [];
  const discoveries: MatchupDiscovery[] = [];
  const { random } = deps;
  const finish = (outcome: BattleOutcome): TurnResult => {
    const ended = endBattle(state, outcome);
    events.push(ended.event);
    return { state: { ...ended.state, turn: state.turn + 1 }, events, discoveries };
  };

  // ---- 2. priority phase
  switch (action.type) {
    case "replace": {
      const to = state.party.find((p) => p.id === action.wildkinId)!;
      state.activeId = to.id;
      if (!state.participants.includes(to.id)) state.participants.push(to.id);
      state.awaiting = "action";
      events.push({ type: "replace", to: to.name, wildkinId: to.id });
      // Free: no wild action follows.
      return { state: { ...state, turn: state.turn + 1 }, events, discoveries };
    }
    case "switch": {
      const from = activeOf(state);
      const to = state.party.find((p) => p.id === action.wildkinId)!;
      state.activeId = to.id;
      if (!state.participants.includes(to.id)) state.participants.push(to.id);
      events.push({ type: "switch", from: from.name, to: to.name, wildkinId: to.id });
      break;
    }
    case "item": {
      const target = state.party.find((p) => p.id === action.wildkinId)!;
      const heal = Math.min(target.stats.hp - target.hp, Math.max(1, Math.floor(target.stats.hp * BATTLE_RULES.trailRationHeal)));
      target.hp += heal;
      events.push({ type: "item", itemId: action.itemId, target: target.name, healed: heal / target.stats.hp });
      break;
    }
    case "capsule": {
      const chance = battleCaptureChance({
        rarity: state.wild.rarity,
        observed: state.wild.observed,
        hp: state.wild.hp,
        maxHp: state.wild.stats.hp,
        status: state.wild.status,
        capsuleBonus: capsuleBonus(action.itemId, state.wild.category),
      });
      const success = random() < chance;
      events.push({ type: "capsule", itemId: action.itemId, success });
      if (success) return finish("captured");
      break;
    }
    case "escape": {
      const active = activeOf(state);
      const success = random() < escapeChance(active.stats.spd, state.wild.stats.spd, state.escapeAttempts);
      events.push({ type: "escape", success, reason: "roll" });
      if (success) return finish("escaped");
      state.escapeAttempts++;
      break;
    }
    case "attack":
      break;
  }

  // ---- 3 + 4. attack phase
  const player = activeOf(state);
  const order: BattleSide[] =
    action.type === "attack"
      ? attackOrder(player.stats.spd, state.wild.stats.spd, random) === "a"
        ? ["player", "wild"]
        : ["wild", "player"]
      : ["wild"];

  for (const side of order) {
    const attacker = side === "player" ? activeOf(state) : state.wild;
    const defender = side === "player" ? state.wild : activeOf(state);
    // A Wildkin that fainted before its turn does not attack.
    if (attacker.hp <= 0 || defender.hp <= 0) continue;
    if (statusSkipsAttack(attacker.status, random)) {
      events.push({ type: "skip", side, name: attacker.name, status: attacker.status!.id });
      continue;
    }
    const moves = attacksOf(attacker);
    const attack =
      side === "player" && action.type === "attack" ? moves[action.attackIndex]! : moves[Math.floor(random() * moves.length)]!;

    const dodge = dodgeChance(defender.stats.spd, attacker.stats.spd);
    if (dodge > 0 && random() < dodge) {
      events.push({ type: "attack", side, attacker: attacker.name, attack: attack.name, approach: attack.approach, dodged: true, damage: 0, effect: null, line: null });
      continue;
    }
    const matchup = evaluateMatchup(attack.approach, defender.bodyTraits);
    const dealt = Math.min(
      defender.hp,
      damage({
        attackerLevel: attacker.level,
        power: attack.power,
        atk: attacker.stats.atk * statusAtkMultiplier(attacker.status),
        def: defender.stats.def,
        matchup: matchup.multiplier,
        random,
      }),
    );
    defender.hp -= dealt;
    events.push({
      type: "attack",
      side,
      attacker: attacker.name,
      attack: attack.name,
      approach: attack.approach,
      dodged: false,
      damage: dealt / defender.stats.hp,
      effect: matchup.effect,
      line: matchup.line,
    });
    for (const d of matchup.discoveries) {
      discoveries.push({ bodyTrait: d.trait, approach: attack.approach, effect: d.effect, category: defender.category });
    }
    if (defender.hp <= 0) events.push({ type: "faint", side: side === "player" ? "wild" : "player", name: defender.name });
  }

  // ---- 5. faint handling
  if (state.wild.hp <= 0) return finish("won");
  if (activeOf(state).hp <= 0) {
    if (!hasReplacement(state)) return finish("lost");
    state.awaiting = "replace";
  }

  // ---- 6. end of turn
  for (const [side, c] of [["wild", state.wild], ["player", activeOf(state)]] as const) {
    if (!c.status) continue;
    const next = tickStatus(c.status);
    if (!next) events.push({ type: "status", side, name: c.name, status: c.status.id, change: "recovered" });
    c.status = next;
  }
  state.turn++;
  return { state, events, discoveries };
}
