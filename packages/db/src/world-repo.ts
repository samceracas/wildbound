import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type {
  CreatureDefinition,
  EncounterTable,
  PublicationStage,
  ValidationReport,
  WorldDocument,
  WorldStatus,
} from "@wildbound/shared";
import { EMPTY_CONDITIONS, NEARBY_POI_LIMIT } from "@wildbound/shared";
import type { Database } from "./client.ts";
import {
  creatures,
  encounterEntries,
  encounterTables,
  habitats,
  pointsOfInterest,
  publications,
  regions,
  worldMeta,
} from "./schema.ts";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Tx;

/** Serializes draft saves and publishes so they never interleave. */
const WORLD_LOCK_KEY = 0x57_42_4e_44; // "WBND"

const geomFromGeoJson = (geometry: object) =>
  sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326)`;

const parseGeo = <T>(value: string): T => JSON.parse(value) as T;

// ------------------------------------------------------------------ creatures

export async function listCreatures(db: Executor): Promise<CreatureDefinition[]> {
  const rows = await db.select().from(creatures).orderBy(asc(creatures.name));
  return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, habitatAffinity: r.habitatAffinity }));
}

export async function upsertCreatures(db: Executor, list: CreatureDefinition[]): Promise<void> {
  if (list.length === 0) return;
  await db
    .insert(creatures)
    .values(list.map((c) => ({ id: c.id, name: c.name, description: c.description, habitatAffinity: c.habitatAffinity })))
    .onConflictDoUpdate({
      target: creatures.id,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        habitatAffinity: sql`excluded.habitat_affinity`,
      },
    });
}

// ------------------------------------------------------------------ load

export async function loadWorld(db: Executor, stage: PublicationStage): Promise<WorldDocument> {
  const [regionRows, habitatRows, poiRows, tableRows, entryRows] = await Promise.all([
    db
      .select({
        id: regions.id,
        slug: regions.slug,
        name: regions.name,
        description: regions.description,
        geometry: sql<string>`ST_AsGeoJSON(${regions.geom})`,
        biomeTags: regions.biomeTags,
        unlockCondition: regions.unlockCondition,
        storyStateRequirements: regions.storyStateRequirements,
        active: regions.active,
      })
      .from(regions)
      .where(eq(regions.stage, stage))
      .orderBy(asc(regions.name), asc(regions.id)),
    db
      .select({
        id: habitats.id,
        regionId: habitats.regionId,
        slug: habitats.slug,
        name: habitats.name,
        description: habitats.description,
        geometry: sql<string>`ST_AsGeoJSON(${habitats.geom})`,
        habitatTags: habitats.habitatTags,
        conditionRules: habitats.conditionRules,
      })
      .from(habitats)
      .where(eq(habitats.stage, stage))
      .orderBy(asc(habitats.name), asc(habitats.id)),
    db
      .select({
        id: pointsOfInterest.id,
        regionId: pointsOfInterest.regionId,
        slug: pointsOfInterest.slug,
        name: pointsOfInterest.name,
        description: pointsOfInterest.description,
        type: pointsOfInterest.type,
        location: sql<string>`ST_AsGeoJSON(${pointsOfInterest.geom})`,
        interactionId: pointsOfInterest.interactionId,
        unlockCondition: pointsOfInterest.unlockCondition,
      })
      .from(pointsOfInterest)
      .where(eq(pointsOfInterest.stage, stage))
      .orderBy(asc(pointsOfInterest.name), asc(pointsOfInterest.id)),
    db
      .select()
      .from(encounterTables)
      .where(eq(encounterTables.stage, stage))
      .orderBy(asc(encounterTables.name), asc(encounterTables.id)),
    db
      .select()
      .from(encounterEntries)
      .where(eq(encounterEntries.stage, stage))
      .orderBy(asc(encounterEntries.position), asc(encounterEntries.id)),
  ]);

  return {
    regions: regionRows.map((r) => ({ ...r, geometry: parseGeo(r.geometry), unlockCondition: r.unlockCondition ?? null })),
    habitats: habitatRows.map((h) => ({ ...h, geometry: parseGeo(h.geometry) })),
    pois: poiRows.map((p) => ({
      ...p,
      type: p.type as WorldDocument["pois"][number]["type"],
      location: parseGeo(p.location),
      unlockCondition: p.unlockCondition ?? null,
    })),
    encounterTables: tableRows.map((t) => toEncounterTable(t, entryRows)),
  };
}

function toEncounterTable(
  t: typeof encounterTables.$inferSelect,
  entries: (typeof encounterEntries.$inferSelect)[],
): EncounterTable {
  return {
    id: t.id,
    name: t.name,
    regionId: t.regionId,
    habitatId: t.habitatId,
    conditionRules: t.conditionRules ?? EMPTY_CONDITIONS,
    active: t.active,
    entries: entries
      .filter((e) => e.tableId === t.id)
      .map((e) => ({ id: e.id, creatureId: e.creatureId, weight: e.weight, conditions: e.conditions })),
  };
}

// ------------------------------------------------------------------ status

export async function getWorldStatus(db: Executor): Promise<WorldStatus> {
  const [meta] = await db.select().from(worldMeta).where(eq(worldMeta.id, 1));
  const [latest] = await db.select().from(publications).orderBy(desc(publications.version)).limit(1);
  const draftUpdatedAt = meta?.draftUpdatedAt ?? null;
  const lastPublishedAt = latest?.publishedAt ?? null;
  return {
    draftUpdatedAt: draftUpdatedAt?.toISOString() ?? null,
    lastPublishedAt: lastPublishedAt?.toISOString() ?? null,
    publishedVersion: latest?.version ?? null,
    hasUnpublishedChanges: draftUpdatedAt !== null && (lastPublishedAt === null || draftUpdatedAt > lastPublishedAt),
  };
}

// ------------------------------------------------------------------ save draft

/**
 * Replaces the entire draft with `doc` in one transaction. Callers must have
 * run integrity validation first; database constraints are the final guard
 * (invalid geometry, broken references, duplicate slugs).
 */
export async function saveDraft(db: Database, doc: WorldDocument): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${WORLD_LOCK_KEY})`);
    // Cascades to habitats, POIs, encounter tables and entries of the draft stage only.
    await tx.delete(regions).where(eq(regions.stage, "draft"));

    if (doc.regions.length) {
      await tx.insert(regions).values(
        doc.regions.map((r) => ({
          id: r.id,
          stage: "draft" as const,
          slug: r.slug,
          name: r.name,
          description: r.description,
          geom: sql`ST_Multi(${geomFromGeoJson(r.geometry)})`,
          biomeTags: r.biomeTags,
          unlockCondition: r.unlockCondition,
          storyStateRequirements: r.storyStateRequirements,
          active: r.active,
        })),
      );
    }
    if (doc.habitats.length) {
      await tx.insert(habitats).values(
        doc.habitats.map((h) => ({
          id: h.id,
          stage: "draft" as const,
          regionId: h.regionId,
          slug: h.slug,
          name: h.name,
          description: h.description,
          geom: geomFromGeoJson(h.geometry),
          habitatTags: h.habitatTags,
          conditionRules: h.conditionRules,
        })),
      );
    }
    if (doc.pois.length) {
      await tx.insert(pointsOfInterest).values(
        doc.pois.map((p) => ({
          id: p.id,
          stage: "draft" as const,
          regionId: p.regionId,
          slug: p.slug,
          name: p.name,
          description: p.description,
          type: p.type,
          geom: geomFromGeoJson(p.location),
          interactionId: p.interactionId,
          unlockCondition: p.unlockCondition,
        })),
      );
    }
    if (doc.encounterTables.length) {
      await tx.insert(encounterTables).values(
        doc.encounterTables.map((t) => ({
          id: t.id,
          stage: "draft" as const,
          regionId: t.regionId,
          habitatId: t.habitatId,
          name: t.name,
          conditionRules: t.conditionRules,
          active: t.active,
        })),
      );
      const entries = doc.encounterTables.flatMap((t) =>
        t.entries.map((e, position) => ({
          id: e.id,
          stage: "draft" as const,
          tableId: t.id,
          creatureId: e.creatureId,
          weight: e.weight,
          conditions: e.conditions,
          position,
        })),
      );
      if (entries.length) await tx.insert(encounterEntries).values(entries);
    }

    await tx
      .insert(worldMeta)
      .values({ id: 1, draftUpdatedAt: sql`clock_timestamp()` })
      .onConflictDoUpdate({ target: worldMeta.id, set: { draftUpdatedAt: sql`clock_timestamp()` } });
  });
}

// ------------------------------------------------------------------ publish

export type PublishResult =
  | { ok: true; version: number; publishedAt: string; report: ValidationReport }
  | { ok: false; report: ValidationReport };

/**
 * Validates the saved draft and, if valid, atomically replaces the published
 * stage with a copy of it. The draft stays editable and independent.
 */
export async function publishDraft(
  db: Database,
  validate: (doc: WorldDocument) => ValidationReport,
): Promise<PublishResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${WORLD_LOCK_KEY})`);
    const draft = await loadWorld(tx, "draft");
    const report = validate(draft);
    if (!report.ok) return { ok: false as const, report };

    await tx.delete(regions).where(eq(regions.stage, "published"));
    await tx.execute(sql`
      INSERT INTO world_regions (id, stage, slug, name, description, geom, biome_tags, unlock_condition, story_state_requirements, active)
      SELECT id, 'published', slug, name, description, geom, biome_tags, unlock_condition, story_state_requirements, active
      FROM world_regions WHERE stage = 'draft'`);
    await tx.execute(sql`
      INSERT INTO habitats (id, stage, region_id, slug, name, description, geom, habitat_tags, condition_rules)
      SELECT id, 'published', region_id, slug, name, description, geom, habitat_tags, condition_rules
      FROM habitats WHERE stage = 'draft'`);
    await tx.execute(sql`
      INSERT INTO points_of_interest (id, stage, region_id, slug, name, description, type, geom, interaction_id, unlock_condition)
      SELECT id, 'published', region_id, slug, name, description, type, geom, interaction_id, unlock_condition
      FROM points_of_interest WHERE stage = 'draft'`);
    await tx.execute(sql`
      INSERT INTO encounter_tables (id, stage, region_id, habitat_id, name, condition_rules, active)
      SELECT id, 'published', region_id, habitat_id, name, condition_rules, active
      FROM encounter_tables WHERE stage = 'draft'`);
    await tx.execute(sql`
      INSERT INTO encounter_entries (id, stage, table_id, creature_id, weight, conditions, position)
      SELECT id, 'published', table_id, creature_id, weight, conditions, position
      FROM encounter_entries WHERE stage = 'draft'`);

    const summary = {
      regions: draft.regions.length,
      habitats: draft.habitats.length,
      pois: draft.pois.length,
      encounterTables: draft.encounterTables.length,
    };
    const [row] = await tx
      .insert(publications)
      .values({ summary, publishedAt: sql`clock_timestamp()` })
      .returning();
    return { ok: true as const, version: row!.version, publishedAt: row!.publishedAt.toISOString(), report };
  });
}

// ------------------------------------------------------------------ spatial resolution

export interface SpatialQuery {
  stage: PublicationStage;
  lat: number;
  lng: number;
  radiusMeters: number;
}

/**
 * Raw spatial lookups for coordinate resolution (PostGIS is authoritative):
 * - region: active region whose geometry covers the point; smallest area wins.
 * - habitat: habitat of that region covering the point; smallest area wins.
 * - POIs: POIs of that region within the radius, nearest first.
 * - tables: active region-wide tables plus the resolved habitat's tables.
 */
export async function findSpatialContext(db: Executor, q: SpatialQuery) {
  const point = sql`ST_SetSRID(ST_MakePoint(${q.lng}, ${q.lat}), 4326)`;

  const [region] = await db
    .select({
      id: regions.id,
      slug: regions.slug,
      name: regions.name,
      description: regions.description,
      biomeTags: regions.biomeTags,
      unlockCondition: regions.unlockCondition,
      storyStateRequirements: regions.storyStateRequirements,
      active: regions.active,
    })
    .from(regions)
    .where(and(eq(regions.stage, q.stage), eq(regions.active, true), sql`ST_Covers(${regions.geom}, ${point})`))
    .orderBy(sql`ST_Area(${regions.geom}::geography) ASC`, asc(regions.id))
    .limit(1);

  const [version] =
    q.stage === "published"
      ? await db.select({ version: publications.version }).from(publications).orderBy(desc(publications.version)).limit(1)
      : [];

  if (!region) {
    return { region: null, habitat: null, pois: [], tables: [], version: version?.version ?? null };
  }

  const [habitat] = await db
    .select({
      id: habitats.id,
      regionId: habitats.regionId,
      slug: habitats.slug,
      name: habitats.name,
      description: habitats.description,
      habitatTags: habitats.habitatTags,
      conditionRules: habitats.conditionRules,
    })
    .from(habitats)
    .where(and(eq(habitats.stage, q.stage), eq(habitats.regionId, region.id), sql`ST_Covers(${habitats.geom}, ${point})`))
    .orderBy(sql`ST_Area(${habitats.geom}::geography) ASC`, asc(habitats.id))
    .limit(1);

  const distance = sql<number>`ST_Distance(${pointsOfInterest.geom}::geography, ${point}::geography)`;
  const pois = await db
    .select({
      id: pointsOfInterest.id,
      slug: pointsOfInterest.slug,
      name: pointsOfInterest.name,
      description: pointsOfInterest.description,
      type: pointsOfInterest.type,
      lat: sql<number>`ST_Y(${pointsOfInterest.geom})`,
      lng: sql<number>`ST_X(${pointsOfInterest.geom})`,
      distanceMeters: distance,
      interactionId: pointsOfInterest.interactionId,
      unlockCondition: pointsOfInterest.unlockCondition,
    })
    .from(pointsOfInterest)
    .where(
      and(
        eq(pointsOfInterest.stage, q.stage),
        eq(pointsOfInterest.regionId, region.id),
        sql`ST_DWithin(${pointsOfInterest.geom}::geography, ${point}::geography, ${q.radiusMeters})`,
      ),
    )
    .orderBy(distance, asc(pointsOfInterest.id))
    .limit(NEARBY_POI_LIMIT);

  const tableRows = await db
    .select()
    .from(encounterTables)
    .where(
      and(
        eq(encounterTables.stage, q.stage),
        eq(encounterTables.regionId, region.id),
        eq(encounterTables.active, true),
        habitat
          ? or(isNull(encounterTables.habitatId), eq(encounterTables.habitatId, habitat.id))
          : isNull(encounterTables.habitatId),
      ),
    );
  const entryRows = tableRows.length
    ? await db
        .select()
        .from(encounterEntries)
        .where(and(eq(encounterEntries.stage, q.stage), inArray(encounterEntries.tableId, tableRows.map((t) => t.id))))
        .orderBy(asc(encounterEntries.position), asc(encounterEntries.id))
    : [];

  return {
    region: { ...region, unlockCondition: region.unlockCondition ?? null },
    habitat: habitat ?? null,
    pois: pois.map((p) => ({
      ...p,
      lat: Number(p.lat),
      lng: Number(p.lng),
      distanceMeters: Number(p.distanceMeters),
      type: p.type as WorldDocument["pois"][number]["type"],
      unlockCondition: p.unlockCondition ?? null,
    })),
    tables: tableRows.map((t) => toEncounterTable(t, entryRows)),
    version: version?.version ?? null,
  };
}
