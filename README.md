# WILDBOUND

A location-aware 2D creature-collecting and field-research game. Where you are in the real world decides which part of the fictional WILDBOUND world you are exploring, which habitat you are standing in, and which Wildkin can appear.

This repository holds the **first milestone**: a developer-facing **Map Editor** and the **world-resolution backend** behind it. Phaser gameplay, battles, accounts and live GPS come later.

```
Real location (lat/lng)
        |
        v
WILDBOUND region  ->  Habitat  ->  Conditions (time, weather)  ->  Encounter table  ->  Wildkin
```

## Table of contents

- [The idea](#the-idea)
- [Why a map editor first](#why-a-map-editor-first)
- [Three separate representations of the world](#three-separate-representations-of-the-world)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Typical workflow](#typical-workflow)
- [Data model](#data-model)
- [Draft vs published](#draft-vs-published)
- [API](#api)
- [How a coordinate is resolved](#how-a-coordinate-is-resolved)
- [Validation](#validation)
- [Testing](#testing)
- [Scripts](#scripts)
- [Sample world: Mabunyi Nature Reserve](#sample-world-mabunyi-nature-reserve)
- [Scope and roadmap](#scope-and-roadmap)
- [Troubleshooting](#troubleshooting)

## The idea

The player experience combines three things:

- **Location-aware exploration.** The player's real position determines their current WILDBOUND region and habitat.
- **Classic top-down 2D exploration.** The eventual field screen should look like a small, readable game world, not a GIS map.
- **Field research and creature discovery.** Wildkin appear in the environment, can be observed or studied, and are recorded in a Registry.

The real-world geography is an implementation layer. The player-facing fiction stays WILDBOUND: the real park in Quezon City is "Mabunyi Nature Reserve" in the game.

The first test world has five Wildkin with simple ecological ties:

| Wildkin | Environment |
|---|---|
| Kawi | canopy, woodland edges |
| Mimu | forest floor, leaf litter, moss |
| Lumae | sunny flowering clearings |
| Kantar | rocks, fallen branches, sheltered surfaces |
| Riverkin | freshwater |

## Why a map editor first

Everything location-aware depends on authored data: where regions and habitats are, which POIs exist, which Wildkin live where under which conditions. Editing that as raw JSON or SQL does not scale even for one park. The Map Editor is an internal tool that lets one developer:

1. View real geography.
2. Draw WILDBOUND regions and habitats on it.
3. Place points of interest.
4. Assign encounter tables with weights and conditions.
5. Save drafts, validate, and publish.
6. Drop a simulated player anywhere and see exactly what the game would resolve.

It deliberately is **not** a general GIS product. It supports only the operations WILDBOUND content needs.

## Three separate representations of the world

These are kept apart on purpose. Do not couple them.

| Layer | Meaning | Where it lives |
|---|---|---|
| **Real world** | Latitude/longitude, boundaries, roads, water | MapLibre basemap + PostGIS geometry |
| **WILDBOUND world context** | Region, habitat, POIs, encounter tables, conditions | `@wildbound/shared` schemas, `@wildbound/world` rules |
| **Presentation** | Tiles, trees, sprites, camera, movement | Phaser, later (`apps/web`) |

PostGIS says *where* something is. WILDBOUND rules say *what it means*. Phaser will later decide *how it looks*. There is one world model; the future Phaser field reads the same `WorldContext` the editor previews.

## Tech stack

| Area | Choice | Notes |
|---|---|---|
| Language | TypeScript 5.9 | Strict mode, `noUncheckedIndexedAccess` |
| Runtime | Node.js 22+ | Uses the built-in `process.loadEnvFile` |
| Monorepo | pnpm 10 workspaces | `apps/*` and `packages/*` |
| Frontend | React 19 + Vite 7 | Editor and web app |
| Map | MapLibre GL JS 5 | Open-source WebGL maps, no API key needed |
| Editor state | Zustand 5 | Undo/redo history, selection, preview |
| Client geometry | Turf.js 7 | Convenience only; PostGIS is authoritative |
| Backend | Fastify 5 | Plain REST + JSON |
| Database | PostgreSQL 16 + PostGIS 3.4 | Geometry as SRID 4326 (WGS84 lon/lat) |
| DB access | Drizzle ORM 0.45 + `pg` | SQL migrations committed to the repo |
| Validation and contracts | Zod 4 | One schema set shared by editor, API and web |
| Tests | Vitest 3 | Unit tests plus integration tests against real PostGIS |
| Local DB | Docker Compose (`postgis/postgis:16-3.4`) | Also creates a separate test database |
| Geographic interchange | GeoJSON (RFC 7946) | `[lng, lat]` order everywhere |
| Basemaps | OpenFreeMap, OpenStreetMap raster, Esri satellite | Key-free; geographic truth only |
| Future game renderer | Phaser 3 | Not started |

## Repository layout

```
wildbound/
  apps/
    api/        Fastify API: authoring, publish, public published world, coordinate resolve
    editor/     React + MapLibre Map Editor (developer tool)
    web/        React + MapLibre player web app. Bootstrapped for learning; Phaser comes later
  packages/
    shared/     Zod schemas and TypeScript types: the data contract used everywhere
    world/      Pure domain logic: validation, conditions, encounter weighting, context assembly
    db/         Drizzle schema, SQL migrations, PostGIS queries, seed data, test helpers
    game/       (later) battle and game systems
    assets/     (later) tile, creature and effect asset metadata
  docker/       Postgres init scripts (creates the test database)
  IMPLEMENTATION.md   The original technical design document for this milestone
```

Dependency direction (arrows mean "depends on"):

```
apps/editor ---> packages/shared, packages/world
apps/web    ---> packages/shared
apps/api    ---> packages/db, packages/world, packages/shared
packages/db ---> packages/world, packages/shared
packages/world ---> packages/shared
```

`packages/world` and `packages/shared` have no database or React dependencies, so the same rules can run in the API, the editor, tests and later in the game client.

Each app and package has its own README with details.

## Quick start

Requirements: Node 22+, pnpm (`corepack enable`), Docker Desktop (for PostGIS).

```bash
pnpm install
cp .env.example .env            # Windows: copy .env.example .env
pnpm db:up                      # PostGIS 16 on localhost:5432
pnpm db:migrate                 # create tables
pnpm db:seed                    # 5 Wildkin + sample Mabunyi draft
pnpm db:seed --publish          # optional: also publish it so apps/web has data
pnpm dev                        # API on :4000 and editor on :5173
pnpm dev:web                    # player web app on :5174 (separate terminal)
```

| URL | What |
|---|---|
| http://localhost:5173 | Map Editor |
| http://localhost:5174 | Player web app (learning space) |
| http://localhost:4000/api/health | API health check |
| http://localhost:4000/api/world/published | Public published world |

If the Docker volume was created before `docker/initdb` existed, create the test database once: `docker exec -it wildbound-db createdb -U postgres wildbound_test`.

### Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Dev database connection string |
| `DATABASE_URL_TEST` | Separate database used by integration tests (must differ from `DATABASE_URL`) |
| `API_PORT`, `API_HOST` | API bind address (default `4000`, `127.0.0.1`) |
| `EDITOR_TOKEN` | Bearer token required by every `/api/editor/*` route and by draft resolution |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API (editor and web) |
| `WORLD_TIMEZONE` | Time zone used to derive time of day when a request does not pass one (default `Asia/Manila`) |
| `VITE_API_URL` | API base URL for the browser apps |
| `VITE_EDITOR_TOKEN` | Token the editor sends. Only the editor reads it; the web app never does |

The editor token is a single shared secret meant for local development. Replace it with real accounts before exposing the editor anywhere public.

## Typical workflow

1. Start everything (see Quick start) and open the editor.
2. Pick the **Region** tool (`R`), click points around the real area, then double-click or press Enter. Rename it in the side panel.
3. Pick **Habitat** (`H`) and draw habitats inside the region.
4. Pick **POI** (`P`) and click to place points of interest.
5. Select a habitat and add an **encounter table**; choose Wildkin and weights. Optionally restrict by time of day or weather.
6. **Save draft** (`Ctrl+S`), then **Validate**.
7. Use **Test** (`T`) to drop a simulated player and read the resolved context.
8. **Publish**. Players (and `apps/web`) now see it.
9. Keep editing: the draft changes, the published world does not, until you publish again.

Editor controls: drag white handles to reshape, drag midpoints to add a vertex, right-click a vertex to delete it, `Ctrl+Z` / `Ctrl+Shift+Z` for undo/redo, `Delete` to remove the selection.

## Data model

All geometry is WGS84 longitude/latitude (SRID 4326), GeoJSON `[lng, lat]`. Distances use PostGIS `::geography`, so they are meters.

| Entity | Key fields |
|---|---|
| `WorldRegion` | slug (unique), name, description, MultiPolygon, biomeTags, unlockCondition, storyStateRequirements, active |
| `Habitat` | regionId, slug (unique per region), Polygon, habitatTags, conditionRules |
| `PointOfInterest` | regionId, slug (unique per region), type, Point, interactionId, unlockCondition |
| `EncounterTable` | regionId, habitatId (null means region-wide), conditionRules, active, entries |
| `EncounterEntry` | creatureId, weight (1 to 1000), conditions |
| `CreatureDefinition` | id (slug), name, description, habitatAffinity |

`conditionRules` is `{ timeOfDay: ("dawn"|"day"|"dusk"|"night")[], weather: ("clear"|"cloudy"|"rain"|"storm"|"fog")[] }`. An empty list means "any"; a non-empty list must contain the current value.

Unlock conditions and story requirements are stored and returned, but not evaluated yet because there is no player state.

## Draft vs published

Every world table has a composite primary key `(id, stage)` where stage is `draft` or `published`.

- The editor only ever writes `draft`. Saving replaces the whole draft in one transaction.
- **Publish** validates the saved draft and, if valid, copies it to `published` atomically and records a row in `publications` (version number plus counts).
- The resolver and `GET /api/world/published` read `published`. Draft edits never leak to players.
- Editors can preview the draft with `stage=draft` on the resolve endpoint (needs the token).
- Full version history is deferred. Only the latest published version is kept.

## API

Editor routes need `Authorization: Bearer $EDITOR_TOKEN`. Public routes need nothing.

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/health` | public | |
| GET | `/api/creatures` | public | Wildkin list |
| GET | `/api/world/published` | public | The whole published world (active regions only) plus creatures and version |
| GET | `/api/world/resolve?lat&lng[&radius&timeOfDay&weather&stage]` | public for `published`; `stage=draft` needs token | Coordinate to world context |
| GET | `/api/editor/world` | editor | Draft + creatures + status |
| GET | `/api/editor/published` | editor | Published world with status |
| PUT | `/api/editor/draft` | editor | Save the whole draft. 400 on malformed or structurally broken documents |
| POST | `/api/editor/validate` | editor | Validate a posted document without saving |
| POST | `/api/editor/publish` | editor | 409 with issues if validation fails |

Example:

```bash
curl "http://localhost:4000/api/world/resolve?lat=14.6518&lng=121.0444&timeOfDay=day&weather=clear"
```

returns region, habitat, environment tags, nearby POIs, encounter tables with per-entry probabilities, and a merged `availableWildkin` list. A coordinate outside every region returns a normal, empty context (HTTP 200), never an error.

## How a coordinate is resolved

PostGIS does the spatial lookups; `@wildbound/world` applies the game rules.

1. **Region.** The active region whose geometry covers the point (`ST_Covers`, so boundary counts as inside). If several do, the smallest area wins.
2. **Habitat.** The habitat of that region covering the point; smallest area wins.
3. **Nearby POIs.** POIs of that region within `radius` meters (default 300, max 5000), nearest first, up to 25.
4. **Encounter tables.** Active tables for the habitat, then region-wide ones. A habitat table applies only if the habitat's own condition rules and the table's rules both pass. An entry is available only if its own conditions also pass.
5. **Available Wildkin.** Weights of available entries across applicable tables are summed per creature and normalized.
6. **Environment.** `timeOfDay` defaults to the current hour in `WORLD_TIMEZONE` (dawn 05:00 to 07:00, day 07:00 to 17:00, dusk 17:00 to 19:00, night 19:00 to 05:00). `weather` defaults to `clear`. Both can be passed explicitly so development never depends on the real clock or GPS.
7. No region means an empty context.

## Validation

| Blocks saving (HTTP 400) | Blocks publishing (HTTP 409) | Warning only |
|---|---|---|
| Malformed payload or coordinates | Habitat more than 50% outside its region | Habitat partly outside its region |
| Self-intersecting boundary | POI outside its region | Overlapping habitats (smaller wins) |
| Missing parent region or habitat | Active encounter table with no Wildkin | Region with no habitats |
| Table habitat in a different region | | Habitat with no encounter table |
| Unknown Wildkin | | Same Wildkin listed twice |
| Duplicate ids, or duplicate slugs within their scope | | No active region |

The database enforces the same invariants as a backstop: `ST_IsValid` checks, composite foreign keys that keep draft and published rows separate, unique constraints and a weight range check.

## Testing

```bash
pnpm test              # everything (integration tests need the database running)
pnpm test:unit         # no database needed
pnpm test:integration  # API and PostGIS tests against DATABASE_URL_TEST
pnpm typecheck         # all packages
```

- **Unit:** schemas, conditions and time of day, encounter weighting and seeded rolls, validation rules, context assembly, geometry helpers, editor edit operations.
- **Integration (real PostGIS):** point-in-polygon, habitat selection, nearby POIs, draft/published isolation, publish gating, auth, payload validation and the full authoring-to-resolve workflow through the HTTP API.

Integration tests run against `wildbound_test`, never your dev data.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | API and editor together |
| `pnpm dev:api` / `pnpm dev:editor` | One at a time |
| `pnpm dev:web` | Player web app |
| `pnpm build` | Production build of the editor and web app |
| `pnpm db:up` / `pnpm db:down` | Start or stop the PostGIS container |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Seed Wildkin and the sample draft (skips if the draft has content) |
| `pnpm db:seed --force` | Replace the draft with the sample world |
| `pnpm db:seed --publish` | Seed and publish |
| `pnpm db:reset` | Drop all WILDBOUND tables and re-run migrations |

## Sample world: Mabunyi Nature Reserve

The seed data (`packages/db/seed/`) is one region, three habitats (Forest Edge, Sunbreak Clearing, Silayan Creekside), seven POIs (East Research Gate, Zigzag Forest Trail, Sunbreak, Root Hollow, Fern Hollow, Creek Trail, Silayan Creek) and three encounter tables, using the five Wildkin above.

The boundary is a **placeholder** near Ninoy Aquino Parks and Wildlife Center in Quezon City. Redraw it over your real area in the editor: use the Satellite basemap, select the region and drag its vertices. The world lives in data, not in UI code.

## Scope and roadmap

Done in this milestone: the Map Editor, the PostGIS-backed resolver, draft/publish, the public published-world endpoint, automated tests, and a bootstrapped player web app.

Deliberately out of scope for now: Phaser field exploration and movement, live browser geolocation and GPS smoothing, spawn and despawn timing, observation and battle, Registry progression, accounts and assignments, AI-generated map or tiles, offline/PWA, social features.

Next steps, in order:

1. Use `apps/web` to render the published world and call the resolver from map clicks.
2. Add a Phaser field to `apps/web` that consumes the same `WorldContext`.
3. Add live geolocation as an adapter (simulated coordinates stay the default for development).
4. Wildkin encounters, observation, and the Registry.

AI-assisted tools may help produce art and tiles later, but they are never a runtime dependency and never the source of geographic truth.

## Troubleshooting

- **Editor shows a token prompt.** `VITE_EDITOR_TOKEN` must equal `EDITOR_TOKEN`. Restart Vite after editing `.env`.
- **"Cannot reach the API".** Run `pnpm dev:api` and check `VITE_API_URL`.
- **Integration tests fail to connect.** Run `pnpm db:up` and make sure `wildbound_test` exists (see Quick start).
- **Base map is blank.** The tile servers need internet access. Try the OSM or Satellite option in the editor.
- **CORS errors in the browser.** Add your origin to `CORS_ORIGINS` and restart the API.
- **`apps/web` says nothing is published.** Publish from the editor or run `pnpm db:seed --publish`.
