import { describe, expect, it } from "vitest";
import { distanceMeters } from "./movement.ts";
import { NEUTRAL_MODIFIERS, planSpawns, randomPointNear } from "./spawning.ts";
import { seededRandom } from "./encounters.ts";

const center = { lat: 14.65, lng: 121.04 };
const env = { timeOfDay: "day", weather: "clear" } as const;

describe("randomPointNear", () => {
  it("stays within the radius", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 200; i++) {
      expect(distanceMeters(center, randomPointNear(center, 120, random))).toBeLessThanOrEqual(121);
    }
  });
});

describe("planSpawns", () => {
  const available = [
    { creatureId: "kawi", name: "Kawi", weight: 60, probability: 0.6 },
    { creatureId: "mimu", name: "Mimu", weight: 40, probability: 0.4 },
  ];
  const modifiers = new Map([["kawi", NEUTRAL_MODIFIERS]]);

  it("tops up to the maximum number of active spawns", () => {
    const planned = planSpawns({ center, available, modifiers, env, activeCount: 4, maxActive: 6, radiusM: 120, random: seededRandom(1) });
    expect(planned).toHaveLength(2);
    for (const p of planned) expect(["kawi", "mimu"]).toContain(p.creatureId);
  });

  it("plans nothing when nothing is available or the player is full", () => {
    expect(planSpawns({ center, available: [], modifiers, env, activeCount: 0, maxActive: 6, radiusM: 120, random: seededRandom(1) })).toEqual([]);
    expect(planSpawns({ center, available, modifiers, env, activeCount: 6, maxActive: 6, radiusM: 120, random: seededRandom(1) })).toEqual([]);
  });
});
