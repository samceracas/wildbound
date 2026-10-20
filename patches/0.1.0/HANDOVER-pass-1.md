# v0.1.0 handover after pass 1

Status of `patches/0.1.0/instructions.md`: **not finished** (state stays "Not implemented" until pass 2 is done).
Branch: `claude/admiring-turing-t5pc39`.

## Decisions already made with the user (do not re-ask)

- **Prisma everywhere.** Drizzle is gone. Geometry columns are `Unsupported(...)` in `schema.prisma`; spatial SQL uses `$queryRaw`. PostGIS, MapLibre and Turf stay ("location features keep their stack").
- **Fill-in-the-blanks level: working skeleton + TODOs.** The app runs end to end; about a third of the feature logic is left as `TODO(you)` with instructions (list in `patches/0.1.0/EXERCISES.md`). Do not implement those exercises.
- **Username-only login** (no password/PIN), httpOnly session cookie.
- **Anti-cheat: server-side movement checks** (speed/accuracy plausibility, strikes, 2-minute lockout), server-authoritative spawns, and observe/capture range checks against the server-tracked position. No HMAC-signed spawns or rate limiting.
- **PixelLab:** use the cheapest model (Pixen or Pixflux, 1 generation each) and always check `get_balance` first.

## Done in pass 1

- `packages/db`: Prisma 7 schema + migrations (`0_init` = old Drizzle schema, so old databases are baselined automatically by `runMigrations`; `1_players` = creature Registry fields + player tables). `world-repo.ts` rewritten on Prisma.
- `apps/api`: Fastify → Express 5. Routers: `/api/auth`, `/api/game`, `/api/editor`. The public `/api/world/resolve`, `/api/world/published` and `/api/creatures` were removed (they allowed coordinate "teleporting"); coordinate preview is now `/api/editor/resolve` (token). Live weather via Open-Meteo (`weather.ts`), local time from the location's time zone.
- `packages/world`: `movement.ts` (anti-teleport), `spawning.ts`, `weather.ts`, `capture.ts`, with tests and exercise tests (`pnpm test:exercises`, excluded from `pnpm test`).
- `packages/shared`: `game.ts` (GAME_RULES, ITEMS, all player API schemas); creature schema extended (registryNumber, habitatSummary, rarity, activityPattern, spawnModifiers, skills).
- `apps/web`: rebuilt. React Router flow `/` → `/location` → `/play` (radar, registry, satchel, party), TanStack Query, react-hook-form + zod login, Tailwind theme from the Stitch design tokens, MapLibre radar, Registry with silhouettes, "Survey paused" overlay when location stops.
- Art: PixelLab Pixen 64px face icons + 128px sprites for all 5 Wildkin and the player head (`apps/web/public/`). 11 generations used; 184 were left of the 2000/cycle allowance (resets 2026-10-21).
- `patches/0.1.0/mockups/DESIGN.md`: the Stitch design system, exported through the Stitch MCP.
- Docs: root README, all app/package READMEs, `.env.example`.
- Verified: `pnpm typecheck`, `pnpm test:unit` (98), `pnpm test:integration` (36), Playwright run of the whole web flow with a faked geolocation.

## Not done: pass 2 prompt

Copy everything below into a fresh session on branch `claude/admiring-turing-t5pc39`.

---

You are continuing WILDBOUND v0.1.0 (read `patches/0.1.0/instructions.md`, then `patches/0.1.0/HANDOVER-pass-1.md` for decisions already made; do not re-ask them). Pass 1 delivered the Prisma/Express backend, anti-teleport, and the web game. Do the remaining work:

1. **Stitch mockups.** In pass 1 the sandbox network blocked `lh3.googleusercontent.com` and `contribution.usercontent.google.com`, so only the design tokens were exported. If those hosts are now reachable, use the Stitch MCP (`get_screen` for project `10056911725099997677`, screens listed in `patches/0.1.0/mockups/DESIGN.md`) to get each screen's screenshot + HTML and `curl -L` them into `patches/0.1.0/mockups/` (`1-login.png/.html`, `2-location…`, `3-radar…`, `4-inventory…`, `5-registry…`, `6-party…`). Then compare each web screen in `apps/web/src/features/*` to its mockup (take Playwright screenshots at 390×844 with a granted fake geolocation of `14.6518, 121.0444`; Chromium is at `/opt/pw-browsers`) and restyle to match the layout and components. Keep the existing logic, routes and exercises intact. If the hosts are still blocked, tell the user and skip this step.

2. **Editor stack standardization** (`apps/editor`). The user likes the editor as is: keep its look, MapLibre controller (`map/editor-map.ts`), Zustand store and undo/redo. Change:
   - Styling: replace `src/styles.css` with Tailwind CSS 4 (same visual design; follow the `apps/web` setup: `@tailwindcss/vite`, `@` alias, shadcn `components.json` if useful).
   - Server state: TanStack Query for load world / save draft / validate / publish / resolve (query keys + mutations with invalidation). Zustand keeps only local editing state (world being edited, selection, tool, history).
   - Forms: the inspectors (`src/inspectors/*.tsx`, `components/fields.tsx`) on react-hook-form + zodResolver using the `@wildbound/shared` schemas. Leave ONE inspector (suggest `PoiInspector`) as a `TODO(you)` exercise with instructions, consistent with the fill-in-the-blanks approach, and add it to `patches/0.1.0/EXERCISES.md`.
   - "Some improvements" (keep them small): show each creature's spawn modifiers in the encounter-table inspector, and let the Test/preview panel show probabilities after species modifiers (it can call `applySpawnModifiers`; note it is an exercise, so the preview equals raw weights until the user implements it).
   - Keep `apps/editor/src/world-edit.test.ts` passing; add tests if you add logic.

3. **Optional art fix.** The Kantar sprite (`apps/web/public/wildkin/sprites/kantar.png`) lacks the pale side markings the Wildkin Bible requires. Check the PixelLab balance first, then regenerate once with Pixen 128×128 (`no_background`, same style keywords as the others) and replace it if better.

4. **Finish.** Run `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration` (start Postgres with PostGIS; see README), and `pnpm build`. Update the READMEs touched by the changes. If everything in `instructions.md` is now covered (exercises are intentionally unimplemented), change its first line to `# State: Implemented`; otherwise write `HANDOVER-pass-2.md` the same way as this file. Commit and push to `claude/admiring-turing-t5pc39`.

---

## Environment notes for the next session

- Local Postgres without Docker: `apt-get install -y postgresql-16-postgis-3`, `service postgresql start`, set the `postgres` password to `postgres`, create `wildbound` and `wildbound_test`, `cp .env.example .env`, `pnpm db:migrate && pnpm db:migrate --test && pnpm db:seed --publish`.
- Open-Meteo and OSM tiles are blocked in that sandbox; run the API with `WEATHER_API_URL=off`.
- PixelLab image downloads (`api.pixellab.ai/mcp/images/<job>/download`) do work from the sandbox.
