# @wildbound/db

> Detailed documentation: [docs/03-database.md](../../docs/03-database.md).

Database layer: Prisma schema and migrations, PostGIS queries, the Wildkin encyclopedia (Creature Manager) repository, seed data and test helpers.

## Tech

PostgreSQL 16 with PostGIS 3.4, Prisma 7 with the `@prisma/adapter-pg` driver adapter, `tsx` for scripts.

## Layout

```
prisma.config.ts        Prisma CLI config (schema path, migrations path, DATABASE_URL)
prisma/
  schema.prisma         All models: creatures, Wildkin encyclopedia + art, world (draft/published), players
  migrations/
    0_init/             The original world schema (identical to the old Drizzle migration)
    1_players/          Registry fields on creatures, player tables, hand-written CHECKs
    2_wildkin_manager/  v0.2.0: wildkin_entries, wildkin_art, creatures.movement_style/deleted_at, spawns.heading/moved_at
seed/
  creatures.json        Kawi, Mimu, Lumae, Kantar, Riverkin with Registry data, spawn modifiers and movement style
  wildkin.json          Their full Wildkin Bible entries for the Creature Manager (validated by WildkinEntryInputSchema)
  mabunyi.world.json    Sample world: 1 region, 3 habitats, 7 POIs, 3 encounter tables
src/
  generated/prisma/     Generated client (gitignored; `pnpm install` or `pnpm generate` creates it)
  client.ts             createDb(connectionString) → { db: PrismaClient, close }
  world-repo.ts         loadWorld, saveDraft, publishDraft, findSpatialContext, getWorldStatus, creatures
                        (listCreatures skips soft-deleted species unless { includeDeleted: true })
  wildkin-repo.ts       Encyclopedia: list/get/create/update, publishWildkin (copies game fields into creatures),
                        soft delete/restore (entry + creature), wildkinStats, art save/load, seedWildkinEntries
  migrate.ts            runMigrations(url): baseline old Drizzle DBs, then `prisma migrate deploy`
  seed-data.ts          Reads and validates the seed JSON; seedArtFile reads apps/web/public/wildkin/* PNGs
  testing.ts            Test database helpers (@wildbound/db/testing)
  scripts/              migrate, seed, reset
test/
  spatial.test.ts       PostGIS integration tests
```

## Prisma and PostGIS

Prisma has no geometry type. Geometry columns are declared as `Unsupported("geometry(Polygon,4326)")`, so:

- They exist in migrations, but the generated client never reads or writes them.
- Spatial reads and writes are raw SQL with tagged templates: `db.$queryRaw\`SELECT ST_AsGeoJSON(geom) ... \``, with fragments built from `Prisma.sql`. Values are always parameters, never string concatenation.
- Tables without geometry (encounter tables/entries, creatures, all player tables) use the normal Prisma API (`findMany`, `createMany`, `upsert`, `$transaction`).

`world-repo.ts` shows both styles side by side.

## Schema highlights

- Every geometry column is SRID 4326 with a GiST index. `CHECK (ST_IsValid(geom))` rejects invalid geometry. Prisma cannot express CHECK constraints; they live in the migration SQL.
- Every world table has the composite key `(id, stage)`. Relations include the stage, so draft rows can never reference published rows.
- Player data hangs off `players` with `ON DELETE CASCADE`.
- `wildkin_entries` keeps `id`, `registry_number` (unique) and `name` as columns and every other Bible field in `content` JSON, re-validated with `WildkinEntryInputSchema` on every read. `wildkin_art` stores PNG bytes per entry and kind (`icon`/`sprite`), cascading with the entry.
- `wildkin_entries` and `creatures` share ids by convention (no FK): publishing upserts the creature. Registry numbers are checked across both tables.
- Species are never hard-deleted by the app: `deleted_at` on both tables is a soft delete.
- Distances use `::geography` so results are in meters.

## Commands (run from the repo root)

```bash
pnpm db:up                 # start PostGIS in Docker
pnpm db:migrate            # apply migrations
pnpm db:seed               # seed Wildkin (creatures; encyclopedia entries + art only if missing) and the sample draft
pnpm db:seed --publish     # also publish
pnpm db:reset              # drop tables and re-migrate
pnpm --filter @wildbound/db migrate:new    # after editing schema.prisma: create a migration, review the SQL
pnpm --filter @wildbound/db studio         # browse data in Prisma Studio
```

When a schema change touches a geometry column or needs a CHECK constraint, edit the generated `migration.sql` by hand before applying it.

Seeding and the Creature Manager: `pnpm db:seed` **upserts** the five seed creatures from `creatures.json` every time (so manager edits to *their game fields* are reset; publish again from the manager), but only **inserts missing** encyclopedia entries from `wildkin.json` and imports art from `apps/web/public/wildkin/` only where an entry has none, so authored entries and generated art are kept.

Older databases can hold the seed creatures under other registry numbers (migration `1_players` numbered them alphabetically). Seeding moves them to temporary numbers and then to the canonical ones in one transaction. If a canonical number (1–5) is used by a creature or entry that is *not* seed data, seeding stops and names it: give that Wildkin another number in the Creature Manager and seed again.

## Publishing and saving

- `saveDraft` replaces the whole draft in one interactive transaction, under an advisory lock shared with publishing.
- `publishDraft` loads the saved draft, runs the validator it is given, then copies draft rows to `published` atomically. Nothing changes if validation fails.
- `findSpatialContext` runs the region, habitat, nearby-POI and encounter-table queries for one coordinate. Rules are applied afterwards by `@wildbound/world`.

## Tests

`pnpm test:integration` uses `DATABASE_URL_TEST` (never your dev database). `@wildbound/db/testing` migrates it and truncates world, encyclopedia and player data between tests.
