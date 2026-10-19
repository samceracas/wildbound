# WILDBOUND

A location-aware 2D creature-collecting and field-research game. Where you are in the real world decides which part of the fictional WILDBOUND world you are exploring, which habitat you are standing in, and which Wildkin can appear.

This repository holds **v0.1.0**: a developer-facing **Map Editor**, the **API** behind it, and the first playable **web game** (username login, live location, radar with spawning Wildkin, Observe, Registry, Satchel and Party). Parts of v0.1.0 are deliberately left as **fill-in-the-blank exercises**: see [Exercises](#exercises-fill-in-the-blanks).

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
- [The game (apps/web)](#the-game-appsweb)
- [Location security (anti-teleport)](#location-security-anti-teleport)
- [Exercises (fill in the blanks)](#exercises-fill-in-the-blanks)
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

The app stack is standardized on React, Node.js + Express, Prisma, PostgreSQL, Tailwind CSS, TanStack Query, Zod and react-hook-form. Location features keep their specialised tools (PostGIS, MapLibre, Turf).

| Area | Choice | Notes |
|---|---|---|
| Language | TypeScript 5.9 | Strict mode, `noUncheckedIndexedAccess` |
| Runtime | Node.js 22+ | Uses the built-in `process.loadEnvFile` |
| Monorepo | pnpm 10 workspaces | `apps/*` and `packages/*` |
| Frontend | React 19 + Vite 7 | Editor and web game |
| Routing (web) | React Router 7 | `/` login → `/location` → `/play/*` |
| Styling | Tailwind CSS 4 (+ shadcn/ui in the web game) | Web: handheld "field nav" look from the Stitch mockups (`patches/0.1.0/mockups/`); editor: its original dark theme as `@theme` tokens |
| Server state | TanStack Query 5 | Editor and web: all API calls go through query/mutation hooks |
| Forms | react-hook-form + Zod resolver | Editor inspectors and web forms use the same Zod schemas the API validates with |
| Map | MapLibre GL JS 5 | Open-source WebGL maps, no API key needed |
| Editor state | Zustand 5 | Local editing only: the world being edited, selection, tool, undo/redo |
| Client geometry | Turf.js 7 | Convenience only; PostGIS is authoritative |
| Backend | Express 5 | Plain REST + JSON, cookie sessions for players |
| Database | PostgreSQL 16 + PostGIS 3.4 | Geometry as SRID 4326 (WGS84 lon/lat) |
| DB access | Prisma 7 (`@prisma/adapter-pg`) | Prisma schema + migrations; PostGIS queries via `$queryRaw` |
| Validation and contracts | Zod 4 | One schema set shared by editor, API and web |
| Weather | Open-Meteo | Free, key-free; fetched by the server for the player's position |
| Art | PixelLab (generated offline) | Wildkin icons/sprites and the player head in `apps/web/public` |
| Tests | Vitest 3 + supertest | Unit, exercises, and integration tests against real PostGIS |
| Local DB | Docker Compose (`postgis/postgis:16-3.4`) | Also creates a separate test database |
| Geographic interchange | GeoJSON (RFC 7946) | `[lng, lat]` order everywhere |
| Future game renderer | Phaser 3 | Not started |

## Repository layout

```
wildbound/
  apps/
    api/        Express API: editor authoring/publish/preview, player auth, game (position, spawns, registry…)
    editor/     React + MapLibre Map Editor (developer tool)
    web/        React game: login, location gate, radar, Registry, Satchel, Party
  packages/
    shared/     Zod schemas and TypeScript types: the data contract used everywhere
    world/      Pure domain logic: validation, conditions, encounters, movement checks, spawning, weather
    db/         Prisma schema + migrations, PostGIS queries, seed data, test helpers
    game/       (later) battle and game systems
    assets/     (later) tile, creature and effect asset metadata
  patches/0.1.0/  v0.1.0 instructions, Stitch mockups + design tokens, handover notes, exercises
  documents/      Game canon: Wildkin Bible, First Field Survey, Biology & Ecology reference
  docker/         Postgres init scripts (creates the test database)
```

Dependency direction (arrows mean "depends on"):

```
apps/editor ---> packages/shared, packages/world
apps/web    ---> packages/shared
apps/api    ---> packages/db, packages/world, packages/shared
packages/db ---> packages/world, packages/shared
packages/world ---> packages/shared
```

`packages/world` and `packages/shared` have no database or React dependencies, so the same rules run in the API, the editor and tests.

Each app and package has its own README with details.

## Quick start

Requirements: Node 22+, pnpm (`corepack enable`), Docker Desktop (for PostGIS).

```bash
pnpm install                    # also generates the Prisma client
cp .env.example .env            # Windows: copy .env.example .env
pnpm db:up                      # PostGIS 16 on localhost:5432
pnpm db:migrate                 # apply Prisma migrations
pnpm db:seed --publish          # 5 Wildkin + sample Mabunyi world, published so the game has data
pnpm dev                        # API on :4000 and editor on :5173
pnpm dev:web                    # the game on :5174 (separate terminal)
```

| URL | What |
|---|---|
| http://localhost:5173 | Map Editor |
| http://localhost:5174 | The game (open on your phone via your LAN IP + HTTPS, or use browser devtools "Sensors" to fake a location) |
| http://localhost:4000/api/health | API health check |

If the Docker volume was created before `docker/initdb` existed, create the test database once: `docker exec -it wildbound-db createdb -U postgres wildbound_test`.

**Upgrading from the Drizzle version?** Just run `pnpm db:migrate`. A database created by the old Drizzle migrations is detected and baselined (its world tables match the first Prisma migration), so your authored draft is kept. Then `pnpm db:seed` refreshes the Wildkin with their new Registry fields.

**Testing the game on a desktop.** Browsers only allow geolocation on `https://` or `localhost`. In Chrome devtools open *More tools → Sensors* and pick a location inside the Mabunyi region (e.g. `14.6518, 121.0444`). Move it in small steps: big jumps are rejected by the server (that is the anti-teleport check working).

### Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Dev database connection string |
| `DATABASE_URL_TEST` | Separate database used by integration tests (must differ from `DATABASE_URL`) |
| `API_PORT`, `API_HOST` | API bind address (default `4000`, `127.0.0.1`) |
| `EDITOR_TOKEN` | Bearer token required by every `/api/editor/*` route |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API (the editor; the game goes through the Vite proxy) |
| `WORLD_TIMEZONE` | Fallback time zone when neither the weather service nor the browser supplies one (default `Asia/Manila`) |
| `WEATHER_API_URL` | Open-Meteo forecast endpoint (default `https://api.open-meteo.com/v1/forecast`). `off` = always clear (offline dev) |
| `SECURE_COOKIES` | `true` to mark the session cookie `Secure` (behind HTTPS) |
| `VITE_API_URL` | API base URL for the editor |
| `VITE_EDITOR_TOKEN` | Token the editor sends. Only the editor reads it; the web game never does |

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

All geometry is WGS84 longitude/latitude (SRID 4326), GeoJSON `[lng, lat]`. Distances use PostGIS `::geography`, so they are meters. The Prisma schema is `packages/db/prisma/schema.prisma`.

World (authored in the editor, draft + published):

| Entity | Key fields |
|---|---|
| `WorldRegion` | slug (unique), name, description, MultiPolygon, biomeTags, unlockCondition, storyStateRequirements, active |
| `Habitat` | regionId, slug (unique per region), Polygon, habitatTags, conditionRules |
| `PointOfInterest` | regionId, slug (unique per region), type, Point, interactionId, unlockCondition |
| `EncounterTable` | regionId, habitatId (null means region-wide), conditionRules, active, entries |
| `EncounterEntry` | creatureId, weight (1 to 1000), conditions |
| `Creature` | id (slug), registryNumber, name, description, habitatAffinity, habitatSummary, rarity, activityPattern, spawnModifiers, skills |

Players:

| Entity | Key fields |
|---|---|
| `Player` | username (lowercased, unique), displayName |
| `PlayerSession` | sha256 of the session token, expiresAt |
| `PlayerPosition` | the server's view of where the player is: lat, lng, accuracy, recordedAt, strikes, lockedUntil, timeZone |
| `Spawn` | one Wildkin placed near one player: creature, lat/lng, environment at spawn time, status, expiresAt |
| `RegistryEntry` | per player and species: first observed/captured, counts |
| `InventoryItem` | per player and item id (items are defined in code: `ITEMS` in `@wildbound/shared`) |
| `CapturedWildkin` | one captured individual, optional nickname, party slot 0–5 or storage |

`conditionRules` is `{ timeOfDay: ("dawn"|"day"|"dusk"|"night")[], weather: ("clear"|"cloudy"|"rain"|"storm"|"fog")[] }`. An empty list means "any"; a non-empty list must contain the current value.

`spawnModifiers` (per species) multiply encounter weights by weather and time of day, e.g. Kawi `{ weather: { rain: 0.5, storm: 0 }, timeOfDay: { night: 0.1 } }`. Values come from the activity patterns proposed in the Wildkin Bible.

## The game (apps/web)

1. **Login** (`/`): pick a researcher name. That name is the save slot; using it again resumes your progress. There is no password yet.
2. **Location** (`/location`): the game cannot be entered without location sharing. Once the first GPS fix arrives you move on automatically.
3. **Radar** (`/play`): your position is a PixelLab player head; nearby Wildkin are face icons. Tap one for **Observe** or **Capture** (both need you within 60 m).
   - *Observe* unlocks the Registry basics: name, registry number, description, habitat.
   - *Capture* (exercise) also unlocks rarity, activity pattern and skills, and adds the Wildkin to your Party.
4. **Registry**: a Pokédex-style grid. Unknown species are silhouettes with only their number.
5. **Satchel** (inventory) and **Party** (6 slots plus storage).

If location sharing is turned off (or the signal is lost) mid-game, the game is covered by a "Survey paused" overlay until it comes back.

**Time and weather.** The status bar shows the device's local time, the time-of-day band and live weather. Both feed spawning: encounter-table conditions decide *whether* a species can appear, and per-species `spawnModifiers` decide *how often* (the modifiers are one of the exercises).

**Spawning.** Each `GET /api/game/state` (polled every 10 s on the radar) expires old spawns, drops ones you walked far away from, and tops you up to 6 spawns (at most 2 new per tick) within 120 m, chosen by weight from the published encounter tables at your server-side position.

## Location security (anti-teleport)

Previously anyone could call the public resolver with any coordinate and "be" anywhere. Now:

- **No public coordinate lookup.** Resolving arbitrary coordinates and reading the whole world are editor-only (`/api/editor/*`, bearer token).
- **The server tracks where each player is.** Clients only *report* GPS fixes (`POST /api/game/position`). `checkMovement` in `@wildbound/world` accepts a fix only if the distance from the last accepted one is at most `40 m/s × elapsed + both accuracies + 25 m`, using the server's clock. Fixes worse than `GAME_RULES.maxAccuracyM` (200 m, generous for desktop Wi-Fi location) are ignored. On the radar, the solid ring is your GPS accuracy (green when usable, red when too imprecise); the dashed ring is the 60 m observe/capture range.
- **Strikes and lockout.** Each implausible jump is rejected and counts as a strike; 3 in a row lock the player for 2 minutes. An accepted move resets the count.
- **Server-authoritative actions.** Spawns are created by the server around the tracked position and belong to one player. Observe/capture check ownership, status, expiry and distance from the *tracked* position, never coordinates sent with the request.
- **Stale positions don't count.** A position older than 2 minutes cannot be used to act; the web client re-sends its last fix every 30 s while still.

All limits live in `GAME_RULES` (`packages/shared/src/game.ts`). Browsers cannot prove a fix is genuine (GPS spoofing apps exist), so this is plausibility checking, not proof.

## Exercises (fill in the blanks)

v0.1.0 is a working skeleton with deliberate gaps, marked `TODO(you)` in the code. Each has instructions and hints right where it lives. The full list, in a suggested order, is in [`patches/0.1.0/EXERCISES.md`](patches/0.1.0/EXERCISES.md).

```bash
pnpm test:exercises    # tests for the pure-logic exercises; they fail until you implement them
grep -rn "TODO(you)" apps packages --include=*.ts --include=*.tsx
```

## Draft vs published

Every world table has a composite primary key `(id, stage)` where stage is `draft` or `published`.

- The editor only ever writes `draft`. Saving replaces the whole draft in one transaction.
- **Publish** validates the saved draft and, if valid, copies it to `published` atomically and records a row in `publications` (version number plus counts).
- The game and `GET /api/editor/published` read `published`. Draft edits never leak to players.
- Editors can preview the draft with `stage=draft` on `/api/editor/resolve`.
- Full version history is deferred. Only the latest published version is kept.

## API

Editor routes need `Authorization: Bearer $EDITOR_TOKEN`. Game routes need the `wb_session` cookie from `POST /api/auth/login`.

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/health` | public | |
| POST | `/api/auth/login` | public | `{ username }`. Creates or resumes the player, sets the session cookie |
| POST | `/api/auth/logout` | session | |
| GET | `/api/auth/me` | session | 401 without a session |
| POST | `/api/game/position` | session | `{ lat, lng, accuracy }` → verdict `first-fix`/`accepted`/`too-fast`/`low-accuracy`/`locked` |
| GET | `/api/game/state` | session | Environment (local time + live weather), region/habitat, nearby spawns |
| POST | `/api/game/spawns/:id/observe` | session | Unlocks the species' basic Registry entry |
| POST | `/api/game/spawns/:id/capture` | session | **Exercise** (501 until implemented) |
| GET | `/api/game/registry` | session | Every species, fields unlocked by progress |
| GET | `/api/game/inventory` | session | |
| GET | `/api/game/party` | session | 6 slots + storage |
| PUT | `/api/game/party` | session | **Exercise** (501) |
| PATCH | `/api/game/wildkin/:id` | session | **Exercise** (501): nickname |
| GET | `/api/editor/world` | editor | Draft + creatures + status |
| GET | `/api/editor/published` | editor | The published world (active regions only) |
| GET | `/api/editor/resolve?lat&lng[&radius&timeOfDay&weather&stage]` | editor | Coordinate → world context (draft or published) |
| PUT | `/api/editor/draft` | editor | Save the whole draft. 400 on malformed or structurally broken documents |
| POST | `/api/editor/validate` | editor | Validate a posted document without saving |
| POST | `/api/editor/publish` | editor | 409 with issues if validation fails |

The old public `GET /api/world/resolve`, `GET /api/world/published` and `GET /api/creatures` are gone: they let anyone look up any coordinate or read the whole world. See [Location security](#location-security-anti-teleport).

Example (editor preview):

```bash
curl -H "Authorization: Bearer dev-editor-token" \
  "http://localhost:4000/api/editor/resolve?lat=14.6518&lng=121.0444&timeOfDay=day&weather=clear"
```

## How a coordinate is resolved

PostGIS does the spatial lookups; `@wildbound/world` applies the game rules.

1. **Region.** The active region whose geometry covers the point (`ST_Covers`, so boundary counts as inside). If several do, the smallest area wins.
2. **Habitat.** The habitat of that region covering the point; smallest area wins.
3. **Nearby POIs.** POIs of that region within `radius` meters (default 300, max 5000), nearest first, up to 25.
4. **Encounter tables.** Active tables for the habitat, then region-wide ones. A habitat table applies only if the habitat's own condition rules and the table's rules both pass. An entry is available only if its own conditions also pass.
5. **Available Wildkin.** Weights of available entries across applicable tables are summed per creature and normalized.
6. **Environment.** For the game, the server derives both from the player's tracked position: live weather from Open-Meteo, and the time of day in the location's own time zone (dawn 05:00 to 07:00, day 07:00 to 17:00, dusk 17:00 to 19:00, night 19:00 to 05:00). The editor preview can pass `timeOfDay`/`weather` explicitly (defaults: current hour in `WORLD_TIMEZONE`, clear).
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
pnpm test              # unit + integration (integration needs the database running)
pnpm test:unit         # no database needed
pnpm test:integration  # API and PostGIS tests against DATABASE_URL_TEST
pnpm test:exercises    # the fill-in-the-blank exercises (fail until implemented)
pnpm typecheck         # all packages
```

- **Unit:** schemas, conditions and time of day, encounter weighting, movement checks, spawn planning, validation rules, context assembly, geometry helpers, editor edit operations.
- **Integration (real PostGIS, Express via supertest):** point-in-polygon, habitat selection, nearby POIs, draft/published isolation, publish gating, editor auth, payload validation, the authoring-to-resolve workflow, and the game: login, teleport rejection and lockout, spawn ownership, range checks, Registry unlocking.

Integration tests run against `wildbound_test`, never your dev data.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | API and editor together |
| `pnpm dev:api` / `pnpm dev:editor` | One at a time |
| `pnpm dev:web` | The game |
| `pnpm build` | Production build of the editor and web game |
| `pnpm db:up` / `pnpm db:down` | Start or stop the PostGIS container |
| `pnpm db:migrate` | Apply Prisma migrations (baselines an old Drizzle database first) |
| `pnpm db:seed` | Seed Wildkin and the sample draft (skips the draft if it has content) |
| `pnpm db:seed --force` | Replace the draft with the sample world |
| `pnpm db:seed --publish` | Seed and publish |
| `pnpm db:reset` | Drop all WILDBOUND tables and re-run migrations |
| `pnpm --filter @wildbound/db migrate:new` | After editing `schema.prisma`: create a new migration (review the SQL) |
| `pnpm --filter @wildbound/db studio` | Prisma Studio |

## Sample world: Mabunyi Nature Reserve

The seed data (`packages/db/seed/`) is one region, three habitats (Forest Edge, Sunbreak Clearing, Silayan Creekside), seven POIs (East Research Gate, Zigzag Forest Trail, Sunbreak, Root Hollow, Fern Hollow, Creek Trail, Silayan Creek) and three encounter tables, using the five Wildkin above.

The boundary is a **placeholder** near Ninoy Aquino Parks and Wildlife Center in Quezon City. Redraw it over your real area in the editor: use the Satellite basemap, select the region and drag its vertices. The world lives in data, not in UI code.

## Scope and roadmap

Done in v0.1.0: the Map Editor, the PostGIS-backed resolver, draft/publish, Express + Prisma API, username sessions, live location with server-side movement checks, live weather and local time, server-authoritative spawns, Observe, the Registry, Satchel and Party views, PixelLab placeholder art, and automated tests.

Left as exercises: capture, party editing, renaming, the weather-code mapping, species spawn modifiers, and the capture-only Registry section.

Not in v0.1.0: the editor's move to Tailwind/TanStack Query/react-hook-form (planned, see `patches/0.1.0/HANDOVER-pass-1.md`), Phaser field exploration, battles, passwords/real accounts, offline/PWA, social features.

AI-assisted tools produce art (PixelLab) but are never a runtime dependency and never the source of geographic truth. Generated art is placeholder until approved against the Wildkin Bible.

## Troubleshooting

- **Editor shows a token prompt.** `VITE_EDITOR_TOKEN` must equal `EDITOR_TOKEN`. Restart Vite after editing `.env`.
- **"Cannot reach the API".** Run `pnpm dev:api` and check `VITE_API_URL` (editor) or the Vite proxy target (game, `API_PROXY_TARGET`).
- **Integration tests fail to connect.** Run `pnpm db:up` and make sure `wildbound_test` exists (see Quick start).
- **Base map is blank.** The tile servers need internet access. Try the OSM or Satellite option in the editor.
- **CORS errors in the editor.** Add your origin to `CORS_ORIGINS` and restart the API.
- **The game says "No surveyed habitat here".** Your (real or simulated) location is outside every published region. Publish from the editor or run `pnpm db:seed --publish`, and set a location inside the region.
- **The game stays on "Share your location".** Geolocation needs `https://` or `localhost`. On a phone, serve the game over HTTPS (e.g. a tunnel) or use desktop devtools Sensors.
- **"That GPS jump looked impossible".** You moved the simulated location too far at once. Move in small steps or wait; after 3 jumps you are locked for 2 minutes.
- **Weather always "Clear".** Either `WEATHER_API_URL=off`, Open-Meteo is unreachable, or you have not done the weather exercise yet.
- **`Cannot find module './generated/prisma/client.ts'`.** Run `pnpm install` (or `pnpm --filter @wildbound/db generate`).

