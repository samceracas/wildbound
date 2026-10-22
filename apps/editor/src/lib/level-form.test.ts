import { describe, expect, it } from "vitest";
import { EMPTY_CONDITIONS } from "@wildbound/shared";
import { z } from "zod";
import {
  EntryFormSchema,
  battleLockLabel,
  formatLevelBands,
  formatLevelRange,
  hasLevelOverride,
  levelInputSchema,
  levelRangeFormIssues,
  overrideLevels,
  refineLevelRanges,
  requirementFromSelect,
  requirementToSelect,
  REQUIREMENT_RANKS,
} from "./level-form.ts";

const entry = (minLevel: number | null, maxLevel: number | null) => ({ minLevel, maxLevel });
const message = (r: { success: boolean; error?: z.ZodError }) => r.error?.issues[0]?.message;

describe("levelInputSchema", () => {
  it("accepts whole numbers from 1 to 100", () => {
    expect(levelInputSchema.safeParse(1).success).toBe(true);
    expect(levelInputSchema.safeParse(100).success).toBe(true);
  });
  it("rejects empty, fractional and out-of-range input with readable messages", () => {
    expect(message(levelInputSchema.safeParse(Number.NaN))).toBe("Enter a level");
    expect(message(levelInputSchema.safeParse(2.5))).toBe("Use a whole number");
    expect(message(levelInputSchema.safeParse(0))).toBe("Levels go from 1 to 100");
    expect(message(levelInputSchema.safeParse(101))).toBe("Levels go from 1 to 100");
  });
  it("allows a null override in the entry schema", () => {
    const parsed = EntryFormSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      creatureId: "kawi",
      weight: 10,
      conditions: EMPTY_CONDITIONS,
      minLevel: null,
      maxLevel: null,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("levelRangeFormIssues", () => {
  it("is empty for valid ranges", () => {
    expect(levelRangeFormIssues({ minLevel: 2, maxLevel: 6, entries: [entry(null, null), entry(5, 12), entry(4, 4)] })).toEqual([]);
  });
  it("marks the table's max when min is above it", () => {
    expect(levelRangeFormIssues({ minLevel: 8, maxLevel: 3, entries: [] })).toEqual([
      { path: ["maxLevel"], message: "Max level must be at least the min level" },
    ]);
  });
  it("marks an entry whose override is inverted or half set", () => {
    expect(levelRangeFormIssues({ minLevel: 1, maxLevel: 10, entries: [entry(9, 4), entry(3, null), entry(null, 7)] })).toEqual([
      { path: ["entries", 0, "maxLevel"], message: "Max level must be at least the min level" },
      { path: ["entries", 1, "maxLevel"], message: "Set both override levels or neither" },
      { path: ["entries", 2, "minLevel"], message: "Set both override levels or neither" },
    ]);
  });
  it("ignores NaN (an empty input is reported by the field itself)", () => {
    expect(levelRangeFormIssues({ minLevel: Number.NaN, maxLevel: 3, entries: [] })).toEqual([]);
  });
  it("feeds superRefine so the form shows the issue at the right path", () => {
    const schema = z
      .object({ minLevel: z.number(), maxLevel: z.number(), entries: z.array(z.object({ minLevel: z.number().nullable(), maxLevel: z.number().nullable() })) })
      .superRefine(refineLevelRanges);
    const result = schema.safeParse({ minLevel: 5, maxLevel: 2, entries: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["maxLevel"]);
  });
});

describe("override toggle", () => {
  it("on copies the table's range, off clears both", () => {
    expect(overrideLevels(true, { minLevel: 3, maxLevel: 8 })).toEqual({ minLevel: 3, maxLevel: 8 });
    expect(overrideLevels(false, { minLevel: 3, maxLevel: 8 })).toEqual({ minLevel: null, maxLevel: null });
  });
  it("hasLevelOverride is true when either bound is set", () => {
    expect(hasLevelOverride(entry(null, null))).toBe(false);
    expect(hasLevelOverride(entry(4, 9))).toBe(true);
    expect(hasLevelOverride(entry(4, null))).toBe(true);
  });
});

describe("level labels", () => {
  it("formats one range", () => {
    expect(formatLevelRange(3, 8)).toBe("Lv 3-8");
    expect(formatLevelRange(5, 5)).toBe("Lv 5");
  });
  it("joins distinct bands, lowest first", () => {
    expect(
      formatLevelBands([
        { minLevel: 5, maxLevel: 12 },
        { minLevel: 2, maxLevel: 6 },
        { minLevel: 5, maxLevel: 12 },
      ]),
    ).toBe("Lv 2-6, Lv 5-12");
    expect(formatLevelBands([])).toBe("");
  });
});

describe("license requirement selects", () => {
  it("offers ranks 2 to 5", () => {
    expect(REQUIREMENT_RANKS).toEqual([2, 3, 4, 5]);
  });
  it("round-trips a requirement", () => {
    expect(requirementToSelect({ category: "aquatic", rank: 3 })).toEqual({ category: "aquatic", rank: 3 });
    expect(requirementFromSelect("aquatic", "3")).toEqual({ category: "aquatic", rank: 3 });
  });
  it("None is null and shows the default rank", () => {
    expect(requirementToSelect(null)).toEqual({ category: "", rank: 2 });
    expect(requirementFromSelect("", 4)).toBeNull();
    expect(requirementFromSelect("TBD", 4)).toBeNull();
  });
  it("a rank outside 2 to 5 falls back to 2", () => {
    expect(requirementFromSelect("verdant", 1)).toEqual({ category: "verdant", rank: 2 });
    expect(requirementFromSelect("verdant", 9)).toEqual({ category: "verdant", rank: 2 });
  });
  it("labels a locked habitat", () => {
    expect(battleLockLabel({ category: "aquatic", rank: 3 })).toBe("Battle locked: needs Aquatic rank 3");
    expect(battleLockLabel(null)).toBeNull();
  });
});
