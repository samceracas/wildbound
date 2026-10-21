import { z } from "zod";
import {
  AttackViewSchema,
  BodyTraitSchema,
  MATCHUP_EFFECTS,
  ApproachSchema,
} from "./battle.ts";
import { POI_TYPES } from "./constants.ts";
import { Latitude, Longitude } from "./geo.ts";
import { CategoryOrTbdSchema, CategorySchema, LicenseRequirementSchema } from "./research.ts";
import {
  ActivityPatternSchema,
  CreatureSkillSchema,
  NameSchema,
  RaritySchema,
  TimeOfDaySchema,
  WeatherSchema,
} from "./world.ts";

/**
 * Player-facing game contract: login, position reports, spawns, Registry,
 * inventory and party. The server is authoritative for all of it; clients
 * only ever report where they are and ask to act on spawns they were given.
 */

// ---------------------------------------------------------------- rules

export const GAME_RULES = {
  /** Spawns are placed within this distance of the player's server-side position. */
  spawnRadiusM: 120,
  /** Observe, battle, POI pickups, vets and assessments require being within this distance. */
  interactRadiusM: 60,
  /** POIs within this distance are listed on the radar. */
  poiRadiusM: 300,
  /** Upper bound of simultaneously active spawns per player. */
  maxActiveSpawns: 6,
  /** How long a spawn stays before it wanders off. */
  spawnTtlMs: 10 * 60 * 1000,
  /** Spawns take one wandering step per interval (see wanderStep in @wildbound/world). */
  spawnWanderStepMs: 10 * 1000,
  /** Most wandering steps applied at once (after the player was away for a while). */
  spawnWanderMaxSteps: 6,
  /** Fastest plausible movement between two reports (~144 km/h, allows vehicles). */
  maxSpeedMps: 40,
  /** Reports worse than this are ignored (not accepted, not flagged). */
  maxAccuracyM: 200,
  /** Distance slack that is always allowed regardless of time (GPS jitter). */
  jitterSlackM: 25,
  /** Implausible jumps in a row before the player is locked out. */
  strikesBeforeLock: 3,
  /** Lockout duration after too many implausible jumps. */
  lockMs: 2 * 60 * 1000,
  /** Positions older than this no longer count as "currently here". */
  positionStaleMs: 2 * 60 * 1000,
  /** Session lifetime. */
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
} as const;

// ---------------------------------------------------------------- items

export const ITEMS = {
  "field-capsule": {
    name: "Field Capsule",
    description: "A padded, breathable carrier for safely bringing a weakened Wildkin along. Used up on each capture attempt.",
    category: "capture",
  },
  "canopy-capsule": {
    name: "Canopy Capsule",
    description: "Lined with leaf mesh and perch bars. Aerial Wildkin settle into it more readily. Used up on each attempt.",
    category: "capture",
  },
  "current-capsule": {
    name: "Current Capsule",
    description: "A damp, cool chamber that feels like shaded water. Aquatic Wildkin settle into it more readily. Used up on each attempt.",
    category: "capture",
  },
  "burrow-capsule": {
    name: "Burrow Capsule",
    description: "Dark and packed with soft litter, like a den under the roots. Terrestrial Wildkin settle into it more readily. Used up on each attempt.",
    category: "capture",
  },
  "bloom-capsule": {
    name: "Bloom Capsule",
    description: "Bright, airy and warm, with a little soil at the base. Verdant Wildkin settle into it more readily. Used up on each attempt.",
    category: "capture",
  },
  "trail-ration": {
    name: "Trail Ration",
    description: "Dried fruit and seeds. Restores a quarter of a Wildkin's strength, in a bout or on the trail.",
    category: "field",
  },
  "field-notebook": {
    name: "Field Notebook",
    description: "Your research ledger. Every observation is recorded here.",
    category: "key",
  },
} as const;
export type ItemId = keyof typeof ITEMS;
export const ItemIdSchema = z.enum(Object.keys(ITEMS) as [ItemId, ...ItemId[]]);

/** Most of one item a player can carry; pickups and grants above it are truncated. */
export const ITEM_STACK_MAX = 30;

/** What a brand-new player starts with. */
export const STARTER_INVENTORY: Partial<Record<ItemId, number>> = {
  "field-capsule": 10,
  "trail-ration": 3,
  "field-notebook": 1,
};

// ---------------------------------------------------------------- auth

export const UsernameSchema = z
  .string()
  .trim()
  .min(3, "Use at least 3 characters")
  .max(20, "Use 20 characters or fewer")
  .regex(/^[A-Za-z0-9_]+$/, "Letters, numbers and underscores only");

export const LoginRequestSchema = z.object({ username: UsernameSchema });
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const PlayerSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
});
export type Player = z.infer<typeof PlayerSchema>;

export const MeResponseSchema = z.object({ player: PlayerSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;

// ---------------------------------------------------------------- position

/** One browser geolocation fix. `clientTime` is informational only; the server uses its own clock. */
export const PositionReportSchema = z.object({
  lat: Latitude,
  lng: Longitude,
  accuracy: z.number().min(0).max(100_000),
  clientTime: z.number().int().optional(),
  /** Browser IANA time zone; used only when the weather service cannot supply one. */
  timeZone: z.string().max(64).optional(),
});
export type PositionReport = z.infer<typeof PositionReportSchema>;

export const MOVEMENT_VERDICTS = ["accepted", "first-fix", "low-accuracy", "too-fast", "locked"] as const;
export const MovementVerdictSchema = z.enum(MOVEMENT_VERDICTS);
export type MovementVerdict = z.infer<typeof MovementVerdictSchema>;

export const PositionResponseSchema = z.object({
  verdict: MovementVerdictSchema,
  /** Where the server believes the player is (unchanged when the report was rejected). */
  position: z.object({ lat: z.number(), lng: z.number(), accuracyM: z.number(), recordedAt: z.string() }).nullable(),
  lockedUntil: z.string().nullable(),
});
export type PositionResponse = z.infer<typeof PositionResponseSchema>;

// ---------------------------------------------------------------- environment + spawns

export const GameEnvironmentSchema = z.object({
  timeOfDay: TimeOfDaySchema,
  weather: WeatherSchema,
  /** IANA zone used for timeOfDay. */
  timeZone: z.string(),
  /** Air temperature if the weather service returned one. */
  temperatureC: z.number().nullable(),
  /** "live" from the weather service, or "fallback" when it was unreachable. */
  weatherSource: z.enum(["live", "fallback"]),
});
export type GameEnvironment = z.infer<typeof GameEnvironmentSchema>;

export const SpawnViewSchema = z.object({
  id: z.uuid(),
  creatureId: z.string(),
  registryNumber: z.number().int(),
  lat: z.number(),
  lng: z.number(),
  distanceM: z.number(),
  /** Close enough to observe/capture. */
  inRange: z.boolean(),
  observed: z.boolean(),
  expiresAt: z.string(),
  /** A battle with this spawn is running (it stops wandering and expiring). */
  inBattle: z.boolean(),
  /** Known after observing; null before. */
  level: z.number().int().nullable(),
  /** What observing revealed (null before observing, or nothing to note). */
  hints: z
    .object({
      build: z.string().nullable(),
      marking: z.string().nullable(),
      /** From license rank 2 in its category. */
      temperament: z.string().nullable(),
    })
    .nullable(),
  /** Why a battle cannot start here (null = it can, range aside). */
  battleLocked: z.string().nullable(),
});
export type SpawnView = z.infer<typeof SpawnViewSchema>;

export const POI_SERVICES = ["pickup", "vet", "assessment"] as const;
export type PoiService = (typeof POI_SERVICES)[number];
/** POI types that are field stations (vets and assessments). */
export const FIELD_STATION_TYPES = ["research-station", "gate"] as const satisfies readonly (typeof POI_TYPES)[number][];

export const PoiViewSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  type: z.enum(POI_TYPES),
  lat: z.number(),
  lng: z.number(),
  distanceM: z.number(),
  inRange: z.boolean(),
  services: z.array(z.enum(POI_SERVICES)),
  pickedUpToday: z.boolean(),
});
export type PoiView = z.infer<typeof PoiViewSchema>;

export const GameStateResponseSchema = z.object({
  position: PositionResponseSchema.shape.position,
  lockedUntil: z.string().nullable(),
  environment: GameEnvironmentSchema.nullable(),
  region: z.object({ id: z.string(), name: z.string() }).nullable(),
  habitat: z
    .object({ id: z.string(), name: z.string(), licenseRequirement: LicenseRequirementSchema })
    .nullable(),
  /** The current habitat is a restricted research zone for this player ("Aquatic rank 3"), else null. */
  habitatLocked: z.string().nullable(),
  spawns: z.array(SpawnViewSchema),
  pois: z.array(PoiViewSchema),
  activeBattleId: z.uuid().nullable(),
  /** The player owns no Wildkin yet (the web app sends them to the starter screen). */
  needsStarter: z.boolean(),
  /** At least one party member can battle. */
  hasUsableWildkin: z.boolean(),
});
export type GameStateResponse = z.infer<typeof GameStateResponseSchema>;

// ---------------------------------------------------------------- registry

export const REGISTRY_STATUSES = ["unknown", "observed", "captured"] as const;
export const RegistryStatusSchema = z.enum(REGISTRY_STATUSES);
export type RegistryStatus = z.infer<typeof RegistryStatusSchema>;

/**
 * One Registry row. What is filled in depends on `status`:
 * - unknown: registryNumber + creatureId only (silhouette)
 * - observed: + name, description, habitatSummary
 * - captured: + rarity, activityPattern, skills, stat shape descriptors
 */
export const FieldNotesSchema = z.object({
  category: CategoryOrTbdSchema,
  bodyTraits: z.array(
    z.object({
      trait: BodyTraitSchema,
      /** Recorded weakness / resistance (per trait, for every species carrying it); null = "?". */
      weakTo: ApproachSchema.nullable(),
      resists: ApproachSchema.nullable(),
    }),
  ),
  timesOfDay: z.array(TimeOfDaySchema),
  weathers: z.array(WeatherSchema),
  /** "Large seen", "Banded markings seen". */
  phenotypes: z.array(z.string()),
});
export type FieldNotes = z.infer<typeof FieldNotesSchema>;

export const RegistryEntryViewSchema = z.object({
  creatureId: z.string(),
  registryNumber: z.number().int(),
  status: RegistryStatusSchema,
  name: z.string().nullable(),
  description: z.string().nullable(),
  habitatSummary: z.string().nullable(),
  rarity: RaritySchema.nullable(),
  activityPattern: ActivityPatternSchema.nullable(),
  skills: z.array(CreatureSkillSchema).nullable(),
  /** Observed only. */
  fieldNotes: FieldNotesSchema.nullable(),
  /** Captured only: species shape descriptor per stat. */
  statShape: z.array(z.object({ stat: z.string(), descriptor: z.string() })).nullable(),
  timesObserved: z.number().int(),
  timesCaptured: z.number().int(),
  firstObservedAt: z.string().nullable(),
  firstCapturedAt: z.string().nullable(),
});
export type RegistryEntryView = z.infer<typeof RegistryEntryViewSchema>;

export const RegistryResponseSchema = z.object({
  entries: z.array(RegistryEntryViewSchema),
  observedCount: z.number().int(),
  capturedCount: z.number().int(),
  total: z.number().int(),
});
export type RegistryResponse = z.infer<typeof RegistryResponseSchema>;

export const ResearcherExpGainSchema = z.object({ category: CategorySchema, amount: z.number().int(), reason: z.string() });
export type ResearcherExpGain = z.infer<typeof ResearcherExpGainSchema>;

export const ObserveResponseSchema = z.object({
  entry: RegistryEntryViewSchema,
  firstObservation: z.boolean(),
  /** The spawn as it looks now (level and hints revealed). */
  spawn: SpawnViewSchema,
  researcherExp: z.array(ResearcherExpGainSchema),
  /** Observation EXP for the lead Wildkin, if any. */
  leadExp: z.object({ wildkinId: z.string(), name: z.string(), amount: z.number().int(), newLevel: z.number().int().nullable() }).nullable(),
});
export type ObserveResponse = z.infer<typeof ObserveResponseSchema>;

// ---------------------------------------------------------------- inventory + party

export const InventoryItemViewSchema = z.object({
  itemId: ItemIdSchema,
  name: z.string(),
  description: z.string(),
  category: z.string(),
  quantity: z.number().int(),
});
export type InventoryItemView = z.infer<typeof InventoryItemViewSchema>;
export const InventoryResponseSchema = z.object({ items: z.array(InventoryItemViewSchema) });
export type InventoryResponse = z.infer<typeof InventoryResponseSchema>;

export const PARTY_SIZE = 6;

export const WILDKIN_CONDITIONS = ["healthy", "injured", "fainted", "restless"] as const;
export type WildkinCondition = (typeof WILDKIN_CONDITIONS)[number];

export const CapturedWildkinViewSchema = z.object({
  id: z.uuid(),
  creatureId: z.string(),
  registryNumber: z.number().int(),
  speciesName: z.string(),
  nickname: z.string().nullable(),
  partySlot: z.number().int().min(0).max(PARTY_SIZE - 1).nullable(),
  capturedAt: z.string(),
  level: z.number().int(),
  /** 0..1 (natural recovery applied). */
  hpFraction: z.number(),
  condition: z.enum(WILDKIN_CONDITIONS),
  restless: z.boolean(),
  /** "Needs Aquatic rank 2 to cooperate." when restless. */
  restlessReason: z.string().nullable(),
  /** The lead: battles start with it and it collects walking/observation EXP. */
  lead: z.boolean(),
  /** The species' marking variant is expressed. */
  marking: z.string().nullable(),
});
export type CapturedWildkinView = z.infer<typeof CapturedWildkinViewSchema>;

export const PartyResponseSchema = z.object({
  /** Exactly PARTY_SIZE slots; null = empty slot. */
  party: z.array(CapturedWildkinViewSchema.nullable()).length(PARTY_SIZE),
  storage: z.array(CapturedWildkinViewSchema),
});
export type PartyResponse = z.infer<typeof PartyResponseSchema>;

/** Replace the whole party: slot index → captured wildkin id (or null). */
export const UpdatePartyRequestSchema = z.object({
  slots: z
    .array(z.uuid().nullable())
    .length(PARTY_SIZE)
    .refine((ids) => {
      const present = ids.filter((id): id is string => id !== null);
      return new Set(present).size === present.length;
    }, "A Wildkin can only be in one slot"),
});
export type UpdatePartyRequest = z.infer<typeof UpdatePartyRequestSchema>;

export const RenameWildkinRequestSchema = z.object({
  nickname: NameSchema.max(24).nullable(),
});
export type RenameWildkinRequest = z.infer<typeof RenameWildkinRequestSchema>;

// ---------------------------------------------------------------- wildkin detail (scanner depth applied)

export const WildkinDetailSchema = CapturedWildkinViewSchema.extend({
  category: CategoryOrTbdSchema,
  /** License needed for this Wildkin's level, e.g. "Aquatic rank 2". */
  licenseNeeded: z.string(),
  /** The player's rank in this category (decides what the scanner shows). */
  scannerRank: z.number().int(),
  bodyTraits: z.array(BodyTraitSchema),
  attacks: z.array(AttackViewSchema),
  exp: z.object({
    /** EXP into the current level and the size of the level (0 / 0 at level 100). */
    intoLevel: z.number().int(),
    levelSize: z.number().int(),
    /** At the license cap: no EXP until the license ranks up. */
    heldAtCap: z.boolean(),
  }),
  /** Milliseconds until full HP by natural recovery; null = full, or cannot be treated (restless). */
  recoveryMs: z.number().nullable(),
  cannotBeTreated: z.boolean(),
  stats: z.array(
    z.object({
      stat: z.string(),
      /** Species shape descriptor (always shown). */
      descriptor: z.string(),
      /** Individual grade (license rank 2+), else null. */
      grade: z.string().nullable(),
      /** Vigor word (rank 3+), else null. */
      vigor: z.string().nullable(),
    }),
  ),
  build: z.string(),
  /** Rank 2+. */
  temperament: z.string().nullable(),
  /** Rank 4+: both alleles per gene, e.g. { build: "S/L" }. */
  genotype: z.object({ build: z.string(), temperament: z.string(), marking: z.string() }).nullable(),
  caught: z.object({
    habitatName: z.string().nullable(),
    level: z.number().int().nullable(),
    at: z.string(),
    timeOfDay: TimeOfDaySchema.nullable(),
    weather: WeatherSchema.nullable(),
  }),
});
export type WildkinDetail = z.infer<typeof WildkinDetailSchema>;
export const WildkinDetailResponseSchema = z.object({ wildkin: WildkinDetailSchema });
export type WildkinDetailResponse = z.infer<typeof WildkinDetailResponseSchema>;

// ---------------------------------------------------------------- starter, items, stations, pickups

/** Species a new player may choose from (open decision 1). */
export const STARTER_SPECIES = ["kawi", "mimu", "kantar"] as const;
export const STARTER_LEVEL = 5;

export const StarterOptionSchema = z.object({
  creatureId: z.string(),
  registryNumber: z.number().int(),
  name: z.string(),
  description: z.string(),
  category: CategoryOrTbdSchema,
  statShape: z.array(z.object({ stat: z.string(), descriptor: z.string() })),
});
export type StarterOption = z.infer<typeof StarterOptionSchema>;
export const StarterOptionsResponseSchema = z.object({ options: z.array(StarterOptionSchema), level: z.number().int() });
export type StarterOptionsResponse = z.infer<typeof StarterOptionsResponseSchema>;

export const StarterRequestSchema = z.object({ creatureId: z.enum(STARTER_SPECIES) });
export type StarterRequest = z.infer<typeof StarterRequestSchema>;
export const StarterResponseSchema = z.object({ wildkin: CapturedWildkinViewSchema });
export type StarterResponse = z.infer<typeof StarterResponseSchema>;

export const UseItemRequestSchema = z.object({ wildkinId: z.uuid() });
export type UseItemRequest = z.infer<typeof UseItemRequestSchema>;
export const UseItemResponseSchema = z.object({ wildkin: CapturedWildkinViewSchema, quantityLeft: z.number().int() });
export type UseItemResponse = z.infer<typeof UseItemResponseSchema>;

export const VetResponseSchema = z.object({
  station: z.object({ id: z.string(), name: z.string() }),
  healed: z.number().int(),
  /** Restless Wildkin a vet cannot treat yet. */
  untreated: z.array(z.object({ wildkinId: z.string(), name: z.string(), reason: z.string() })),
});
export type VetResponse = z.infer<typeof VetResponseSchema>;

export const ItemGrantSchema = z.object({
  itemId: ItemIdSchema,
  name: z.string(),
  quantity: z.number().int(),
  /** Some did not fit (ITEM_STACK_MAX). */
  truncated: z.number().int(),
});
export type ItemGrant = z.infer<typeof ItemGrantSchema>;
export const PickupResponseSchema = z.object({ poi: z.object({ id: z.string(), name: z.string() }), items: z.array(ItemGrantSchema) });
export type PickupResponse = z.infer<typeof PickupResponseSchema>;

/** Battle start errors carry extra detail. */
export const BattleStartErrorDetailSchema = z.object({
  battleId: z.uuid().optional(),
  requirement: LicenseRequirementSchema.optional(),
});

/** Matchup records the player has made, per body trait. */
export const MatchupRecordViewSchema = z.object({
  bodyTrait: BodyTraitSchema,
  approach: ApproachSchema,
  effect: z.enum(MATCHUP_EFFECTS),
});
export type MatchupRecordView = z.infer<typeof MatchupRecordViewSchema>;
