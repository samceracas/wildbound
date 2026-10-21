import { describe, expect, it } from "vitest";
import { applyExpGain, expCapFor, levelForExp, levelProgress, nextLevelGap, totalExpForLevel } from "./levels.ts";

describe("EXP curve", () => {
  it("is L cubed, with level 1 at 0 and level 100 at 1,000,000", () => {
    expect(totalExpForLevel(1)).toBe(0);
    expect(totalExpForLevel(2)).toBe(8);
    expect(totalExpForLevel(5)).toBe(125);
    expect(totalExpForLevel(100)).toBe(1_000_000);
  });

  it("matches the worked gaps", () => {
    expect(nextLevelGap(5)).toBe(91);
    expect(nextLevelGap(20)).toBe(1261);
    expect(nextLevelGap(50)).toBe(7651);
    expect(nextLevelGap(100)).toBe(0);
  });

  it("finds the level for any EXP, exact cubes included", () => {
    expect(levelForExp(0)).toBe(1);
    expect(levelForExp(7)).toBe(1);
    expect(levelForExp(8)).toBe(2);
    expect(levelForExp(124)).toBe(4);
    expect(levelForExp(125)).toBe(5);
    expect(levelForExp(999_999)).toBe(99);
    expect(levelForExp(1_000_000)).toBe(100);
    expect(levelForExp(5_000_000)).toBe(100);
    for (let l = 1; l <= 100; l++) expect(levelForExp(totalExpForLevel(l))).toBe(l);
  });

  it("reports progress into the level", () => {
    expect(levelProgress(150, 5)).toEqual({ intoLevel: 25, levelSize: 91 });
    expect(levelProgress(1_000_000, 100)).toEqual({ intoLevel: 0, levelSize: 0 });
  });
});

describe("applyExpGain (cap stops EXP)", () => {
  it("levels up below the cap", () => {
    expect(applyExpGain({ exp: 125, level: 5 }, 100, 20)).toEqual({ exp: 225, level: 6, gained: 100, newLevel: 6, heldAtCap: false });
    expect(applyExpGain({ exp: 125, level: 5 }, 10, 20)).toMatchObject({ level: 5, newLevel: null, gained: 10 });
  });

  it("clamps EXP at the cap and discards the rest", () => {
    const r = applyExpGain({ exp: 7000, level: 19 }, 5000, 20);
    expect(r).toEqual({ exp: 8000, level: 20, gained: 1000, newLevel: 20, heldAtCap: true });
  });

  it("gains nothing at the cap or at level 100", () => {
    expect(applyExpGain({ exp: 8000, level: 20 }, 300, 20)).toEqual({ exp: 8000, level: 20, gained: 0, newLevel: null, heldAtCap: true });
    expect(applyExpGain({ exp: 1_000_000, level: 100 }, 300, 100)).toMatchObject({ gained: 0, heldAtCap: false });
  });

  it("resumes after a rank-up raises the cap", () => {
    expect(applyExpGain({ exp: 8000, level: 20 }, 1300, 40)).toMatchObject({ exp: 9300, level: 21, gained: 1300, newLevel: 21 });
  });

  it("lets restless Wildkin grow within their own license band", () => {
    expect(expCapFor(25, 20)).toBe(40);
    expect(expCapFor(40, 20)).toBe(40);
    expect(expCapFor(41, 20)).toBe(60);
    expect(expCapFor(12, 20)).toBe(20);
    expect(applyExpGain({ exp: 15625, level: 25 }, 2000, expCapFor(25, 20))).toMatchObject({ level: 26, gained: 2000 });
  });
});
