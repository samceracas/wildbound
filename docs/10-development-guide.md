# 10 · Development guide

> **In plain English:** how to get the project running on your computer, which commands do what, how the automated
> tests work, and what to do when something goes wrong.

## Contents

- [Prerequisites](#prerequisites)
- [First-time setup](#first-time-setup)
- [Daily workflow](#daily-workflow)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Testing](#testing)
- [Code conventions](#code-conventions)
- [Before you commit](#before-you-commit)
- [Troubleshooting](#troubleshooting)
- [Running without Docker](#running-without-docker)

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 22 | Uses `process.loadEnvFile` |
| pnpm | 10 (`packageManager: pnpm@10.28.0`) | `corepack enable` |
| Docker Desktop | any recent | Runs PostGIS. Or install PostgreSQL 16 + PostGIS 3 natively (below) |
| A Chromium-based browser | – | For DevTools → Sensors (fake location) |

## First-time setup

```bash
pnpm install                    # installs everything and generates the Prisma client
cp .env.example .env            # Windows: copy .env.example .env
pnpm db:up                      # PostGIS on localhost:5432 (creates wildbound + wildbound_test)
pnpm db:migrate                 # apply migrations to the dev DB
pnpm db:migrate --test          # …and to the test DB (tests also do this themselves)
pnpm db:seed --publish          # 5 Wildkin (+ encyclopedia entries and art) + Mabunyi sample world, published
```

Optional, for the Creature Manager's AI helpers: put `GROQ_API_KEY` (free at <https://console.groq.com/keys>) and
`PIXELLAB_API_KEY` in `.env`. Everything else works without them.

```mermaid
flowchart LR
    i["pnpm install"] --> e["cp .env.example .env"] --> up["pnpm db:up"] --> m["pnpm db:migrate"] --> s["pnpm db:seed --publish"] --> d["pnpm dev"]
```

## Daily workflow

```bash
pnpm dev          # API (:4000), editor (:5173), game (:5174) and Creature Manager (:5175) together
# or one at a time, each in its own terminal:
pnpm dev:api
pnpm dev:editor
pnpm dev:web
pnpm dev:manager
```

| URL | What |
|---|---|
| http://localhost:5173 | Map Editor |
| http://localhost:5174 | The game (use DevTools → Sensors → `14.6518, 121.0444`) |
| http://localhost:5175 | Creature Manager |
| http://localhost:4000/api/health | API health |

The API restarts on file changes (`tsx watch`); the Vite apps hot-reload. Changes in `packages/*` are picked up by
both because they are consumed as source.

## Environment variables

All in the repo-root `.env` (read by the API and DB scripts via `process.loadEnvFile`, and by Vite via `envDir`).

| Variable | Used by | Purpose | Default / example |
|---|---|---|---|
| `DATABASE_URL` | api, db scripts | Dev DB | `postgres://postgres:postgres@localhost:5432/wildbound` |
| `DATABASE_URL_TEST` | tests | Test DB (**must differ** from `DATABASE_URL`) | `…/wildbound_test` |
| `API_PORT`, `API_HOST` | api | Bind address | `4000`, `127.0.0.1` |
| `EDITOR_TOKEN` | api | Bearer token for `/api/editor/*` and `/api/manager/*` | `dev-editor-token` |
| `CORS_ORIGINS` | api | Allowed browser origins (comma separated) | `http://localhost:5173,http://localhost:5174,http://localhost:5175` |
| `WORLD_TIMEZONE` | api | Fallback time zone | `Asia/Manila` |
| `WEATHER_API_URL` | api | Open-Meteo endpoint, or `off` | `https://api.open-meteo.com/v1/forecast` |
| `SECURE_COOKIES` | api | `true` behind HTTPS | `false` |
| `GROQ_API_KEY` | api | Creature Manager AI assistant; empty = off | unset |
| `GROQ_MODEL` | api | Groq chat model (JSON mode) | `llama-3.3-70b-versatile` |
| `LORE_MAX_CHARS` | api | Canon characters sent per assistant request; lower it on Groq's free tier | `30000` |
| `LORE_DOCS_DIR` | api (optional) | Folder with the `WILDBOUND_*.docx` canon | repo `docs/` |
| `GROQ_API_URL`, `PIXELLAB_API_URL` | api (optional) | Override the service base URLs | Groq / PixelLab v2 |
| `PIXELLAB_API_KEY` | api, and `.mcp.json` (shell env) | Creature Manager art generation; empty = off. Also used by the PixelLab MCP tool | unset |
| `VITE_API_URL` | editor, manager | API base URL | `http://localhost:4000` |
| `VITE_EDITOR_TOKEN` | editor, manager | Token they send (must equal `EDITOR_TOKEN`) | `dev-editor-token` |
| `VITE_MAP_STYLE` | editor (optional) | Streets basemap style URL | OpenFreeMap Liberty |
| `API_PROXY_TARGET` | web dev server (shell env) | Where Vite proxies `/api` | `http://localhost:4000` |
| `PRISMA_MIGRATE_VERBOSE` | db scripts (shell env) | Show Prisma CLI output | unset |

Restart the dev servers after editing `.env` (Vite reads `VITE_*` at startup).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | API, editor, game and Creature Manager in parallel |
| `pnpm dev:api` / `dev:editor` / `dev:web` / `dev:manager` | One app |
| `pnpm build` | Production build of editor, web and manager (`tsc` then `vite build`) |
| `pnpm build:manager` | Production build of the manager only |
| `pnpm typecheck` | `tsc` in every package |
| `pnpm test` | Unit + integration tests |
| `pnpm test:unit` | No database needed |
| `pnpm test:integration` | API + PostGIS tests (needs `pnpm db:up`) |
| `pnpm test:exercises` | Exercise tests (fail until you implement them) |
| `pnpm db:up` / `db:down` | Start / stop the PostGIS container |
| `pnpm db:migrate [--test]` | Apply migrations (baselines an old Drizzle DB first) |
| `pnpm db:seed [--force] [--publish] [--creatures]` | Seed (see [03](03-database.md#seed-data)). Re-seeding resets the five seed creatures' game fields but keeps encyclopedia entries |
| `pnpm db:reset [--test]` | Drop all WILDBOUND tables and re-migrate (data loss!) |
| `pnpm --filter @wildbound/db migrate:new` | Create a migration from `schema.prisma` changes |
| `pnpm --filter @wildbound/db generate` | Regenerate the Prisma client |
| `pnpm --filter @wildbound/db studio` | Prisma Studio |
| `node docs/images/generate-charts.mjs` | Regenerate documentation charts |

## Testing

`vitest.config.ts` defines three projects. Files never run in parallel (`fileParallelism: false`) because integration
suites share one test database.

```mermaid
flowchart LR
    subgraph unit["unit — pnpm test:unit"]
        u1["packages/*/src/**/*.test.ts"]
        u2["apps/*/src/**/*.test.ts"]
    end
    subgraph ex["exercises — pnpm test:exercises"]
        e1["**/*.exercise.test.ts"]
    end
    subgraph int["integration — pnpm test:integration"]
        i1["apps/api/test/**/*.test.ts"]
        i2["packages/db/test/**/*.test.ts"]
    end
    unit -. "excluded" .-> ex
    int --> PG[("wildbound_test")]
```

| File | Covers |
|---|---|
| `packages/shared/src/schemas.test.ts` | Schemas (rings, slugs, coercion…) |
| `packages/world/src/conditions.test.ts` | Condition matching, time-of-day bands, time zones |
| `packages/world/src/encounters.test.ts` | Table evaluation, combining, weighted rolls, seeded RNG |
| `packages/world/src/context.test.ts` | `assembleWorldContext` rules (habitat gate, ordering, empty context) |
| `packages/world/src/geometry.test.ts` | Turf helpers |
| `packages/world/src/movement.test.ts` | Haversine, `checkMovement` verdicts, strikes, lock, `canAct` |
| `packages/world/src/spawning.test.ts` | `randomPointNear`, `planSpawns` |
| `packages/world/src/validation.test.ts` | Integrity and publish rules |
| `packages/world/src/wandering.test.ts` | `offsetMeters`, activity periods, `wanderStep` speed/pauses, `wander` step cap and leaving the radius |
| `packages/world/src/*.exercise.test.ts` | Exercises #1 (weather) and #2 (spawn modifiers) |
| `apps/editor/src/world-edit.test.ts` | Pure edit operations |
| `apps/editor/src/lib/spawn-preview.test.ts` | Spawn-modifier preview |
| `apps/manager/src/lib/wildkin-form.test.ts` | Manager form helpers: slugify, registry number format, empty entry, suggestion merge, spawn modifiers |
| `apps/api/src/manager/manager.test.ts` | `buildLoreContext` budget, `artPrompt`, `canAfford`, `sanitizeSuggestion` |
| `packages/db/test/spatial.test.ts` | PostGIS: point-in-polygon, smallest wins, POI distances, draft/published isolation |
| `apps/api/test/world.test.ts` | Editor auth, authoring → publish → resolve workflow, validation, isolation |
| `apps/api/test/game.test.ts` | Login, anti-teleport and lockout, spawns, wandering and despawning, deleted species, observe ownership and range, Registry; exercise endpoints expect 501 |
| `apps/api/test/manager.test.ts` | Creature Manager: auth, CRUD, draft → publish into `creatures`, duplicates, soft delete/restore, AI assistant and art with **fake** providers (no network, no credits spent) |

**How integration tests are built:** `openTestDb()` migrates `DATABASE_URL_TEST`; `resetTestData()` truncates and
re-seeds creatures in `beforeEach`; the app is created with a fake clock, seeded randomness and fixed weather, and
called in-process with supertest. Controlling `now` lets a test "wait" without sleeping. A small test world lives in
`packages/world/src/__fixtures__/world.ts` (`sampleWorld()`, `CREATURE_IDS`), shared by unit and integration tests.

```ts
// excerpt from apps/api/test/game.test.ts
let clock = new Date("2026-10-18T02:00:00Z");       // 10:00 in Manila: "day"
const tick = (seconds: number) => (clock = new Date(clock.getTime() + seconds * 1000));

app = createApp({
  db: handle.db,
  config: testConfig(),
  weather: new StaticWeather({ weather: "clear", timeZone: "Asia/Manila", source: "live" }),
  now: () => clock,
  random: seededRandom(42),
});

const agent = request.agent(app);                   // keeps the wb_session cookie between calls
await agent.post("/api/auth/login").send({ username: "Sam_Field" });
await agent.post("/api/game/position").send({ lat: 14.65, lng: 120.998, accuracy: 10 });
tick(10);                                           // advance the fake clock 10 s
```

## Code conventions

- **TypeScript strict** with `noUncheckedIndexedAccess`; imports include `.ts`/`.tsx` extensions.
- **Schemas first:** define/extend a Zod schema in `@wildbound/shared`, derive the type, use it on both sides.
- **Pure rules** in `@wildbound/world`; side effects passed in (clock, random, DB rows).
- **Comment density:** short JSDoc on exported functions explaining *why*, not what. `TODO(you)` marks exercises only.
- **React:** feature folders (`features/<name>/`), hooks for server state in `lib/queries.ts`, query keys in one
  object, invalidate after mutations. Imperative libraries (MapLibre) are created once and synced in effects.
- **Styling:** Tailwind utilities with design tokens; `cn()` for conditional classes; no inline hex unless matching a
  mockup detail.
- **Naming:** files `PascalCase.tsx` for components, `kebab-case.ts`/`camelCase.ts` for modules (follow the folder);
  DB columns `snake_case` mapped to camelCase Prisma fields with `@map`.
- **Determinism:** sort outputs; tie-break by id.

## Before you commit

```bash
pnpm typecheck
pnpm test:unit
pnpm test:integration     # if you touched api/db/world
pnpm build                # if you touched editor/web/manager
```

Also: update the relevant page in `docs/` and the package README if behaviour changed; regenerate charts if seed data
or rules changed.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `✖ Migrate failed: Can't reach localhost:5432/wildbound` | Postgres not running: `pnpm db:up`; check `DATABASE_URL` |
| `… is missing tables or columns. Run pnpm db:migrate first.` | Run `pnpm db:migrate` |
| `Cannot find module './generated/prisma/client.ts'` | `pnpm install` or `pnpm --filter @wildbound/db generate` |
| Integration tests can't connect / `database "wildbound_test" does not exist` | `docker exec -it wildbound-db createdb -U postgres wildbound_test` (volumes created before `docker/initdb` existed) |
| `DATABASE_URL_TEST must differ from DATABASE_URL` | Point the test URL at `wildbound_test` |
| Editor shows a token prompt | `VITE_EDITOR_TOKEN` ≠ `EDITOR_TOKEN`; fix `.env` and restart Vite (or type the token) |
| "Cannot reach the API" | `pnpm dev:api`; check `VITE_API_URL` (editor) or `API_PROXY_TARGET` (game) |
| CORS error in the editor or manager | Add the origin to `CORS_ORIGINS`, restart the API |
| Manager: "AI assist is off" / "Art generation is off" | Set `GROQ_API_KEY` / `PIXELLAB_API_KEY` and restart the API. More in [13 · Troubleshooting](13-creature-manager.md#troubleshooting) |
| Manager: "Groq returned 429" or "413" | Groq rate/token limit (free tier): wait, lower `LORE_MAX_CHARS`, or use a smaller `GROQ_MODEL` |
| Editor map shows labels but no polygons | The Streets style failed to load (offline). Switch basemap to OSM or Satellite |
| Base map blank | Tile servers unreachable; harmless for development |
| Game stuck on "Enable location?" | Needs `https://` or `localhost`; check browser site permissions |
| "No surveyed habitat here" | Position outside every **published** region: publish (or `pnpm db:seed --publish`) and move inside |
| "That GPS jump looked impossible" | You moved the simulated location too far at once; step smaller or wait. 3 in a row lock you for 2 min |
| "GPS too imprecise" / `ACC` in red | Fix accuracy > 200 m; use precise location or set a Sensors location |
| Weather always Clear | `WEATHER_API_URL=off`, Open-Meteo unreachable, or exercise #1 not done |
| Capture says "isn't built yet" | Exercise #3 |
| `pnpm db:seed --publish` fails with validation errors | Your edited draft has errors (the sample was skipped). Fix in the editor or `--force --publish` |

## Running without Docker

```bash
# Debian/Ubuntu
sudo apt-get install -y postgresql-16 postgresql-16-postgis-3
sudo service postgresql start
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres createdb wildbound
sudo -u postgres createdb wildbound_test
pnpm db:migrate && pnpm db:migrate --test && pnpm db:seed --publish
WEATHER_API_URL=off pnpm dev:api     # if outbound internet is restricted
```

Migrations run `CREATE EXTENSION IF NOT EXISTS postgis`, which requires the PostGIS package to be installed.

Next: [11 · Cookbook](11-cookbook.md).
