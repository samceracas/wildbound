import { describe, expect, it } from "vitest";
import { MATCHUPS } from "@wildbound/shared";
import { seededRandom } from "../encounters.ts";
import { capsuleBonus, captureBase } from "./capture.ts";
import { baseDamage, damage } from "./damage.ts";
import { BattleActionError, activeOf, endBattle, pickLead, resolveTurn } from "./engine.ts";
import { PLAYER_A, PLAYER_B, PLAYER_C, battleState, combatant, sequence } from "./fixtures.ts";
import { evaluateMatchup, traitEffect } from "./matchups.ts";
import { inflictStatus, rollStatusDuration, statusAtkMultiplier, statusSkipsAttack, statusTraps, tickStatus } from "./statuses.ts";
import { dodgeChance } from "./turn-order.ts";

describe("damage", () => {
  it("matches the worked example (level 5 Kawi pecks a level 5 Mimu)", () => {
    expect(baseDamage(5, 40, 12, 13)).toBe(4);
    expect(damage({ attackerLevel: 5, power: 40, atk: 12, def: 13, matchup: 1.5, random: () => 0.9999 })).toBe(5);
    expect(damage({ attackerLevel: 5, power: 40, atk: 12, def: 13, matchup: 1.5, random: () => 0 })).toBe(5);
    expect(damage({ attackerLevel: 5, power: 40, atk: 12, def: 13, matchup: 1, random: () => 0 })).toBe(3);
  });

  it("is always at least 1", () => {
    expect(damage({ attackerLevel: 1, power: 30, atk: 1, def: 200, matchup: 0.67, random: () => 0 })).toBe(1);
  });
});

describe("dodge", () => {
  it("only happens when the defender is faster, capped at 10%", () => {
    expect(dodgeChance(10, 16)).toBe(0);
    expect(dodgeChance(16, 16)).toBe(0);
    expect(dodgeChance(16, 9)).toBeCloseTo(((16 - 9) / 16) * 0.2);
    expect(dodgeChance(100, 5)).toBe(0.1);
  });
});

describe("matchup lookups", () => {
  it("knows each trait's weakness and resistance; strike is neutral", () => {
    expect(traitEffect("plated", "crush")).toBe("weak");
    expect(traitEffect("plated", "pierce")).toBe("resist");
    expect(traitEffect("plated", "strike")).toBeNull();
    for (const m of Object.values(MATCHUPS)) expect([m.weak, m.resist]).not.toContain("strike");
  });

  it("records nothing for a neutral hit", () => {
    expect(evaluateMatchup("strike", ["plated"])).toEqual({ multiplier: 1, effect: null, line: null, discoveries: [] });
    expect(evaluateMatchup("toxin", ["feathered"])).toEqual({ multiplier: 1, effect: null, line: null, discoveries: [] });
  });
});

describe("statuses", () => {
  it("rolls durations within each status' range", () => {
    expect(rollStatusDuration("asleep", () => 0)).toBe(1);
    expect(rollStatusDuration("asleep", () => 0.9999)).toBe(3);
    expect(rollStatusDuration("stunned", () => 0.9999)).toBe(1);
    expect(rollStatusDuration("exhausted", () => 0.3)).toBe(3);
    const r = seededRandom(2);
    for (let i = 0; i < 200; i++) {
      const d = rollStatusDuration("entangled", r);
      expect(d).toBeGreaterThanOrEqual(2);
      expect(d).toBeLessThanOrEqual(4);
    }
  });

  it("keeps one status at a time", () => {
    expect(inflictStatus({ id: "numbed", turnsLeft: 2 }, "asleep", () => 0)).toEqual({ id: "numbed", turnsLeft: 2 });
    expect(inflictStatus(null, "asleep", () => 0)).toEqual({ id: "asleep", turnsLeft: 1 });
  });

  it("applies each effect", () => {
    expect(statusSkipsAttack({ id: "asleep", turnsLeft: 1 }, () => 0.99)).toBe(true);
    expect(statusSkipsAttack({ id: "stunned", turnsLeft: 1 }, () => 0.99)).toBe(true);
    expect(statusSkipsAttack({ id: "numbed", turnsLeft: 1 }, () => 0.2)).toBe(true);
    expect(statusSkipsAttack({ id: "numbed", turnsLeft: 1 }, () => 0.3)).toBe(false);
    expect(statusSkipsAttack({ id: "entangled", turnsLeft: 1 }, () => 0)).toBe(false);
    expect(statusSkipsAttack(null, () => 0)).toBe(false);
    expect(statusTraps({ id: "entangled", turnsLeft: 2 })).toBe(true);
    expect(statusTraps({ id: "asleep", turnsLeft: 2 })).toBe(false);
    expect(statusAtkMultiplier({ id: "exhausted", turnsLeft: 2 })).toBe(0.75);
    expect(statusAtkMultiplier(null)).toBe(1);
  });

  it("ticks down and wears off", () => {
    expect(tickStatus({ id: "asleep", turnsLeft: 2 })).toEqual({ id: "asleep", turnsLeft: 1 });
    expect(tickStatus({ id: "asleep", turnsLeft: 1 })).toBeNull();
    expect(tickStatus(null)).toBeNull();
  });
});

describe("capsules", () => {
  it("adds the category bonus only on a match", () => {
    expect(capsuleBonus("current-capsule", "aquatic")).toBe(0.15);
    expect(capsuleBonus("current-capsule", "aerial")).toBe(0);
    expect(capsuleBonus("field-capsule", "aquatic")).toBe(0);
    expect(capsuleBonus("bloom-capsule", "TBD")).toBe(0);
  });
  it("starts from rarity plus the observation bonus", () => {
    expect(captureBase("common", true)).toBeCloseTo(0.35);
    expect(captureBase("rare", false)).toBeCloseTo(0.08);
  });
});

describe("pickLead", () => {
  it("is slot 0 when usable, else the first usable member", () => {
    const a = { id: "a", hp: 10, restless: false };
    const b = { id: "b", hp: 0, restless: false };
    const c = { id: "c", hp: 5, restless: true };
    expect(pickLead([a, b])?.id).toBe("a");
    expect(pickLead([b, c, a])?.id).toBe("a");
    expect(pickLead([b, c])).toBeNull();
  });
});

describe("resolveTurn", () => {
  it("resolves priority actions before attacks: a switch takes the wild hit", () => {
    const { state, events } = resolveTurn(battleState(), { type: "switch", wildkinId: PLAYER_B }, { random: sequence([0.5]) });
    expect(state.activeId).toBe(PLAYER_B);
    expect(events.map((e) => e.type)).toEqual(["switch", "attack"]);
    expect(events[1]).toMatchObject({ side: "wild", attack: "Nibble" });
    expect(activeOf(state).hp).toBeLessThan(22);
    expect(state.party.find((p) => p.id === PLAYER_A)!.hp).toBe(21);
    expect(state.participants).toEqual([PLAYER_A, PLAYER_B]);
    expect(state.turn).toBe(1);
  });

  it("lets both sides attack", () => {
    const { state, events } = resolveTurn(battleState(), { type: "attack", attackIndex: 0 }, { random: () => 0.5 });
    expect(events.filter((e) => e.type === "attack").map((e) => (e.type === "attack" ? e.side : ""))).toEqual(["player", "wild"]);
    expect(state.wild.hp).toBeLessThan(22);
    expect(activeOf(state).hp).toBeLessThan(21);
  });

  it("a fainted Wildkin does not attack, and a wild faint wins the battle", () => {
    const start = battleState();
    start.wild.hp = 1;
    const { state, events } = resolveTurn(start, { type: "attack", attackIndex: 0 }, { random: () => 0.5 });
    expect(state.outcome).toBe("won");
    expect(events.map((e) => e.type)).toEqual(["attack", "faint", "battle-end"]);
    expect(() => resolveTurn(state, { type: "capsule", itemId: "field-capsule" }, { random: () => 0 })).toThrow(BattleActionError);
  });

  it("waits for a free replace after the player's active faints", () => {
    const start = battleState();
    start.party[0]!.hp = 1;
    start.wild.stats.spd = 99;
    const first = resolveTurn(start, { type: "attack", attackIndex: 0 }, { random: () => 0.5 });
    expect(first.state.awaiting).toBe("replace");
    expect(first.state.outcome).toBeNull();
    expect(first.events.map((e) => e.type)).toEqual(["attack", "faint"]);
    expect(() => resolveTurn(first.state, { type: "attack", attackIndex: 0 }, { random: () => 0 })).toThrow(/Choose who goes next/);
    expect(() => resolveTurn(first.state, { type: "replace", wildkinId: PLAYER_A }, { random: () => 0 })).toThrow(BattleActionError);
    const second = resolveTurn(first.state, { type: "replace", wildkinId: PLAYER_B }, { random: () => 0 });
    expect(second.events.map((e) => e.type)).toEqual(["replace"]);
    expect(second.state.awaiting).toBe("action");
    expect(second.state.activeId).toBe(PLAYER_B);
    expect(activeOf(second.state).hp).toBe(22);
  });

  it("loses when nobody usable is left", () => {
    const start = battleState({ party: [combatant({ hp: 1 }), combatant({ id: PLAYER_B, hp: 5, restless: true })] });
    start.wild.stats.spd = 99;
    const { state, events } = resolveTurn(start, { type: "attack", attackIndex: 1 }, { random: () => 0.5 });
    expect(state.outcome).toBe("lost");
    expect(events.at(-1)).toMatchObject({ type: "battle-end", outcome: "lost" });
  });

  it("captures on a successful capsule roll; on failure the wild Wildkin attacks", () => {
    const won = resolveTurn(battleState(), { type: "capsule", itemId: "field-capsule" }, { random: () => 0.1 });
    expect(won.state.outcome).toBe("captured");
    expect(won.events.map((e) => e.type)).toEqual(["capsule", "battle-end"]);
    const broke = resolveTurn(battleState(), { type: "capsule", itemId: "field-capsule" }, { random: () => 0.9 });
    expect(broke.state.outcome).toBeNull();
    expect(broke.events.map((e) => e.type)).toEqual(["capsule", "attack"]);
    expect(broke.events[0]).toMatchObject({ success: false });
  });

  it("escapes, or counts a failed attempt (fallback 50%)", () => {
    expect(resolveTurn(battleState(), { type: "escape" }, { random: () => 0.4 }).state.outcome).toBe("escaped");
    const failed = resolveTurn(battleState(), { type: "escape" }, { random: () => 0.6 });
    expect(failed.state.escapeAttempts).toBe(1);
    expect(failed.events[0]).toMatchObject({ type: "escape", success: false });
  });

  it("heals 25% with a Trail Ration, never above max", () => {
    const start = battleState();
    start.party[0]!.hp = 10;
    const { events, state } = resolveTurn(start, { type: "item", itemId: "trail-ration", wildkinId: PLAYER_A }, { random: () => 0.99 });
    expect(events[0]).toMatchObject({ type: "item", healed: 5 / 21 });
    expect(state.party[0]!.hp).toBeLessThanOrEqual(15);
    const full = battleState();
    expect(() => resolveTurn(full, { type: "item", itemId: "trail-ration", wildkinId: PLAYER_A }, { random: () => 0 })).toThrow(/full strength/);
  });

  it("refuses restless and fainted switch targets and unknown attacks", () => {
    const start = battleState({ party: [combatant(), combatant({ id: PLAYER_B, restless: true }), combatant({ id: PLAYER_C, hp: 0 })] });
    expect(() => resolveTurn(start, { type: "switch", wildkinId: PLAYER_B }, { random: () => 0 })).toThrow(/restless/);
    expect(() => resolveTurn(start, { type: "switch", wildkinId: PLAYER_C }, { random: () => 0 })).toThrow(/fainted/);
    expect(() => resolveTurn(start, { type: "switch", wildkinId: PLAYER_A }, { random: () => 0 })).toThrow(/already out/);
    expect(() => resolveTurn(start, { type: "attack", attackIndex: 1 }, { random: () => 0 })).not.toThrow();
    const one = battleState({ party: [combatant({ attacks: [] })] });
    expect(() => resolveTurn(one, { type: "attack", attackIndex: 1 }, { random: () => 0 })).toThrow(/Unknown attack/);
    expect(resolveTurn(one, { type: "attack", attackIndex: 0 }, { random: () => 0.5 }).events[0]).toMatchObject({ attack: "Lunge" });
  });

  it("asleep and stunned skip the attack; numbed sometimes does", () => {
    const start = battleState();
    start.wild.status = { id: "asleep", turnsLeft: 2 };
    const asleep = resolveTurn(start, { type: "attack", attackIndex: 0 }, { random: () => 0.5 });
    expect(asleep.events.find((e) => e.type === "skip")).toMatchObject({ side: "wild", status: "asleep" });
    expect(asleep.state.wild.status).toEqual({ id: "asleep", turnsLeft: 1 });
    const wake = resolveTurn(asleep.state, { type: "attack", attackIndex: 0 }, { random: () => 0.5 });
    expect(wake.events.at(-1)).toMatchObject({ type: "status", change: "recovered", status: "asleep" });
    expect(wake.state.wild.status).toBeNull();

    const stunned = battleState();
    activeOf(stunned).status = { id: "stunned", turnsLeft: 1 };
    const s = resolveTurn(stunned, { type: "attack", attackIndex: 0 }, { random: () => 0.5 });
    expect(s.events.find((e) => e.type === "skip")).toMatchObject({ type: "skip", side: "player" });
    expect(s.state.wild.hp).toBe(22);

    const numbed = battleState();
    numbed.wild.status = { id: "numbed", turnsLeft: 3 };
    // A failed capsule (0.9), then the wild side's numbed roll (0.1 < 0.25) cancels its attack.
    const n = resolveTurn(numbed, { type: "capsule", itemId: "field-capsule" }, { random: sequence([0.9, 0.1]) });
    expect(n.events.map((e) => e.type)).toEqual(["capsule", "skip"]);
    const m = resolveTurn(numbed, { type: "capsule", itemId: "field-capsule" }, { random: sequence([0.9, 0.3]) });
    expect(m.events.map((e) => e.type)).toEqual(["capsule", "attack"]);
  });

  it("entangled blocks switching and escaping; exhausted weakens attacks", () => {
    const trapped = battleState();
    activeOf(trapped).status = { id: "entangled", turnsLeft: 2 };
    expect(() => resolveTurn(trapped, { type: "switch", wildkinId: PLAYER_B }, { random: () => 0 })).toThrow(/entangled/);
    expect(() => resolveTurn(trapped, { type: "escape" }, { random: () => 0 })).toThrow(/entangled/);

    const strong = battleState();
    strong.party[0]!.stats.atk = 60;
    const weak = structuredClone(strong);
    activeOf(weak).status = { id: "exhausted", turnsLeft: 3 };
    const hit = (s: typeof strong) => {
      const r = resolveTurn(s, { type: "attack", attackIndex: 1 }, { random: () => 0.99 });
      return 22 - r.state.wild.hp;
    };
    expect(hit(weak)).toBeLessThan(hit(strong));
  });

  it("refuses actions once the battle is over, and endBattle fills the line", () => {
    const over = endBattle(battleState(), "abandoned");
    expect(over.event).toMatchObject({ type: "battle-end", outcome: "abandoned" });
    expect(over.event.type === "battle-end" && over.event.line).toContain("Mimu");
    expect(() => resolveTurn(over.state, { type: "escape" }, { random: () => 0 })).toThrow(/over/);
  });

  it("does not mutate its input", () => {
    const start = battleState();
    const copy = structuredClone(start);
    resolveTurn(start, { type: "attack", attackIndex: 0 }, { random: seededRandom(4) });
    expect(start).toEqual(copy);
  });
});
