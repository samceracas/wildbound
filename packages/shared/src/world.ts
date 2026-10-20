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

export const EncounterEntrySchema = z.object({
  id: IdSchema,
  creatureId: SlugSchema,
  weight: z.number().int().min(ENCOUNTER_WEIGHT_MIN).max(ENCOUNTER_WEIGHT_MAX),
  conditions: ConditionRulesSchema,
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
  entries: z.array(EncounterEntrySchema).max(64),
});
export type EncounterTable = z.infer<typeof EncounterTableSchema>;

/** The complete authorable world. Draft and published stages share this exact shape. */
export const WorldDocumentSchema = z.object({
  regions: z.array(WorldRegionSchema).max(200),
  habitats: z.array(HabitatSchema).max(2000),
  pois: z.array(PointOfInterestSchema).max(5000),
  encounterTables: z.array(EncounterTableSchema).max(2000),
});
export type WorldDocument = z.infer<typeof WorldDocumentSchema>;

export const EMPTY_WORLD: WorldDocument = { regions: [], habitats: [], pois: [], encounterTables: [] };
