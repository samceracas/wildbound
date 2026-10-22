# @wildbound/db

> Detailed documentation: [docs/03-database.md](../../docs/03-database.md).

Database layer: Prisma schema and migrations, PostGIS queries, the Wildkin encyclopedia (Creature Manager) repository, seed data and test helpers. Since v0.3.0 it also holds the battle, license, EXP and research tables.

## Tech

PostgreSQL 16 with PostGIS 3.4, Prisma 7 with the `@prisma/adapter-pg` driver adapter, `tsx` for scripts.

## Layout

```
prisma.config.ts        Prisma CLI config (schema path, migrations path, DATABASE_URL)
prisma/
  schema.prisma         All models: creatures, Wildkin encyclopedia + art, world (draft/published), players, battles, licenses,
                        EXP events and research records
  migrations/
    0_init/             The original world schema (identical to the old Drizzle migration)
    1_players/          Registry fields on creatures, player tables, hand-written CHECKs
    2_wildkin_manager/  v0.2.0: wildkin_entries, wildkin_art, creatures.movement_style/deleted_at, spawns.heading/moved_at
    3_registry_description/  v0.2.0: backfills registryDescription in wildkin_entries.content
    4_registry_number_reuse/ v0.2.0: registry numbers unique only among non-deleted rows (partial indexes)
    5_battle_system/    v0.3.0: creature battle fields (category, body_traits, base_stats, attacks, gene_pool), wild level
                        ranges on encounter tables/entries, habitats.license_requirement, spawn level/genome/vigor and the
                        in_battle status, captured Wildkin level/exp/genome/vigor/current_hp/hp_updated_at and catch record,
                        player rested and walking columns, new tables battles, researcher_licenses, assessment_completions,
                        exp_events, matchup_records, condition_records, phenotype_records, habitat_visits, poi_pickups.
                        Hand-written backfills (active spawns expired, captured Wildkin level 5, rank 1 licenses for every
                        player), CHECKs and the one-active-battle-per-player partial unique index
seed/
  creatures.json        Kawi, Mimu, Lumae, Kantar, Riverkin with Registry data, spawn modifiers, movement style and (v0.3.0,
                        PROPOSED) category, body traits, base stats, placeholder attacks and gene pool
  wildkin.json          Their full Wildkin Bible entries for the Creature Manager (validated by WildkinEntryInputSchema)
  mabunyi.world.json    Sample world: 1 region, 3 habitats, 7 POIs, 3 encounter tables (wild levels 2 to 6, 3 to 8, 4 to 10;
                        Riverkin 5 to 12)
src/
  generated/prisma/     Generated client (gitignored; `pnpm install` or `pnpm generate` creates it)
  client.ts             createDb(connectionString) → { db: PrismaClient, close }
  world-repo.ts         loadWorld, saveDraft, publishDraft, findSpatialContext, getWorldStatus, creatures
                        (listCreatures skips soft-deleted species unless { includeDeleted: true }); also the creature
                        battle fields, level ranges and license requirements
  wildkin-repo.ts       Encyclopedia: list/get/create/update, publishWildkin (copies game fields into creatures; publishIssues
                        checks the battle fields), soft delete/restore (entry + creature), wildkinStats (incl. battleReady),
                        art save/load, seedWildkinEntries, backfillBattleFields (v0.3.0 fields into older seed entries)
  player-repo.ts        clampCapturedHp: lowers captured Wildkin HP above their maximum (run by the seed)
  migrate.ts            runMigrations(url): baseline old Drizzle DBs, then `prisma migrate deploy`
  seed-data.ts          Reads and validates the seed JSON; seedArtFile reads apps/web/public/wildkin/* PNGs
  testing.ts            Test database helpers (@wildbound/db/testing): openTestDb, resetTestData, createTestPlayer (with
                        licenses), maxHpOf, createTestWildkin (level, HP, slot, genome, vigor), createTestBattle
  scripts/              migrate, seed, reset
test/
  spatial.test.ts       PostGIS integration tests
  seed.test.ts          Seed data validity and seeding
  migration.test.ts     Applies migrations 0 to 4 to a scratch database, inserts v0.2.0 rows, applies 5 and checks the
                        backfills, the one-active-battle index and a CHECK (the test user needs CREATEDB)
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
- Species are soft-deleted (`deleted_at` on both tables) unless the Creature Manager's permanent delete is used.
- Genomes, vigor, gene pools, base stats, attacks and battle state are JSON columns validated by the shared Zod schemas; phenotypes are always derived, never stored.
- Every "only once" rule (one active battle, first matchup/condition/phenotype records, daily habitat visits, daily POI pickups, assessment completions) is a primary key or unique index, so concurrent requests cannot double-award. `exp_events` logs every EXP gain and is the source for daily caps (no counter table).
- Distances use `::geography` so results are in meters.

## Commands (run from the repo root)

```bash
pnpm db:up                 # start PostGIS in Docker
pnpm db:migrate            # apply migrations
pnpm db:seed               # seed Wildkin (creatures; encyclopedia entries + art only if missing; battle fields backfilled) and the sample draft
pnpm db:seed --publish     # also publish
pnpm db:reset              # drop tables and re-migrate
pnpm --filter @wildbound/db migrate:new    # after editing schema.prisma: create a migration, review the SQL
pnpm --filter @wildbound/db studio         # browse data in Prisma Studio
```

When a schema change touches a geometry column or needs a CHECK constraint, edit the generated `migration.sql` by hand before applying it.

Seeding and the Creature Manager: `pnpm db:seed` **upserts** the five seed creatures from `creatures.json` every time (so manager edits to *their game fields* are reset; publish again from the manager), but only **inserts missing** encyclopedia entries from `wildkin.json` and imports art from `apps/web/public/wildkin/` only where an entry has none, so authored entries and generated art are kept. Since v0.3.0 it also fills the battle fields (category, body traits, base stats, attacks, gene pool) into those five entries when they are missing or still at their defaults (`backfillBattleFields`, keeps anything an author set), and clamps captured Wildkin HP to their maximum (`clampCapturedHp`). `pnpm db:seed --force --publish` gives a playable v0.3.0 world.

Older databases can hold the seed creatures under other registry numbers (migration `1_players` numbered them alphabetically). Seeding moves them to temporary numbers and then to the canonical ones in one transaction. If a canonical number (1–5) is used by a creature or entry that is *not* seed data, seeding stops and names it: give that Wildkin another number in the Creature Manager and seed again.

## Publishing and saving

- `saveDraft` replaces the whole draft in one interactive transaction, under an advisory lock shared with publishing.
- `publishDraft` loads the saved draft, runs the validator it is given, then copies draft rows to `published` atomically. Nothing changes if validation fails.
- `findSpatialContext` runs the region, habitat, nearby-POI and encounter-table queries for one coordinate. Rules are applied afterwards by `@wildbound/world`.

## Tests

`pnpm test:integration` uses `DATABASE_URL_TEST` (never your dev database). `@wildbound/db/testing` migrates it and truncates world, encyclopedia, player, battle and research data between tests.
