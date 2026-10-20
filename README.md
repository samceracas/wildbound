# WILDBOUND

A location-aware 2D creature-collecting and field-research game. Where you are in the real world decides which part of the fictional WILDBOUND world you are exploring, which habitat you are standing in, and which Wildkin can appear.

This repository holds **v0.2.0**: a developer-facing **Map Editor**, a **Creature Manager** (an editable Wildkin encyclopedia with an AI assistant and PixelLab art generation), the **API** behind them, and the playable **web game** (username login, live location, radar with spawning and wandering Wildkin, Observe, Registry, Satchel and Party). Parts of the game are deliberately left as **fill-in-the-blank exercises**: see [Exercises](#exercises-fill-in-the-blanks).

```
Real location (lat/lng)
        |
        v
WILDBOUND region  ->  Habitat  ->  Conditions (time, weather)  ->  Encounter table  ->  Wildkin
```

> 📚 **Full documentation lives in [`docs/`](docs/README.md)**: a plain-English overview for non-programmers,
> architecture and data-flow diagrams, the database, every API endpoint, the editor and game internals, the game rules
> (spawning, weather, anti-teleport) with charts, and a cookbook of step-by-step recipes for adding features safely.
> This README is the short version.

## Table of contents

- [The idea](#the-idea)
- [Why a map editor first](#why-a-map-editor-first)
- [The Creature Manager (apps/manager)](#the-creature-manager-appsmanager)
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

The first test world has five Wildkin with simple ecological ties (more are written in the [Creature Manager](#the-creature-manager-appsmanager)):

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

## The Creature Manager (apps/manager)

Wildkin themselves are authored in a second internal tool, the **Creature Manager** (http://localhost:5175). It is the Wildkin Bible as an app:

- **Dashboard** with stat cards (Wildkin, published, drafts, unpublished changes, with art, deleted), rarity breakdown and the next registry number.
- **Wildkin list** with icon, registry number and name; Create, Edit, Delete (soft delete) and Restore.
- **Entry page**: the Bible entry in eight sections (identity, habitat, diet and temperament, activity and rarity, appearance, behaviour, ecology, game), with selects and comboboxes for every property that has fixed choices.
- **Save draft / Publish.** Entries live in their own encyclopedia table (`wildkin_entries`). Publishing copies only the game fields (name, Registry description, habitat tags and summary, rarity, activity, spawn modifiers, skills, movement style) into the `creatures` table the editor and game read.
- **AI assistant.** Describe an idea in a sentence; the API asks a Groq LLM, which is given the canon documents in `docs/` (Bible first) and the existing roster, and fills in the form for you to review. Needs `GROQ_API_KEY`.
- **PixelLab art.** Generates a 64 px icon and a 128 px sprite from the entry's physical description, visual hook and design notes, with the cheapest model (Pixen), after checking the credit balance. The art is stored in the database and served by the API, so the game shows it without a rebuild. Needs `PIXELLAB_API_KEY`.

Full guide: [`docs/13-creature-manager.md`](docs/13-creature-manager.md).

![Creature Manager entry page](docs/images/screenshots/manager-3-entry.png)

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
| Frontend | React 19 + Vite 7 | Editor, Creature Manager and web game |
| Routing (web, manager) | React Router 7 | Web: `/` login → `/location` → `/play/*`; manager: `/`, `/wildkin`, `/wildkin/:id` |
| Styling | Tailwind CSS 4 (+ shadcn/ui in the web game and manager) | Web: handheld "field nav" look from the Stitch mockups (`patches/0.1.0/mockups/`); editor: its original dark theme as `@theme` tokens; manager: dark "field research" theme |
| Server state | TanStack Query 5 | Editor, manager and web: all API calls go through query/mutation hooks |
| Forms | react-hook-form + Zod resolver | Editor inspectors, manager entry form and web forms use the same Zod schemas the API validates with |
| Map | MapLibre GL JS 5 | Open-source WebGL maps, no API key needed |
| Editor state | Zustand 5 | Local editing only: the world being edited, selection, tool, undo/redo |
| Client geometry | Turf.js 7 | Convenience only; PostGIS is authoritative |
| Backend | Express 5 | Plain REST + JSON, cookie sessions for players |
| Database | PostgreSQL 16 + PostGIS 3.4 | Geometry as SRID 4326 (WGS84 lon/lat) |
| DB access | Prisma 7 (`@prisma/adapter-pg`) | Prisma schema + migrations; PostGIS queries via `$queryRaw` |
| Validation and contracts | Zod 4 | One schema set shared by editor, API and web |
| Weather | Open-Meteo | Free, key-free; fetched by the server for the player's position |
| AI assistant | Groq API (chat completions, JSON mode) | Creature Manager only, optional (`GROQ_API_KEY`). Default model `llama-3.3-70b-versatile`; canon `.docx` read with mammoth |
| Art | PixelLab API v2 (Pixen) | Creature Manager generates Wildkin icons/sprites (optional, `PIXELLAB_API_KEY`), stored in the DB and served at `/api/art/...`. Seed art and the player head in `apps/web/public` |
| Tests | Vitest 3 + supertest | Unit, exercises, and integration tests against real PostGIS |
| Local DB | Docker Compose (`postgis/postgis:16-3.4`) | Also creates a separate test database |
| Geographic interchange | GeoJSON (RFC 7946) | `[lng, lat]` order everywhere |
| Future game renderer | Phaser 3 | Not started |

## Repository layout

```
wildbound/
  apps/
    api/        Express API: editor authoring/publish/preview, Creature Manager (+ Groq, PixelLab), player auth, game, art
    editor/     React + MapLibre Map Editor (developer tool)
    manager/    React Creature Manager: Wildkin encyclopedia, draft/publish, AI assistant, PixelLab art (developer tool)
    web/        React game: login, location gate, radar, Registry, Satchel, Party
  packages/
    shared/     Zod schemas and TypeScript types: the data contract used everywhere
    world/      Pure domain logic: validation, conditions, encounters, movement checks, spawning, wandering, weather
    db/         Prisma schema + migrations, PostGIS queries, Wildkin encyclopedia repo, seed data, test helpers
    game/       (later) battle and game systems
    assets/     (later) tile, creature and effect asset metadata
  patches/0.1.0/  v0.1.0 instructions, Stitch mockups + design tokens, handover notes, exercises
  patches/0.2.0/  v0.2.0 instructions (Creature Manager, wandering spawns)
  docs/           Documentation + game canon (WILDBOUND_*.docx: Wildkin Bible, First Field Survey,
                  Biology & Ecology reference), also the AI assistant's lore context
  docker/         Postgres init scripts (creates the test database)
```

Dependency direction (arrows mean "depends on"):

```
apps/editor  ---> packages/shared, packages/world
apps/manager ---> packages/shared
apps/web     ---> packages/shared
apps/api     ---> packages/db, packages/world, packages/shared
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
pnpm db:seed --publish          # 5 Wildkin (+ encyclopedia entries and art) + sample Mabunyi world, published
pnpm dev                        # API :4000, editor :5173, game :5174, Creature Manager :5175
```

| URL | What |
|---|---|
| http://localhost:5173 | Map Editor |
| http://localhost:5174 | The game (open on your phone via your LAN IP + HTTPS, or use browser devtools "Sensors" to fake a location) |
| http://localhost:5175 | Creature Manager |
| http://localhost:4000/api/health | API health check |

The Creature Manager's AI helpers are optional: add `GROQ_API_KEY` (free key at https://console.groq.com/keys) and `PIXELLAB_API_KEY` (https://pixellab.ai) to `.env` and restart the API. Without them the manager works and the two buttons are disabled with a hint.

If the Docker volume was created before `docker/initdb` existed, create the test database once: `docker exec -it wildbound-db createdb -U postgres wildbound_test`.

**Upgrading from v0.1.0?** Run `pnpm install`, `pnpm db:migrate` (adds migrations `2_wildkin_manager` and `3_registry_description`) and `pnpm db:seed` (creates the five encyclopedia entries and imports their art; your world draft is kept). Add the new `.env` keys from `.env.example` (the manager reaches the API through its Vite proxy, so `CORS_ORIGINS` needs no change).

**Upgrading from the Drizzle version?** Just run `pnpm db:migrate`. A database created by the old Drizzle migrations is detected and baselined (its world tables match the first Prisma migration), so your authored draft is kept. Then `pnpm db:seed` refreshes the Wildkin with their new Registry fields.

**Testing the game on a desktop.** Browsers only allow geolocation on `https://` or `localhost`. In Chrome devtools open *More tools → Sensors* and pick a location inside the Mabunyi region (e.g. `14.6518, 121.0444`). Move it in small steps: big jumps are rejected by the server (that is the anti-teleport check working).

### Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Dev database connection string |
| `DATABASE_URL_TEST` | Separate database used by integration tests (must differ from `DATABASE_URL`) |
| `API_PORT`, `API_HOST` | API bind address (default `4000`, `127.0.0.1`) |
| `EDITOR_TOKEN` | Bearer token required by every `/api/editor/*` and `/api/manager/*` route |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API (the editor; the game and the Creature Manager go through their Vite proxies) |
| `WORLD_TIMEZONE` | Fallback time zone when neither the weather service nor the browser supplies one (default `Asia/Manila`) |
| `WEATHER_API_URL` | Open-Meteo forecast endpoint (default `https://api.open-meteo.com/v1/forecast`). `off` = always clear (offline dev) |
| `SECURE_COOKIES` | `true` to mark the session cookie `Secure` (behind HTTPS) |
| `GROQ_API_KEY` | Enables the Creature Manager AI assistant (empty = off) |
| `GROQ_MODEL` | Groq chat model with JSON mode (default `llama-3.3-70b-versatile`) |
| `LORE_MAX_CHARS` | Characters of canon (`docs/WILDBOUND_*.docx`) sent per assistant request (default `30000`). Lower it, or pick a smaller model, if Groq's free tier rate-limits you |
| `PIXELLAB_API_KEY` | Enables PixelLab art generation in the Creature Manager (empty = off) |
| `VITE_API_URL` | API base URL for the editor and the manager |
| `VITE_EDITOR_TOKEN` | Token the editor and manager send. The web game never reads it |

The editor token is a single shared secret meant for local development. Replace it with real accounts before exposing the editor or manager anywhere public.

## Typical workflow

New species first: in the **Creature Manager**, create the Wildkin (optionally with the AI assistant and PixelLab), **Save draft**, then **Publish**. It then appears in the editor's Wildkin picker (refetched when the editor tab regains focus). Then, in the editor:

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
| `Creature` | id (slug), registryNumber, name, description, habitatAffinity, habitatSummary, rarity, activityPattern, spawnModifiers, skills, movementStyle, deletedAt (soft delete) |

Wildkin encyclopedia (authored in the Creature Manager):

| Entity | Key fields |
|---|---|
| `WildkinEntry` | id (= creature id once published), registryNumber (unique), name, status (`draft`/`published`), content (every other Bible field, JSON validated by `WildkinEntryInputSchema`), publishedAt, deletedAt |
| `WildkinArt` | entryId + kind (`icon` 64 px / `sprite` 128 px), PNG bytes, prompt, model |

Players:

| Entity | Key fields |
|---|---|
| `Player` | username (lowercased, unique), displayName |
| `PlayerSession` | sha256 of the session token, expiresAt |
| `PlayerPosition` | the server's view of where the player is: lat, lng, accuracy, recordedAt, strikes, lockedUntil, timeZone |
| `Spawn` | one Wildkin placed near one player: creature, lat/lng (changes as it wanders), heading, movedAt, environment at spawn time, status, expiresAt |
| `RegistryEntry` | per player and species: first observed/captured, counts |
| `InventoryItem` | per player and item id (items are defined in code: `ITEMS` in `@wildbound/shared`) |
| `CapturedWildkin` | one captured individual, optional nickname, party slot 0–5 or storage |

`conditionRules` is `{ timeOfDay: ("dawn"|"day"|"dusk"|"night")[], weather: ("clear"|"cloudy"|"rain"|"storm"|"fog")[] }`. An empty list means "any"; a non-empty list must contain the current value.

`spawnModifiers` (per species) multiply encounter weights by weather and time of day, e.g. Kawi `{ weather: { rain: 0.5, storm: 0 }, timeOfDay: { night: 0.1 } }`. Values come from the activity patterns proposed in the Wildkin Bible.

## The game (apps/web)

1. **Login** (`/`): pick a researcher name. That name is the save slot; using it again resumes your progress. There is no password yet.
2. **Location** (`/location`): the game cannot be entered without location sharing. Once the first GPS fix arrives you move on automatically.
3. **Radar** (`/play`): your position is a PixelLab player head; nearby Wildkin are face icons that **wander** around (experimental, may be removed by v0.3.0). Tap one for **Observe** or **Capture** (both need you within 60 m).
   - *Observe* unlocks the Registry basics: name, registry number, description, habitat.
   - *Capture* (exercise) also unlocks rarity, activity pattern and skills, and adds the Wildkin to your Party.
4. **Registry**: a Pokédex-style grid. Unknown species are silhouettes with only their number.
5. **Satchel** (inventory) and **Party** (6 slots plus storage).

If location sharing is turned off (or the signal is lost) mid-game, the game is covered by a "Survey paused" overlay until it comes back.

**Time and weather.** The status bar shows the device's local time, the time-of-day band and live weather. Both feed spawning: encounter-table conditions decide *whether* a species can appear, and per-species `spawnModifiers` decide *how often* (the modifiers are one of the exercises).

**Spawning.** Each `GET /api/game/state` (polled every 10 s on the radar) expires old spawns, drops ones you walked far away from, lets the rest wander, and tops you up to 6 spawns (at most 2 new per tick) within 120 m, chosen by weight from the published encounter tables at your server-side position. Species deleted in the Creature Manager never spawn.

**Wandering (experimental).** Spawns take one step per 10 s since they last moved (at most 6 per poll), in the style of their species' `movementStyle` (`still`, `skulker`, `forager`, `roamer`, `darter`), slower outside their activity period. A spawn that wanders more than `spawnRadiusM` (120 m) from you is despawned. On the radar markers walk smoothly between polls, face their direction and fade in and out; "It wandered off." shows if the selected one leaves. Code: `packages/world/src/wandering.ts`. This may be removed by v0.3.0 after testing.

**Art.** Wildkin images load from the API (`/api/art/wildkin/<id>/<icon|sprite>.png`, stored in the database), falling back to the static PNGs in `apps/web/public/wildkin/` and then a placeholder.

## Location security (anti-teleport)

Previously anyone could call the public resolver with any coordinate and "be" anywhere. Now:

- **No public coordinate lookup.** Resolving arbitrary coordinates and reading the whole world are editor-only (`/api/editor/*`, bearer token).
- **The server tracks where each player is.** Clients only *report* GPS fixes (`POST /api/game/position`). `checkMovement` in `@wildbound/world` accepts a fix only if the distance from the last accepted one is at most `40 m/s × elapsed + both accuracies + 25 m`, using the server's clock. Fixes worse than `GAME_RULES.maxAccuracyM` (200 m, generous for desktop Wi-Fi location) are ignored. The radar shows your current accuracy against that limit (`ACC ±x/200M`, red when too imprecise); the dashed ring is the 60 m observe/capture range.
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

Editor and Creature Manager routes need `Authorization: Bearer $EDITOR_TOKEN`. Game routes need the `wb_session` cookie from `POST /api/auth/login`. Full reference: [`docs/04-api-reference.md`](docs/04-api-reference.md).

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
| GET | `/api/editor/creatures` | editor | Creature catalogue (no deleted species); the editor refetches it on window focus |
| GET | `/api/editor/published` | editor | The published world (active regions only) |
| GET | `/api/editor/resolve?lat&lng[&radius&timeOfDay&weather&stage]` | editor | Coordinate → world context (draft or published) |
| PUT | `/api/editor/draft` | editor | Save the whole draft. 400 on malformed or structurally broken documents |
| POST | `/api/editor/validate` | editor | Validate a posted document without saving |
| POST | `/api/editor/publish` | editor | 409 with issues if validation fails |
| GET | `/api/manager/config` | editor | Whether the AI assistant and PixelLab art are configured |
| GET | `/api/manager/stats` | editor | Dashboard counts, next registry number |
| GET | `/api/manager/wildkin?deleted=exclude\|include\|only` | editor | Encyclopedia list |
| GET / PUT | `/api/manager/wildkin/:id` | editor | Read / replace an entry (id is immutable) |
| POST | `/api/manager/wildkin` | editor | Create a draft (409 on duplicate id or registry number) |
| POST | `/api/manager/wildkin/:id/publish` | editor | Copy game fields into `creatures` (400 `publish_incomplete` if required fields are empty) |
| DELETE | `/api/manager/wildkin/:id` | editor | Soft delete (entry + creature) |
| POST | `/api/manager/wildkin/:id/restore` | editor | Undo the soft delete |
| POST | `/api/manager/assist` | editor | `{ prompt, current? }` → lore-aligned suggestion from Groq (503 without `GROQ_API_KEY`) |
| GET | `/api/manager/art/balance` | editor | PixelLab balance |
| POST | `/api/manager/wildkin/:id/art` | editor | `{ kinds?, extraPrompt? }` → generate icon/sprite (balance checked first, 402 if too low) |
| GET | `/api/art/wildkin/:id/:kind.png` | public | Wildkin art from the database (non-deleted entries) |

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
| Unknown Wildkin (a species deleted in the Creature Manager can still be saved, but blocks publishing) | | Same Wildkin listed twice |
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

- **Unit:** schemas, conditions and time of day, encounter weighting, movement checks, spawn planning, wandering, validation rules, context assembly, geometry helpers, editor edit operations, manager form helpers, lore budget, art prompt, suggestion sanitizing.
- **Integration (real PostGIS, Express via supertest):** point-in-polygon, habitat selection, nearby POIs, draft/published isolation, publish gating, editor auth, payload validation, the authoring-to-resolve workflow, the game (login, teleport rejection and lockout, spawn ownership, wandering and despawning, deleted species, range checks, Registry unlocking) and the Creature Manager (CRUD, publish, soft delete, AI assistant and art with fake providers, so no network or credits are used).

Integration tests run against `wildbound_test`, never your dev data.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | API, editor, game and Creature Manager together |
| `pnpm dev:api` / `pnpm dev:editor` / `pnpm dev:web` / `pnpm dev:manager` | One at a time |
| `pnpm build` | Production build of the editor, web game and Creature Manager |
| `pnpm build:manager` | Production build of the Creature Manager only |
| `pnpm db:up` / `pnpm db:down` | Start or stop the PostGIS container |
| `pnpm db:migrate` | Apply Prisma migrations (baselines an old Drizzle database first) |
| `pnpm db:seed` | Seed Wildkin (creatures, plus encyclopedia entries and art if missing) and the sample draft (skips the draft if it has content). Resets the five seed creatures' game fields |
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

Done in v0.2.0: the Creature Manager (Wildkin encyclopedia, dashboard, draft/publish into `creatures`, soft delete and restore, Groq AI assistant fed with the canon documents, PixelLab art generation with balance checks), Wildkin art stored in the database and served by the API, the editor's creature list following the database live, and wandering spawns on the radar (experimental: keep, tune or remove by v0.3.0).

Left as exercises: capture, party editing, renaming, the weather-code mapping, species spawn modifiers, and the capture-only Registry section.

Not yet: Phaser field exploration, battles, passwords/real accounts, offline/PWA, social features.

AI tools (Groq, PixelLab) are used only for authoring in the Creature Manager. They are never a runtime dependency of the game and never the source of geographic truth; AI suggestions are reviewed by a person before saving. Generated art is placeholder until approved against the Wildkin Bible.

## Troubleshooting

- **Editor shows a token prompt.** `VITE_EDITOR_TOKEN` must equal `EDITOR_TOKEN`. Restart Vite after editing `.env`.
- **Creature Manager: "AI assist is off" / "Art generation is off".** Set `GROQ_API_KEY` / `PIXELLAB_API_KEY` in `.env` and restart the API.
- **Creature Manager: "Groq returned 429" (or 413).** Groq's rate/token limit, common on the free tier. Wait a minute, lower `LORE_MAX_CHARS` (e.g. `12000`), or set a smaller `GROQ_MODEL`.
- **A new Wildkin is missing from the editor.** Publish it in the manager (drafts are not game data), then focus the editor tab.
- **"Cannot reach the API".** Run `pnpm dev:api` and check `VITE_API_URL` (editor) or the Vite proxy target (game, `API_PROXY_TARGET`).
- **Integration tests fail to connect.** Run `pnpm db:up` and make sure `wildbound_test` exists (see Quick start).
- **Base map is blank.** The tile servers need internet access. Try the OSM or Satellite option in the editor.
- **CORS errors in the editor.** Add your origin to `CORS_ORIGINS` and restart the API. (The game and the Creature Manager use a Vite proxy and need no CORS entry.)
- **The game says "No surveyed habitat here".** Your (real or simulated) location is outside every published region. Publish from the editor or run `pnpm db:seed --publish`, and set a location inside the region.
- **The game stays on "Share your location".** Geolocation needs `https://` or `localhost`. On a phone, serve the game over HTTPS (e.g. a tunnel) or use desktop devtools Sensors.
- **"That GPS jump looked impossible".** You moved the simulated location too far at once. Move in small steps or wait; after 3 jumps you are locked for 2 minutes.
- **Weather always "Clear".** Either `WEATHER_API_URL=off`, Open-Meteo is unreachable, or you have not done the weather exercise yet.
- **`Cannot find module './generated/prisma/client.ts'`.** Run `pnpm install` (or `pnpm --filter @wildbound/db generate`).

