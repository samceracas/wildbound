-- v0.2.0: Creature Manager (Wildkin encyclopedia + art), soft-deleted creatures, wandering spawns.

-- CreateEnum
CREATE TYPE "wildkin_entry_status" AS ENUM ('draft', 'published');

-- AlterTable
ALTER TABLE "creatures" ADD COLUMN     "movement_style" TEXT NOT NULL DEFAULT 'forager',
ADD COLUMN     "deleted_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "spawns" ADD COLUMN     "heading" DOUBLE PRECISION,
ADD COLUMN     "moved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "wildkin_entries" (
    "id" TEXT NOT NULL,
    "registry_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "wildkin_entry_status" NOT NULL DEFAULT 'draft',
    "content" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "wildkin_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wildkin_art" (
    "entry_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "png" BYTEA NOT NULL,
    "prompt" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wildkin_art_pkey" PRIMARY KEY ("entry_id","kind"),
    CONSTRAINT "wildkin_art_kind_check" CHECK ("kind" IN ('icon', 'sprite'))
);

-- CreateIndex
CREATE UNIQUE INDEX "wildkin_entries_registry_number_key" ON "wildkin_entries"("registry_number");

-- AddForeignKey
ALTER TABLE "wildkin_art" ADD CONSTRAINT "wildkin_art_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "wildkin_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
