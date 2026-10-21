import { describe, expect, it } from "vitest";
import { battleCaptureChance } from "./capture.ts";

/**
 * Exercise #12: make these pass by implementing battleCaptureChance (capture.ts).
 * Run with: pnpm test:exercises
 */
const base = { rarity: "common" as const, observed: true, hp: 22, maxHp: 22, status: null, capsuleBonus: 0 };

describe("battleCaptureChance", () => {
  it("matches the worked examples", () => {
    expect(battleCaptureChance({ ...base, hp: 20, maxHp: 100 })).toBeCloseTo(0.71);
    expect(battleCaptureChance({ ...base, observed: false })).toBeCloseTo(0.25);
  });

  it("rewards missing HP most, then statuses and matching capsules", () => {
    expect(battleCaptureChance({ ...base, hp: 11 })).toBeCloseTo(0.25 + 0.1 + 0.225);
    expect(battleCaptureChance({ ...base, status: { id: "asleep", turnsLeft: 2 } })).toBeCloseTo(0.55);
    expect(battleCaptureChance({ ...base, status: { id: "numbed", turnsLeft: 2 } })).toBeCloseTo(0.45);
    expect(battleCaptureChance({ ...base, capsuleBonus: 0.15 })).toBeCloseTo(0.5);
  });

  it("uses each rarity's base", () => {
    expect(battleCaptureChance({ ...base, observed: false, rarity: "uncommon" })).toBeCloseTo(0.15);
    expect(battleCaptureChance({ ...base, observed: false, rarity: "rare" })).toBeCloseTo(0.08);
    expect(battleCaptureChance({ ...base, observed: false, rarity: "TBD" })).toBeCloseTo(0.2);
  });

  it("is capped at 95% and safe with maxHp 0", () => {
    expect(battleCaptureChance({ ...base, hp: 1, maxHp: 100, status: { id: "asleep", turnsLeft: 1 }, capsuleBonus: 0.15 })).toBe(0.95);
    expect(Number.isFinite(battleCaptureChance({ ...base, hp: 0, maxHp: 0 }))).toBe(true);
  });
});
