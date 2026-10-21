import { describe, expect, it } from "vitest";
import {
  advanceWalkMeter,
  battleExp,
  captureExp,
  dayKey,
  explorationExp,
  levelGapFactor,
  observationExp,
  remainingToday,
  restedCharges,
  sharedBattleExp,
  walkingExp,
} from "./exp.ts";

describe("battle EXP", () => {
  it("scales with the opponent's level and the level gap", () => {
    expect(levelGapFactor(5, 30)).toBe(0.2);
    expect(levelGapFactor(30, 5)).toBe(1.5);
    expect(levelGapFactor(6, 5)).toBeCloseTo(1.2);
    expect(battleExp(5, 30)).toBe(8);
    expect(battleExp(5, 5)).toBe(42);
    expect(battleExp(7, 5)).toBe(84);
  });

  it("shares 50% with the party, 75% when 5+ levels below the lead", () => {
    expect(sharedBattleExp(42, 5, 5)).toBe(21);
    expect(sharedBattleExp(42, 3, 8)).toBe(31);
    expect(sharedBattleExp(1, 5, 5)).toBe(1);
  });
});

describe("gap-share EXP", () => {
  it("is a share of the lead's next level gap, at least 1, 0 at level 100", () => {
    expect(walkingExp(5)).toBe(1);
    expect(walkingExp(50)).toBe(76);
    expect(observationExp(20)).toBe(37);
    expect(explorationExp(20)).toBe(63);
    expect(captureExp(5)).toBe(9);
    expect(captureExp(100)).toBe(0);
  });

  it("counts what a daily cap still allows", () => {
    expect(remainingToday(30, 12)).toBe(18);
    expect(remainingToday(5, 7)).toBe(0);
  });
});

describe("rested charges", () => {
  const h = 60 * 60 * 1000;
  const t0 = new Date("2026-10-21T00:00:00Z");
  it("earns one per 2 hours, up to 10", () => {
    expect(restedCharges(0, t0, new Date(t0.getTime() + 1.9 * h))).toBe(0);
    expect(restedCharges(0, t0, new Date(t0.getTime() + 2 * h))).toBe(1);
    expect(restedCharges(3, t0, new Date(t0.getTime() + 9 * h))).toBe(7);
    expect(restedCharges(0, t0, new Date(t0.getTime() + 100 * h))).toBe(10);
    expect(restedCharges(2, t0, new Date(t0.getTime() - h))).toBe(2);
  });
});

describe("walking meter", () => {
  it("awards one unit per full 100 m and resets on a new day", () => {
    let r = advanceWalkMeter({ meterM: 0, day: null }, { distanceM: 60, durationMs: 60_000 }, "2026-10-21");
    expect(r).toEqual({ meter: { meterM: 60, day: "2026-10-21" }, units: 0 });
    r = advanceWalkMeter(r.meter, { distanceM: 250, durationMs: 200_000 }, "2026-10-21");
    expect(r.units).toBe(3);
    expect(r.meter.meterM).toBe(310);
    r = advanceWalkMeter(r.meter, { distanceM: 50, durationMs: 60_000 }, "2026-10-22");
    expect(r).toEqual({ meter: { meterM: 50, day: "2026-10-22" }, units: 0 });
  });

  it("ignores segments at 3 m/s or faster", () => {
    const r = advanceWalkMeter({ meterM: 90, day: "d" }, { distanceM: 300, durationMs: 100_000 }, "d");
    expect(r).toEqual({ meter: { meterM: 90, day: "d" }, units: 0 });
    expect(advanceWalkMeter({ meterM: 90, day: "d" }, { distanceM: 20, durationMs: 0 }, "d").units).toBe(0);
  });
});

describe("dayKey", () => {
  it("uses the player's time zone", () => {
    const t = new Date("2026-10-21T17:30:00Z");
    expect(dayKey(t, "Asia/Manila")).toBe("2026-10-22");
    expect(dayKey(t, "UTC")).toBe("2026-10-21");
    expect(dayKey(t, "Not/AZone")).toBe("2026-10-21");
  });
});
