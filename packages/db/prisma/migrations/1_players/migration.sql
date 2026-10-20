-- CreateEnum
CREATE TYPE "spawn_status" AS ENUM ('active', 'captured', 'fled', 'expired');

-- AlterTable
ALTER TABLE "creatures" ADD COLUMN     "activity_pattern" TEXT NOT NULL DEFAULT 'TBD',
ADD COLUMN     "habitat_summary" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "rarity" TEXT NOT NULL DEFAULT 'common',
ADD COLUMN     "registry_number" INTEGER,
ADD COLUMN     "skills" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "spawn_modifiers" JSONB NOT NULL DEFAULT '{}';

-- Backfill registry numbers for creatures that existed before this migration
-- (alphabetical; `pnpm db:seed` then sets the canonical numbers), then require them.
UPDATE "creatures" c SET "registry_number" = n.rn
FROM (SELECT "id", row_number() OVER (ORDER BY "id") AS rn FROM "creatures") n
WHERE c."id" = n."id";
ALTER TABLE "creatures" ALTER COLUMN "registry_number" SET NOT NULL;

-- CreateTable
CREATE TABLE "players" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_sessions" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "player_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_positions" (
    "player_id" UUID NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy_m" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "time_zone" TEXT,

    CONSTRAINT "player_positions_pkey" PRIMARY KEY ("player_id")
);

-- CreateTable
CREATE TABLE "spawns" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "creature_id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "region_id" UUID,
    "habitat_id" UUID,
    "time_of_day" TEXT NOT NULL,
    "weather" TEXT NOT NULL,
    "status" "spawn_status" NOT NULL DEFAULT 'active',
    "observed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "spawns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registry_entries" (
    "player_id" UUID NOT NULL,
    "creature_id" TEXT NOT NULL,
    "first_observed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "times_observed" INTEGER NOT NULL DEFAULT 1,
    "first_captured_at" TIMESTAMPTZ(6),
    "times_captured" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "registry_entries_pkey" PRIMARY KEY ("player_id","creature_id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "player_id" UUID NOT NULL,
    "item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("player_id","item_id")
);

-- CreateTable
CREATE TABLE "captured_wildkin" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "creature_id" TEXT NOT NULL,
    "nickname" TEXT,
    "party_slot" INTEGER,
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "captured_wildkin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_username_key" ON "players"("username");

-- CreateIndex
CREATE UNIQUE INDEX "player_sessions_token_hash_key" ON "player_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "player_sessions_player_id_idx" ON "player_sessions"("player_id");

-- CreateIndex
CREATE INDEX "spawns_player_id_status_expires_at_idx" ON "spawns"("player_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "captured_wildkin_player_id_idx" ON "captured_wildkin"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "captured_wildkin_player_id_party_slot_key" ON "captured_wildkin"("player_id", "party_slot");

-- CreateIndex
CREATE UNIQUE INDEX "creatures_registry_number_key" ON "creatures"("registry_number");

-- AddForeignKey
ALTER TABLE "player_sessions" ADD CONSTRAINT "player_sessions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_positions" ADD CONSTRAINT "player_positions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spawns" ADD CONSTRAINT "spawns_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spawns" ADD CONSTRAINT "spawns_creature_id_fkey" FOREIGN KEY ("creature_id") REFERENCES "creatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry_entries" ADD CONSTRAINT "registry_entries_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry_entries" ADD CONSTRAINT "registry_entries_creature_id_fkey" FOREIGN KEY ("creature_id") REFERENCES "creatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captured_wildkin" ADD CONSTRAINT "captured_wildkin_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captured_wildkin" ADD CONSTRAINT "captured_wildkin_creature_id_fkey" FOREIGN KEY ("creature_id") REFERENCES "creatures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written CHECK constraints (Prisma cannot express these).
ALTER TABLE "creatures" ADD CONSTRAINT "creatures_registry_number_positive" CHECK ("registry_number" > 0);
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_quantity_non_negative" CHECK ("quantity" >= 0);
ALTER TABLE "captured_wildkin" ADD CONSTRAINT "captured_wildkin_party_slot_range" CHECK ("party_slot" IS NULL OR "party_slot" BETWEEN 0 AND 5);
ALTER TABLE "player_positions" ADD CONSTRAINT "player_positions_lat_range" CHECK ("lat" BETWEEN -90 AND 90);
ALTER TABLE "player_positions" ADD CONSTRAINT "player_positions_lng_range" CHECK ("lng" BETWEEN -180 AND 180);
