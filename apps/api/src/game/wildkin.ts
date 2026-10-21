import { Prisma, type CapturedWildkinModel } from "@wildbound/db";
import {
  AVERAGE_VIGOR,
  BUILD_NAMES,
  CATEGORY_NAMES,
  LEVEL_MAX,
  TEMPERAMENT_NAMES,
  powerWord,
  scannerShows,
  type WildkinDetail,
  GenomeSchema,
  STAT_KEYS,
  STAT_NAMES,
  TYPICAL_GENOME,
  VigorSchema,
  licenseRequirementLabel,
  obedienceCap,
  rankForLevel,
  type CapturedWildkinView,
  type CreatureDefinition,
  type Genome,
  type StatBlock,
  type Vigor,
  type WildkinCondition,
  type WildkinExpSource,
} from "@wildbound/shared";
import {
  applyExpGain,
  attacksOf,
  currentHp,
  expCapFor,
  genotypeText,
  individualMultiplier,
  individualStats,
  levelProgress,
  msUntilFull,
  phenotype,
  pickLead,
  statDescriptor,
  statGrade,
  totalExpForLevel,
  traitModifiers,
  vigorWord,
} from "@wildbound/world";
import { rankFor, type Creatures, type Licenses, type Tx } from "./common.ts";

/**
 * Captured Wildkin as the game sees them: stats from species + genome + vigor
 * at their level, current HP with lazy natural recovery, restless when their
 * level is above the license cap of their category.
 */
export interface WildkinInfo {
  row: CapturedWildkinModel;
  creature: CreatureDefinition;
  genome: Genome;
  vigor: Vigor;
  stats: StatBlock;
  maxHp: number;
  /** Natural recovery applied (frozen while restless). */
  hp: number;
  restless: boolean;
  /** The player's rank in its category. */
  rank: number;
  /** The level it may grow to (license cap, or the top of its own band when restless). */
  expCap: number;
}

export const genomeOf = (json: unknown): Genome => GenomeSchema.safeParse(json).data ?? TYPICAL_GENOME;
export const vigorOf = (json: unknown): Vigor => VigorSchema.safeParse(json).data ?? AVERAGE_VIGOR;

export function wildkinInfo(row: CapturedWildkinModel, creature: CreatureDefinition, licenses: Licenses, now: Date): WildkinInfo {
  const genome = genomeOf(row.genome);
  const vigor = vigorOf(row.vigor);
  const stats = individualStats(creature.baseStats, row.level, genome, vigor);
  const rank = rankFor(licenses, creature.category);
  const cap = obedienceCap(rank);
  const restless = creature.category !== "TBD" && row.level > cap;
  return {
    row,
    creature,
    genome,
    vigor,
    stats,
    maxHp: stats.hp,
    hp: Math.max(0, currentHp(row, stats.hp, now, restless)),
    restless,
    rank,
    expCap: expCapFor(row.level, cap),
  };
}

/** Every captured Wildkin of a player, oldest first (deleted species included: they still own them). */
export async function loadWildkin(db: Tx, playerId: string, creatures: Creatures, licenses: Licenses, now: Date) {
  const rows = await db.capturedWildkin.findMany({ where: { playerId }, orderBy: [{ capturedAt: "asc" }, { id: "asc" }] });
  return rows.flatMap((r) => {
    const creature = creatures.get(r.creatureId);
    return creature ? [wildkinInfo(r, creature, licenses, now)] : [];
  });
}

/** Party members in slot order. */
export const partyOf = (all: readonly WildkinInfo[]) =>
  all.filter((w) => w.row.partySlot !== null).sort((a, b) => a.row.partySlot! - b.row.partySlot!);

/** The lead: slot 0 if it can battle, else the first party member (by slot) that can. */
export const leadOf = (all: readonly WildkinInfo[]) => pickLead(partyOf(all));

export const displayName = (w: Pick<WildkinInfo, "row" | "creature">) => w.row.nickname ?? w.creature.name;

/** The license this Wildkin's level needs, e.g. "Aquatic rank 2" ("Rank 2" for an unclassified species). */
export const licenseNeeded = (w: Pick<WildkinInfo, "row" | "creature">) =>
  w.creature.category === "TBD"
    ? `Rank ${rankForLevel(w.row.level)}`
    : licenseRequirementLabel({ category: w.creature.category, rank: rankForLevel(w.row.level) });

/** "Needs Aquatic rank 2 to cooperate." */
export const restlessReason = (w: WildkinInfo) => (w.restless ? `Needs ${licenseNeeded(w)} to cooperate.` : null);

export function conditionOf(w: WildkinInfo): WildkinCondition {
  if (w.restless) return "restless";
  if (w.hp <= 0) return "fainted";
  return w.hp < w.maxHp ? "injured" : "healthy";
}

export const markingOf = (w: Pick<WildkinInfo, "genome" | "creature">) =>
  phenotype(w.genome).marked && w.creature.genePool.marking ? w.creature.genePool.marking.name : null;

export function capturedView(w: WildkinInfo, leadId: string | null): CapturedWildkinView {
  return {
    id: w.row.id,
    creatureId: w.row.creatureId,
    registryNumber: w.creature.registryNumber,
    speciesName: w.creature.name,
    nickname: w.row.nickname,
    partySlot: w.row.partySlot,
    capturedAt: w.row.capturedAt.toISOString(),
    level: w.row.level,
    hpFraction: w.maxHp > 0 ? w.hp / w.maxHp : 0,
    condition: conditionOf(w),
    restless: w.restless,
    restlessReason: restlessReason(w),
    lead: w.row.id === leadId,
    marking: markingOf(w),
  };
}

/** Species shape descriptors ("Signature strength", ...); empty when base stats are not authored. */
export const statShape = (c: CreatureDefinition) =>
  c.baseStats ? STAT_KEYS.map((k) => ({ stat: STAT_NAMES[k], descriptor: statDescriptor(c.baseStats![k]) })) : [];

export const categoryName = (c: CreatureDefinition) => (c.category === "TBD" ? "Unclassified" : CATEGORY_NAMES[c.category]);

/**
 * One Wildkin's detail page. What the scanner shows depends on the player's
 * license rank in its category (SCANNER_DEPTH); hidden fields are null.
 */
export function wildkinDetail(w: WildkinInfo, leadId: string | null, caughtHabitatName: string | null): WildkinDetail {
  const rank = w.rank;
  const p = phenotype(w.genome);
  const mods = traitModifiers(p);
  const progress = levelProgress(w.row.exp, w.row.level);
  const full = w.hp >= w.maxHp;
  return {
    ...capturedView(w, leadId),
    category: w.creature.category,
    licenseNeeded: licenseNeeded(w),
    scannerRank: rank,
    bodyTraits: w.creature.bodyTraits,
    attacks: attacksOf(w.creature).map((a, index) => ({
      index,
      name: a.name,
      approach: a.approach,
      powerWord: powerWord(a.power),
      description: a.description,
    })),
    exp: { ...progress, heldAtCap: w.row.level < LEVEL_MAX && w.row.exp >= totalExpForLevel(w.expCap) },
    recoveryMs: w.restless || full ? null : msUntilFull(w.hp, w.maxHp),
    cannotBeTreated: w.restless,
    stats: STAT_KEYS.map((k) => ({
      stat: STAT_NAMES[k],
      descriptor: w.creature.baseStats ? statDescriptor(w.creature.baseStats[k]) : "Unknown",
      grade: scannerShows("grades", rank) ? statGrade(individualMultiplier(mods[k], w.vigor[k])) : null,
      vigor: scannerShows("vigor", rank) ? vigorWord(w.vigor[k]) : null,
    })),
    build: BUILD_NAMES[p.build],
    temperament: scannerShows("temperament", rank) ? TEMPERAMENT_NAMES[p.temperament] : null,
    genotype: scannerShows("genotype", rank) ? genotypeText(w.genome) : null,
    caught: {
      habitatName: caughtHabitatName,
      level: w.row.caughtLevel,
      at: w.row.capturedAt.toISOString(),
      timeOfDay: (w.row.caughtAtTimeOfDay as WildkinDetail["caught"]["timeOfDay"]) ?? null,
      weather: (w.row.caughtAtWeather as WildkinDetail["caught"]["weather"]) ?? null,
    },
  };
}

// ------------------------------------------------------------------ EXP

export interface WildkinExpResult {
  wildkinId: string;
  name: string;
  amount: number;
  newLevel: number | null;
  heldAtCap: boolean;
}

/**
 * Adds EXP to one captured Wildkin under its license cap (decision 2: EXP
 * beyond the cap is lost) and logs the gain in exp_events. On a level-up the
 * current HP rises by the max-HP increase (written with hp_updated_at = now).
 * Nothing is written or logged when nothing was gained.
 */
export async function grantWildkinExp(
  tx: Tx,
  args: {
    info: WildkinInfo;
    amount: number;
    source: WildkinExpSource;
    dayKey: string;
    now: Date;
    meta?: Record<string, unknown>;
  },
): Promise<WildkinExpResult> {
  const { info, now } = args;
  const result = applyExpGain({ exp: info.row.exp, level: info.row.level }, args.amount, info.expCap);
  const base = { wildkinId: info.row.id, name: displayName(info), newLevel: result.newLevel, heldAtCap: result.heldAtCap };
  if (result.gained <= 0) return { ...base, amount: 0 };

  let hpUpdate = {};
  if (result.newLevel) {
    const newMax = individualStats(info.creature.baseStats, result.level, info.genome, info.vigor).hp;
    hpUpdate = { currentHp: Math.min(newMax, info.hp + Math.max(0, newMax - info.maxHp)), hpUpdatedAt: now };
  }
  const row = await tx.capturedWildkin.update({ where: { id: info.row.id }, data: { exp: result.exp, level: result.level, ...hpUpdate } });
  // Keep the in-memory info current so a second grant in the same request builds on this one.
  Object.assign(info, { row, ...(result.newLevel ? { stats: individualStats(info.creature.baseStats, row.level, info.genome, info.vigor) } : {}) });
  if (result.newLevel) Object.assign(info, { maxHp: info.stats.hp, hp: row.currentHp });

  await tx.expEvent.create({
    data: {
      playerId: row.playerId,
      track: "wildkin",
      capturedWildkinId: row.id,
      source: args.source,
      amount: result.gained,
      dayKey: args.dayKey,
      meta: { ...(args.meta ?? {}), ...(result.newLevel ? { newLevel: result.newLevel } : {}) } as Prisma.InputJsonObject,
      createdAt: now,
    },
  });
  return { ...base, amount: result.gained };
}

/** How many events of a source the player logged today (daily caps). */
export const countToday = (tx: Tx, playerId: string, source: string, day: string, extra: object = {}) =>
  tx.expEvent.count({ where: { playerId, source, dayKey: day, ...extra } });
