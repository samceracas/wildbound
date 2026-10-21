import { describe, expect, it } from "vitest";
import { AVERAGE_VIGOR, type BaseStats } from "@wildbound/shared";
import { computeStats, individualMultiplier, statDescriptor, statGrade, vigorWord } from "./stats.ts";

const kawi: BaseStats = { hp: 65, atk: 75, def: 50, spd: 110 };
const kantar: BaseStats = { hp: 70, atk: 90, def: 95, spd: 45 };
const mimu: BaseStats = { hp: 70, atk: 50, def: 80, spd: 100 };
const noVigor = { hp: 0, atk: 0, def: 0, spd: 0 };

describe("computeStats", () => {
  it("matches the worked examples (no traits, no vigor)", () => {
    const k5 = computeStats(kawi, 5, {}, noVigor);
    expect(k5.hp).toBe(21);
    expect(k5.spd).toBe(16);
    expect(k5.atk).toBe(12);
    expect(computeStats(kantar, 50, {}, noVigor).hp).toBe(130);
    expect(computeStats(kantar, 5, {}, noVigor).spd).toBe(9);
    expect(computeStats(mimu, 5, {}, noVigor)).toMatchObject({ hp: 22, def: 13 });
  });

  it("is about base + 5 at level 50 and 2 x base + 5 at level 100", () => {
    expect(computeStats(kawi, 50, {}, noVigor).spd).toBe(115);
    expect(computeStats(kawi, 100, {}, noVigor).spd).toBe(225);
  });

  it("applies trait modifiers and vigor, and never drops below 1", () => {
    const s = computeStats(kawi, 50, { spd: 1.1, hp: 0.9 }, { ...noVigor, spd: 5 });
    expect(s.spd).toBe(Math.round(115 * 1.1 * 1.05));
    expect(s.hp).toBe(Math.round((65 + 50 + 10) * 0.9));
    expect(computeStats({ hp: 10, atk: 10, def: 10, spd: 10 }, 1, { atk: 0.01 }, noVigor).atk).toBe(1);
    expect(computeStats(kawi, 5, {}, AVERAGE_VIGOR).hp).toBe(Math.round(21 * 1.02));
  });
});

describe("descriptors and grades", () => {
  it.each([
    [150, "Signature strength"],
    [100, "Signature strength"],
    [99, "Solid"],
    [80, "Solid"],
    [79, "Modest"],
    [60, "Modest"],
    [59, "Weak point"],
    [10, "Weak point"],
  ])("base %i is %s", (base, label) => expect(statDescriptor(base)).toBe(label));

  it.each([
    [0.9, "Low"],
    [0.949, "Low"],
    [0.95, "Fair"],
    [0.999, "Fair"],
    [1, "Typical"],
    [1.039, "Typical"],
    [1.04, "Strong"],
    [1.099, "Strong"],
    [1.1, "Exceptional"],
    [1.155, "Exceptional"],
  ])("multiplier %d is %s", (m, label) => expect(statGrade(m)).toBe(label));

  it("grades combine trait and vigor", () => {
    expect(statGrade(individualMultiplier(undefined, 0))).toBe("Typical");
    expect(statGrade(individualMultiplier(0.9, 5))).toBe("Low");
    expect(statGrade(individualMultiplier(1.1, 0))).toBe("Exceptional");
    expect(statGrade(individualMultiplier(0.99, 5))).toBe("Typical");
    expect(statGrade(individualMultiplier(undefined, 5))).toBe("Strong");
  });

  it("names vigor", () => {
    expect([0, 1, 2, 3, 4, 5].map(vigorWord)).toEqual(["Frail", "Slight", "Average", "Sound", "Robust", "Exceptional"]);
  });
});
