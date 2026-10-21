import { describe, expect, it } from "vitest";
import { seededRandom } from "../encounters.ts";
import { attackOrder, escapeChance } from "./turn-order.ts";

/**
 * Exercise #10: make these pass by implementing attackOrder and escapeChance (turn-order.ts).
 * Run with: pnpm test:exercises
 */
describe("attackOrder", () => {
  it("compares random() with SPD_A / (SPD_A + SPD_B)", () => {
    expect(attackOrder(10, 10, () => 0.49)).toBe("a");
    expect(attackOrder(10, 10, () => 0.5)).toBe("b");
    // Twice as fast: 2/3 for A.
    expect(attackOrder(20, 10, () => 0.66)).toBe("a");
    expect(attackOrder(20, 10, () => 0.67)).toBe("b");
    // The slower side still goes first sometimes.
    expect(attackOrder(16, 9, () => 0.7)).toBe("b");
    expect(attackOrder(9, 16, () => 0.3)).toBe("a");
  });

  it("calls random exactly once", () => {
    let calls = 0;
    attackOrder(16, 9, () => (calls++, 0.5));
    expect(calls).toBe(1);
  });

  it("matches the odds over many seeded rolls (level 5 Kawi 16 vs. Kantar 9 is 64%)", () => {
    const random = seededRandom(21);
    let first = 0;
    for (let i = 0; i < 20000; i++) if (attackOrder(16, 9, random) === "a") first++;
    expect(first / 20000).toBeCloseTo(0.64, 1);
  });
});

describe("escapeChance", () => {
  it("follows 0.20 + share x 0.60 + 0.10 per failed attempt", () => {
    expect(escapeChance(10, 10, 0)).toBeCloseTo(0.5);
    expect(escapeChance(30, 10, 0)).toBeCloseTo(0.65);
    expect(escapeChance(10, 30, 0)).toBeCloseTo(0.35);
    expect(escapeChance(10, 30, 2)).toBeCloseTo(0.55);
  });

  it("is capped at 95%", () => {
    expect(escapeChance(100, 1, 5)).toBe(0.95);
  });
});
