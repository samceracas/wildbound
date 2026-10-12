import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { ConditionRules, UnlockCondition } from "@wildbound/shared";

/**
 * Spatial convention: every geometry column is WGS84 lon/lat (SRID 4326).
 * Distances are computed with ::geography so they come back in meters.
 *
 * Draft/published model: each world table has a composite primary key
 * (id, stage). Editors only ever write stage = 'draft'. Publishing copies the
 * draft rows to stage = 'published' in one transaction. The resolver reads
 * 'published' by default, so draft edits never leak to players.
 */

const geometry = (kind: "MultiPolygon" | "Polygon" | "Point") =>
  customType<{ data: string; driverData: string }>({
    dataType: () => `geometry(${kind},4326)`,
  });

export const publicationStage = pgEnum("publication_stage", ["draft", "published"]);

export const creatures = pgTable("creatures", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  habitatAffinity: text("habitat_affinity").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const regions = pgTable(
  "world_regions",
  {
    id: uuid("id").notNull(),
    stage: publicationStage("stage").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    geom: geometry("MultiPolygon")("geom").notNull(),
    biomeTags: text("biome_tags").array().notNull().default(sql`'{}'::text[]`),
    unlockCondition: jsonb("unlock_condition").$type<UnlockCondition>(),
    storyStateRequirements: text("story_state_requirements").array().notNull().default(sql`'{}'::text[]`),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.stage] }),
    unique("world_regions_stage_slug_unique").on(t.stage, t.slug),
    index("world_regions_geom_idx").using("gist", t.geom),
    check("world_regions_geom_valid", sql`ST_IsValid(${t.geom})`),
  ],
);

export const habitats = pgTable(
  "habitats",
  {
    id: uuid("id").notNull(),
    stage: publicationStage("stage").notNull(),
    regionId: uuid("region_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    geom: geometry("Polygon")("geom").notNull(),
    habitatTags: text("habitat_tags").array().notNull().default(sql`'{}'::text[]`),
    conditionRules: jsonb("condition_rules").$type<ConditionRules>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.stage] }),
    foreignKey({ columns: [t.regionId, t.stage], foreignColumns: [regions.id, regions.stage] }).onDelete("cascade"),
    unique("habitats_stage_region_slug_unique").on(t.stage, t.regionId, t.slug),
    index("habitats_geom_idx").using("gist", t.geom),
    check("habitats_geom_valid", sql`ST_IsValid(${t.geom})`),
  ],
);

export const pointsOfInterest = pgTable(
  "points_of_interest",
  {
    id: uuid("id").notNull(),
    stage: publicationStage("stage").notNull(),
    regionId: uuid("region_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    type: text("type").notNull(),
    geom: geometry("Point")("geom").notNull(),
    interactionId: text("interaction_id"),
    unlockCondition: jsonb("unlock_condition").$type<UnlockCondition>(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.stage] }),
    foreignKey({ columns: [t.regionId, t.stage], foreignColumns: [regions.id, regions.stage] }).onDelete("cascade"),
    unique("pois_stage_region_slug_unique").on(t.stage, t.regionId, t.slug),
    index("pois_geom_idx").using("gist", t.geom),
  ],
);

export const encounterTables = pgTable(
  "encounter_tables",
  {
    id: uuid("id").notNull(),
    stage: publicationStage("stage").notNull(),
    regionId: uuid("region_id").notNull(),
    habitatId: uuid("habitat_id"),
    name: text("name").notNull(),
    conditionRules: jsonb("condition_rules").$type<ConditionRules>().notNull(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.stage] }),
    foreignKey({ columns: [t.regionId, t.stage], foreignColumns: [regions.id, regions.stage] }).onDelete("cascade"),
    // MATCH SIMPLE: a null habitat_id (region-wide table) skips this check.
    foreignKey({ columns: [t.habitatId, t.stage], foreignColumns: [habitats.id, habitats.stage] }).onDelete("cascade"),
    index("encounter_tables_region_idx").on(t.stage, t.regionId),
  ],
);

export const encounterEntries = pgTable(
  "encounter_entries",
  {
    id: uuid("id").notNull(),
    stage: publicationStage("stage").notNull(),
    tableId: uuid("table_id").notNull(),
    creatureId: text("creature_id")
      .notNull()
      .references(() => creatures.id, { onDelete: "restrict" }),
    weight: integer("weight").notNull(),
    conditions: jsonb("conditions").$type<ConditionRules>().notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.stage] }),
    foreignKey({ columns: [t.tableId, t.stage], foreignColumns: [encounterTables.id, encounterTables.stage] }).onDelete("cascade"),
    check("encounter_entries_weight_range", sql`${t.weight} BETWEEN 1 AND 1000`),
  ],
);

/** Single-row bookkeeping for the editable draft. */
export const worldMeta = pgTable("world_meta", {
  id: integer("id").primaryKey().default(1),
  draftUpdatedAt: timestamp("draft_updated_at", { withTimezone: true }),
});

/** One row per publish. Full version history of content is deferred. */
export const publications = pgTable("publications", {
  version: serial("version").primaryKey(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  summary: jsonb("summary").$type<Record<string, number>>().notNull(),
});
