import {
  PUBLISH_REQUIRED_FIELDS,
  WildkinEntryInputSchema,
  type ArtKind,
  type CreatureDefinition,
  type ValidationIssue,
  type WildkinArtInfo,
  type WildkinEntry,
  type WildkinEntryData,
  type WildkinStats,
  type WildkinSummary,
} from "@wildbound/shared";
import type { Database } from "./client.ts";
import type { WildkinArt, WildkinEntry as WildkinEntryRow } from "./generated/prisma/client.ts";
import type { Executor } from "./world-repo.ts";

/**
 * Wildkin encyclopedia (Creature Manager). An entry is the Bible record for a
 * species; `publishWildkin` copies its game fields into `creatures`, which is
 * all the editor and the game ever read.
 */

type ArtMeta = Pick<WildkinArt, "kind" | "createdAt">;
type RowWithArt = WildkinEntryRow & { art: ArtMeta[] };

const artSelect = { select: { kind: true, createdAt: true } } as const;

export class WildkinRepoError extends Error {
  constructor(
    readonly code: "not_found" | "conflict" | "publish_incomplete" | "deleted",
    message: string,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(message);
  }
}

function artInfo(art: ArtMeta[]): WildkinArtInfo {
  const latest = art.reduce<Date | null>((max, a) => (!max || a.createdAt > max ? a.createdAt : max), null);
  return {
    icon: art.some((a) => a.kind === "icon"),
    sprite: art.some((a) => a.kind === "sprite"),
    version: latest ? String(latest.getTime()) : null,
  };
}

/** Columns hold id/registryNumber/name; everything else is in `content`. */
function toEntry(row: RowWithArt): WildkinEntry {
  const data = WildkinEntryInputSchema.parse({
    ...(row.content as object),
    id: row.id,
    registryNumber: row.registryNumber,
    name: row.name,
  });
  return {
    ...data,
    status: row.status,
    hasUnpublishedChanges: row.status === "published" && row.publishedAt !== null && row.updatedAt > row.publishedAt,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    art: artInfo(row.art),
  };
}

const summarize = (e: WildkinEntry): WildkinSummary => ({
  id: e.id,
  registryNumber: e.registryNumber,
  name: e.name,
  classification: e.classification,
  rarity: e.rarity,
  status: e.status,
  hasUnpublishedChanges: e.hasUnpublishedChanges,
  updatedAt: e.updatedAt,
  publishedAt: e.publishedAt,
  deletedAt: e.deletedAt,
  art: e.art,
});

function contentOf(data: WildkinEntryData): object {
  const { id: _id, registryNumber: _rn, name: _name, ...content } = data;
  return content;
}

/** The game-facing projection of an entry (what lands in `creatures`). */
export function creatureFromEntry(data: WildkinEntryData): CreatureDefinition {
  return {
    id: data.id,
    registryNumber: data.registryNumber,
    name: data.name,
    description: (data.identity || data.physicalDescription).slice(0, 2000),
    habitatAffinity: data.habitatTags,
    habitatSummary: data.habitatSummary.slice(0, 2000),
    rarity: data.rarity,
    activityPattern: data.activityPattern,
    spawnModifiers: data.spawnModifiers,
    skills: data.skills,
    movementStyle: data.movementStyle,
  };
}

/** Fields that must be filled before an entry can reach the game. */
export function publishIssues(data: WildkinEntryData): ValidationIssue[] {
  return PUBLISH_REQUIRED_FIELDS.filter((f) => String(data[f] ?? "").trim() === "").map((f) => ({
    severity: "error" as const,
    code: "required",
    entityType: "wildkin" as const,
    entityId: data.id,
    message: `${f} is required before publishing`,
  }));
}

async function loadRow(db: Executor, id: string): Promise<RowWithArt> {
  const row = await db.wildkinEntry.findUnique({ where: { id }, include: { art: artSelect } });
  if (!row) throw new WildkinRepoError("not_found", `No Wildkin with id "${id}"`);
  return row;
}

/** Registry numbers are shared with creatures that were never authored here (e.g. seeded ones). */
async function assertRegistryNumberFree(db: Executor, id: string, registryNumber: number) {
  const [entry, creature] = await Promise.all([
    db.wildkinEntry.findFirst({ where: { registryNumber, NOT: { id } }, select: { id: true } }),
    db.creature.findFirst({ where: { registryNumber, NOT: { id } }, select: { id: true } }),
  ]);
  const owner = entry?.id ?? creature?.id;
  if (owner) throw new WildkinRepoError("conflict", `Registry number ${registryNumber} is already used by "${owner}"`);
}

export type DeletedFilter = "exclude" | "include" | "only";

export async function listWildkin(db: Executor, deleted: DeletedFilter = "exclude"): Promise<WildkinSummary[]> {
  const where = deleted === "exclude" ? { deletedAt: null } : deleted === "only" ? { deletedAt: { not: null } } : {};
  const rows = await db.wildkinEntry.findMany({ where, orderBy: { registryNumber: "asc" }, include: { art: artSelect } });
  return rows.map((r) => summarize(toEntry(r)));
}

export async function getWildkin(db: Executor, id: string): Promise<WildkinEntry> {
  return toEntry(await loadRow(db, id));
}

export async function createWildkin(db: Database, data: WildkinEntryData, now = new Date()): Promise<WildkinEntry> {
  return db.$transaction(async (tx) => {
    if (await tx.wildkinEntry.findUnique({ where: { id: data.id }, select: { id: true } })) {
      throw new WildkinRepoError("conflict", `A Wildkin with id "${data.id}" already exists`);
    }
    if (await tx.creature.findUnique({ where: { id: data.id }, select: { id: true } })) {
      throw new WildkinRepoError("conflict", `A creature with id "${data.id}" already exists in the game data`);
    }
    await assertRegistryNumberFree(tx, data.id, data.registryNumber);
    const row = await tx.wildkinEntry.create({
      data: {
        id: data.id,
        registryNumber: data.registryNumber,
        name: data.name,
        content: contentOf(data),
        createdAt: now,
        updatedAt: now,
      },
      include: { art: artSelect },
    });
    return toEntry(row);
  });
}

export async function updateWildkin(db: Database, data: WildkinEntryData, now = new Date()): Promise<WildkinEntry> {
  return db.$transaction(async (tx) => {
    const current = await loadRow(tx, data.id);
    if (current.deletedAt) throw new WildkinRepoError("deleted", "Restore this Wildkin before editing it");
    await assertRegistryNumberFree(tx, data.id, data.registryNumber);
    const row = await tx.wildkinEntry.update({
      where: { id: data.id },
      data: { registryNumber: data.registryNumber, name: data.name, content: contentOf(data), updatedAt: now },
      include: { art: artSelect },
    });
    return toEntry(row);
  });
}

/** Copies the entry into `creatures` (insert or update) and marks it published. */
export async function publishWildkin(db: Database, id: string, now = new Date()): Promise<WildkinEntry> {
  return db.$transaction(async (tx) => {
    const current = toEntry(await loadRow(tx, id));
    if (current.deletedAt) throw new WildkinRepoError("deleted", "Restore this Wildkin before publishing it");
    const issues = publishIssues(current);
    if (issues.length) throw new WildkinRepoError("publish_incomplete", "Fill in the required fields before publishing", issues);
    await assertRegistryNumberFree(tx, id, current.registryNumber);

    const { id: _id, ...fields } = creatureFromEntry(current);
    await tx.creature.upsert({ where: { id }, create: { id, ...fields }, update: { ...fields, deletedAt: null } });
    const row = await tx.wildkinEntry.update({
      where: { id },
      // updatedAt = publishedAt so the entry reads as "no unpublished changes".
      data: { status: "published", publishedAt: now, updatedAt: now },
      include: { art: artSelect },
    });
    return toEntry(row);
  });
}

/** Soft delete: the entry is hidden and the species stops spawning; Registry history is kept. */
export async function softDeleteWildkin(db: Database, id: string, now = new Date()): Promise<void> {
  await db.$transaction(async (tx) => {
    await loadRow(tx, id);
    await tx.wildkinEntry.update({ where: { id }, data: { deletedAt: now } });
    await tx.creature.updateMany({ where: { id }, data: { deletedAt: now } });
  });
}

export async function restoreWildkin(db: Database, id: string): Promise<WildkinEntry> {
  return db.$transaction(async (tx) => {
    await loadRow(tx, id);
    await tx.creature.updateMany({ where: { id }, data: { deletedAt: null } });
    return toEntry(await tx.wildkinEntry.update({ where: { id }, data: { deletedAt: null }, include: { art: artSelect } }));
  });
}

export async function wildkinStats(db: Executor): Promise<WildkinStats> {
  const [entries, maxCreature] = await Promise.all([
    db.wildkinEntry.findMany({ include: { art: artSelect } }),
    db.creature.aggregate({ _max: { registryNumber: true } }),
  ]);
  const all = entries.map(toEntry);
  const live = all.filter((e) => !e.deletedAt);
  const byRarity: Record<string, number> = {};
  for (const e of live) byRarity[e.rarity] = (byRarity[e.rarity] ?? 0) + 1;
  const maxEntry = all.reduce((m, e) => Math.max(m, e.registryNumber), 0);
  return {
    total: live.length,
    published: live.filter((e) => e.status === "published").length,
    drafts: live.filter((e) => e.status === "draft").length,
    unpublishedChanges: live.filter((e) => e.hasUnpublishedChanges).length,
    deleted: all.length - live.length,
    withArt: live.filter((e) => e.art.icon).length,
    byRarity,
    nextRegistryNumber: Math.max(maxEntry, maxCreature._max.registryNumber ?? 0) + 1,
  };
}

// ------------------------------------------------------------------ art

export async function saveWildkinArt(
  db: Executor,
  entryId: string,
  kind: ArtKind,
  png: Uint8Array,
  meta: { prompt: string; model: string },
  now = new Date(),
): Promise<void> {
  const data = { png: Buffer.from(png), prompt: meta.prompt, model: meta.model, createdAt: now };
  await db.wildkinArt.upsert({
    where: { entryId_kind: { entryId, kind } },
    create: { entryId, kind, ...data },
    update: data,
  });
}

/** PNG bytes for a non-deleted entry, or null. */
export async function loadWildkinArt(db: Executor, entryId: string, kind: ArtKind): Promise<{ png: Uint8Array; createdAt: Date } | null> {
  const art = await db.wildkinArt.findFirst({
    where: { entryId, kind, entry: { deletedAt: null } },
    select: { png: true, createdAt: true },
  });
  return art ? { png: art.png, createdAt: art.createdAt } : null;
}

// ------------------------------------------------------------------ seeding

/**
 * Inserts encyclopedia entries that do not exist yet (never overwrites authored
 * work). Entries whose creature already exists in the game data are marked
 * published.
 */
export async function seedWildkinEntries(db: Executor, list: WildkinEntryData[], now = new Date()): Promise<number> {
  let created = 0;
  for (const data of list) {
    if (await db.wildkinEntry.findUnique({ where: { id: data.id }, select: { id: true } })) continue;
    const published = (await db.creature.findUnique({ where: { id: data.id }, select: { id: true } })) !== null;
    await db.wildkinEntry.create({
      data: {
        id: data.id,
        registryNumber: data.registryNumber,
        name: data.name,
        content: contentOf(data),
        status: published ? "published" : "draft",
        createdAt: now,
        updatedAt: now,
        publishedAt: published ? now : null,
      },
    });
    created++;
  }
  return created;
}
