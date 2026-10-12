import { describe, expect, it } from "vitest";
import type { EncounterTable } from "@wildbound/shared";
import { combineAvailableWildkin, evaluateEncounterTable, rollEncounter, seededRandom } from "./encounters.ts";

const names = new Map([
  ["kawi", "Kawi"],
  ["mimu", "Mimu"],
  ["lumae", "Lumae"],
]);
const any = { timeOfDay: [], weather: [] };
const table = (overrides: Partial<EncounterTable> = {}): EncounterTable => ({
  id: "40000000-0000-4000-8000-000000000001",
  name: "T",
  regionId: "10000000-0000-4000-8000-000000000001",
  habitatId: null,
  conditionRules: any,
  active: true,
  entries: [
    { id: "50000000-0000-4000-8000-000000000001", creatureId: "kawi", weight: 30, conditions: any },
    { id: "50000000-0000-4000-8000-000000000002", creatureId: "lumae", weight: 70, conditions: { timeOfDay: ["day"], weather: [] } },
  ],
  ...overrides,
});

describe("evaluateEncounterTable", () => {
  it("normalizes probabilities over available entries", () => {
    const day = evaluateEncounterTable(table(), "region", { timeOfDay: "day", weather: "clear" }, names);
    expect(day.applicable).toBe(true);
    expect(day.entries.map((e) => [e.creatureId, e.probability])).toEqual([
      ["kawi", 0.3],
      ["lumae", 0.7],
    ]);

    const night = evaluateEncounterTable(table(), "region", { timeOfDay: "night", weather: "clear" }, names);
    expect(night.entries.map((e) => [e.creatureId, e.available, e.probability])).toEqual([
      ["kawi", true, 1],
      ["lumae", false, 0],
    ]);
  });

  it("closes the table when its conditions fail, it is inactive, or the gate is closed", () => {
    const env = { timeOfDay: "day", weather: "clear" } as const;
    const rainy = evaluateEncounterTable(table({ conditionRules: { timeOfDay: [], weather: ["rain"] } }), "region", env, names);
    expect(rainy.applicable).toBe(false);
    expect(rainy.entries.every((e) => !e.available && e.probability === 0)).toBe(true);
    expect(evaluateEncounterTable(table({ active: false }), "region", env, names).applicable).toBe(false);
    expect(evaluateEncounterTable(table(), "habitat", env, names, false).applicable).toBe(false);
  });

  it("falls back to the creature id when a name is unknown", () => {
    const t = table({ entries: [{ id: "50000000-0000-4000-8000-000000000009", creatureId: "ghost", weight: 1, conditions: any }] });
    expect(evaluateEncounterTable(t, "region", { timeOfDay: "day", weather: "clear" }, names).entries[0]!.creatureName).toBe("ghost");
  });
});

describe("combineAvailableWildkin", () => {
  it("sums weights per creature across applicable tables and sorts deterministically", () => {
    const env = { timeOfDay: "day", weather: "clear" } as const;
    const a = evaluateEncounterTable(table(), "habitat", env, names);
    const b = evaluateEncounterTable(
      table({ id: "40000000-0000-4000-8000-000000000002", entries: [{ id: "50000000-0000-4000-8000-000000000003", creatureId: "kawi", weight: 40, conditions: any }] }),
      "region",
      env,
      names,
    );
    const closed = evaluateEncounterTable(table({ active: false }), "region", env, names);
    const combined = combineAvailableWildkin([a, b, closed]);
    expect(combined).toEqual([
      { creatureId: "kawi", name: "Kawi", weight: 70, probability: 0.5 },
      { creatureId: "lumae", name: "Lumae", weight: 70, probability: 0.5 },
    ]);
  });

  it("returns nothing when no table applies", () => {
    expect(combineAvailableWildkin([])).toEqual([]);
  });
});

describe("rollEncounter", () => {
  const pool = [
    { creatureId: "kawi", weight: 1 },
    { creatureId: "mimu", weight: 3 },
  ];
  it("maps the random number onto cumulative weights", () => {
    expect(rollEncounter(pool, () => 0)).toBe("kawi");
    expect(rollEncounter(pool, () => 0.249)).toBe("kawi");
    expect(rollEncounter(pool, () => 0.25)).toBe("mimu");
    expect(rollEncounter(pool, () => 0.9999)).toBe("mimu");
  });
  it("returns null for an empty or zero-weight pool", () => {
    expect(rollEncounter([], () => 0.5)).toBeNull();
    expect(rollEncounter([{ creatureId: "kawi", weight: 0 }], () => 0.5)).toBeNull();
  });
  it("matches weights statistically and is reproducible with a seed", () => {
    const random = seededRandom(42);
    const counts = { kawi: 0, mimu: 0 } as Record<string, number>;
    for (let i = 0; i < 20000; i++) counts[rollEncounter(pool, random)!]!++;
    expect(counts.mimu! / 20000).toBeCloseTo(0.75, 1);
    const seq = (seed: number) => {
      const r = seededRandom(seed);
      return Array.from({ length: 10 }, () => rollEncounter(pool, r));
    };
    expect(seq(7)).toEqual(seq(7));
  });
});
