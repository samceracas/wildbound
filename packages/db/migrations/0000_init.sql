-- PostGIS must exist before any geometry column. Spatial convention: SRID 4326 (WGS84 lon/lat).
CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TYPE "public"."publication_stage" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "creatures" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"habitat_affinity" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encounter_entries" (
	"id" uuid NOT NULL,
	"stage" "publication_stage" NOT NULL,
	"table_id" uuid NOT NULL,
	"creature_id" text NOT NULL,
	"weight" integer NOT NULL,
	"conditions" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "encounter_entries_id_stage_pk" PRIMARY KEY("id","stage"),
	CONSTRAINT "encounter_entries_weight_range" CHECK ("encounter_entries"."weight" BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "encounter_tables" (
	"id" uuid NOT NULL,
	"stage" "publication_stage" NOT NULL,
	"region_id" uuid NOT NULL,
	"habitat_id" uuid,
	"name" text NOT NULL,
	"condition_rules" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "encounter_tables_id_stage_pk" PRIMARY KEY("id","stage")
);
--> statement-breakpoint
CREATE TABLE "habitats" (
	"id" uuid NOT NULL,
	"stage" "publication_stage" NOT NULL,
	"region_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"geom" geometry(Polygon,4326) NOT NULL,
	"habitat_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"condition_rules" jsonb NOT NULL,
	CONSTRAINT "habitats_id_stage_pk" PRIMARY KEY("id","stage"),
	CONSTRAINT "habitats_stage_region_slug_unique" UNIQUE("stage","region_id","slug"),
	CONSTRAINT "habitats_geom_valid" CHECK (ST_IsValid("habitats"."geom"))
);
--> statement-breakpoint
CREATE TABLE "points_of_interest" (
	"id" uuid NOT NULL,
	"stage" "publication_stage" NOT NULL,
	"region_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" text NOT NULL,
	"geom" geometry(Point,4326) NOT NULL,
	"interaction_id" text,
	"unlock_condition" jsonb,
	CONSTRAINT "points_of_interest_id_stage_pk" PRIMARY KEY("id","stage"),
	CONSTRAINT "pois_stage_region_slug_unique" UNIQUE("stage","region_id","slug")
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"version" serial PRIMARY KEY NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_regions" (
	"id" uuid NOT NULL,
	"stage" "publication_stage" NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"geom" geometry(MultiPolygon,4326) NOT NULL,
	"biome_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"unlock_condition" jsonb,
	"story_state_requirements" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "world_regions_id_stage_pk" PRIMARY KEY("id","stage"),
	CONSTRAINT "world_regions_stage_slug_unique" UNIQUE("stage","slug"),
	CONSTRAINT "world_regions_geom_valid" CHECK (ST_IsValid("world_regions"."geom"))
);
--> statement-breakpoint
CREATE TABLE "world_meta" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"draft_updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "encounter_entries" ADD CONSTRAINT "encounter_entries_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_entries" ADD CONSTRAINT "encounter_entries_table_id_stage_encounter_tables_id_stage_fk" FOREIGN KEY ("table_id","stage") REFERENCES "public"."encounter_tables"("id","stage") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_tables" ADD CONSTRAINT "encounter_tables_region_id_stage_world_regions_id_stage_fk" FOREIGN KEY ("region_id","stage") REFERENCES "public"."world_regions"("id","stage") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_tables" ADD CONSTRAINT "encounter_tables_habitat_id_stage_habitats_id_stage_fk" FOREIGN KEY ("habitat_id","stage") REFERENCES "public"."habitats"("id","stage") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habitats" ADD CONSTRAINT "habitats_region_id_stage_world_regions_id_stage_fk" FOREIGN KEY ("region_id","stage") REFERENCES "public"."world_regions"("id","stage") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_of_interest" ADD CONSTRAINT "points_of_interest_region_id_stage_world_regions_id_stage_fk" FOREIGN KEY ("region_id","stage") REFERENCES "public"."world_regions"("id","stage") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "encounter_tables_region_idx" ON "encounter_tables" USING btree ("stage","region_id");--> statement-breakpoint
CREATE INDEX "habitats_geom_idx" ON "habitats" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "pois_geom_idx" ON "points_of_interest" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "world_regions_geom_idx" ON "world_regions" USING gist ("geom");