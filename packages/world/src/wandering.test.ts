import { describe, expect, it } from "vitest";
import { seededRandom } from "./encounters.ts";
import { distanceMeters } from "./movement.ts";
import { isActivePeriod, offsetMeters, wander, wanderStep, WANDER_PROFILES } from "./wandering.ts";

const start = { lat: 14.6518, lng: 121.0444, heading: 0 };

describe("offsetMeters", () => {
  it("moves the requested distance", () => {
    const to = offsetMeters(start, Math.PI / 3, 50);
    expect(distanceMeters(start, to)).toBeCloseTo(50, 0);
  });
});

describe("isActivePeriod", () => {
  it("follows the activity pattern", () => {
    expect(isActivePeriod("diurnal", "day")).toBe(true);
    expect(isActivePeriod("diurnal", "night")).toBe(false);
    expect(isActivePeriod("crepuscular", "dusk")).toBe(true);
    expect(isActivePeriod("sheltering_by_day", "day")).toBe(false);
    expect(isActivePeriod("TBD", "night")).toBe(true);
  });
});

describe("wanderStep", () => {
  it("stays put when the pause roll hits", () => {
    const next = wanderStep(start, { style: "forager", active: true, stepMs: 10_000, random: () => 0 });
    expect(next).toMatchObject({ lat: start.lat, lng: start.lng });
  });

  it("never exceeds 1.5x the profile speed", () => {
    const random = seededRandom(3);
    for (const style of Object.keys(WANDER_PROFILES) as (keyof typeof WANDER_PROFILES)[]) {
      for (let i = 0; i < 50; i++) {
        const next = wanderStep(start, { style, active: true, stepMs: 10_000, random });
        expect(distanceMeters(start, next)).toBeLessThanOrEqual(WANDER_PROFILES[style].speedMps * 10 * 1.5 + 1e-6);
        expect(next.heading).toBeGreaterThanOrEqual(0);
        expect(next.heading!).toBeLessThan(2 * Math.PI);
      }
    }
  });

  it("moves slower outside the active period", () => {
    const always = (v: number) => () => v;
    const active = wanderStep(start, { style: "roamer", active: true, stepMs: 10_000, random: always(0.9) });
    const resting = wanderStep(start, { style: "roamer", active: false, stepMs: 10_000, random: always(0.9) });
    expect(distanceMeters(start, resting)).toBeLessThan(distanceMeters(start, active));
  });
});

describe("wander", () => {
  const base = { style: "darter" as const, active: true, stepMs: 10_000, center: start, random: seededRandom(9) };

  it("takes one step per elapsed interval, capped", () => {
    expect(wander(start, { ...base, elapsedMs: 25_000, maxSteps: 6, radiusM: 1000 }).steps).toBe(2);
    expect(wander(start, { ...base, elapsedMs: 10 * 60_000, maxSteps: 6, radiusM: 1000 }).steps).toBe(6);
    expect(wander(start, { ...base, elapsedMs: 5_000, maxSteps: 6, radiusM: 1000 })).toMatchObject({ steps: 0, lat: start.lat });
  });

  it("reports leaving the radius and stops there", () => {
    const result = wander(start, { ...base, random: () => 0.99, elapsedMs: 60_000, maxSteps: 6, radiusM: 5 });
    expect(result.outOfBounds).toBe(true);
    expect(result.steps).toBe(1);
  });
});
