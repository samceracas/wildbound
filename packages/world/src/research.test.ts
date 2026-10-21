import { describe, expect, it } from "vitest";
import { ASSESSMENTS, CreatureDefinitionSchema, type CreatureDefinition } from "@wildbound/shared";
import { sampleWorld } from "./__fixtures__/world.ts";
import {
  UNLIMITED,
  achievableAssessmentLimits,
  assessmentProgress,
  categoryWeights,
  emptyRequirementCounts,
  observationResearcherExp,
  phenotypeRecordExp,
  phenotypeRecordTraits,
  rankThreshold,
  splitResearcherExp,
} from "./research.ts";

const creature = (id: string, category: CreatureDefinition["category"], bodyTraits: CreatureDefinition["bodyTraits"], spawnModifiers = {}) =>
  CreatureDefinitionSchema.parse({ id, registryNumber: 1, name: id, description: "", habitatAffinity: [], category, bodyTraits, spawnModifiers });

const FIVE = [
  creature("kawi", "aerial", ["feathered"], { timeOfDay: { night: 0.1 }, weather: { storm: 0 } }),
  creature("mimu", "terrestrial", ["soft-bodied"]),
  creature("lumae", "verdant", ["leafy"], { timeOfDay: { night: 0 } }),
  creature("kantar", "terrestrial", ["plated"]),
  creature("riverkin", "aquatic", ["slick"]),
];

describe("splitResearcherExp", () => {
  it("splits by weight and always adds up to the amount", () => {
    expect(splitResearcherExp(50, { aerial: 40, terrestrial: 60 })).toEqual([
      { category: "aerial", amount: 20 },
      { category: "terrestrial", amount: 30 },
    ]);
    const parts = splitResearcherExp(10, { aerial: 1, aquatic: 1, verdant: 1 });
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(10);
    expect(parts.map((p) => p.amount).sort()).toEqual([3, 3, 4]);
  });

  it("ignores TBD and empty weights", () => {
    expect(splitResearcherExp(50, { TBD: 10 })).toEqual([]);
    expect(splitResearcherExp(50, {})).toEqual([]);
    expect(splitResearcherExp(10, { TBD: 50, aquatic: 1 })).toEqual([{ category: "aquatic", amount: 10 }]);
  });

  it("weighs categories from a habitat's available Wildkin", () => {
    const cats = new Map(FIVE.map((c) => [c.id, c.category]));
    expect(categoryWeights([{ creatureId: "kawi", weight: 40 }, { creatureId: "mimu", weight: 35 }, { creatureId: "kantar", weight: 25 }], cats)).toEqual({
      aerial: 40,
      terrestrial: 60,
    });
  });
});

describe("observation and phenotype records", () => {
  it("gives first-observation EXP once, then repeats up to 5 per day", () => {
    expect(observationResearcherExp(true, 0)).toBe(100);
    expect(observationResearcherExp(false, 4)).toBe(10);
    expect(observationResearcherExp(false, 5)).toBe(0);
  });

  it("records visible extremes and markings, nothing for typical", () => {
    expect(phenotypeRecordTraits({ build: "typical", temperament: "steady", marked: false })).toEqual([]);
    expect(phenotypeRecordTraits({ build: "large", temperament: "wary", marked: true })).toEqual(["large", "wary", "marking"]);
    expect(phenotypeRecordTraits({ build: "small", temperament: "bold", marked: false })).toEqual(["small", "bold"]);
    expect(phenotypeRecordExp("large")).toBe(40);
    expect(phenotypeRecordExp("marking")).toBe(200);
  });
});

describe("achievableAssessmentLimits", () => {
  const world = sampleWorld();

  it("counts what the published world makes possible for a category", () => {
    const terrestrial = achievableAssessmentLimits(world, FIVE, "terrestrial");
    expect(terrestrial.observeDistinctSpecies).toBe(2);
    expect(terrestrial.recordMatchups).toBe(4);
    expect(terrestrial.recordPhenotypes).toBe(8);
    expect(terrestrial.visitHabitats).toBe(1);
    expect(terrestrial.observeTimesOfDay).toBe(4);
    expect(terrestrial.observeWeathers).toBe(5);
    expect(terrestrial.winBattles).toBe(UNLIMITED);

    const aquatic = achievableAssessmentLimits(world, FIVE, "aquatic");
    // Riverkin is only in the region-wide table, which needs rain.
    expect(aquatic.observeDistinctSpecies).toBe(1);
    expect(aquatic.observeWeathers).toBe(1);
    expect(aquatic.visitHabitats).toBe(2);
  });

  it("respects spawn modifiers of 0 and categories without species", () => {
    const aerial = achievableAssessmentLimits(world, FIVE, "aerial");
    expect(aerial.observeWeathers).toBe(4);
    const verdant = achievableAssessmentLimits(world, FIVE, "verdant");
    expect(verdant).toMatchObject({ observeDistinctSpecies: 0, captureCount: 0, winBattles: 0, visitHabitats: 0 });
  });
});

describe("assessmentProgress", () => {
  const limits = { ...emptyRequirementCounts(), observeDistinctSpecies: 1, observeTimesOfDay: 4, observeWeathers: 5, captureCount: UNLIMITED };

  it("clamps each requirement to what is achievable", () => {
    const counts = { ...emptyRequirementCounts(), observeDistinctSpecies: 1, observeTimesOfDay: 1 };
    const progress = assessmentProgress(ASSESSMENTS[2], counts, limits, { relaxWeather: false });
    expect(progress).toEqual([
      { type: "observeDistinctSpecies", label: "Observe 1 different species", required: 1, current: 1, met: true },
      { type: "observeTimesOfDay", label: "Observe at 2 different times of day", required: 2, current: 1, met: false },
      { type: "captureCount", label: "Capture 1 Wildkin", required: 1, current: 0, met: false },
    ]);
  });

  it("relaxes weather requirements to 1 while live weather is not implemented", () => {
    const counts = { ...emptyRequirementCounts(), observeWeathers: 1 };
    const relaxed = assessmentProgress(ASSESSMENTS[3], counts, limits, { relaxWeather: true });
    expect(relaxed.find((r) => r.type === "observeWeathers")).toMatchObject({ required: 1, met: true });
    const strict = assessmentProgress(ASSESSMENTS[3], counts, limits, { relaxWeather: false });
    expect(strict.find((r) => r.type === "observeWeathers")).toMatchObject({ required: 3, met: false });
  });

  it("makes every 0.3.0 assessment completable for every category in the sample world", () => {
    for (const category of ["aerial", "aquatic", "terrestrial", "verdant"] as const) {
      const lim = achievableAssessmentLimits(sampleWorld(), FIVE, category);
      // A player who did everything the world allows (battles and captures: plenty).
      const best = Object.fromEntries(Object.entries(lim).map(([k, v]) => [k, v === UNLIMITED ? 1000 : v])) as typeof lim;
      for (const rank of [2, 3, 4, 5] as const) {
        expect(assessmentProgress(ASSESSMENTS[rank], best, lim, { relaxWeather: true }).every((r) => r.met)).toBe(true);
      }
    }
  });

  it("knows the rank thresholds", () => {
    expect([1, 2, 3, 4, 5].map(rankThreshold)).toEqual([0, 600, 2000, 5000, 12000]);
  });
});
