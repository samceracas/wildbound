import { z } from "zod";
import {
  AttackSchema,
  BaseStatsSchema,
  BodyTraitSchema,
  DEFAULT_GENE_POOL,
  GenePoolSchema,
  MAX_ATTACKS,
  STAT_BUDGET,
  statTotal,
} from "./battle.ts";
import { MOVEMENT_STYLES } from "./constants.ts";
import { CategoryOrTbdSchema } from "./research.ts";
import {
  ActivityPatternSchema,
  CreatureSkillSchema,
  NameSchema,
  RaritySchema,
  SlugSchema,
  SpawnModifiersSchema,
  TagListSchema,
} from "./world.ts";

/**
 * Wildkin encyclopedia (Creature Manager contract).
 *
 * A `WildkinEntry` is the Wildkin Bible entry for one species: prose for people
 * (identity, physical description, ecology, open questions…) plus the explicit
 * fields the game needs. Publishing an entry copies its game fields into the
 * `creatures` table (CreatureDefinition), which is what the editor and the game
 * read. The prose never reaches the game engine (Bible §8).
 */

export const MovementStyleSchema = z.enum(MOVEMENT_STYLES);
export type MovementStyle = z.infer<typeof MovementStyleSchema>;

export const WILDKIN_ENTRY_STATUSES = ["draft", "published"] as const;
export const WildkinEntryStatusSchema = z.enum(WILDKIN_ENTRY_STATUSES);
export type WildkinEntryStatus = z.infer<typeof WildkinEntryStatusSchema>;

export const ART_KINDS = ["icon", "sprite"] as const;
export const ArtKindSchema = z.enum(ART_KINDS);
export type ArtKind = z.infer<typeof ArtKindSchema>;

/** Pixel sizes of generated art (match the hand-made art in apps/web/public/wildkin). */
export const ART_SIZES: Record<ArtKind, number> = { icon: 64, sprite: 128 };

const Prose = z.string().max(4000);
const Line = z.string().max(400);
const FreeTagList = z.array(z.string().trim().min(1).max(60)).max(24);

/** Everything an author edits. Defaults make a mostly-empty draft valid. */
export const WildkinEntryInputSchema = z.object({
  /** Canonical ID (Bible "Canonical ID"); becomes the creature id. Cannot change after creation. */
  id: SlugSchema,
  registryNumber: z.number().int().positive().max(9999),
  name: NameSchema,
  /** Header line, e.g. "Canopy Bird Wildkin". */
  classification: Line.default(""),
  /** Canon status summary: what is ESTABLISHED vs PROPOSED/TBD. */
  canonStatus: Prose.default(""),
  /** One-line identity (encyclopedia). */
  identity: Prose.default(""),
  /**
   * What players read in the in-game Registry after observing this Wildkin
   * (creatures.description). Written in the game's field-research voice.
   */
  registryDescription: z.string().max(2000).default(""),
  inspiration: Prose.default(""),
  /** Free-form habitat and distribution prose. */
  habitat: Prose.default(""),
  /** Habitat tags (slugs) used by the game (`habitatAffinity`). */
  habitatTags: TagListSchema.default([]),
  /** Short habitat line for the in-game Registry. */
  habitatSummary: Line.default(""),
  diet: Prose.default(""),
  dietTags: FreeTagList.default([]),
  activityPattern: ActivityPatternSchema.default("TBD"),
  activityNotes: Prose.default(""),
  temperament: Prose.default(""),
  temperamentTags: FreeTagList.default([]),
  rarity: RaritySchema.default("TBD"),
  rarityNotes: Prose.default(""),
  /** Gameplay / narrative role. */
  role: Prose.default(""),
  physicalDescription: Prose.default(""),
  visualHook: Line.default(""),
  visualDesignNotes: Prose.default(""),
  behavior: Prose.default(""),
  /** How the Wildkin wanders on the radar. */
  movementStyle: MovementStyleSchema.default("forager"),
  ecology: Prose.default(""),
  fieldSigns: Prose.default(""),
  gameplayProfile: Prose.default(""),
  assetNeeds: Prose.default(""),
  openQuestions: z.array(z.string().trim().min(1).max(400)).max(24).default([]),
  spawnModifiers: SpawnModifiersSchema.default({ weather: {}, timeOfDay: {} }),
  skills: z.array(CreatureSkillSchema).max(8).default([]),
  // ---- battle & genetics (v0.3.0)
  /** Which Field Registry license covers it. Required (not TBD) to publish. */
  category: CategoryOrTbdSchema.default("TBD"),
  /** 1 to 2 body traits once published. */
  bodyTraits: z
    .array(BodyTraitSchema)
    .max(2, "At most 2 body traits")
    .refine((t) => new Set(t).size === t.length, "Body traits must be different")
    .default([]),
  /** Stat shape; the four values must sum to exactly STAT_BUDGET (300). */
  baseStats: BaseStatsSchema.nullable().default(null),
  /** Placeholder attacks (replaced by the 0.4.0 skill system). */
  attacks: z.array(AttackSchema).max(MAX_ATTACKS, `At most ${MAX_ATTACKS} attacks`).default([]),
  genePool: GenePoolSchema.default(DEFAULT_GENE_POOL),
});
export type WildkinEntryInput = z.input<typeof WildkinEntryInputSchema>;
export type WildkinEntryData = z.infer<typeof WildkinEntryInputSchema>;

export const WildkinArtInfoSchema = z.object({
  icon: z.boolean(),
  sprite: z.boolean(),
  /** Changes whenever art is regenerated; append to image URLs to bust caches. */
  version: z.string().nullable(),
});
export type WildkinArtInfo = z.infer<typeof WildkinArtInfoSchema>;

export const WildkinEntrySchema = WildkinEntryInputSchema.extend({
  status: WildkinEntryStatusSchema,
  /** Edited after the last publish (the game still has the older version). */
  hasUnpublishedChanges: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  art: WildkinArtInfoSchema,
});
export type WildkinEntry = z.infer<typeof WildkinEntrySchema>;

export const WildkinSummarySchema = WildkinEntrySchema.pick({
  id: true,
  registryNumber: true,
  name: true,
  classification: true,
  rarity: true,
  status: true,
  hasUnpublishedChanges: true,
  updatedAt: true,
  publishedAt: true,
  deletedAt: true,
  art: true,
});
export type WildkinSummary = z.infer<typeof WildkinSummarySchema>;

export const WildkinListResponseSchema = z.object({ wildkin: z.array(WildkinSummarySchema) });
export type WildkinListResponse = z.infer<typeof WildkinListResponseSchema>;

export const WildkinStatsSchema = z.object({
  /** Not deleted. */
  total: z.number().int(),
  published: z.number().int(),
  /** Never published. */
  drafts: z.number().int(),
  /** Published, but edited since. */
  unpublishedChanges: z.number().int(),
  deleted: z.number().int(),
  withArt: z.number().int(),
  /** Published species with category, body traits, stats and attacks. */
  battleReady: z.number().int(),
  byRarity: z.record(z.string(), z.number().int()),
  nextRegistryNumber: z.number().int(),
});
export type WildkinStats = z.infer<typeof WildkinStatsSchema>;

/** Text fields the publish step insists on (the rest may stay empty / TBD). */
export const PUBLISH_REQUIRED_FIELDS = ["name", "registryDescription", "habitatSummary"] as const;

/**
 * Battle fields a species needs before it can reach the game (v0.3.0). Each
 * returns a message when the field is not ready, else null.
 */
export const PUBLISH_BATTLE_CHECKS: { field: keyof WildkinEntryData; problem: (d: WildkinEntryData) => string | null }[] = [
  { field: "category", problem: (d) => (d.category === "TBD" ? "Choose a category before publishing" : null) },
  { field: "bodyTraits", problem: (d) => (d.bodyTraits.length === 0 ? "Add at least one body trait before publishing" : null) },
  {
    field: "baseStats",
    problem: (d) =>
      d.baseStats === null
        ? "Set the base stats before publishing"
        : statTotal(d.baseStats) !== STAT_BUDGET
          ? `Base stats must add up to exactly ${STAT_BUDGET}`
          : null,
  },
  { field: "attacks", problem: (d) => (d.attacks.length === 0 ? "Add at least one placeholder attack before publishing" : null) },
];

/** Ready for battle: the checks above all pass. */
export const isBattleReady = (d: WildkinEntryData) => PUBLISH_BATTLE_CHECKS.every((c) => c.problem(d) === null);

/**
 * Entry fields that publishing copies into the game (the `creatures` table).
 * Everything else is encyclopedia-only (Bible prose for people and for the AI/art prompts).
 */
export const GAME_FIELDS = [
  "id",
  "registryNumber",
  "name",
  "registryDescription",
  "habitatTags",
  "habitatSummary",
  "rarity",
  "activityPattern",
  "movementStyle",
  "spawnModifiers",
  "skills",
  "category",
  "bodyTraits",
  "baseStats",
  "attacks",
  "genePool",
] as const satisfies readonly (keyof WildkinEntryData)[];
export type GameField = (typeof GAME_FIELDS)[number];

/** Everything a permanent delete also removes (GET /api/manager/wildkin/:id/usage). */
export const WildkinUsageSchema = z.object({
  /** Encounter-table entries listing this species, per world stage. */
  encounterEntries: z.object({ draft: z.number().int(), published: z.number().int() }),
  /** Individuals players have captured. */
  capturedWildkin: z.number().int(),
  /** Players' Registry records of this species. */
  registryEntries: z.number().int(),
  activeSpawns: z.number().int(),
});
export type WildkinUsage = z.infer<typeof WildkinUsageSchema>;

// ---------------------------------------------------------------- AI assistant

/**
 * The fields the assistant may fill. Every field is optional and has no default
 * (a missing field must stay missing, or it would overwrite the form); invalid
 * ones are dropped by the API.
 */
const { registryNumber: _registryNumber, ...suggestionShape } = WildkinEntryInputSchema.shape;
export const WildkinSuggestionSchema = z.object(
  Object.fromEntries(
    Object.entries(suggestionShape).map(([key, field]) => [key, (field instanceof z.ZodDefault ? field.unwrap() : field).optional()]),
  ) as { [K in keyof typeof suggestionShape]: z.ZodOptional<UnwrapDefault<(typeof suggestionShape)[K]>> },
);
type UnwrapDefault<T> = T extends z.ZodDefault<infer Inner> ? Inner : T;
export type WildkinSuggestion = z.infer<typeof WildkinSuggestionSchema>;

export const AssistRequestSchema = z.object({
  /** The author's general idea, e.g. "a shy moth that pollinates night-blooming vines by the creek". */
  prompt: z.string().trim().min(3, "Describe the idea in a few words").max(2000),
  /**
   * Current form values, so the assistant can refine rather than start over.
   * Loose on purpose: a half-filled form (empty id, unfinished tags) is still useful context.
   */
  current: z.record(z.string(), z.unknown()).optional(),
});
export type AssistRequest = z.infer<typeof AssistRequestSchema>;

export const AssistResponseSchema = z.object({
  suggestion: WildkinSuggestionSchema,
  /** Assistant notes: canon conflicts, overlaps with existing Wildkin, labelled proposals. */
  notes: z.array(z.string()),
  /** Field names the API dropped because they did not validate. */
  dropped: z.array(z.string()),
  model: z.string(),
});
export type AssistResponse = z.infer<typeof AssistResponseSchema>;

// ---------------------------------------------------------------- art (PixelLab)

export const ArtBalanceSchema = z.object({
  /** Remaining subscription generations, if the account has a subscription. */
  generations: z.number().nullable(),
  /** Remaining USD credits. */
  usd: z.number().nullable(),
});
export type ArtBalance = z.infer<typeof ArtBalanceSchema>;

export const GenerateArtRequestSchema = z.object({
  kinds: z.array(ArtKindSchema).min(1).max(2).default(["icon", "sprite"]),
  /** Optional extra direction appended to the prompt built from the entry. */
  extraPrompt: z.string().trim().max(500).optional(),
});
export type GenerateArtRequest = z.input<typeof GenerateArtRequestSchema>;

export const GenerateArtResponseSchema = z.object({
  art: WildkinArtInfoSchema,
  generated: z.array(ArtKindSchema),
  balanceBefore: ArtBalanceSchema,
  balanceAfter: ArtBalanceSchema.nullable(),
  /** The prompts sent to PixelLab, for transparency. */
  prompts: z.record(z.string(), z.string()),
});
export type GenerateArtResponse = z.infer<typeof GenerateArtResponseSchema>;

export const ManagerConfigSchema = z.object({
  assistant: z.object({ enabled: z.boolean(), model: z.string().nullable() }),
  art: z.object({ enabled: z.boolean(), model: z.string() }),
});
export type ManagerConfig = z.infer<typeof ManagerConfigSchema>;

/** Public URL of a Wildkin's art (served by the API from the database; any non-deleted entry). */
export const wildkinArtPath = (id: string, kind: ArtKind, version?: string | null) =>
  `/api/art/wildkin/${id}/${kind}.png${version ? `?v=${encodeURIComponent(version)}` : ""}`;
