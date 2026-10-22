import { describe, expect, it } from "vitest";
import type { BattleView } from "@wildbound/shared";
import { applyEvent, eventLine, shownHpOf } from "./battle-log.ts";

const member = (id: string, name: string, hpFraction: number, active = false) => ({
  id,
  creatureId: "kawi",
  registryNumber: 1,
  name,
  level: 5,
  hpFraction,
  status: null,
  fainted: false,
  restless: false,
  usable: true,
  unusableReason: null,
  active,
});

const view: BattleView = {
  id: "00000000-0000-4000-8000-000000000001",
  kind: "wild",
  spawnId: "00000000-0000-4000-8000-000000000002",
  turn: 3,
  awaiting: "action",
  outcome: null,
  wild: { creatureId: "mimu", name: "Mimu", registryNumber: 2, level: 4, hpFraction: 0.8, status: null, bodyTraits: ["soft-bodied"] },
  activeId: "a",
  attacks: [],
  party: [member("a", "Kawi", 1, true), member("b", "Kantar", 0.5)],
  items: [],
  expGained: [],
  capturedWildkinId: null,
  createdAt: "2026-10-22T00:00:00Z",
  updatedAt: "2026-10-22T00:00:00Z",
};

describe("eventLine", () => {
  it("writes attacks in the field-note voice", () => {
    expect(
      eventLine({ type: "attack", side: "wild", attacker: "Mimu", attack: "Nibble", approach: "pierce", dodged: false, damage: 0.1, effect: null, line: null }),
    ).toBe("The wild Mimu used Nibble.");
    expect(
      eventLine({ type: "attack", side: "player", attacker: "Kawi", attack: "Peck", approach: "pierce", dodged: false, damage: 0.3, effect: "weak", line: "It had nothing to shield it." }),
    ).toBe("Kawi used Peck. It had nothing to shield it.");
  });

  it("names recorded matchups, captures and the license cap", () => {
    expect(eventLine({ type: "matchup-recorded", bodyTrait: "plated", approach: "crush", effect: "weak", line: "" })).toBe(
      "Field note recorded: Plated is weak to Crush.",
    );
    expect(eventLine({ type: "capsule", itemId: "field-capsule", success: false })).toBe("It broke free!");
    expect(eventLine({ type: "exp", wildkinId: "a", name: "Kawi", amount: 0, newLevel: null, heldAtCap: true })).toBe(
      "Kawi's growth is held at your license cap.",
    );
    expect(eventLine({ type: "exp", wildkinId: "a", name: "Kawi", amount: 12, newLevel: 7, heldAtCap: false })).toBe(
      "Kawi gained 12 EXP. Kawi grew to level 7!",
    );
  });
});

describe("applyEvent", () => {
  it("moves the shown HP bars with the events", () => {
    let hp = shownHpOf(view);
    hp = applyEvent(hp, { type: "attack", side: "player", attacker: "Kawi", attack: "Peck", approach: "pierce", dodged: false, damage: 0.3, effect: null, line: null }, view);
    expect(hp.wild).toBeCloseTo(0.5);
    hp = applyEvent(hp, { type: "switch", from: "Kawi", to: "Kantar", wildkinId: "b" }, view);
    hp = applyEvent(hp, { type: "attack", side: "wild", attacker: "Mimu", attack: "Nibble", approach: "pierce", dodged: false, damage: 0.7, effect: null, line: null }, view);
    expect(hp.party.b).toBe(0);
    expect(hp.party.a).toBe(1);
    hp = applyEvent(hp, { type: "item", itemId: "trail-ration", target: "Kantar", healed: 0.25 }, view);
    expect(hp.party.b).toBeCloseTo(0.25);
  });
});
