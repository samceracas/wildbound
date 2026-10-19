# @wildbound/api

> Detailed documentation: [docs/04-api-reference.md](../../docs/04-api-reference.md).

Express 5 REST API. It authors and publishes the world (editor only), and runs the player game: username sessions, position reports, spawns, Observe/Capture, Registry, inventory and party.

## Responsibilities

- Persist the editable **draft** world and **publish** it atomically.
- Validate every payload server-side with the shared Zod schemas. The server is authoritative.
- Resolve a coordinate to WILDBOUND context (PostGIS, then the rules in `@wildbound/world`). Only the editor can do this for arbitrary coordinates.
- Track each player's position and reject implausible movement (anti-teleport).
- Place spawns around a player's **server-side** position using live weather and local time.

## Tech

Node 22, TypeScript, Express 5, `cors`, `cookie-parser`, Zod 4 (via `@wildbound/shared`), Prisma 7 (via `@wildbound/db`), Open-Meteo for weather, `tsx watch` in development, Vitest + supertest for tests.

## Layout

```
src/
  server.ts          Process entry: config, database, weather provider, listen, graceful shutdown
  app.ts             createApp(deps): middleware, routers, 404 and error handler (also used by tests)
  config.ts          Environment configuration
  http.ts            HttpError, parseOr400 (Zod → 400), notImplemented (501 for the exercises)
  errors.ts          Error middleware: HttpError, Prisma/Postgres constraint errors → 400/409, else 500
  auth.ts            Editor bearer token; player sessions (httpOnly cookie, sha256-hashed token in the DB)
  resolve.ts         Coordinate → WorldContext (PostGIS lookups + rules)
  weather.ts         WeatherProvider: OpenMeteoWeather (cached, falls back to clear) and StaticWeather
  game/
    service.ts       reportPosition, environmentAt, gameState (spawn lifecycle), loadActionableSpawn
    views.ts         registryView: what a player may see about a species
  routes/
    auth.ts          login, logout, me
    game.ts          position, state, observe, capture*, registry, inventory, party, party update*, rename*
    editor.ts        world, published, resolve, draft, validate, publish
test/
  world.test.ts      Editor/authoring integration tests
  game.test.ts       Player/game integration tests (login, anti-teleport, spawns, Registry)
  helpers.ts         testConfig()
```
`*` = exercise: answers 501 until you implement the `TODO(you)`.

`createApp` takes its database, config, weather provider, clock and RNG as arguments. That is how tests drive the real app in-process with supertest, with a fixed clock and seeded randomness.

## Endpoints

See the [root README](../../README.md#api) for the full table.

### Status codes

| Code | Meaning |
|---|---|
| 200 / 204 | Success. Resolving a coordinate outside every region is also 200 with an empty context |
| 400 | Malformed query or body, integrity errors, invalid geometry. The body lists `issues` |
| 401 | Missing/wrong editor token, or no player session |
| 404 | Unknown route, or a spawn that is not yours |
| 409 | Publish blocked; uniqueness conflict; out of range; location unavailable/locked |
| 410 | The spawn expired or was already taken |
| 501 | An exercise endpoint you have not implemented yet |
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

## Notes

- Saving a draft replaces the whole draft document in one transaction, serialized with publishing by a Postgres advisory lock.
- Editor auth is one shared token; player auth is username-only. Both are fine for local development, not for a public deployment.
