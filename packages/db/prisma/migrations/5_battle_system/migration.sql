-- v0.3.0: stats, genetics, levels and EXP, wild battles, capture through battle,
-- healing and Field Registry licenses. Generated with `prisma migrate diff`, then
-- edited by hand: backfills for existing rows, CHECK constraints and the partial
-- unique index on active battles (Prisma cannot express these).
--
-- Note: ALTER TYPE ... ADD VALUE runs inside the migration transaction; the new
-- spawn_status value 'in_battle' is not used by any statement below (Postgres
-- only allows using it after the transaction commits).
-- CreateEnum
CREATE TYPE "battle_status" AS ENUM ('active', 'won', 'lost', 'captured', 'escaped', 'abandoned');

-- AlterEnum
ALTER TYPE "spawn_status" ADD VALUE 'in_battle';

-- AlterTable
ALTER TABLE "captured_wildkin" ADD COLUMN     "caught_at_time_of_day" TEXT,
ADD COLUMN     "caught_at_weather" TEXT,
ADD COLUMN     "caught_habitat_id" UUID,
ADD COLUMN     "caught_level" INTEGER,
ADD COLUMN     "current_hp" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "exp" INTEGER NOT NULL DEFAULT 125,
ADD COLUMN     "genome" JSONB NOT NULL DEFAULT '{"build":["S","L"],"temperament":["B","W"],"marking":["+","+"]}',
ADD COLUMN     "hp_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "vigor" JSONB NOT NULL DEFAULT '{"hp":2,"atk":2,"def":2,"spd":2}';

-- AlterTable
ALTER TABLE "creatures" ADD COLUMN     "attacks" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "base_stats" JSONB,
ADD COLUMN     "body_traits" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'TBD',
ADD COLUMN     "gene_pool" JSONB NOT NULL DEFAULT '{"build":{"pAllele":0.5,"byHabitatTag":[]},"temperament":{"pAllele":0.5,"byHabitatTag":[]},"marking":null}';

-- AlterTable
ALTER TABLE "encounter_entries" ADD COLUMN     "max_level" INTEGER,
ADD COLUMN     "min_level" INTEGER;

-- AlterTable
ALTER TABLE "encounter_tables" ADD COLUMN     "max_level" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "min_level" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "habitats" ADD COLUMN     "license_requirement" JSONB;

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "last_battle_exp_at" TIMESTAMPTZ(6),
ADD COLUMN     "rested_charges" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "walk_meter_day" TEXT,
ADD COLUMN     "walk_meter_m" REAL NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "spawns" ADD COLUMN     "genome" JSONB NOT NULL DEFAULT '{"build":["S","L"],"temperament":["B","W"],"marking":["+","+"]}',
ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "vigor" JSONB NOT NULL DEFAULT '{"hp":2,"atk":2,"def":2,"spd":2}';

-- CreateTable
CREATE TABLE "battles" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "spawn_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'wild',
    "status" "battle_status" NOT NULL DEFAULT 'active',
    "turn" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "researcher_licenses" (
    "player_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "exp" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "researcher_licenses_pkey" PRIMARY KEY ("player_id","category")
);

-- CreateTable
CREATE TABLE "assessment_completions" (
    "player_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_completions_pkey" PRIMARY KEY ("player_id","category","rank")
);

-- CreateTable
CREATE TABLE "exp_events" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "track" TEXT NOT NULL,
    "captured_wildkin_id" UUID,
    "category" TEXT,
    "source" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "day_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "exp_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matchup_records" (
    "player_id" UUID NOT NULL,
    "body_trait" TEXT NOT NULL,
    "approach" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matchup_records_pkey" PRIMARY KEY ("player_id","body_trait","approach")
);

-- CreateTable
CREATE TABLE "condition_records" (
    "player_id" UUID NOT NULL,
    "creature_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "condition_records_pkey" PRIMARY KEY ("player_id","creature_id","kind","value")
);

-- CreateTable
CREATE TABLE "phenotype_records" (
    "player_id" UUID NOT NULL,
    "creature_id" TEXT NOT NULL,
    "trait" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phenotype_records_pkey" PRIMARY KEY ("player_id","creature_id","trait")
);

-- CreateTable
CREATE TABLE "habitat_visits" (
    "player_id" UUID NOT NULL,
    "habitat_id" UUID NOT NULL,
    "day_key" TEXT NOT NULL,
    "first_ever" BOOLEAN NOT NULL DEFAULT false,
    "visited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "habitat_visits_pkey" PRIMARY KEY ("player_id","habitat_id","day_key")
);

-- CreateTable
CREATE TABLE "poi_pickups" (
    "player_id" UUID NOT NULL,
    "poi_id" UUID NOT NULL,
    "day_key" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "collected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poi_pickups_pkey" PRIMARY KEY ("player_id","poi_id","day_key")
);

-- CreateIndex
CREATE INDEX "battles_player_id_status_idx" ON "battles"("player_id", "status");

-- CreateIndex
CREATE INDEX "exp_events_player_id_day_key_source_idx" ON "exp_events"("player_id", "day_key", "source");

-- AddForeignKey
ALTER TABLE "battles" ADD CONSTRAINT "battles_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battles" ADD CONSTRAINT "battles_spawn_id_fkey" FOREIGN KEY ("spawn_id") REFERENCES "spawns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "researcher_licenses" ADD CONSTRAINT "researcher_licenses_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_completions" ADD CONSTRAINT "assessment_completions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exp_events" ADD CONSTRAINT "exp_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exp_events" ADD CONSTRAINT "exp_events_captured_wildkin_id_fkey" FOREIGN KEY ("captured_wildkin_id") REFERENCES "captured_wildkin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchup_records" ADD CONSTRAINT "matchup_records_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_records" ADD CONSTRAINT "condition_records_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_records" ADD CONSTRAINT "condition_records_creature_id_fkey" FOREIGN KEY ("creature_id") REFERENCES "creatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phenotype_records" ADD CONSTRAINT "phenotype_records_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phenotype_records" ADD CONSTRAINT "phenotype_records_creature_id_fkey" FOREIGN KEY ("creature_id") REFERENCES "creatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habitat_visits" ADD CONSTRAINT "habitat_visits_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poi_pickups" ADD CONSTRAINT "poi_pickups_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------------ hand-written

-- Database-side UUID defaults, so raw SQL inserts work too (Prisma also generates ids).
ALTER TABLE "battles" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "exp_events" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- One active battle per player: backs the "only once" rule against concurrent requests.
CREATE UNIQUE INDEX "battles_one_active_per_player" ON "battles"("player_id") WHERE "status" = 'active';

-- Wild level ranges.
ALTER TABLE "encounter_tables" ADD CONSTRAINT "encounter_tables_level_range"
  CHECK ("min_level" BETWEEN 1 AND 100 AND "max_level" BETWEEN 1 AND 100 AND "min_level" <= "max_level");
ALTER TABLE "encounter_entries" ADD CONSTRAINT "encounter_entries_level_range"
  CHECK (("min_level" IS NULL AND "max_level" IS NULL)
      OR ("min_level" BETWEEN 1 AND 100 AND "max_level" BETWEEN 1 AND 100 AND "min_level" <= "max_level"));

-- Levels, HP and license rows.
ALTER TABLE "spawns" ADD CONSTRAINT "spawns_level_range" CHECK ("level" BETWEEN 1 AND 100);
ALTER TABLE "captured_wildkin" ADD CONSTRAINT "captured_wildkin_level_range" CHECK ("level" BETWEEN 1 AND 100);
ALTER TABLE "captured_wildkin" ADD CONSTRAINT "captured_wildkin_exp_non_negative" CHECK ("exp" >= 0);
ALTER TABLE "captured_wildkin" ADD CONSTRAINT "captured_wildkin_current_hp_non_negative" CHECK ("current_hp" >= 0);
ALTER TABLE "researcher_licenses" ADD CONSTRAINT "researcher_licenses_rank_range" CHECK ("rank" BETWEEN 1 AND 5);
ALTER TABLE "researcher_licenses" ADD CONSTRAINT "researcher_licenses_exp_non_negative" CHECK ("exp" >= 0);
ALTER TABLE "researcher_licenses" ADD CONSTRAINT "researcher_licenses_category_known"
  CHECK ("category" IN ('aerial', 'aquatic', 'terrestrial', 'verdant'));
ALTER TABLE "assessment_completions" ADD CONSTRAINT "assessment_completions_rank_range" CHECK ("rank" BETWEEN 2 AND 5);
ALTER TABLE "exp_events" ADD CONSTRAINT "exp_events_track_known" CHECK ("track" IN ('wildkin', 'researcher'));
ALTER TABLE "exp_events" ADD CONSTRAINT "exp_events_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "matchup_records" ADD CONSTRAINT "matchup_records_effect_known" CHECK ("effect" IN ('weak', 'resist'));
ALTER TABLE "condition_records" ADD CONSTRAINT "condition_records_kind_known" CHECK ("kind" IN ('time_of_day', 'weather'));
ALTER TABLE "phenotype_records" ADD CONSTRAINT "phenotype_records_trait_known"
  CHECK ("trait" IN ('small', 'large', 'bold', 'wary', 'marking'));
ALTER TABLE "players" ADD CONSTRAINT "players_rested_charges_range" CHECK ("rested_charges" BETWEEN 0 AND 10);

-- ------------------------------------------------------------------ backfills

-- Spawns from before genetics have no level, genome or vigor worth keeping: let them go.
UPDATE "spawns" SET "status" = 'expired' WHERE "status" = 'active';

-- Every existing player starts at rank 1 in all four licenses.
INSERT INTO "researcher_licenses" ("player_id", "category")
SELECT p."id", c."category"
FROM "players" p CROSS JOIN (VALUES ('aerial'), ('aquatic'), ('terrestrial'), ('verdant')) AS c("category")
ON CONFLICT DO NOTHING;

-- Existing captured Wildkin: level 5 (EXP 125), typical genome, vigor 2 (the column defaults),
-- caught at level 5, full HP for their species at level 5:
--   round((floor(base.hp x 2 x 5 / 100) + 5 + 10) x (1 + 2 / 100))
-- Base HP comes from the creature row when it has stats, else the v0.3.0 seed value
-- (PROPOSED) for the five opening Wildkin, else 75 (the stat budget / 4).
-- `pnpm db:seed` later clamps current_hp to the real maximum (see clampCapturedHp).
UPDATE "captured_wildkin" w SET
  "caught_level" = 5,
  "current_hp" = ROUND((FLOOR(COALESCE(
      (c."base_stats" ->> 'hp')::int,
      CASE c."id" WHEN 'kawi' THEN 65 WHEN 'mimu' THEN 70 WHEN 'lumae' THEN 100 WHEN 'kantar' THEN 70 WHEN 'riverkin' THEN 85 ELSE 75 END
    ) * 2 * 5 / 100.0) + 15) * 1.02)
FROM "creatures" c
WHERE c."id" = w."creature_id";
ALTER TABLE "captured_wildkin" ALTER COLUMN "current_hp" DROP DEFAULT;
