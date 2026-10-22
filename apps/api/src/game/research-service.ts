import { Prisma, listCreatures, loadWorld } from "@wildbound/db";
import {
  BODY_TRAIT_NAMES,
  APPROACH_NAMES,
  BUILD_NAMES,
  CATEGORIES,
  CATEGORY_CAPSULES,
  CATEGORY_NAMES,
  EXP_RULES,
  LICENSE_MAX_RANK,
  RESEARCH_RULES,
  TEMPERAMENT_NAMES,
  assessmentFor,
  scannerShows,
  obedienceCap,
  type AssessmentResponse,
  type AvailableWildkin,
  type BodyTrait,
  type Approach,
  type Category,
  type CategoryOrTbd,
  type CreatureDefinition,
  type Genome,
  type LicenseView,
  type LicensesResponse,
  type ObserveResponse,
  type PhenotypeRecordTrait,
  type ResearcherExpGain,
  type ResearcherExpSource,
  type MatchupEffect,
} from "@wildbound/shared";
import {
  assessmentProgress,
  categoryPresence,
  categoryWeights,
  explorationExp,
  observationExp,
  observationResearcherExp,
  phenotype,
  phenotypeRecordExp,
  phenotypeRecordTraits,
  rankThreshold,
  achievableAssessmentLimits,
  canAct,
  splitResearcherExp,
  type RequirementCounts,
} from "@wildbound/world";
import { conflict } from "../http.ts";
import {
  creatureMap,
  getTracked,
  insertOnce,
  isCategory,
  loadLicenses,
  nowOf,
  playerDayKey,
  rankFor,
  requirePosition,
  type Creatures,
  type GameDeps,
  type Tx,
} from "./common.ts";
import { grantItems } from "./care-service.ts";
import { stationInRange } from "./pois.ts";
import { loadActionableSpawn } from "./service.ts";
import { registryView, spawnView, type FieldKnowledge } from "./views.ts";
import { countToday, grantWildkinExp, leadOf, loadWildkin } from "./wildkin.ts";

/**
 * Field Registry research: researcher EXP (always earned by learning, never by
 * battling, and always for one category), condition, phenotype and matchup
 * records, habitat visits, licenses and assessments.
 */

/** Adds researcher EXP to one category's license and logs it. */
export async function grantResearcherExp(
  tx: Tx,
  args: {
    playerId: string;
    category: CategoryOrTbd;
    source: ResearcherExpSource;
    amount: number;
    dayKey: string;
    now: Date;
    reason: string;
    meta?: Record<string, unknown>;
  },
): Promise<ResearcherExpGain | null> {
  if (!isCategory(args.category) || args.amount <= 0) return null;
  const { playerId, category, amount } = args;
  await tx.researcherLicense.upsert({
    where: { playerId_category: { playerId, category } },
    create: { playerId, category, exp: amount },
    update: { exp: { increment: amount } },
  });
  await tx.expEvent.create({
    data: { playerId, track: "researcher", category, source: args.source, amount, dayKey: args.dayKey, meta: (args.meta ?? {}) as Prisma.InputJsonObject, createdAt: args.now },
  });
  return { category, amount, reason: args.reason };
}

const PHENOTYPE_WORDS: Record<PhenotypeRecordTrait, string> = {
  small: BUILD_NAMES.small,
  large: BUILD_NAMES.large,
  bold: TEMPERAMENT_NAMES.bold,
  wary: TEMPERAMENT_NAMES.wary,
  marking: "Marked",
};

const TEMPERAMENT_TRAITS: readonly PhenotypeRecordTrait[] = ["bold", "wary"];

/**
 * How a phenotype record is named. Temperament is visible to any observer, so it
 * is always recorded, but it is only named from the scanner depth that shows it.
 */
export function phenotypeWord(trait: PhenotypeRecordTrait, creature: CreatureDefinition, rank: number): string {
  if (trait === "marking") return creature.genePool.marking?.name ?? "Marked";
  if (TEMPERAMENT_TRAITS.includes(trait) && !scannerShows("temperament", rank)) return "Temperament variant of";
  return PHENOTYPE_WORDS[trait];
}

/**
 * Records the visible phenotypes of an individual (observed or captured); first records give researcher EXP.
 * `rank` is the player's license rank in the species' category (it decides how the record is worded).
 */
export async function recordPhenotypes(
  tx: Tx,
  args: { playerId: string; creature: CreatureDefinition; genome: Genome; rank: number; dayKey: string; now: Date },
): Promise<ResearcherExpGain[]> {
  const gains: ResearcherExpGain[] = [];
  for (const trait of phenotypeRecordTraits(phenotype(args.genome))) {
    const fresh = await insertOnce(
      tx.phenotypeRecord.createMany({
        data: [{ playerId: args.playerId, creatureId: args.creature.id, trait, recordedAt: args.now }],
        skipDuplicates: true,
      }),
    );
    if (!fresh) continue;
    const word = phenotypeWord(trait, args.creature, args.rank);
    const gain = await grantResearcherExp(tx, {
      ...args,
      category: args.creature.category,
      source: "phenotype-record",
      amount: phenotypeRecordExp(trait),
      reason: `${word} ${args.creature.name} recorded`,
      meta: { creatureId: args.creature.id, trait },
    });
    if (gain) gains.push(gain);
  }
  return gains;
}

/** Records a matchup discovered in battle (per body trait); the first record gives researcher EXP to the target's category. */
export async function recordMatchup(
  tx: Tx,
  args: { playerId: string; bodyTrait: BodyTrait; approach: Approach; effect: MatchupEffect; category: CategoryOrTbd; dayKey: string; now: Date },
): Promise<{ line: string; gain: ResearcherExpGain | null } | null> {
  const fresh = await insertOnce(
    tx.matchupRecord.createMany({
      data: [{ playerId: args.playerId, bodyTrait: args.bodyTrait, approach: args.approach, effect: args.effect, recordedAt: args.now }],
      skipDuplicates: true,
    }),
  );
  if (!fresh) return null;
  const line = `Field note recorded: ${BODY_TRAIT_NAMES[args.bodyTrait]} ${args.effect === "weak" ? "is weak to" : "resists"} ${APPROACH_NAMES[args.approach]}`;
  const gain = await grantResearcherExp(tx, {
    ...args,
    source: "matchup-record",
    amount: RESEARCH_RULES.matchupRecord,
    reason: line,
    meta: { bodyTrait: args.bodyTrait, approach: args.approach, effect: args.effect },
  });
  return { line, gain };
}

// ------------------------------------------------------------------ observe

/**
 * Observe a spawn: unlocks the species' Registry entry, reveals the spawn's
 * level and hints, records condition and phenotype records, and awards
 * researcher EXP and the lead's observation EXP, all in one transaction.
 */
export async function observeSpawn(deps: GameDeps, playerId: string, spawnId: string): Promise<ObserveResponse> {
  const { spawn, tracked, now } = await loadActionableSpawn(deps, playerId, spawnId);
  const day = await playerDayKey(deps, deps.db, playerId, now);
  const creatures = await creatureMap(deps.db);
  const creature = creatures.get(spawn.creatureId)!;

  return deps.db.$transaction(async (tx) => {
    const previous = await tx.registryEntry.findUnique({ where: { playerId_creatureId: { playerId, creatureId: creature.id } } });
    const entry = await tx.registryEntry.upsert({
      where: { playerId_creatureId: { playerId, creatureId: creature.id } },
      create: { playerId, creatureId: creature.id, firstObservedAt: now },
      update: { timesObserved: { increment: 1 } },
    });
    const updated = await tx.spawn.update({ where: { id: spawn.id }, data: { observedAt: spawn.observedAt ?? now } });

    const gains: ResearcherExpGain[] = [];
    const push = (g: ResearcherExpGain | null) => g && gains.push(g);
    const base = { playerId, category: creature.category, dayKey: day, now };
    const perSpecies = { meta: { path: ["creatureId"], equals: creature.id } };

    // First observation, or a repeat (up to 5 per species per day).
    const repeats = previous ? await countToday(tx, playerId, "repeat-observation", day, perSpecies) : 0;
    const amount = observationResearcherExp(previous === null, repeats);
    push(
      await grantResearcherExp(tx, {
        ...base,
        source: previous ? "repeat-observation" : "first-observation",
        amount,
        reason: previous ? `Observed ${creature.name} again` : `First observation of ${creature.name}`,
        meta: { creatureId: creature.id },
      }),
    );

    // New time of day / weather for this species.
    for (const [kind, value, words] of [
      ["time_of_day", spawn.timeOfDay, `at ${spawn.timeOfDay}`],
      ["weather", spawn.weather, `in ${spawn.weather} weather`],
    ] as const) {
      const fresh = await insertOnce(
        tx.conditionRecord.createMany({ data: [{ playerId, creatureId: creature.id, kind, value, recordedAt: now }], skipDuplicates: true }),
      );
      if (fresh) {
        push(
          await grantResearcherExp(tx, {
            ...base,
            source: "condition-record",
            amount: RESEARCH_RULES.conditionRecord,
            reason: `${creature.name} seen ${words}`,
            meta: { creatureId: creature.id, kind, value },
          }),
        );
      }
    }

    const licenses = await loadLicenses(tx, playerId);
    gains.push(
      ...(await recordPhenotypes(tx, {
        playerId,
        creature,
        genome: updated.genome as Genome,
        rank: rankFor(licenses, creature.category),
        dayKey: day,
        now,
      })),
    );

    // The lead's observation EXP: the first observation of each species per day, 5 per day.
    let leadExp: ObserveResponse["leadExp"] = null;
    const lead = leadOf(await loadWildkin(tx, playerId, creatures, licenses, now));
    if (lead) {
      const speciesToday = await countToday(tx, playerId, "observation", day, perSpecies);
      const total = await countToday(tx, playerId, "observation", day);
      if (speciesToday === 0 && total < EXP_RULES.observationsPerDay) {
        const r = await grantWildkinExp(tx, {
          info: lead,
          amount: observationExp(lead.row.level),
          source: "observation",
          dayKey: day,
          now,
          meta: { creatureId: creature.id },
        });
        if (r.amount > 0) leadExp = { wildkinId: r.wildkinId, name: r.name, amount: r.amount, newLevel: r.newLevel };
      }
    }

    const knowledge = await fieldKnowledge(tx, playerId);
    return {
      entry: registryView(creature, entry, knowledge),
      firstObservation: previous === null,
      spawn: spawnView(updated, creature, tracked, { rank: rankFor(licenses, creature.category), battleLocked: null }),
      researcherExp: gains,
      leadExp,
    };
  });
}

// ------------------------------------------------------------------ habitat visits

/**
 * Called from the game-state tick when the player's position resolves to a
 * habitat: the first visit each day (or ever) gives researcher EXP, split by
 * the categories of the Wildkin available there, and the lead exploration EXP.
 */
export async function recordHabitatVisit(
  deps: GameDeps,
  args: { playerId: string; habitat: { id: string; name: string }; available: readonly AvailableWildkin[]; creatures: Creatures; now: Date },
): Promise<void> {
  const { playerId, habitat, now } = args;
  const day = await playerDayKey(deps, deps.db, playerId, now);
  if (await deps.db.habitatVisit.findUnique({ where: { playerId_habitatId_dayKey: { playerId, habitatId: habitat.id, dayKey: day } } })) return;

  await deps.db.$transaction(async (tx) => {
    const firstEver = (await tx.habitatVisit.count({ where: { playerId, habitatId: habitat.id } })) === 0;
    const fresh = await insertOnce(
      tx.habitatVisit.createMany({ data: [{ playerId, habitatId: habitat.id, dayKey: day, firstEver, visitedAt: now }], skipDuplicates: true }),
    );
    if (!fresh) return;

    const categories = new Map([...args.creatures.values()].map((c) => [c.id, c.category] as const));
    const amount = firstEver ? RESEARCH_RULES.habitatFirstVisit : RESEARCH_RULES.habitatDailyVisit;
    for (const part of splitResearcherExp(amount, categoryWeights(args.available, categories))) {
      await grantResearcherExp(tx, {
        playerId,
        category: part.category,
        source: firstEver ? "habitat-first-visit" : "habitat-daily-visit",
        amount: part.amount,
        dayKey: day,
        now,
        reason: firstEver ? `First visit to ${habitat.name}` : `Visit to ${habitat.name}`,
        meta: { habitatId: habitat.id },
      });
    }

    const lead = leadOf(await loadWildkin(tx, playerId, args.creatures, await loadLicenses(tx, playerId), now));
    if (lead && (await countToday(tx, playerId, "exploration", day)) < EXP_RULES.explorationsPerDay) {
      await grantWildkinExp(tx, { info: lead, amount: explorationExp(lead.row.level), source: "exploration", dayKey: day, now, meta: { habitatId: habitat.id } });
    }
  });
}

// ------------------------------------------------------------------ registry knowledge

export async function fieldKnowledge(tx: Tx, playerId: string): Promise<FieldKnowledge> {
  const [matchups, conditions, phenotypes, licenses] = await Promise.all([
    tx.matchupRecord.findMany({ where: { playerId } }),
    tx.conditionRecord.findMany({ where: { playerId } }),
    tx.phenotypeRecord.findMany({ where: { playerId } }),
    loadLicenses(tx, playerId),
  ]);
  const add = (map: Map<string, Set<string>>, key: string, value: string) => map.set(key, (map.get(key) ?? new Set()).add(value));
  const k = {
    matchups: new Map<string, Map<string, "weak" | "resist">>(),
    timesOfDay: new Map<string, Set<string>>(),
    weathers: new Map<string, Set<string>>(),
    phenotypes: new Map<string, Set<string>>(),
    licenses,
  };
  for (const m of matchups) k.matchups.set(m.bodyTrait, (k.matchups.get(m.bodyTrait) ?? new Map()).set(m.approach, m.effect as "weak" | "resist"));
  for (const c of conditions) add(c.kind === "time_of_day" ? k.timesOfDay : k.weathers, c.creatureId, c.value);
  for (const p of phenotypes) add(k.phenotypes, p.creatureId, p.trait);
  return k;
}

// ------------------------------------------------------------------ licenses

/** The player's progress on every requirement type, for one category. */
async function requirementCounts(
  tx: Tx,
  playerId: string,
  speciesIds: string[],
  bodyTraits: string[],
  categoryHabitats: string[],
): Promise<RequirementCounts> {
  const creatureId = { in: speciesIds };
  const [species, times, weathers, captures, wins, matchups, phenotypes, visits] = await Promise.all([
    tx.registryEntry.count({ where: { playerId, creatureId } }),
    tx.conditionRecord.findMany({ where: { playerId, creatureId, kind: "time_of_day" }, distinct: ["value"], select: { value: true } }),
    tx.conditionRecord.findMany({ where: { playerId, creatureId, kind: "weather" }, distinct: ["value"], select: { value: true } }),
    tx.registryEntry.aggregate({ where: { playerId, creatureId }, _sum: { timesCaptured: true } }),
    tx.battle.count({ where: { playerId, status: { in: ["won", "captured"] }, spawn: { creatureId } } }),
    tx.matchupRecord.count({ where: { playerId, bodyTrait: { in: bodyTraits } } }),
    tx.phenotypeRecord.count({ where: { playerId, creatureId } }),
    tx.habitatVisit.findMany({ where: { playerId, habitatId: { in: categoryHabitats } }, distinct: ["habitatId"], select: { habitatId: true } }),
  ]);
  return {
    observeDistinctSpecies: species,
    observeTimesOfDay: times.length,
    observeWeathers: weathers.length,
    captureCount: captures._sum.timesCaptured ?? 0,
    winBattles: wins,
    recordMatchups: matchups,
    recordPhenotypes: phenotypes,
    visitHabitats: visits.length,
  };
}

interface LicenseContext {
  licenses: Awaited<ReturnType<typeof loadLicenses>>;
  station: { id: string; name: string } | null;
}

async function licenseView(deps: GameDeps, tx: Tx, playerId: string, category: Category, ctx: LicenseContext): Promise<LicenseView> {
  const [world, live, all] = await Promise.all([loadWorld(tx, "published"), listCreatures(tx), listCreatures(tx, { includeDeleted: true })]);
  const presence = categoryPresence(world, live, category);
  const ofCategory = all.filter((c) => c.category === category);
  const counts = await requirementCounts(
    tx,
    playerId,
    ofCategory.map((c) => c.id),
    [...new Set(ofCategory.flatMap((c) => c.bodyTraits))],
    [...presence.habitatIds],
  );
  const { rank, exp } = ctx.licenses[category];
  const nextRank = rank < LICENSE_MAX_RANK ? rank + 1 : null;
  const nextThreshold = nextRank ? rankThreshold(nextRank) : null;
  const requirements = nextRank
    ? assessmentProgress(assessmentFor(nextRank)!, counts, achievableAssessmentLimits(world, live, category), { relaxWeather: deps.relaxWeather })
    : [];
  const expMet = nextThreshold !== null && exp >= nextThreshold;
  const checklistMet = nextRank !== null && requirements.every((r) => r.met);
  const atStation = ctx.station !== null;
  let blockedReason: string | null = null;
  if (!nextRank) blockedReason = "Highest rank reached";
  else if (!expMet) blockedReason = `Needs ${nextThreshold} researcher EXP (${exp} so far)`;
  else if (!checklistMet) blockedReason = "Complete the assessment checklist first";
  else if (!atStation) blockedReason = "Go to a field station such as East Research Gate";
  return {
    category,
    name: CATEGORY_NAMES[category],
    rank,
    obedienceCap: obedienceCap(rank),
    exp,
    nextThreshold,
    currentThreshold: rankThreshold(rank),
    nextRank,
    requirements,
    expMet,
    checklistMet,
    atStation,
    canTakeAssessment: blockedReason === null,
    blockedReason,
  };
}

async function licenseContext(tx: Tx, playerId: string, now: Date): Promise<LicenseContext> {
  const { tracked } = await getTracked(tx, playerId);
  const poi = tracked && canAct(tracked, now) ? await stationInRange(tx, tracked) : null;
  return { licenses: await loadLicenses(tx, playerId), station: poi ? { id: poi.id, name: poi.name } : null };
}

export async function licensesView(deps: GameDeps, playerId: string): Promise<LicensesResponse> {
  const now = nowOf(deps);
  const ctx = await licenseContext(deps.db, playerId, now);
  const licenses: LicenseView[] = [];
  for (const category of CATEGORIES) licenses.push(await licenseView(deps, deps.db, playerId, category, ctx));
  return { licenses, station: ctx.station };
}

/**
 * Take the next rank's assessment at a field station. On success, in one
 * transaction: rank + 1, the completion row (its primary key makes each
 * rank-up happen once), the rank-up grants, and hp_updated_at = now for
 * Wildkin of the category that are no longer restless (so they do not heal
 * retroactively for the time they were frozen).
 */
export async function takeAssessment(deps: GameDeps, playerId: string, category: Category): Promise<AssessmentResponse> {
  const now = nowOf(deps);
  const licenses = await loadLicenses(deps.db, playerId);
  const { rank } = licenses[category];
  if (rank >= LICENSE_MAX_RANK) throw conflict("max_rank", `Your ${CATEGORY_NAMES[category]} license is already at the highest rank`);
  const at = await requirePosition(deps, playerId, now);
  const station = await stationInRange(deps.db, at);
  if (!station) throw conflict("not_at_station", "Assessments are taken at a field station such as East Research Gate");

  const ctx: LicenseContext = { licenses, station: { id: station.id, name: station.name } };
  const before = await licenseView(deps, deps.db, playerId, category, ctx);
  if (!before.expMet) {
    throw conflict("exp_too_low", `Needs ${before.nextThreshold} ${CATEGORY_NAMES[category]} researcher EXP (${before.exp} so far)`, {
      exp: before.exp,
      threshold: before.nextThreshold,
    });
  }
  if (!before.checklistMet) {
    throw conflict("assessment_incomplete", "The assessment checklist is not complete yet", { requirements: before.requirements });
  }

  const newRank = rank + 1;
  const result = await deps.db.$transaction(async (tx) => {
    const { count } = await tx.researcherLicense.updateMany({ where: { playerId, category, rank }, data: { rank: newRank } });
    if (count !== 1) throw conflict("conflict", "The license changed meanwhile; try again");
    await tx.assessmentCompletion.create({ data: { playerId, category, rank: newRank, completedAt: now } });
    const granted = await grantItems(tx, playerId, {
      [CATEGORY_CAPSULES[category]]: RESEARCH_RULES.grantCategoryCapsules,
      "field-capsule": RESEARCH_RULES.grantFieldCapsules,
    });

    // Wildkin of this category between the old and the new cap cooperate now.
    const species = (await listCreatures(tx, { includeDeleted: true })).filter((c) => c.category === category).map((c) => c.id);
    const { count: calmed } = await tx.capturedWildkin.updateMany({
      where: { playerId, creatureId: { in: species }, level: { gt: obedienceCap(rank), lte: obedienceCap(newRank) } },
      data: { hpUpdatedAt: now },
    });
    return { granted, calmed };
  });

  const summary = [`${CATEGORY_NAMES[category]} license rank ${newRank}: Wildkin up to level ${obedienceCap(newRank)} cooperate with you`];
  if (result.calmed > 0) summary.push(`${result.calmed} Wildkin ${result.calmed === 1 ? "is" : "are"} no longer restless`);
  for (const g of result.granted) {
    if (g.quantity > 0) summary.push(`Received ${g.quantity} ${g.name}`);
    if (g.truncated > 0) summary.push(`${g.truncated} ${g.name} did not fit in your satchel`);
  }
  const after = await licenseView(deps, deps.db, playerId, category, { licenses: await loadLicenses(deps.db, playerId), station: ctx.station });
  return { license: after, summary, granted: result.granted.map((g) => ({ itemId: g.itemId, quantity: g.quantity })) };
}
