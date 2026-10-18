# @wildbound/db

Database layer: Prisma schema and migrations, PostGIS queries, seed data and test helpers.

## Tech

PostgreSQL 16 with PostGIS 3.4, Prisma 7 with the `@prisma/adapter-pg` driver adapter, `tsx` for scripts.

## Layout

```
prisma.config.ts        Prisma CLI config (schema path, migrations path, DATABASE_URL)
prisma/
  schema.prisma         All models: world (draft/published) + players
  migrations/
    0_init/             The original world schema (identical to the old Drizzle migration)
    1_players/          Registry fields on creatures, player tables, hand-written CHECKs
seed/
  creatures.json        Kawi, Mimu, Lumae, Kantar, Riverkin with Registry data and spawn modifiers
  mabunyi.world.json    Sample world: 1 region, 3 habitats, 7 POIs, 3 encounter tables
src/
  generated/prisma/     Generated client (gitignored; `pnpm install` or `pnpm generate` creates it)
  client.ts             createDb(connectionString) → { db: PrismaClient, close }
  world-repo.ts         loadWorld, saveDraft, publishDraft, findSpatialContext, getWorldStatus, creatures
  migrate.ts            runMigrations(url): baseline old Drizzle DBs, then `prisma migrate deploy`
  seed-data.ts          Reads and validates the seed JSON
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
- Distances use `::geography` so results are in meters.

## Commands (run from the repo root)

```bash
pnpm db:up                 # start PostGIS in Docker
pnpm db:migrate            # apply migrations
pnpm db:seed               # seed Wildkin and the sample draft
pnpm db:seed --publish     # also publish
pnpm db:reset              # drop tables and re-migrate
pnpm --filter @wildbound/db migrate:new    # after editing schema.prisma: create a migration, review the SQL
pnpm --filter @wildbound/db studio         # browse data in Prisma Studio
```

When a schema change touches a geometry column or needs a CHECK constraint, edit the generated `migration.sql` by hand before applying it.

## Publishing and saving

- `saveDraft` replaces the whole draft in one interactive transaction, under an advisory lock shared with publishing.
- `publishDraft` loads the saved draft, runs the validator it is given, then copies draft rows to `published` atomically. Nothing changes if validation fails.
- `findSpatialContext` runs the region, habitat, nearby-POI and encounter-table queries for one coordinate. Rules are applied afterwards by `@wildbound/world`.

## Tests

`pnpm test:integration` uses `DATABASE_URL_TEST` (never your dev database). `@wildbound/db/testing` migrates it and truncates world and player data between tests.
