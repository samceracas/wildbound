# @wildbound/api

Fastify REST API. It authors and publishes the world (editor only) and serves the published world and coordinate resolution (public).

## Responsibilities

- Persist the editable **draft** world and **publish** it atomically.
- Validate every editor payload server-side. The server is authoritative.
- Resolve a coordinate to WILDBOUND context using PostGIS, then the rules in `@wildbound/world`.
- Serve the published world to clients such as `apps/web`.
- Protect editor routes with a bearer token.

## Tech

Node 22, TypeScript, Fastify 5, `@fastify/cors`, Zod 4 (via `@wildbound/shared`), Drizzle + `pg` (via `@wildbound/db`), run in development with `tsx watch`.

## Layout

```
src/
  server.ts          Process entry: config, database, listen, graceful shutdown
  app.ts             buildApp(deps): registers CORS, error handler and routes (also used by tests)
  config.ts          Environment configuration
  auth.ts            Bearer token check (timing-safe)
  errors.ts          Maps Zod and Postgres errors to 400/409 responses
  resolve.ts         Coordinate -> WorldContext (PostGIS lookups + rules)
  routes/
    public.ts        health, creatures, published world, resolve
    editor.ts        world, published, draft, validate, publish
test/
  world.test.ts      Integration tests against a real PostGIS test database
```

`buildApp` takes its database and config as arguments, which is how the integration tests run the real API in-process with `app.inject`, without opening a port.

## Endpoints

| Method | Path | Access |
|---|---|---|
| GET | `/api/health` | public |
| GET | `/api/creatures` | public |
| GET | `/api/world/published` | public |
| GET | `/api/world/resolve?lat&lng[&radius&timeOfDay&weather&stage]` | public (`stage=draft` needs the token) |
| GET | `/api/editor/world` | editor |
| GET | `/api/editor/published` | editor |
| PUT | `/api/editor/draft` | editor |
| POST | `/api/editor/validate` | editor |
| POST | `/api/editor/publish` | editor |

Details and examples are in the [root README](../../README.md#api).

### Status codes

| Code | Meaning |
|---|---|
| 200 | Success. Resolving a coordinate outside every region is also 200 with an empty context |
| 400 | Malformed query or body, integrity errors, invalid geometry. The body lists `issues` |
| 401 | Missing or wrong editor token |
| 409 | Publish blocked by validation errors, or a database uniqueness conflict |
| 500 | Unexpected error (details are logged, not returned) |

Error body shape: `{ "error": string, "message": string, "issues"?: ValidationIssue[] }`.

## Configuration

See [Environment variables](../../README.md#environment-variables-env). The API needs `DATABASE_URL` and `EDITOR_TOKEN`.

## Run and test

```bash
pnpm dev:api                                 # watch mode on :4000
pnpm --filter @wildbound/api start           # without watch
pnpm --filter @wildbound/api typecheck
pnpm test:integration                        # needs the database (pnpm db:up)
```

## Notes

- Saving a draft replaces the whole draft document in one transaction, serialized with publishing by a Postgres advisory lock.
- Editor auth is one shared token, fine for local development. Swap `requireEditor` in `auth.ts` for real authentication before any public deployment.
- Draft resolution (`stage=draft`) is editor-only so unpublished content cannot leak.
