import { z } from "zod";

/**
 * Field Registry licenses (v0.3.0). One license per Wildkin category, ranks 1
 * to 5. The rank sets the obedience cap, unlocks license-locked habitats and
 * decides how much the scanner shows. Researcher EXP comes from learning
 * (observing, recording, exploring), never from battling.
 */

// ---------------------------------------------------------------- categories

export const CATEGORIES = ["aerial", "aquatic", "terrestrial", "verdant"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CategorySchema = z.enum(CATEGORIES);
/** A species' category; "TBD" until authored (cannot be published). */
export const CategoryOrTbdSchema = z.enum([...CATEGORIES, "TBD"]);
export type CategoryOrTbd = z.infer<typeof CategoryOrTbdSchema>;

export const CATEGORY_NAMES: Record<Category, string> = {
  aerial: "Aerial",
  aquatic: "Aquatic",
  terrestrial: "Terrestrial",
  verdant: "Verdant",
};

/** The category capsule for each category (+categoryCapsuleBonus on a match). */
export const CATEGORY_CAPSULES = {
  aerial: "canopy-capsule",
  aquatic: "current-capsule",
  terrestrial: "burrow-capsule",
  verdant: "bloom-capsule",
} as const satisfies Record<Category, string>;

// ---------------------------------------------------------------- ranks

export const LICENSE_MIN_RANK = 1;
export const LICENSE_MAX_RANK = 5;
export const LicenseRankSchema = z.number().int().min(LICENSE_MIN_RANK).max(LICENSE_MAX_RANK);

export const RESEARCH_RULES = {
  /** Obedience cap = rank x levelsPerRank (20, 40, 60, 80, 100). */
  levelsPerRank: 20,
  /** Cumulative researcher EXP needed to take the assessment for each rank. */
  rankThresholds: { 2: 600, 3: 2000, 4: 5000, 5: 12000 } as Record<number, number>,
  firstObservation: 100,
  repeatObservation: 10,
  repeatObservationsPerSpeciesPerDay: 5,
  firstCapture: 150,
  repeatCapture: 20,
  conditionRecord: 30,
  matchupRecord: 50,
  phenotypeRecord: 40,
  markingRecord: 200,
  habitatFirstVisit: 50,
  habitatDailyVisit: 10,
  /** Rank-up grants: this many category capsules of the license's category... */
  grantCategoryCapsules: 5,
  /** ...and this many Field Capsules. */
  grantFieldCapsules: 3,
} as const;

export const obedienceCap = (rank: number) => rank * RESEARCH_RULES.levelsPerRank;
/** The license rank whose cap covers `level` (1 for levels 1..20, 2 for 21..40, ...). */
export const rankForLevel = (level: number) =>
  Math.min(LICENSE_MAX_RANK, Math.max(LICENSE_MIN_RANK, Math.ceil(level / RESEARCH_RULES.levelsPerRank)));

/** Researcher EXP sources (exp_events.source on the researcher track). */
export const RESEARCHER_EXP_SOURCES = [
  "first-observation",
  "repeat-observation",
  "first-capture",
  "repeat-capture",
  "condition-record",
  "matchup-record",
  "phenotype-record",
  "habitat-first-visit",
  "habitat-daily-visit",
] as const;
export type ResearcherExpSource = (typeof RESEARCHER_EXP_SOURCES)[number];

export const EXP_TRACKS = ["wildkin", "researcher"] as const;
export type ExpTrack = (typeof EXP_TRACKS)[number];

/** Phenotypes the Registry records (observing or capturing a species showing them). */
export const PHENOTYPE_RECORD_TRAITS = ["small", "large", "bold", "wary", "marking"] as const;
export type PhenotypeRecordTrait = (typeof PHENOTYPE_RECORD_TRAITS)[number];

export const CONDITION_KINDS = ["time_of_day", "weather"] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];

// ---------------------------------------------------------------- scanner depth

/** Lowest license rank (in the Wildkin's category) at which each detail is shown. */
export const SCANNER_DEPTH = {
  /** Always: level, HP, category, body traits, shape descriptors, Build, marking variant. */
  build: 1,
  temperament: 2,
  grades: 2,
  vigor: 3,
  genotype: 4,
} as const;
export type ScannerDetail = keyof typeof SCANNER_DEPTH;
export const scannerShows = (detail: ScannerDetail, rank: number) => rank >= SCANNER_DEPTH[detail];

// ---------------------------------------------------------------- license-locked habitats

export const LicenseRequirementSchema = z
  .object({
    category: CategorySchema,
    /** Rank 1 is everyone, so a requirement starts at 2. */
    rank: z.number().int().min(2).max(LICENSE_MAX_RANK),
  })
  .nullable();
export type LicenseRequirement = z.infer<typeof LicenseRequirementSchema>;

export const licenseRequirementLabel = (r: NonNullable<LicenseRequirement>) => `${CATEGORY_NAMES[r.category]} rank ${r.rank}`;

// ---------------------------------------------------------------- assessments

export const ASSESSMENT_REQUIREMENT_TYPES = [
  "observeDistinctSpecies",
  "observeTimesOfDay",
  "observeWeathers",
  "captureCount",
  "winBattles",
  "recordMatchups",
  "recordPhenotypes",
  "visitHabitats",
] as const;
export type AssessmentRequirementType = (typeof ASSESSMENT_REQUIREMENT_TYPES)[number];

/** Label template per requirement type; {n} is the (clamped) count. */
export const ASSESSMENT_REQUIREMENT_LABELS: Record<AssessmentRequirementType, string> = {
  observeDistinctSpecies: "Observe {n} different species",
  observeTimesOfDay: "Observe at {n} different times of day",
  observeWeathers: "Observe in {n} different weathers",
  captureCount: "Capture {n} Wildkin",
  winBattles: "Win {n} wild battles",
  recordMatchups: "Record {n} matchups",
  recordPhenotypes: "Record {n} individual traits",
  visitHabitats: "Visit {n} habitats where they live",
};

export interface AssessmentRequirement {
  type: AssessmentRequirementType;
  count: number;
}

/**
 * The checklist for reaching each rank, as data (never bespoke code per
 * assessment). The same template applies to every category in 0.3.0. Every
 * count is clamped to what the current world makes achievable.
 */
export const ASSESSMENTS: Record<2 | 3 | 4 | 5, AssessmentRequirement[]> = {
  2: [
    { type: "observeDistinctSpecies", count: 2 },
    { type: "observeTimesOfDay", count: 2 },
    { type: "captureCount", count: 1 },
  ],
  3: [
    { type: "recordMatchups", count: 2 },
    { type: "observeWeathers", count: 3 },
    { type: "winBattles", count: 5 },
    { type: "captureCount", count: 3 },
  ],
  4: [
    { type: "recordPhenotypes", count: 2 },
    { type: "observeTimesOfDay", count: 4 },
    { type: "winBattles", count: 15 },
    { type: "visitHabitats", count: 3 },
  ],
  5: [
    { type: "recordMatchups", count: 4 },
    { type: "recordPhenotypes", count: 4 },
    { type: "observeWeathers", count: 5 },
    { type: "winBattles", count: 30 },
    { type: "captureCount", count: 10 },
  ],
};

export const assessmentFor = (targetRank: number): AssessmentRequirement[] | null =>
  targetRank >= 2 && targetRank <= LICENSE_MAX_RANK ? ASSESSMENTS[targetRank as 2 | 3 | 4 | 5] : null;

// ---------------------------------------------------------------- views

export const RequirementProgressSchema = z.object({
  type: z.enum(ASSESSMENT_REQUIREMENT_TYPES),
  label: z.string(),
  /** After clamping to what the world allows. */
  required: z.number().int(),
  current: z.number().int(),
  met: z.boolean(),
});
export type RequirementProgress = z.infer<typeof RequirementProgressSchema>;

export const LicenseViewSchema = z.object({
  category: CategorySchema,
  name: z.string(),
  rank: LicenseRankSchema,
  obedienceCap: z.number().int(),
  exp: z.number().int(),
  /** Researcher EXP for the next rank's assessment; null at max rank. */
  nextThreshold: z.number().int().nullable(),
  /** The previous threshold (bar start). */
  currentThreshold: z.number().int(),
  nextRank: z.number().int().nullable(),
  requirements: z.array(RequirementProgressSchema),
  expMet: z.boolean(),
  checklistMet: z.boolean(),
  /** A field station is within reach of the server-side position. */
  atStation: z.boolean(),
  canTakeAssessment: z.boolean(),
  /** Why not, when it cannot be taken. */
  blockedReason: z.string().nullable(),
});
export type LicenseView = z.infer<typeof LicenseViewSchema>;

export const LicensesResponseSchema = z.object({
  licenses: z.array(LicenseViewSchema),
  /** The nearest field station in range, if any. */
  station: z.object({ id: z.string(), name: z.string() }).nullable(),
});
export type LicensesResponse = z.infer<typeof LicensesResponseSchema>;

export const AssessmentResponseSchema = z.object({
  license: LicenseViewSchema,
  /** Human-readable results: "3 Wildkin are no longer restless", items granted, ... */
  summary: z.array(z.string()),
  granted: z.array(z.object({ itemId: z.string(), quantity: z.number().int() })),
});
export type AssessmentResponse = z.infer<typeof AssessmentResponseSchema>;
