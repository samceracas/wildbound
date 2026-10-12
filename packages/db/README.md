# @wildbound/db

Database layer: Drizzle schema, SQL migrations, PostGIS queries, seed data and test helpers.

## Tech

PostgreSQL 16 with PostGIS 3.4, Drizzle ORM 0.45, `pg`, drizzle-kit for migration generation, `tsx` for scripts.

## Layout

```
migrations/             Committed SQL migrations (the first one enables PostGIS)
seed/
  creatures.json        Kawi, Mimu, Lumae, Kantar, Riverkin
  mabunyi.world.json    Sample world: 1 region, 3 habitats, 7 POIs, 3 encounter tables
src/
  schema.ts             Tables, constraints and indexes
  client.ts             createDb(connectionString)
  world-repo.ts         loadWorld, saveDraft, publishDraft, findSpatialContext, status, creatures
  migrate.ts            runMigrations
  seed-data.ts          Reads and validates the seed JSON
  testing.ts            Test database helpers (@wildbound/db/testing)
  scripts/              migrate, seed, reset
test/
  spatial.test.ts       PostGIS integration tests
```

## Schema highlights

- Geometry columns use SRID 4326 (WGS84 lon/lat) with GiST indexes. Regions are `MultiPolygon`, habitats `Polygon`, POIs `Point`.
- `CHECK (ST_IsValid(geom))` rejects invalid geometry at the database.
- Every world table has the composite key `(id, stage)` with stage `draft` or `published`. Foreign keys include the stage, so draft rows can never reference published rows.
- Encounter tables with a null `habitat_id` are region-wide.
- `publications` records one row per publish. `world_meta` tracks when the draft last changed.
- Distances use `::geography` so results are in meters.

## Commands (run from the repo root)

```bash
pnpm db:up                 # start PostGIS in Docker
pnpm db:migrate            # apply migrations
pnpm db:seed               # seed Wildkin and the sample draft
pnpm db:seed --publish     # also publish
pnpm db:reset              # drop tables and re-migrate
pnpm --filter @wildbound/db generate   # after editing src/schema.ts, generate a new migration
```

After generating a migration, review the SQL. The initial migration was edited by hand to run `CREATE EXTENSION IF NOT EXISTS postgis` first.

## Publishing and saving

- `saveDraft` replaces the whole draft in one transaction, under an advisory lock shared with publishing.
- `publishDraft` loads the saved draft, runs the validator it is given, then copies draft rows to `published` atomically. Nothing changes if validation fails.
- `findSpatialContext` runs the region, habitat, nearby-POI and encounter-table queries for one coordinate. Rules are applied afterwards by `@wildbound/world`.

## Tests

`pnpm test:integration` uses `DATABASE_URL_TEST` (never your dev database). `@wildbound/db/testing` migrates it and truncates world data between tests.
