import { z } from "zod";
import { RARITIES } from "./constants.ts";
import { CATEGORIES } from "./research.ts";

// Local primitives (world.ts imports this file, so importing from it would be circular).
const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase slug, e.g. forest-floor").max(64);
const RaritySchema = z.enum(RARITIES);

/**
 * Creature systems shared by every app (v0.3.0): stats, genetics, levels and
 * EXP, attacks, matchups, statuses and the wild battle contract.
 *
 * Every tunable number lives in one exported constant object (EXP_RULES,
 * BATTLE_RULES, ...) so tuning after play-testing never touches logic. The
 * formulas themselves are pure functions in @wildbound/world.
 */

// ---------------------------------------------------------------- stats

export const STAT_KEYS = ["hp", "atk", "def", "spd"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export const STAT_NAMES: Record<StatKey, string> = { hp: "HP", atk: "Attack", def: "Defense", spd: "Speed" };

/** Every species' four base stats add up to exactly this. Rarity is not strength. */
export const STAT_BUDGET = 300;
export const BASE_STAT_MIN = 10;
export const BASE_STAT_MAX = 150;

const BaseStat = z.number().int().min(BASE_STAT_MIN).max(BASE_STAT_MAX);
export const StatBlockSchema = z.object({ hp: z.number(), atk: z.number(), def: z.number(), spd: z.number() });
export type StatBlock = z.infer<typeof StatBlockSchema>;

export const statTotal = (s: StatBlock) => s.hp + s.atk + s.def + s.spd;

/** A species' stat shape. The four values must sum to STAT_BUDGET. */
export const BaseStatsSchema = z
  .object({ hp: BaseStat, atk: BaseStat, def: BaseStat, spd: BaseStat })
  .refine((s) => statTotal(s) === STAT_BUDGET, {
    message: `Base stats must add up to exactly ${STAT_BUDGET}`,
  });
export type BaseStats = z.infer<typeof BaseStatsSchema>;

/** Species shape descriptor per stat, from its base value (highest threshold first). */
export const STAT_DESCRIPTORS = [
  { min: 100, label: "Signature strength" },
  { min: 80, label: "Solid" },
  { min: 60, label: "Modest" },
  { min: 0, label: "Weak point" },
] as const;
export type StatDescriptor = (typeof STAT_DESCRIPTORS)[number]["label"];

/** Individual grade per stat, from m = traitMod x (1 + vigor / 100) (highest threshold first). */
export const STAT_GRADES = [
  { min: 1.1, label: "Exceptional" },
  { min: 1.04, label: "Strong" },
  { min: 1.0, label: "Typical" },
  { min: 0.95, label: "Fair" },
  { min: 0, label: "Low" },
] as const;
export type StatGrade = (typeof STAT_GRADES)[number]["label"];

export const VIGOR_MAX = 5;
/** Index = vigor value 0..5. */
export const VIGOR_WORDS = ["Frail", "Slight", "Average", "Sound", "Robust", "Exceptional"] as const;
export type VigorWord = (typeof VIGOR_WORDS)[number];

// ---------------------------------------------------------------- genetics

export const BUILD_ALLELES = ["S", "L"] as const;
export const TEMPERAMENT_ALLELES = ["B", "W"] as const;
export const MARKING_ALLELES = ["+", "m"] as const;

export const GenomeSchema = z.object({
  build: z.tuple([z.enum(BUILD_ALLELES), z.enum(BUILD_ALLELES)]),
  temperament: z.tuple([z.enum(TEMPERAMENT_ALLELES), z.enum(TEMPERAMENT_ALLELES)]),
  marking: z.tuple([z.enum(MARKING_ALLELES), z.enum(MARKING_ALLELES)]),
});
export type Genome = z.infer<typeof GenomeSchema>;

/** Heterozygous for both trait genes, unmarked: what migrated rows and fixtures use. */
export const TYPICAL_GENOME: Genome = { build: ["S", "L"], temperament: ["B", "W"], marking: ["+", "+"] };

const VigorValue = z.number().int().min(0).max(VIGOR_MAX);
export const VigorSchema = z.object({ hp: VigorValue, atk: VigorValue, def: VigorValue, spd: VigorValue });
export type Vigor = z.infer<typeof VigorSchema>;
export const AVERAGE_VIGOR: Vigor = { hp: 2, atk: 2, def: 2, spd: 2 };

export const BUILDS = ["small", "typical", "large"] as const;
export type Build = (typeof BUILDS)[number];
export const TEMPERAMENTS = ["bold", "steady", "wary"] as const;
export type Temperament = (typeof TEMPERAMENTS)[number];

export interface Phenotype {
  build: Build;
  temperament: Temperament;
  /** The species' marking variant is expressed (mm). */
  marked: boolean;
}

/** Stat multipliers per phenotype. Missing keys are 1. They multiply across genes. */
export const TRAIT_MODIFIERS: {
  build: Record<Build, Partial<Record<StatKey, number>>>;
  temperament: Record<Temperament, Partial<Record<StatKey, number>>>;
} = {
  build: { small: { hp: 0.9, spd: 1.1 }, typical: {}, large: { hp: 1.1, def: 1.05, spd: 0.9 } },
  temperament: { bold: { atk: 1.1, def: 0.9 }, steady: {}, wary: { spd: 1.1, atk: 0.9 } },
};

export const BUILD_NAMES: Record<Build, string> = { small: "Small", typical: "Typical", large: "Large" };
export const TEMPERAMENT_NAMES: Record<Temperament, string> = { bold: "Bold", steady: "Steady", wary: "Wary" };

/** What an observer notices in the field (wild spawns). Typical / Steady give no hint. */
export const BUILD_HINTS: Record<Build, string | null> = {
  small: "Smaller than typical",
  typical: null,
  large: "Larger than typical",
};
export const TEMPERAMENT_HINTS: Record<Temperament, string | null> = {
  bold: "Holds its ground",
  steady: null,
  wary: "Keeps its distance",
};

const Probability = z.number().min(0).max(1);
const AlleleOdds = z.object({
  /** Chance each allele is the second allele of the gene (L for Build, W for Temperament). */
  pAllele: Probability,
  /** First entry (authored order) whose tag is in the spawn habitat's tags wins. */
  byHabitatTag: z.array(z.object({ tag: SlugSchema, pAllele: Probability })).max(16).default([]),
});
export type AlleleOdds = z.infer<typeof AlleleOdds>;

export const MARKING_FREQUENCY_MAX = 0.2;
export const MarkingVariantSchema = z.object({
  /** Named after a visible difference, e.g. "Banded". */
  name: z.string().trim().min(1).max(40),
  description: z.string().max(400),
  /** Chance each allele is m; expressed in frequency squared of individuals. */
  frequency: z.number().min(0).max(MARKING_FREQUENCY_MAX),
});
export type MarkingVariant = z.infer<typeof MarkingVariantSchema>;

export const GenePoolSchema = z.object({
  build: AlleleOdds,
  temperament: AlleleOdds,
  marking: MarkingVariantSchema.nullable(),
});
export type GenePool = z.infer<typeof GenePoolSchema>;

export const DEFAULT_GENE_POOL: GenePool = {
  build: { pAllele: 0.5, byHabitatTag: [] },
  temperament: { pAllele: 0.5, byHabitatTag: [] },
  marking: null,
};

// ---------------------------------------------------------------- levels + EXP

export const LEVEL_MIN = 1;
export const LEVEL_MAX = 100;
export const LevelSchema = z.number().int().min(LEVEL_MIN).max(LEVEL_MAX);

/** Wildkin EXP sources (exp_events.source on the wildkin track). */
export const WILDKIN_EXP_SOURCES = ["battle", "battle-shared", "walking", "observation", "exploration", "capture"] as const;
export type WildkinExpSource = (typeof WILDKIN_EXP_SOURCES)[number];

/** Placeholders, tune after play-testing. See docs/07-game-systems.md. */
export const EXP_RULES = {
  /** battle = floor(battleBase x L_opp / battleDivisor x gap). */
  battleBase: 60,
  battleDivisor: 7,
  /** gap = clamp(L_opp / L_self, gapMin, gapMax). */
  gapMin: 0.2,
  gapMax: 1.5,
  /** Other non-fainted party members get this share of the battle amount... */
  sharedShare: 0.5,
  /** ...or this one when they are this many levels below the lead. */
  catchUpShare: 0.75,
  catchUpLevelGap: 5,
  /** Walking: this share of the lead's nextLevelGap per unit. */
  walkingShare: 0.01,
  walkingUnitM: 100,
  walkingUnitsPerDay: 30,
  /** Only segments slower than this count (no EXP from driving). */
  walkingMaxSpeedMps: 3,
  observationShare: 0.03,
  observationsPerDay: 5,
  explorationShare: 0.05,
  explorationsPerDay: 5,
  captureShare: 0.1,
  /** One rested charge per this long since the last battle EXP. */
  restedChargeMs: 2 * 60 * 60 * 1000,
  restedMaxCharges: 10,
  /** A won battle with a rested charge multiplies battle and battle-shared EXP by this. */
  restedMultiplier: 2,
} as const;

// ---------------------------------------------------------------- attacks + matchups

export const APPROACHES = ["strike", "pierce", "crush", "surge", "toxin", "spore"] as const;
export type Approach = (typeof APPROACHES)[number];
export const ApproachSchema = z.enum(APPROACHES);
export const APPROACH_NAMES: Record<Approach, string> = {
  strike: "Strike",
  pierce: "Pierce",
  crush: "Crush",
  surge: "Surge",
  toxin: "Toxin",
  spore: "Spore",
};

export const BODY_TRAITS = ["plated", "feathered", "soft-bodied", "leafy", "slick"] as const;
export type BodyTrait = (typeof BODY_TRAITS)[number];
export const BodyTraitSchema = z.enum(BODY_TRAITS);
export const BODY_TRAIT_NAMES: Record<BodyTrait, string> = {
  plated: "Plated",
  feathered: "Feathered",
  "soft-bodied": "Soft-bodied",
  leafy: "Leafy",
  slick: "Slick",
};

export const MATCHUP_WEAK = 1.5;
export const MATCHUP_RESIST = 0.67;
export const MATCHUP_EFFECTS = ["weak", "resist"] as const;
export type MatchupEffect = (typeof MATCHUP_EFFECTS)[number];

/**
 * Body trait matchups. `strike` is never listed: it is always neutral.
 * The lines are battle text in the field-note voice.
 */
export const MATCHUPS: Record<
  BodyTrait,
  { weak: Approach; resist: Approach; reason: string; weakLine: string; resistLine: string }
> = {
  plated: {
    weak: "crush",
    resist: "pierce",
    reason: "Armour deflects points but cracks under blunt force.",
    weakLine: "The plates cracked under the blow.",
    resistLine: "The point glanced off its plates.",
  },
  feathered: {
    weak: "surge",
    resist: "crush",
    reason: "Soaked feathers weigh it down; light and hard to pin.",
    weakLine: "Its soaked feathers dragged it down.",
    resistLine: "It rode the impact on light wings.",
  },
  "soft-bodied": {
    weak: "pierce",
    resist: "spore",
    reason: "No protection; lives among leaf-litter spores and molds.",
    weakLine: "It had nothing to shield it.",
    resistLine: "It shrugged off the spores, as at home as in the leaf litter.",
  },
  leafy: {
    weak: "toxin",
    resist: "surge",
    reason: "Toxins wilt it; water feeds it.",
    weakLine: "Its leaves curled and wilted.",
    resistLine: "It drank the water in.",
  },
  slick: {
    weak: "toxin",
    resist: "pierce",
    reason: "Absorbs through its skin; points glance off.",
    weakLine: "Its skin drew the toxin in.",
    resistLine: "The point slid off its slick hide.",
  },
};

export const ATTACK_POWER_MIN = 30;
export const ATTACK_POWER_MAX = 60;
export const MAX_ATTACKS = 2;

/**
 * A placeholder attack (v0.3.0). Not a skill: the 0.4.0 skill system replaces
 * these. `priority` is reserved for that system; no placeholder attack has it.
 */
export const AttackSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40),
  approach: ApproachSchema,
  power: z.number().int().min(ATTACK_POWER_MIN).max(ATTACK_POWER_MAX),
  description: z.string().max(400).default(""),
  canon: z.enum(["established", "proposed"]).default("proposed"),
  priority: z.boolean().default(false),
});
export type Attack = z.infer<typeof AttackSchema>;
export type AttackInput = z.input<typeof AttackSchema>;

export const POWER_WORDS = [
  { min: 50, label: "Heavy" },
  { min: 40, label: "Moderate" },
  { min: 0, label: "Light" },
] as const;
export type PowerWord = (typeof POWER_WORDS)[number]["label"];
export const powerWord = (power: number): PowerWord => POWER_WORDS.find((w) => power >= w.min)!.label;

// ---------------------------------------------------------------- statuses

export const STATUSES = ["asleep", "stunned", "entangled", "numbed", "exhausted"] as const;
export type StatusId = (typeof STATUSES)[number];
export const StatusIdSchema = z.enum(STATUSES);

/**
 * Status framework. Nothing inflicts a status in 0.3.0 (skills will, in 0.4.0).
 * Durations are in turns, rolled uniformly in [minTurns, maxTurns].
 */
export const STATUS_RULES: Record<
  StatusId,
  {
    name: string;
    minTurns: number;
    maxTurns: number;
    captureBonus: number;
    /** Chance per turn to lose its attack (1 = never attacks). */
    skipAttackChance: number;
    /** Cannot switch out or escape. */
    trapped: boolean;
    /** Attack multiplier while the status lasts. */
    atkMultiplier: number;
  }
> = {
  asleep: { name: "Asleep", minTurns: 1, maxTurns: 3, captureBonus: 0.2, skipAttackChance: 1, trapped: false, atkMultiplier: 1 },
  stunned: { name: "Stunned", minTurns: 1, maxTurns: 1, captureBonus: 0.15, skipAttackChance: 1, trapped: false, atkMultiplier: 1 },
  entangled: { name: "Entangled", minTurns: 2, maxTurns: 4, captureBonus: 0.15, skipAttackChance: 0, trapped: true, atkMultiplier: 1 },
  numbed: { name: "Numbed", minTurns: 2, maxTurns: 4, captureBonus: 0.1, skipAttackChance: 0.25, trapped: false, atkMultiplier: 1 },
  exhausted: { name: "Exhausted", minTurns: 3, maxTurns: 3, captureBonus: 0.1, skipAttackChance: 0, trapped: false, atkMultiplier: 0.75 },
};

export const StatusStateSchema = z.object({ id: StatusIdSchema, turnsLeft: z.number().int().min(0) });
export type StatusState = z.infer<typeof StatusStateSchema>;

// ---------------------------------------------------------------- battle rules

export const BATTLE_RULES = {
  /** P(A first) = SPD_A^k / (SPD_A^k + SPD_B^k). Raise to 2 if Speed matters too little. */
  turnOrderExponent: 1,
  /** escape = min(escapeMax, escapeBase + SPD_self / (SPD_self + SPD_wild) x escapeSpeedWeight + escapePerAttempt x attempts). */
  escapeBase: 0.2,
  escapeSpeedWeight: 0.6,
  escapePerAttempt: 0.1,
  escapeMax: 0.95,
  /** dodge = defender faster ? min(dodgeMax, (SPD_def - SPD_att) / SPD_def x dodgeWeight) : 0. */
  dodgeMax: 0.1,
  dodgeWeight: 0.2,
  /** Damage random factor, uniform in [min, max]. */
  damageRandomMin: 0.85,
  damageRandomMax: 1,
  /** Capture: chance = min(captureMax, rarityBase + observedBonus + hpWeight x (1 - hp / maxHp) + statusBonus + capsuleBonus). */
  captureMax: 0.95,
  captureRarityBase: { common: 0.25, uncommon: 0.15, rare: 0.08, TBD: 0.2 } as Record<z.infer<typeof RaritySchema>, number>,
  captureObservedBonus: 0.1,
  captureHpWeight: 0.45,
  categoryCapsuleBonus: 0.15,
  /** A battle with no action for this long is abandoned (checked lazily). */
  idleTimeoutMs: 10 * 60 * 1000,
  /** Trail Ration heals this share of max HP. */
  trailRationHeal: 0.25,
  /** Natural recovery: empty to full in this long (first aid in the capsule). */
  naturalRecoveryFullMs: 8 * 60 * 60 * 1000,
} as const;

// ---------------------------------------------------------------- battle state (server only)

export const BATTLE_KINDS = ["wild"] as const;
export const BATTLE_OUTCOMES = ["won", "lost", "captured", "escaped", "abandoned"] as const;
export type BattleOutcome = (typeof BATTLE_OUTCOMES)[number];
export const BattleOutcomeSchema = z.enum(BATTLE_OUTCOMES);
export const BATTLE_STATUSES = ["active", ...BATTLE_OUTCOMES] as const;
export type BattleStatus = (typeof BATTLE_STATUSES)[number];

const CategoryOrTbd = z.enum([...CATEGORIES, "TBD"]);

/** One Wildkin in a battle, with everything the engine needs. Never sent to the client as is. */
export const CombatantSchema = z.object({
  /** captured_wildkin id, or the spawn id for the wild side. */
  id: z.string(),
  creatureId: z.string(),
  name: z.string(),
  registryNumber: z.number().int(),
  level: LevelSchema,
  stats: StatBlockSchema,
  hp: z.number().int().min(0),
  status: StatusStateSchema.nullable(),
  attacks: z.array(AttackSchema),
  bodyTraits: z.array(BodyTraitSchema),
  category: CategoryOrTbd,
  /** Above the player's license cap: travels along but will not battle. */
  restless: z.boolean(),
});
export type Combatant = z.infer<typeof CombatantSchema>;

export const BattleStateSchema = z.object({
  kind: z.enum(BATTLE_KINDS),
  turn: z.number().int().min(0),
  awaiting: z.enum(["action", "replace"]),
  outcome: BattleOutcomeSchema.nullable(),
  escapeAttempts: z.number().int().min(0),
  wild: CombatantSchema.extend({
    rarity: RaritySchema,
    /** The spawn was observed before the battle started. */
    observed: z.boolean(),
  }),
  /** Party members in slot order. */
  party: z.array(CombatantSchema),
  activeId: z.string(),
  /** Party members that took part (were active at some point), for EXP. */
  participants: z.array(z.string()),
});
export type BattleState = z.infer<typeof BattleStateSchema>;

// ---------------------------------------------------------------- actions

export const CAPSULE_ITEM_IDS = ["field-capsule", "canopy-capsule", "current-capsule", "burrow-capsule", "bloom-capsule"] as const;
export type CapsuleItemId = (typeof CAPSULE_ITEM_IDS)[number];

export const BattleActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("attack"), attackIndex: z.number().int().min(0).max(MAX_ATTACKS - 1) }),
  z.object({ type: z.literal("switch"), wildkinId: z.uuid() }),
  z.object({ type: z.literal("item"), itemId: z.literal("trail-ration"), wildkinId: z.uuid() }),
  z.object({ type: z.literal("capsule"), itemId: z.enum(CAPSULE_ITEM_IDS) }),
  z.object({ type: z.literal("escape") }),
  z.object({ type: z.literal("replace"), wildkinId: z.uuid() }),
]);
export type BattleAction = z.infer<typeof BattleActionSchema>;

export const BattleActionRequestSchema = z.object({
  /** The turn number the client saw; stale turns are refused (double taps). */
  turn: z.number().int().min(0),
  action: BattleActionSchema,
});
export type BattleActionRequest = z.infer<typeof BattleActionRequestSchema>;

// ---------------------------------------------------------------- events (UI playback)

const Side = z.enum(["player", "wild"]);
export type BattleSide = z.infer<typeof Side>;

export const BattleEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("attack"),
    side: Side,
    /** Name or nickname of the attacker. */
    attacker: z.string(),
    attack: z.string(),
    approach: ApproachSchema,
    dodged: z.boolean(),
    /** Damage as a share of the target's max HP (0..1). */
    damage: z.number(),
    effect: z.enum(MATCHUP_EFFECTS).nullable(),
    line: z.string().nullable(),
  }),
  z.object({ type: z.literal("skip"), side: Side, name: z.string(), status: StatusIdSchema }),
  z.object({ type: z.literal("status"), side: Side, name: z.string(), status: StatusIdSchema, change: z.enum(["inflicted", "recovered"]) }),
  z.object({ type: z.literal("switch"), from: z.string(), to: z.string(), wildkinId: z.string() }),
  z.object({ type: z.literal("replace"), to: z.string(), wildkinId: z.string() }),
  z.object({ type: z.literal("faint"), side: Side, name: z.string() }),
  z.object({ type: z.literal("capsule"), itemId: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("escape"), success: z.boolean(), reason: z.enum(["roll", "moved-away"]).default("roll") }),
  z.object({ type: z.literal("item"), itemId: z.string(), target: z.string(), healed: z.number() }),
  z.object({ type: z.literal("trapped"), name: z.string() }),
  z.object({
    type: z.literal("matchup-recorded"),
    bodyTrait: BodyTraitSchema,
    approach: ApproachSchema,
    effect: z.enum(MATCHUP_EFFECTS),
    line: z.string(),
  }),
  z.object({
    type: z.literal("exp"),
    wildkinId: z.string(),
    name: z.string(),
    amount: z.number().int(),
    newLevel: z.number().int().nullable(),
    /** At the license cap: no more EXP until the license ranks up. */
    heldAtCap: z.boolean(),
  }),
  z.object({ type: z.literal("researcher-exp"), category: z.enum(CATEGORIES), amount: z.number().int(), reason: z.string() }),
  z.object({ type: z.literal("battle-end"), outcome: BattleOutcomeSchema, line: z.string() }),
]);
export type BattleEvent = z.infer<typeof BattleEventSchema>;

// ---------------------------------------------------------------- views (what the client sees)

export const AttackViewSchema = z.object({
  index: z.number().int(),
  name: z.string(),
  approach: ApproachSchema,
  powerWord: z.enum(["Light", "Moderate", "Heavy"]),
  description: z.string(),
});
export type AttackView = z.infer<typeof AttackViewSchema>;

export const BattleWildViewSchema = z.object({
  creatureId: z.string(),
  name: z.string(),
  registryNumber: z.number().int(),
  level: z.number().int(),
  /** 0..1, never the exact HP. */
  hpFraction: z.number(),
  status: StatusIdSchema.nullable(),
  bodyTraits: z.array(BodyTraitSchema),
});

export const BattlePartyMemberViewSchema = z.object({
  id: z.string(),
  creatureId: z.string(),
  registryNumber: z.number().int(),
  name: z.string(),
  level: z.number().int(),
  hpFraction: z.number(),
  status: StatusIdSchema.nullable(),
  fainted: z.boolean(),
  restless: z.boolean(),
  /** Can be switched or sent in right now. */
  usable: z.boolean(),
  /** Why not, when not usable. */
  unusableReason: z.string().nullable(),
  active: z.boolean(),
});
export type BattlePartyMemberView = z.infer<typeof BattlePartyMemberViewSchema>;

export const BattleViewSchema = z.object({
  id: z.uuid(),
  kind: z.enum(BATTLE_KINDS),
  spawnId: z.uuid(),
  turn: z.number().int(),
  awaiting: z.enum(["action", "replace"]),
  outcome: BattleOutcomeSchema.nullable(),
  wild: BattleWildViewSchema,
  activeId: z.string(),
  attacks: z.array(AttackViewSchema),
  party: z.array(BattlePartyMemberViewSchema),
  /** Usable item counts (Trail Rations and capsules). */
  items: z.array(z.object({ itemId: z.string(), name: z.string(), quantity: z.number().int() })),
  /** Total EXP each Wildkin gained in this battle (filled once it is over). */
  expGained: z.array(z.object({ wildkinId: z.string(), name: z.string(), amount: z.number().int() })),
  /** The Wildkin caught, when the outcome is "captured". */
  capturedWildkinId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BattleView = z.infer<typeof BattleViewSchema>;

export const BattleResponseSchema = z.object({ battle: BattleViewSchema });
export type BattleResponse = z.infer<typeof BattleResponseSchema>;

export const BattleActionResponseSchema = z.object({ battle: BattleViewSchema, events: z.array(BattleEventSchema) });
export type BattleActionResponse = z.infer<typeof BattleActionResponseSchema>;

/** End-screen copy per outcome (the species name is filled in by the client). */
export const BATTLE_END_LINES: Record<BattleOutcome, string> = {
  won: "The wild {name} retreated into cover.",
  captured: "{name} was given first aid and settled into the capsule.",
  lost: "Your Wildkin are exhausted. They have been given first aid; a vet at a field station can treat them faster.",
  escaped: "You slipped away and the wild {name} went back to its business.",
  abandoned: "The wild {name} lost interest and wandered off.",
};
