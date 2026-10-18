import type {
  ConditionRules,
  CreatureDefinition,
  EncounterTable,
  PoiType,
  PublicationStage,
  UnlockCondition,
  ValidationReport,
  WorldDocument,
  WorldStatus,
} from "@wildbound/shared";
import { CreatureDefinitionSchema, EMPTY_CONDITIONS, NEARBY_POI_LIMIT } from "@wildbound/shared";
import type { Database } from "./client.ts";
import { Prisma } from "./generated/prisma/client.ts";

/** Either the client or the `tx` handed to an interactive transaction. */
export type Executor = Database | Prisma.TransactionClient;

/** Serializes draft saves and publishes so they never interleave. */
const WORLD_LOCK_KEY = 0x57_42_4e_44; // "WBND"

/** Big worlds take a moment to copy; the 5s Prisma default is too tight. */
const WORLD_TX = { timeout: 60_000, maxWait: 10_000 } as const;

const geomFromGeoJson = (geometry: object) =>
  Prisma.sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326)`;
/** null stays SQL NULL (not the JSON literal `null`). */
const json = (value: unknown) => (value === null ? Prisma.sql`NULL` : Prisma.sql`${JSON.stringify(value)}::jsonb`);
const textArray = (value: readonly string[]) => Prisma.sql`${value}::text[]`;
const stageSql = (stage: PublicationStage) => Prisma.sql`${stage}::publication_stage`;

const parseGeo = <T>(value: string): T => JSON.parse(value) as T;

// ------------------------------------------------------------------ creatures

export async function listCreatures(db: Executor): Promise<CreatureDefinition[]> {
  const rows = await db.creature.findMany({ orderBy: [{ registryNumber: "asc" }] });
  // Json columns come back as `unknown`; the schema restores their shape and defaults.
  return rows.map((r) =>
    CreatureDefinitionSchema.parse({
      id: r.id,
      registryNumber: r.registryNumber,
      name: r.name,
      description: r.description,
      habitatAffinity: r.habitatAffinity,
      habitatSummary: r.habitatSummary,
      rarity: r.rarity,
      activityPattern: r.activityPattern,
      spawnModifiers: r.spawnModifiers,
      skills: r.skills,
    }),
  );
}

export async function upsertCreatures(db: Executor, list: CreatureDefinition[]): Promise<void> {
  for (const c of list) {
    const data = {
      registryNumber: c.registryNumber,
      name: c.name,
      description: c.description,
      habitatAffinity: c.habitatAffinity,
      habitatSummary: c.habitatSummary,
      rarity: c.rarity,
      activityPattern: c.activityPattern,
      spawnModifiers: c.spawnModifiers,
      skills: c.skills,
    };
    await db.creature.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
  }
}

// ------------------------------------------------------------------ load

interface RegionRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  geometry: string;
  biome_tags: string[];
  unlock_condition: UnlockCondition;
  story_state_requirements: string[];
  active: boolean;
}
interface HabitatRow {
  id: string;
  region_id: string;
  slug: string;
  name: string;
  description: string;
  geometry: string;
  habitat_tags: string[];
  condition_rules: ConditionRules;
}
interface PoiRow {
  id: string;
  region_id: string;
  slug: string;
  name: string;
  description: string;
  type: string;
  location: string;
  interaction_id: string | null;
  unlock_condition: UnlockCondition;
}

type TableWithEntries = Prisma.EncounterTableGetPayload<{ include: { entries: true } }>;

export async function loadWorld(db: Executor, stage: PublicationStage): Promise<WorldDocument> {
  // Geometry columns are invisible to the Prisma client, so the spatial tables are read with raw SQL.
  const [regionRows, habitatRows, poiRows, tableRows] = await Promise.all([
    db.$queryRaw<RegionRow[]>`
      SELECT id, slug, name, description, ST_AsGeoJSON(geom) AS geometry, biome_tags, unlock_condition,
             story_state_requirements, active
      FROM world_regions WHERE stage = ${stageSql(stage)} ORDER BY name, id`,
    db.$queryRaw<HabitatRow[]>`
      SELECT id, region_id, slug, name, description, ST_AsGeoJSON(geom) AS geometry, habitat_tags, condition_rules
      FROM habitats WHERE stage = ${stageSql(stage)} ORDER BY name, id`,
    db.$queryRaw<PoiRow[]>`
      SELECT id, region_id, slug, name, description, type, ST_AsGeoJSON(geom) AS location, interaction_id, unlock_condition
      FROM points_of_interest WHERE stage = ${stageSql(stage)} ORDER BY name, id`,
    // No geometry here, so the regular Prisma API works.
    db.encounterTable.findMany({
      where: { stage },
      include: { entries: { orderBy: [{ position: "asc" }, { id: "asc" }] } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
  ]);

  return {
    regions: regionRows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      geometry: parseGeo(r.geometry),
      biomeTags: r.biome_tags,
      unlockCondition: r.unlock_condition ?? null,
      storyStateRequirements: r.story_state_requirements,
      active: r.active,
    })),
    habitats: habitatRows.map((h) => ({
      id: h.id,
      regionId: h.region_id,
      slug: h.slug,
      name: h.name,
      description: h.description,
      geometry: parseGeo(h.geometry),
      habitatTags: h.habitat_tags,
      conditionRules: h.condition_rules,
    })),
    pois: poiRows.map((p) => ({
      id: p.id,
      regionId: p.region_id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      type: p.type as PoiType,
      location: parseGeo(p.location),
      interactionId: p.interaction_id,
      unlockCondition: p.unlock_condition ?? null,
    })),
    encounterTables: tableRows.map(toEncounterTable),
  };
}

function toEncounterTable(t: TableWithEntries): EncounterTable {
  return {
    id: t.id,
    name: t.name,
    regionId: t.regionId,
    habitatId: t.habitatId,
    conditionRules: (t.conditionRules as ConditionRules | null) ?? EMPTY_CONDITIONS,
    active: t.active,
    entries: t.entries.map((e) => ({
      id: e.id,
      creatureId: e.creatureId,
      weight: e.weight,
      conditions: e.conditions as ConditionRules,
    })),
  };
}

// ------------------------------------------------------------------ status

export async function getWorldStatus(db: Executor): Promise<WorldStatus> {
  const [meta, latest] = await Promise.all([
    db.worldMeta.findUnique({ where: { id: 1 } }),
    db.publication.findFirst({ orderBy: { version: "desc" } }),
  ]);
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
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${WORLD_LOCK_KEY}::bigint)::text`;
    // Cascades to habitats, POIs, encounter tables and entries of the draft stage only.
    await tx.worldRegion.deleteMany({ where: { stage: "draft" } });

    for (const r of doc.regions) {
      await tx.$executeRaw`
        INSERT INTO world_regions (id, stage, slug, name, description, geom, biome_tags, unlock_condition, story_state_requirements, active)
        VALUES (${r.id}::uuid, 'draft', ${r.slug}, ${r.name}, ${r.description}, ST_Multi(${geomFromGeoJson(r.geometry)}),
                ${textArray(r.biomeTags)}, ${json(r.unlockCondition)}, ${textArray(r.storyStateRequirements)}, ${r.active})`;
    }
    for (const h of doc.habitats) {
      await tx.$executeRaw`
        INSERT INTO habitats (id, stage, region_id, slug, name, description, geom, habitat_tags, condition_rules)
        VALUES (${h.id}::uuid, 'draft', ${h.regionId}::uuid, ${h.slug}, ${h.name}, ${h.description},
                ${geomFromGeoJson(h.geometry)}, ${textArray(h.habitatTags)}, ${json(h.conditionRules)})`;
    }
    for (const p of doc.pois) {
      await tx.$executeRaw`
        INSERT INTO points_of_interest (id, stage, region_id, slug, name, description, type, geom, interaction_id, unlock_condition)
        VALUES (${p.id}::uuid, 'draft', ${p.regionId}::uuid, ${p.slug}, ${p.name}, ${p.description}, ${p.type},
                ${geomFromGeoJson(p.location)}, ${p.interactionId}, ${json(p.unlockCondition)})`;
    }

    // Encounter tables have no geometry: plain Prisma batch inserts.
    if (doc.encounterTables.length) {
      await tx.encounterTable.createMany({
        data: doc.encounterTables.map((t) => ({
          id: t.id,
          stage: "draft",
          regionId: t.regionId,
          habitatId: t.habitatId,
          name: t.name,
          conditionRules: t.conditionRules,
          active: t.active,
        })),
      });
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
      if (entries.length) await tx.encounterEntry.createMany({ data: entries });
    }

    await tx.$executeRaw`
      INSERT INTO world_meta (id, draft_updated_at) VALUES (1, clock_timestamp())
      ON CONFLICT (id) DO UPDATE SET draft_updated_at = clock_timestamp()`;
  }, WORLD_TX);
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
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${WORLD_LOCK_KEY}::bigint)::text`;
    const draft = await loadWorld(tx, "draft");
    const report = validate(draft);
    if (!report.ok) return { ok: false as const, report };

    await tx.worldRegion.deleteMany({ where: { stage: "published" } });
    await tx.$executeRaw`
      INSERT INTO world_regions (id, stage, slug, name, description, geom, biome_tags, unlock_condition, story_state_requirements, active)
      SELECT id, 'published', slug, name, description, geom, biome_tags, unlock_condition, story_state_requirements, active
      FROM world_regions WHERE stage = 'draft'`;
    await tx.$executeRaw`
      INSERT INTO habitats (id, stage, region_id, slug, name, description, geom, habitat_tags, condition_rules)
      SELECT id, 'published', region_id, slug, name, description, geom, habitat_tags, condition_rules
      FROM habitats WHERE stage = 'draft'`;
    await tx.$executeRaw`
      INSERT INTO points_of_interest (id, stage, region_id, slug, name, description, type, geom, interaction_id, unlock_condition)
      SELECT id, 'published', region_id, slug, name, description, type, geom, interaction_id, unlock_condition
      FROM points_of_interest WHERE stage = 'draft'`;
    await tx.$executeRaw`
      INSERT INTO encounter_tables (id, stage, region_id, habitat_id, name, condition_rules, active)
      SELECT id, 'published', region_id, habitat_id, name, condition_rules, active
      FROM encounter_tables WHERE stage = 'draft'`;
    await tx.$executeRaw`
      INSERT INTO encounter_entries (id, stage, table_id, creature_id, weight, conditions, position)
      SELECT id, 'published', table_id, creature_id, weight, conditions, position
      FROM encounter_entries WHERE stage = 'draft'`;

    const summary = {
      regions: draft.regions.length,
      habitats: draft.habitats.length,
      pois: draft.pois.length,
      encounterTables: draft.encounterTables.length,
    };
    // clock_timestamp() (not now()) so publishedAt is later than a draft saved earlier in the same test transaction.
    const [row] = await tx.$queryRaw<{ version: number; published_at: Date }[]>`
      INSERT INTO publications (summary, published_at) VALUES (${json(summary)}, clock_timestamp())
      RETURNING version, published_at`;
    return { ok: true as const, version: row!.version, publishedAt: row!.published_at.toISOString(), report };
  }, WORLD_TX);
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
  const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${q.lng}::float8, ${q.lat}::float8), 4326)`;
  const stage = stageSql(q.stage);

  const [region] = await db.$queryRaw<Omit<RegionRow, "geometry">[]>`
    SELECT id, slug, name, description, biome_tags, unlock_condition, story_state_requirements, active
    FROM world_regions
    WHERE stage = ${stage} AND active AND ST_Covers(geom, ${point})
    ORDER BY ST_Area(geom::geography) ASC, id ASC
    LIMIT 1`;

  const latest =
    q.stage === "published" ? await db.publication.findFirst({ orderBy: { version: "desc" }, select: { version: true } }) : null;
  const version = latest?.version ?? null;

  if (!region) return { region: null, habitat: null, pois: [], tables: [], version };

  const [habitat] = await db.$queryRaw<Omit<HabitatRow, "geometry">[]>`
    SELECT id, region_id, slug, name, description, habitat_tags, condition_rules
    FROM habitats
    WHERE stage = ${stage} AND region_id = ${region.id}::uuid AND ST_Covers(geom, ${point})
    ORDER BY ST_Area(geom::geography) ASC, id ASC
    LIMIT 1`;

  const pois = await db.$queryRaw<(Omit<PoiRow, "location" | "region_id"> & { lat: number; lng: number; distance_meters: number })[]>`
    SELECT id, slug, name, description, type, ST_Y(geom) AS lat, ST_X(geom) AS lng,
           ST_Distance(geom::geography, ${point}::geography) AS distance_meters, interaction_id, unlock_condition
    FROM points_of_interest
    WHERE stage = ${stage} AND region_id = ${region.id}::uuid
      AND ST_DWithin(geom::geography, ${point}::geography, ${q.radiusMeters}::float8)
    ORDER BY distance_meters ASC, id ASC
    LIMIT ${NEARBY_POI_LIMIT}`;

  const tables = await db.encounterTable.findMany({
    where: {
      stage: q.stage,
      regionId: region.id,
      active: true,
      OR: habitat ? [{ habitatId: null }, { habitatId: habitat.id }] : [{ habitatId: null }],
    },
    include: { entries: { orderBy: [{ position: "asc" }, { id: "asc" }] } },
  });

  return {
    region: {
      id: region.id,
      slug: region.slug,
      name: region.name,
      description: region.description,
      biomeTags: region.biome_tags,
      unlockCondition: region.unlock_condition ?? null,
      storyStateRequirements: region.story_state_requirements,
      active: region.active,
    },
    habitat: habitat
      ? {
          id: habitat.id,
          regionId: habitat.region_id,
          slug: habitat.slug,
          name: habitat.name,
          description: habitat.description,
          habitatTags: habitat.habitat_tags,
          conditionRules: habitat.condition_rules,
        }
      : null,
    pois: pois.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      type: p.type as PoiType,
      lat: Number(p.lat),
      lng: Number(p.lng),
      distanceMeters: Number(p.distance_meters),
      interactionId: p.interaction_id,
      unlockCondition: p.unlock_condition ?? null,
    })),
    tables: tables.map(toEncounterTable),
    version,
  };
}
