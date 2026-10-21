import { describe, expect, it } from "vitest";
import type { EncounterTable } from "@wildbound/shared";
import {
  combineAvailableWildkin,
  effectiveLevelRange,
  evaluateEncounterTable,
  rollEncounter,
  rollLevel,
  seededRandom,
} from "./encounters.ts";

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
  minLevel: 1,
  maxLevel: 10,
  entries: [
    { id: "50000000-0000-4000-8000-000000000001", creatureId: "kawi", weight: 30, conditions: any, minLevel: null, maxLevel: null },
    { id: "50000000-0000-4000-8000-000000000002", creatureId: "lumae", weight: 70, conditions: { timeOfDay: ["day"], weather: [] }, minLevel: null, maxLevel: null },
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
    const t = table({ entries: [{ id: "50000000-0000-4000-8000-000000000009", creatureId: "ghost", weight: 1, conditions: any, minLevel: null, maxLevel: null }] });
    expect(evaluateEncounterTable(t, "region", { timeOfDay: "day", weather: "clear" }, names).entries[0]!.creatureName).toBe("ghost");
  });
});

describe("combineAvailableWildkin", () => {
  it("sums weights per creature across applicable tables and sorts deterministically", () => {
    const env = { timeOfDay: "day", weather: "clear" } as const;
    const a = evaluateEncounterTable(table(), "habitat", env, names);
    const b = evaluateEncounterTable(
      table({ id: "40000000-0000-4000-8000-000000000002", entries: [{ id: "50000000-0000-4000-8000-000000000003", creatureId: "kawi", weight: 40, conditions: any, minLevel: null, maxLevel: null }] }),
      "region",
      env,
      names,
    );
    const closed = evaluateEncounterTable(table({ active: false }), "region", env, names);
    const combined = combineAvailableWildkin([a, b, closed]);
    expect(combined).toEqual([
      {
        creatureId: "kawi",
        name: "Kawi",
        weight: 70,
        probability: 0.5,
        levelBands: [
          { minLevel: 1, maxLevel: 10, weight: 30 },
          { minLevel: 1, maxLevel: 10, weight: 40 },
        ],
      },
      { creatureId: "lumae", name: "Lumae", weight: 70, probability: 0.5, levelBands: [{ minLevel: 1, maxLevel: 10, weight: 70 }] },
    ]);
  });

  it("returns nothing when no table applies", () => {
    expect(combineAvailableWildkin([])).toEqual([]);
  });
});

describe("wild levels", () => {
  it("uses an entry's override when both bounds are set, else the table range", () => {
    expect(effectiveLevelRange({ minLevel: 4, maxLevel: 10 }, { minLevel: null, maxLevel: null })).toEqual({ minLevel: 4, maxLevel: 10 });
    expect(effectiveLevelRange({ minLevel: 4, maxLevel: 10 }, { minLevel: 5, maxLevel: 12 })).toEqual({ minLevel: 5, maxLevel: 12 });
    const env = { timeOfDay: "day", weather: "clear" } as const;
    const t = table({ minLevel: 3, maxLevel: 8 });
    t.entries[0] = { ...t.entries[0]!, minLevel: 20, maxLevel: 22 };
    const resolved = evaluateEncounterTable(t, "region", env, names);
    expect(resolved.entries.map((e) => [e.minLevel, e.maxLevel])).toEqual([
      [20, 22],
      [3, 8],
    ]);
  });

  it("rolls a band by weight, then a level uniformly within it", () => {
    const bands = [
      { minLevel: 2, maxLevel: 4, weight: 1 },
      { minLevel: 50, maxLevel: 50, weight: 3 },
    ];
    expect(rollLevel(bands, () => 0)).toBe(2);
    expect(rollLevel(bands, (() => { const v = [0.1, 0.999]; return () => v.shift()!; })())).toBe(4);
    expect(rollLevel(bands, () => 0.5)).toBe(50);
    const random = seededRandom(9);
    const seen = new Set<number>();
    let high = 0;
    for (let i = 0; i < 4000; i++) {
      const level = rollLevel(bands, random);
      seen.add(level);
      if (level === 50) high++;
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([2, 3, 4, 50]);
    expect(high / 4000).toBeCloseTo(0.75, 1);
    expect(rollLevel([], random)).toBe(1);
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
