# v0.1.0 exercises (fill in the blanks)

v0.1.0 runs end to end, but these pieces are left for you. Each `TODO(you)` comment in the code
has step-by-step instructions and hints. Suggested order: pure logic first, then API, then UI.

Find them all: `grep -rn "TODO(you)" apps packages --include=*.ts --include=*.tsx`

| # | Exercise | Where | Skills | How you know it works |
|---|---|---|---|---|
| 1 | Map Open-Meteo weather codes to WILDBOUND weather | `packages/world/src/weather.ts` → `weatherFromWmoCode` | TypeScript, pure functions | `pnpm test:exercises` (weather) passes; the status bar shows real weather |
| 2 | Weather and time change how often each Wildkin spawns | `packages/world/src/spawning.ts` → `applySpawnModifiers` | TypeScript, `map`/`filter`, Zod-typed data | `pnpm test:exercises` (spawning) passes; Kawi becomes rare at night |
| 3 | Capture a Wildkin | `apps/api/src/routes/game.ts` → `POST /spawns/:id/capture` | Express, Prisma interactive transactions, compound keys, `increment`/`decrement` | Capture on the radar succeeds/fails, capsules go down, the Wildkin appears in Party |
| 4 | Show captured-only Registry data | `apps/web/src/features/registry/RegistryDetailPage.tsx` → `CapturedDetails` | React, Tailwind, the design tokens | After a capture the entry shows rarity, activity and skills |
| 5 | Rename a captured Wildkin (API) | `apps/api/src/routes/game.ts` → `PATCH /wildkin/:id` | Express, Prisma `findFirst`/`update`, ownership checks | `curl`/the form gets 200 with the new nickname |
| 6 | Rename form | `apps/web/src/features/party/RenameForm.tsx` | react-hook-form, zodResolver, `useMutation`, query invalidation | The nickname changes in Party without a reload |
| 7 | Rearrange the party (API) | `apps/api/src/routes/game.ts` → `PUT /party` | Prisma transactions, unique constraints, validation | 200/204, `GET /party` shows the new order |
| 8 | Rearrange the party (UI, stretch) | `apps/web/src/features/party/PartyPage.tsx` | React state, `useMutation`, optimistic updates (bonus) | Moving a Wildkin between slots and storage sticks after refresh |

## Tips

- **Tests.** Exercises 1–2 have tests in `*.exercise.test.ts` (`pnpm test:exercises`). For 3, 5 and 7, the
  integration test `apps/api/test/game.test.ts` currently expects `501`. Change those assertions to the
  behaviour you build (a good habit: write the test first).
- **Contracts.** Request/response shapes are already defined in `packages/shared/src/game.ts`
  (`CaptureResponseSchema`, `UpdatePartyRequestSchema`, `RenameWildkinRequestSchema`, …). Reuse them on
  both sides so the client and server can never disagree.
- **Prisma.** The generated client is in `packages/db/src/generated/prisma`. Hover a model in your
  editor to see its fields. `pnpm --filter @wildbound/db studio` lets you look at the data.
- **Security.** Always scope queries by `playerId: res.locals.player.id`. Never trust ids or coordinates
  from the request without checking ownership (see `loadActionableSpawn`).
- **Reference.** Finished examples of every pattern exist nearby: Observe (transaction + upsert), GET /party
  (view mapping), LoginPage (react-hook-form + zod), `useObserve` (mutation + invalidation).
