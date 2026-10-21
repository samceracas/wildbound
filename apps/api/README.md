# @wildbound/api

> Detailed documentation: [docs/04-api-reference.md](../../docs/04-api-reference.md).

Express 5 REST API. It authors and publishes the world (editor only), backs the Creature Manager (Wildkin encyclopedia, AI assistant, PixelLab art), serves Wildkin art, and runs the player game: username sessions, position reports, spawns (that wander), Observe/Capture, Registry, inventory and party.

## Responsibilities

- Persist the editable **draft** world and **publish** it atomically.
- Validate every payload server-side with the shared Zod schemas. The server is authoritative.
- Resolve a coordinate to WILDBOUND context (PostGIS, then the rules in `@wildbound/world`). Only the editor can do this for arbitrary coordinates.
- Track each player's position and reject implausible movement (anti-teleport).
- Place spawns around a player's **server-side** position using live weather and local time, and let them wander (experimental).
- Store Wildkin encyclopedia entries and publish their game fields into `creatures`; soft delete/restore species.
- Talk to the optional outside services for the Creature Manager: Groq (AI assistant, fed with the canon `.docx` files in `docs/`) and PixelLab (art, balance checked before every generation). Their keys never leave the server.
- Serve Wildkin art from the database at `GET /api/art/wildkin/:id/:kind.png` (public).

## Tech

Node 22, TypeScript, Express 5, `cors`, `cookie-parser`, Zod 4 (via `@wildbound/shared`), Prisma 7 (via `@wildbound/db`), Open-Meteo for weather, Groq chat completions (JSON mode) and the PixelLab v2 HTTP API via `fetch`, `mammoth` to read `.docx` canon, `tsx watch` in development, Vitest + supertest for tests.

## Layout

```
src/
  server.ts          Process entry: config, database, weather provider, Groq/PixelLab providers (only if keys are set), listen
  app.ts             createApp(deps): middleware, routers, 404 and error handler (also used by tests)
  config.ts          Environment configuration
  http.ts            HttpError, parseOr400 (Zod → 400), notImplemented (501 for the exercises)
  errors.ts          Error middleware: HttpError, Prisma/Postgres constraint errors → 400/409, else 500
  auth.ts            Editor bearer token; player sessions (httpOnly cookie, sha256-hashed token in the DB)
  resolve.ts         Coordinate → WorldContext (PostGIS lookups + rules)
  weather.ts         WeatherProvider: OpenMeteoWeather (cached, falls back to clear) and StaticWeather
  game/
    service.ts       reportPosition, environmentAt, gameState (spawn lifecycle + wanderSpawns), loadActionableSpawn
    views.ts         registryView: what a player may see about a species
  manager/
    assistant.ts     WildkinAssistant interface, GroqAssistant, system/user prompts, sanitizeSuggestion
    art.ts           ArtGenerator interface, PixelLabArt (Pixen, transparent bg), artPrompt, canAfford
    lore.ts          Lore for the assistant: docs/lore/assistant-brief.md (LORE_SOURCE=brief, default) or
                     docs/WILDBOUND_*.docx (full; Bible > First Field Survey > Biology); caches, trims to LORE_MAX_CHARS
    manager.test.ts  Unit tests (lore budget, art prompt, balance check, suggestion sanitizing)
  routes/
    auth.ts          login, logout, me
    game.ts          position, state, observe, capture*, registry, inventory, party, party update*, rename*
    editor.ts        world, creatures, published, resolve, draft, validate, publish
    manager.ts       /api/manager/*: config, stats, wildkin CRUD, publish, delete/restore, assist, art balance, art;
                     artRoutes: public /api/art/wildkin/:id/:kind.png
test/
  world.test.ts      Editor/authoring integration tests
  game.test.ts       Player/game integration tests (login, anti-teleport, spawns, wandering, deleted species, Registry)
  manager.test.ts    Creature Manager integration tests with fake assistant/art providers (no network, no credits)
  helpers.ts         testConfig()
```
`*` = exercise: answers 501 until you implement the `TODO(you)`.

`createApp` takes its database, config, weather provider, optional assistant and art generator, clock and RNG as arguments. That is how tests drive the real app in-process with supertest, with a fixed clock and seeded randomness.

## Endpoints

See the [root README](../../README.md#api) for the full table and [docs/04](../../docs/04-api-reference.md) for request/response details. Route groups: `/api/auth`, `/api/game` (session cookie), `/api/editor` and `/api/manager` (editor bearer token), `/api/art` (public).

### Status codes

| Code | Meaning |
|---|---|
| 200 / 204 | Success. Resolving a coordinate outside every region is also 200 with an empty context |
| 400 | Malformed query or body, integrity errors, invalid geometry, Wildkin entry missing required fields (`publish_incomplete`). The body lists `issues` |
| 401 | Missing/wrong editor token, or no player session |
| 402 | PixelLab balance too low (`insufficient_credits`) |
| 404 | Unknown route, a spawn that is not yours, an unknown Wildkin entry or missing art |
| 409 | Publish blocked; uniqueness conflict (id/registry number taken); Wildkin entry deleted; out of range; location unavailable/locked |
| 410 | The spawn expired or was already taken |
| 501 | An exercise endpoint you have not implemented yet |
| 502 | Groq or PixelLab failed (`assistant_failed`, `art_failed`) |
| 503 | Groq or PixelLab not configured (`assistant_unavailable`, `art_unavailable`) |
| 500 | Unexpected error (details are logged, not returned) |

Error body shape: `{ "error": string, "message": string, "issues"?: ValidationIssue[] }`.

## Express notes

- Express 5 forwards rejected promises from async handlers to the error middleware, so handlers just `throw new HttpError(...)`.
- `res.locals.player` is typed via declaration merging in `auth.ts` and set by `requirePlayer`.
- The game sets a first-party `wb_session` cookie. The web app calls the API through the Vite proxy (same origin), so no CORS or third-party cookie issues.

## Run and test

```bash
pnpm dev:api                                 # watch mode on :4000
WEATHER_API_URL=off pnpm dev:api             # offline: always clear weather
pnpm --filter @wildbound/api typecheck
pnpm test:integration                        # needs the database (pnpm db:up)
```

## Configuration

Read from the repo-root `.env` by `config.ts`: `DATABASE_URL`, `API_PORT`, `API_HOST`, `EDITOR_TOKEN`, `CORS_ORIGINS` (default `:5173,:5174,:5175`), `WORLD_TIMEZONE`, `WEATHER_API_URL`, `SECURE_COOKIES`, and for the Creature Manager `GROQ_API_KEY`, `GROQ_MODEL` (default `llama-3.3-70b-versatile`), `LORE_SOURCE` (`brief` default, or `full`), `LORE_MAX_CHARS` (default 30000), `LORE_DOCS_DIR`, `PIXELLAB_API_KEY`, plus `GROQ_API_URL` / `PIXELLAB_API_URL` overrides. At startup the API logs whether the assistant and art generation are on. The lore (brief or canon documents) is read once; restart the API after changing it. Details: [docs/13-creature-manager.md](../../docs/13-creature-manager.md).

## Notes

- Saving a draft replaces the whole draft document in one transaction, serialized with publishing by a Postgres advisory lock.
- Editor auth is one shared token; player auth is username-only. Both are fine for local development, not for a public deployment.
