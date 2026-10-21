import { z } from "zod";
import {
  ACTIVITY_PATTERNS,
  ENCOUNTER_WEIGHT_MAX,
  ENCOUNTER_WEIGHT_MIN,
  MOVEMENT_STYLES,
  POI_TYPES,
  RARITIES,
  TIME_OF_DAY,
  WEATHER,
} from "./constants.ts";
import { AreaGeometrySchema, PointSchema, PolygonSchema } from "./geo.ts";
import {
  AttackSchema,
  BaseStatsSchema,
  BodyTraitSchema,
  DEFAULT_GENE_POOL,
  GenePoolSchema,
  LEVEL_MAX,
  LEVEL_MIN,
  MAX_ATTACKS,
} from "./battle.ts";
import { CategoryOrTbdSchema, LicenseRequirementSchema } from "./research.ts";

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const SlugSchema = z
  .string()
  .min(1, "Slug is required")
  .max(64, "Slug must be 64 characters or fewer")
  .regex(SLUG_PATTERN, "Slug must be lowercase letters, numbers and single hyphens (e.g. forest-edge)");

/** Tags share slug rules so they stay stable identifiers for presentation rules. */
export const TagSchema = SlugSchema;
export const TagListSchema = z
  .array(TagSchema)
  .max(32)
  .refine((tags) => new Set(tags).size === tags.length, { message: "Tags must be unique" });

export const IdSchema = z.uuid();
export const NameSchema = z.string().trim().min(1, "Name is required").max(120);
export const DescriptionSchema = z.string().max(2000);

export const TimeOfDaySchema = z.enum(TIME_OF_DAY);
export const WeatherSchema = z.enum(WEATHER);
export const PoiTypeSchema = z.enum(POI_TYPES);

/**
 * Structured condition model. An empty list means "any".
 * Every non-empty list must contain the current value for the rule to pass.
 */
export const ConditionRulesSchema = z.object({
  timeOfDay: z.array(TimeOfDaySchema).max(TIME_OF_DAY.length),
  weather: z.array(WeatherSchema).max(WEATHER.length),
});
export type ConditionRules = z.infer<typeof ConditionRulesSchema>;
export const EMPTY_CONDITIONS: ConditionRules = { timeOfDay: [], weather: [] };

/** Gates content behind story flags. Not evaluated by the POC resolver (no player state yet). */
export const UnlockConditionSchema = z
  .object({ requiredFlags: z.array(SlugSchema).max(32) })
  .nullable();
export type UnlockCondition = z.infer<typeof UnlockConditionSchema>;

export const RaritySchema = z.enum(RARITIES);
export const ActivityPatternSchema = z.enum(ACTIVITY_PATTERNS);

/**
 * Multipliers applied to an encounter weight under the current environment.
 * Missing keys mean 1 (no change). 0 means "never spawns in this condition".
 * Example: { weather: { rain: 1.5, storm: 0 }, timeOfDay: { night: 2 } }
 */
export const SpawnModifiersSchema = z.object({
  weather: z.partialRecord(WeatherSchema, z.number().min(0).max(10)).default({}),
  timeOfDay: z.partialRecord(TimeOfDaySchema, z.number().min(0).max(10)).default({}),
});
export type SpawnModifiers = z.infer<typeof SpawnModifiersSchema>;

/** A battle/field skill. Revealed in the Registry only after a capture. */
export const CreatureSkillSchema = z.object({
  name: NameSchema,
  description: DescriptionSchema,
  /** "proposed" until the Wildkin Bible approves it (see documents/). */
  canon: z.enum(["established", "proposed"]),
});
export type CreatureSkill = z.infer<typeof CreatureSkillSchema>;

export const CreatureDefinitionSchema = z.object({
  id: SlugSchema,
  /** Registry number ("No. 001"). */
  registryNumber: z.number().int().positive(),
  name: NameSchema,
  description: DescriptionSchema,
  habitatAffinity: TagListSchema,
  /** Human-readable habitat line for the Registry. */
  habitatSummary: DescriptionSchema.default(""),
  rarity: RaritySchema.default("common"),
  activityPattern: ActivityPatternSchema.default("TBD"),
  spawnModifiers: SpawnModifiersSchema.default({ weather: {}, timeOfDay: {} }),
  skills: z.array(CreatureSkillSchema).max(8).default([]),
  /** How spawns of this species wander on the radar. */
  movementStyle: z.enum(MOVEMENT_STYLES).default("forager"),
  /** Which Field Registry license covers it. */
  category: CategoryOrTbdSchema.default("TBD"),
  /** Anatomy that resists or is vulnerable to attack approaches (1 or 2 once published). */
  bodyTraits: z.array(BodyTraitSchema).max(2).default([]),
  /** Stat shape summing to STAT_BUDGET; null = not authored yet. */
  baseStats: BaseStatsSchema.nullable().default(null),
  /** Placeholder attacks (v0.3.0), replaced by the 0.4.0 skill system. */
  attacks: z.array(AttackSchema).max(MAX_ATTACKS).default([]),
  genePool: GenePoolSchema.default(DEFAULT_GENE_POOL),
});
export type CreatureDefinition = z.infer<typeof CreatureDefinitionSchema>;

export const WorldRegionSchema = z.object({
  id: IdSchema,
  slug: SlugSchema,
  name: NameSchema,
  description: DescriptionSchema,
  geometry: AreaGeometrySchema,
  biomeTags: TagListSchema,
  unlockCondition: UnlockConditionSchema,
  storyStateRequirements: z.array(SlugSchema).max(32),
  active: z.boolean(),
});
export type WorldRegion = z.infer<typeof WorldRegionSchema>;

export const HabitatSchema = z.object({
  id: IdSchema,
  regionId: IdSchema,
  slug: SlugSchema,
  name: NameSchema,
  description: DescriptionSchema,
  geometry: PolygonSchema,
  habitatTags: TagListSchema,
  conditionRules: ConditionRulesSchema,
  /** Battle and capture need this license rank (observing is always allowed). null = open to everyone. */
  licenseRequirement: LicenseRequirementSchema.default(null),
});
export type Habitat = z.infer<typeof HabitatSchema>;

export const PointOfInterestSchema = z.object({
  id: IdSchema,
  regionId: IdSchema,
  slug: SlugSchema,
  name: NameSchema,
  description: DescriptionSchema,
  type: PoiTypeSchema,
  location: PointSchema,
  interactionId: SlugSchema.nullable(),
  unlockCondition: UnlockConditionSchema,
});
export type PointOfInterest = z.infer<typeof PointOfInterestSchema>;

const WildLevelSchema = z.number().int().min(LEVEL_MIN).max(LEVEL_MAX);
/** Default level range for new encounter tables (and older drafts without one). */
export const DEFAULT_WILD_LEVELS = { minLevel: 1, maxLevel: 10 } as const;

export const EncounterEntrySchema = z.object({
  id: IdSchema,
  creatureId: SlugSchema,
  weight: z.number().int().min(ENCOUNTER_WEIGHT_MIN).max(ENCOUNTER_WEIGHT_MAX),
  conditions: ConditionRulesSchema,
  /** Level override for this entry: both set, or both null (= the table's range). */
  minLevel: WildLevelSchema.nullable().default(null),
  maxLevel: WildLevelSchema.nullable().default(null),
});
export type EncounterEntry = z.infer<typeof EncounterEntrySchema>;

export const EncounterTableSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  regionId: IdSchema,
  /** null = applies to the whole region; otherwise scoped to one habitat. */
  habitatId: IdSchema.nullable(),
  conditionRules: ConditionRulesSchema,
  active: z.boolean(),
  /** Wild level range for the table's entries (entries may override it). */
  minLevel: WildLevelSchema.default(DEFAULT_WILD_LEVELS.minLevel),
  maxLevel: WildLevelSchema.default(DEFAULT_WILD_LEVELS.maxLevel),
  entries: z.array(EncounterEntrySchema).max(64),
});
export type EncounterTable = z.infer<typeof EncounterTableSchema>;

/**
 * Level range problems that make a world invalid (they block saving). Each
 * message names the table; `code` is "invalid-level-range".
 */
export function levelRangeProblems(t: Pick<EncounterTable, "name" | "minLevel" | "maxLevel" | "entries">): string[] {
  const problems: string[] = [];
  if (t.minLevel > t.maxLevel) problems.push(`Encounter table "${t.name}": the lowest wild level is above the highest`);
  t.entries.forEach((e, i) => {
    if ((e.minLevel === null) !== (e.maxLevel === null)) {
      problems.push(`Encounter table "${t.name}", entry ${i + 1}: set both override levels or neither`);
    } else if (e.minLevel !== null && e.maxLevel !== null && e.minLevel > e.maxLevel) {
      problems.push(`Encounter table "${t.name}", entry ${i + 1}: the lowest override level is above the highest`);
    }
  });
  return problems;
}

/** The complete authorable world. Draft and published stages share this exact shape. */
export const WorldDocumentSchema = z
  .object({
    regions: z.array(WorldRegionSchema).max(200),
    habitats: z.array(HabitatSchema).max(2000),
    pois: z.array(PointOfInterestSchema).max(5000),
    encounterTables: z.array(EncounterTableSchema).max(2000),
  })
  .superRefine((doc, ctx) => {
    doc.encounterTables.forEach((t, i) => {
      for (const message of levelRangeProblems(t)) {
        ctx.addIssue({ code: "custom", message, path: ["encounterTables", i], params: { code: "invalid-level-range" } });
      }
    });
  });
export type WorldDocument = z.infer<typeof WorldDocumentSchema>;

export const EMPTY_WORLD: WorldDocument = { regions: [], habitats: [], pois: [], encounterTables: [] };
