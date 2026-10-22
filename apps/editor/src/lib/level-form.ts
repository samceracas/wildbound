/**
 * Pure helpers for the wild level and license requirement fields in the
 * inspectors, and for showing levels in the Test panel.
 * (Relative imports only: the unit tests run without the "@" alias.)
 */
import type { Category, EncounterEntry, EncounterTable, LevelBand, LicenseRequirement } from "@wildbound/shared";
import {
  CATEGORIES,
  EncounterEntrySchema,
  LEVEL_MAX,
  LEVEL_MIN,
  LICENSE_MAX_RANK,
  licenseRequirementLabel,
} from "@wildbound/shared";
import { z } from "zod";

// ------------------------------------------------------------------ wild levels

/** A wild level input: a whole number from 1 to 100, with messages that read well under a field. */
const levelRangeMessage = `Levels go from ${LEVEL_MIN} to ${LEVEL_MAX}`;
export const levelInputSchema = z
  .number({ error: "Enter a level" })
  .int("Use a whole number")
  .min(LEVEL_MIN, levelRangeMessage)
  .max(LEVEL_MAX, levelRangeMessage);

/** An entry as the table form edits it: the shared schema with friendlier level messages. */
export const EntryFormSchema = EncounterEntrySchema.extend({
  minLevel: levelInputSchema.nullable(),
  maxLevel: levelInputSchema.nullable(),
});

export interface LevelFormIssue {
  path: (string | number)[];
  message: string;
}

type LevelValues = Pick<EncounterTable, "minLevel" | "maxLevel"> & {
  entries: readonly Pick<EncounterEntry, "minLevel" | "maxLevel">[];
};

const isLevel = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * Cross-field range problems in the table form (the per-field 1..100 checks
 * live in `levelInputSchema`). Paths point at the field to mark.
 */
export function levelRangeFormIssues(values: LevelValues): LevelFormIssue[] {
  const issues: LevelFormIssue[] = [];
  if (isLevel(values.minLevel) && isLevel(values.maxLevel) && values.minLevel > values.maxLevel) {
    issues.push({ path: ["maxLevel"], message: "Max level must be at least the min level" });
  }
  values.entries.forEach((e, i) => {
    if ((e.minLevel === null) !== (e.maxLevel === null)) {
      issues.push({ path: ["entries", i, e.minLevel === null ? "minLevel" : "maxLevel"], message: "Set both override levels or neither" });
    } else if (isLevel(e.minLevel) && isLevel(e.maxLevel) && e.minLevel > e.maxLevel) {
      issues.push({ path: ["entries", i, "maxLevel"], message: "Max level must be at least the min level" });
    }
  });
  return issues;
}

/** Adds `levelRangeFormIssues` to a form schema (for `.superRefine`). */
export function refineLevelRanges(values: LevelValues, ctx: z.RefinementCtx) {
  for (const issue of levelRangeFormIssues(values)) ctx.addIssue({ code: "custom", ...issue });
}

/** The entry's level fields after switching "Override levels": on starts from the table's range, off is both null. */
export function overrideLevels(
  on: boolean,
  table: Pick<EncounterTable, "minLevel" | "maxLevel">,
): Pick<EncounterEntry, "minLevel" | "maxLevel"> {
  return on ? { minLevel: table.minLevel, maxLevel: table.maxLevel } : { minLevel: null, maxLevel: null };
}

export const hasLevelOverride = (e: Pick<EncounterEntry, "minLevel" | "maxLevel">) => e.minLevel !== null || e.maxLevel !== null;

/** "Lv 5" or "Lv 3-8". */
export function formatLevelRange(minLevel: number, maxLevel: number): string {
  return minLevel === maxLevel ? `Lv ${minLevel}` : `Lv ${minLevel}-${maxLevel}`;
}

/** Each distinct band once, lowest first: "Lv 2-6, Lv 5-12". "" for no bands. */
export function formatLevelBands(bands: readonly Pick<LevelBand, "minLevel" | "maxLevel">[]): string {
  const seen = new Map<string, { minLevel: number; maxLevel: number }>();
  for (const b of bands) seen.set(`${b.minLevel}:${b.maxLevel}`, { minLevel: b.minLevel, maxLevel: b.maxLevel });
  return [...seen.values()]
    .sort((a, b) => a.minLevel - b.minLevel || a.maxLevel - b.maxLevel)
    .map((b) => formatLevelRange(b.minLevel, b.maxLevel))
    .join(", ");
}

// ------------------------------------------------------------------ license requirement

/** Rank 1 is everyone, so a requirement can ask for 2 to 5. */
export const REQUIREMENT_RANKS: readonly number[] = Array.from({ length: LICENSE_MAX_RANK - 1 }, (_, i) => i + 2);
export const DEFAULT_REQUIREMENT_RANK = 2;

/** What the two selects show: category "" means None. */
export interface RequirementSelectValue {
  category: Category | "";
  rank: number;
}

export function requirementToSelect(req: LicenseRequirement | null | undefined): RequirementSelectValue {
  return req ? { category: req.category, rank: req.rank } : { category: "", rank: DEFAULT_REQUIREMENT_RANK };
}

/** The requirement for the selects' values; None (or an unknown category) is null, a bad rank falls back to 2. */
export function requirementFromSelect(category: string, rank: number | string): LicenseRequirement {
  if (!(CATEGORIES as readonly string[]).includes(category)) return null;
  const n = Number(rank);
  return { category: category as Category, rank: REQUIREMENT_RANKS.includes(n) ? n : DEFAULT_REQUIREMENT_RANK };
}

/** "Battle locked: needs Aquatic rank 3", or null for an open habitat. */
export function battleLockLabel(req: LicenseRequirement | null | undefined): string | null {
  return req ? `Battle locked: needs ${licenseRequirementLabel(req)}` : null;
}
