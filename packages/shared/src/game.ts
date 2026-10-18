import { z } from "zod";
import { Latitude, Longitude } from "./geo.ts";
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
  /** Observe and capture require the spawn to be within this distance. */
  interactRadiusM: 60,
  /** Upper bound of simultaneously active spawns per player. */
  maxActiveSpawns: 6,
  /** How long a spawn stays before it wanders off. */
  spawnTtlMs: 10 * 60 * 1000,
  /** Fastest plausible movement between two reports (~144 km/h, allows vehicles). */
  maxSpeedMps: 40,
  /** Reports worse than this are ignored (not accepted, not flagged). */
  maxAccuracyM: 100,
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
    description: "A padded, breathable carrier for safely bringing a Wildkin along. Used up on each capture attempt.",
    category: "capture",
  },
  "trail-ration": {
    name: "Trail Ration",
    description: "Dried fruit and seeds. Useful for calming nervous Wildkin (not usable yet).",
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
});
export type SpawnView = z.infer<typeof SpawnViewSchema>;

export const GameStateResponseSchema = z.object({
  position: PositionResponseSchema.shape.position,
  lockedUntil: z.string().nullable(),
  environment: GameEnvironmentSchema.nullable(),
  region: z.object({ id: z.string(), name: z.string() }).nullable(),
  habitat: z.object({ id: z.string(), name: z.string() }).nullable(),
  spawns: z.array(SpawnViewSchema),
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
 * - captured: + rarity, activityPattern, skills
 */
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

export const ObserveResponseSchema = z.object({ entry: RegistryEntryViewSchema, firstObservation: z.boolean() });
export type ObserveResponse = z.infer<typeof ObserveResponseSchema>;

export const CaptureResponseSchema = z.object({
  success: z.boolean(),
  /** The spawn is gone either way once a capture has succeeded or it fled. */
  fled: z.boolean(),
  capsulesLeft: z.number().int(),
  entry: RegistryEntryViewSchema,
  wildkinId: z.uuid().nullable(),
});
export type CaptureResponse = z.infer<typeof CaptureResponseSchema>;

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

export const CapturedWildkinViewSchema = z.object({
  id: z.uuid(),
  creatureId: z.string(),
  registryNumber: z.number().int(),
  speciesName: z.string(),
  nickname: z.string().nullable(),
  partySlot: z.number().int().min(0).max(PARTY_SIZE - 1).nullable(),
  capturedAt: z.string(),
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
