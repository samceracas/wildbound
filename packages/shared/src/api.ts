import { z } from "zod";
import { NEARBY_POI_DEFAULT_RADIUS_M, NEARBY_POI_MAX_RADIUS_M, PUBLICATION_STAGES } from "./constants.ts";
import { Latitude, Longitude } from "./geo.ts";
import {
  ConditionRulesSchema,
  CreatureDefinitionSchema,
  PoiTypeSchema,
  TimeOfDaySchema,
  UnlockConditionSchema,
  WeatherSchema,
  WorldDocumentSchema,
} from "./world.ts";

export const PublicationStageSchema = z.enum(PUBLICATION_STAGES);

// ---------------------------------------------------------------- validation

export const ENTITY_TYPES = ["world", "region", "habitat", "poi", "encounterTable"] as const;
export const EntityTypeSchema = z.enum(ENTITY_TYPES);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const ValidationIssueSchema = z.object({
  severity: z.enum(["error", "warning"]),
  code: z.string(),
  entityType: EntityTypeSchema,
  entityId: z.string().optional(),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const ValidationReportSchema = z.object({
  ok: z.boolean(),
  issues: z.array(ValidationIssueSchema),
});
export type ValidationReport = z.infer<typeof ValidationReportSchema>;

// ---------------------------------------------------------------- editor

export const WorldStatusSchema = z.object({
  draftUpdatedAt: z.string().nullable(),
  lastPublishedAt: z.string().nullable(),
  publishedVersion: z.number().int().nullable(),
  hasUnpublishedChanges: z.boolean(),
});
export type WorldStatus = z.infer<typeof WorldStatusSchema>;

export const EditorWorldResponseSchema = z.object({
  draft: WorldDocumentSchema,
  creatures: z.array(CreatureDefinitionSchema),
  status: WorldStatusSchema,
});
export type EditorWorldResponse = z.infer<typeof EditorWorldResponseSchema>;

export const SaveDraftResponseSchema = z.object({
  status: WorldStatusSchema,
  report: ValidationReportSchema,
});
export type SaveDraftResponse = z.infer<typeof SaveDraftResponseSchema>;

export const PublishResponseSchema = z.object({
  version: z.number().int(),
  publishedAt: z.string(),
  report: ValidationReportSchema,
});
export type PublishResponse = z.infer<typeof PublishResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  issues: z.array(ValidationIssueSchema).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// ---------------------------------------------------------------- published world

/**
 * Everything players currently get, in one payload. Public (no token).
 * The player web app uses it to draw the world; clients that only need
 * "what is at this coordinate" should call /api/world/resolve instead.
 */
export const PublishedWorldResponseSchema = z.object({
  /** null when nothing has been published yet. */
  version: z.number().int().nullable(),
  publishedAt: z.string().nullable(),
  /** Active regions only, with their habitats, POIs and active encounter tables. */
  world: WorldDocumentSchema,
  creatures: z.array(CreatureDefinitionSchema),
});
export type PublishedWorldResponse = z.infer<typeof PublishedWorldResponseSchema>;

// ---------------------------------------------------------------- resolve

export const ResolveQuerySchema = z.object({
  lat: z.coerce.number().pipe(Latitude),
  lng: z.coerce.number().pipe(Longitude),
  radius: z.coerce.number().int().min(1).max(NEARBY_POI_MAX_RADIUS_M).default(NEARBY_POI_DEFAULT_RADIUS_M),
  stage: PublicationStageSchema.default("published"),
  timeOfDay: TimeOfDaySchema.optional(),
  weather: WeatherSchema.optional(),
});
export type ResolveQuery = z.infer<typeof ResolveQuerySchema>;
export type ResolveQueryInput = z.input<typeof ResolveQuerySchema>;

export const ResolvedRegionSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  biomeTags: z.array(z.string()),
  storyStateRequirements: z.array(z.string()),
  unlockCondition: UnlockConditionSchema,
});

export const ResolvedHabitatSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  habitatTags: z.array(z.string()),
  conditionRules: ConditionRulesSchema,
  conditionsMet: z.boolean(),
});

export const ResolvedPoiSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  type: PoiTypeSchema,
  lat: z.number(),
  lng: z.number(),
  distanceMeters: z.number(),
  interactionId: z.string().nullable(),
  unlockCondition: UnlockConditionSchema,
});

export const ResolvedEncounterEntrySchema = z.object({
  creatureId: z.string(),
  creatureName: z.string(),
  weight: z.number(),
  conditions: ConditionRulesSchema,
  /** Entry conditions pass under the current environment. */
  available: z.boolean(),
  /** Share of this table's available weight (0 when unavailable). */
  probability: z.number(),
});

export const ResolvedEncounterTableSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: z.enum(["habitat", "region"]),
  conditionRules: ConditionRulesSchema,
  /** Table-level conditions pass under the current environment. */
  applicable: z.boolean(),
  entries: z.array(ResolvedEncounterEntrySchema),
});

export const AvailableWildkinSchema = z.object({
  creatureId: z.string(),
  name: z.string(),
  weight: z.number(),
  probability: z.number(),
});

export const WorldContextSchema = z.object({
  coordinate: z.object({ lat: z.number(), lng: z.number() }),
  stage: PublicationStageSchema,
  /** Published version the context came from (null for draft or nothing published). */
  version: z.number().int().nullable(),
  environment: z.object({
    timeOfDay: TimeOfDaySchema,
    weather: WeatherSchema,
    /** Region biome tags + habitat tags: the semantic hints for presentation. */
    tags: z.array(z.string()),
  }),
  region: ResolvedRegionSchema.nullable(),
  habitat: ResolvedHabitatSchema.nullable(),
  nearbyPois: z.array(ResolvedPoiSchema),
  encounterTables: z.array(ResolvedEncounterTableSchema),
  availableWildkin: z.array(AvailableWildkinSchema),
});
export type WorldContext = z.infer<typeof WorldContextSchema>;
export type ResolvedEncounterTable = z.infer<typeof ResolvedEncounterTableSchema>;
export type ResolvedPoi = z.infer<typeof ResolvedPoiSchema>;
export type AvailableWildkin = z.infer<typeof AvailableWildkinSchema>;
