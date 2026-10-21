import { describe, expect, it } from "vitest";
import { evaluateMatchup, matchupMultiplier } from "./matchups.ts";

/**
 * Exercise #11: make these pass by implementing matchupMultiplier (matchups.ts).
 * Run with: pnpm test:exercises
 */
describe("matchupMultiplier", () => {
  it("is 1.5 for a weakness and 0.67 for a resistance", () => {
    expect(matchupMultiplier("crush", ["plated"])).toBe(1.5);
    expect(matchupMultiplier("pierce", ["plated"])).toBe(0.67);
    expect(matchupMultiplier("surge", ["feathered"])).toBe(1.5);
    expect(matchupMultiplier("spore", ["soft-bodied"])).toBe(0.67);
  });

  it("is neutral for strike, unrelated approaches and no traits", () => {
    expect(matchupMultiplier("strike", ["plated"])).toBe(1);
    expect(matchupMultiplier("toxin", ["plated"])).toBe(1);
    expect(matchupMultiplier("crush", [])).toBe(1);
  });

  it("multiplies both factors with two traits", () => {
    expect(matchupMultiplier("toxin", ["leafy", "slick"])).toBeCloseTo(2.25);
    expect(matchupMultiplier("pierce", ["soft-bodied", "plated"])).toBeCloseTo(1.005);
    expect(matchupMultiplier("pierce", ["plated", "slick"])).toBeCloseTo(0.4489);
  });

  it("makes hits discoverable", () => {
    expect(evaluateMatchup("crush", ["plated"])).toEqual({
      multiplier: 1.5,
      effect: "weak",
      line: "The plates cracked under the blow.",
      discoveries: [{ trait: "plated", effect: "weak" }],
    });
    expect(evaluateMatchup("pierce", ["slick"]).line).toBe("The point slid off its slick hide.");
  });
});
