import { describe, expect, it } from "vitest";
import type { SpawnModifiers } from "@wildbound/shared";
import { applySpawnModifiers } from "./spawning.ts";

/**
 * Exercise: make these pass by implementing applySpawnModifiers (spawning.ts).
 * Run with: pnpm test:exercises
 */
const modifiers = new Map<string, SpawnModifiers>([
  ["kawi", { weather: { rain: 0.5, storm: 0 }, timeOfDay: { day: 1.5, night: 0.1 } }],
  ["kantar", { weather: { rain: 1.4 }, timeOfDay: { night: 2 } }],
]);
const candidates = [
  { creatureId: "kawi", weight: 60 },
  { creatureId: "kantar", weight: 20 },
  { creatureId: "mimu", weight: 30 },
];

describe("applySpawnModifiers", () => {
  it("multiplies weather and time-of-day modifiers", () => {
    const out = applySpawnModifiers(candidates, modifiers, { weather: "rain", timeOfDay: "day" });
    expect(out.find((c) => c.creatureId === "kawi")?.weight).toBeCloseTo(45);
    expect(out.find((c) => c.creatureId === "kantar")?.weight).toBeCloseTo(28);
  });

  it("treats missing modifiers and species as 1", () => {
    const out = applySpawnModifiers(candidates, modifiers, { weather: "clear", timeOfDay: "dawn" });
    expect(out).toEqual(candidates);
  });

  it("removes species whose weight drops to 0", () => {
    const out = applySpawnModifiers(candidates, modifiers, { weather: "storm", timeOfDay: "night" });
    expect(out.map((c) => c.creatureId)).toEqual(["kantar", "mimu"]);
    expect(out[0]?.weight).toBeCloseTo(40);
  });

  it("does not mutate its input", () => {
    const copy = structuredClone(candidates);
    applySpawnModifiers(candidates, modifiers, { weather: "rain", timeOfDay: "night" });
    expect(candidates).toEqual(copy);
  });
});
