import { describe, expect, it } from "vitest";
import { currentHp } from "./recovery.ts";

/**
 * Exercise #13: make these pass by implementing currentHp (recovery.ts).
 * Run with: pnpm test:exercises
 */
const h = 60 * 60 * 1000;
const t0 = new Date("2026-10-21T08:00:00Z");
const at = (hours: number) => new Date(t0.getTime() + hours * h);
const row = { currentHp: 0, hpUpdatedAt: t0 };

describe("currentHp", () => {
  it("recovers from empty to full in 8 hours", () => {
    expect(currentHp(row, 80, at(0), false)).toBe(0);
    expect(currentHp(row, 80, at(1), false)).toBe(10);
    expect(currentHp(row, 80, at(4), false)).toBe(40);
    expect(currentHp(row, 80, at(8), false)).toBe(80);
  });

  it("continues from the last write and never exceeds max HP", () => {
    expect(currentHp({ currentHp: 50, hpUpdatedAt: t0 }, 80, at(2), false)).toBe(70);
    expect(currentHp({ currentHp: 50, hpUpdatedAt: t0 }, 80, at(30), false)).toBe(80);
  });

  it("rounds down", () => {
    expect(currentHp(row, 21, at(1), false)).toBe(2);
  });

  it("is frozen while restless", () => {
    expect(currentHp({ currentHp: 5, hpUpdatedAt: t0 }, 80, at(8), true)).toBe(5);
  });

  it("ignores a clock that went backwards", () => {
    expect(currentHp({ currentHp: 5, hpUpdatedAt: t0 }, 80, at(-3), false)).toBe(5);
  });
});
