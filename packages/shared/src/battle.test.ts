import { describe, expect, it } from "vitest";
import {
  AttackSchema,
  BaseStatsSchema,
  BattleActionRequestSchema,
  CreatureDefinitionSchema,
  EncounterTableSchema,
  GenomeSchema,
  HabitatSchema,
  PUBLISH_BATTLE_CHECKS,
  WildkinEntryInputSchema,
  WildkinSuggestionSchema,
  isBattleReady,
  obedienceCap,
  powerWord,
  rankForLevel,
} from "./index.ts";

describe("stat budget", () => {
  it("requires the four base stats to add up to exactly 300", () => {
    expect(BaseStatsSchema.safeParse({ hp: 65, atk: 75, def: 50, spd: 110 }).success).toBe(true);
    expect(BaseStatsSchema.safeParse({ hp: 65, atk: 75, def: 50, spd: 100 }).success).toBe(false);
    expect(BaseStatsSchema.safeParse({ hp: 5, atk: 145, def: 50, spd: 100 }).success).toBe(false);
  });
});

describe("attacks", () => {
  it("accepts power 30 to 60 and fills defaults", () => {
    expect(AttackSchema.parse({ name: "Peck", approach: "pierce", power: 40 })).toEqual({
      name: "Peck",
      approach: "pierce",
      power: 40,
      description: "",
      canon: "proposed",
      priority: false,
    });
    expect(AttackSchema.safeParse({ name: "Peck", approach: "pierce", power: 61 }).success).toBe(false);
    expect(AttackSchema.safeParse({ name: "Peck", approach: "fire", power: 40 }).success).toBe(false);
  });
  it("names power with words", () => {
    expect([30, 39, 40, 49, 50, 60].map(powerWord)).toEqual(["Light", "Light", "Moderate", "Moderate", "Heavy", "Heavy"]);
  });
});

describe("genome", () => {
  it("parses allele pairs", () => {
    expect(GenomeSchema.safeParse({ build: ["S", "L"], temperament: ["W", "W"], marking: ["+", "m"] }).success).toBe(true);
    expect(GenomeSchema.safeParse({ build: ["S", "X"], temperament: ["W", "W"], marking: ["+", "m"] }).success).toBe(false);
  });
});

describe("defaults for older data", () => {
  it("gives old creatures, tables, entries and habitats the 0.3.0 defaults", () => {
    const c = CreatureDefinitionSchema.parse({ id: "kawi", registryNumber: 1, name: "Kawi", description: "", habitatAffinity: [] });
    expect(c).toMatchObject({ category: "TBD", bodyTraits: [], baseStats: null, attacks: [] });
    expect(c.genePool.build.pAllele).toBe(0.5);
    const t = EncounterTableSchema.parse({
      id: "40000000-0000-4000-8000-000000000001",
      name: "T",
      regionId: "10000000-0000-4000-8000-000000000001",
      habitatId: null,
      conditionRules: { timeOfDay: [], weather: [] },
      active: true,
      entries: [{ id: "50000000-0000-4000-8000-000000000001", creatureId: "kawi", weight: 1, conditions: { timeOfDay: [], weather: [] } }],
    });
    expect([t.minLevel, t.maxLevel, t.entries[0]!.minLevel, t.entries[0]!.maxLevel]).toEqual([1, 10, null, null]);
    const h = HabitatSchema.shape.licenseRequirement.parse(undefined);
    expect(h).toBeNull();
  });
});

describe("licenses", () => {
  it("caps obedience at rank x 20", () => {
    expect([1, 2, 3, 4, 5].map(obedienceCap)).toEqual([20, 40, 60, 80, 100]);
    expect([1, 20, 21, 40, 41, 100].map(rankForLevel)).toEqual([1, 1, 2, 2, 3, 5]);
  });
});

describe("Creature Manager publish checks", () => {
  const entry = (over: object = {}) => WildkinEntryInputSchema.parse({ id: "kawi", registryNumber: 1, name: "Kawi", ...over });
  it("needs a category, traits, stats summing to 300 and an attack", () => {
    const empty = entry();
    expect(PUBLISH_BATTLE_CHECKS.map((c) => c.problem(empty)).filter(Boolean)).toHaveLength(4);
    const ready = entry({
      category: "aerial",
      bodyTraits: ["feathered"],
      baseStats: { hp: 65, atk: 75, def: 50, spd: 110 },
      attacks: [{ name: "Peck", approach: "pierce", power: 40 }],
    });
    expect(isBattleReady(ready)).toBe(true);
  });
  it("rejects duplicate traits and more than two", () => {
    expect(WildkinEntryInputSchema.shape.bodyTraits.safeParse(["leafy", "leafy"]).success).toBe(false);
    expect(WildkinEntryInputSchema.shape.bodyTraits.safeParse(["leafy", "slick", "plated"]).success).toBe(false);
  });
  it("lets the assistant suggest the new fields, dropping stats that miss the budget", () => {
    expect(WildkinSuggestionSchema.shape.baseStats.safeParse({ hp: 100, atk: 100, def: 100, spd: 100 }).success).toBe(false);
    expect(WildkinSuggestionSchema.shape.category.safeParse("aquatic").success).toBe(true);
  });
});

describe("battle actions", () => {
  it("parses each action type", () => {
    const id = "a0000000-0000-4000-8000-000000000001";
    for (const action of [
      { type: "attack", attackIndex: 1 },
      { type: "switch", wildkinId: id },
      { type: "item", itemId: "trail-ration", wildkinId: id },
      { type: "capsule", itemId: "current-capsule" },
      { type: "escape" },
      { type: "replace", wildkinId: id },
    ]) {
      expect(BattleActionRequestSchema.safeParse({ turn: 3, action }).success).toBe(true);
    }
    expect(BattleActionRequestSchema.safeParse({ turn: 3, action: { type: "attack", attackIndex: 2 } }).success).toBe(false);
    expect(BattleActionRequestSchema.safeParse({ turn: 3, action: { type: "capsule", itemId: "trail-ration" } }).success).toBe(false);
  });
});
