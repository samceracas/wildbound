# v0.3.0 exercises (fill in the blanks)

v0.3.0 (stats, genetics, battles, capture through battle, healing and licenses) runs end to end, but
these pieces are left for you. Each `TODO(you)` comment in the code has step-by-step instructions and
hints, and every one ships with a working fallback so the game keeps running while it is open.
The numbering continues from `patches/0.1.0/EXERCISES.md`. Suggested order: pure logic first, then
API, then UI.

Find them all: `grep -rn "TODO(you)" apps packages --include=*.ts --include=*.tsx`

## New in v0.3.0

| # | Exercise | Where | Skills | Fallback until done | How you know it works |
|---|---|---|---|---|---|
| 10 | Weighted turn order and escape chance | `packages/world/src/battle/turn-order.ts` → `attackOrder(spdA, spdB, random)`, `escapeChance` | Pure TypeScript, probability | The faster side always goes first (ties: the player); escape is a flat 50% | `pnpm test:exercises` (turn-order) passes; a slower Wildkin sometimes strikes first |
| 11 | Matchup multiplier | `packages/world/src/battle/matchups.ts` → `matchupMultiplier(approach, traits)` | Lookup tables, `reduce` | Always 1: no weaknesses, so nothing to discover yet | `pnpm test:exercises` (matchups) passes; Peck on a Mimu writes "Field note recorded: Soft-bodied is weak to Pierce" |
| 12 | In-battle capture chance | `packages/world/src/battle/capture.ts` → `battleCaptureChance(...)` | Pure TypeScript, clamping | `rarityBase + observedBonus` only (capture is still possible) | `pnpm test:exercises` (capture) passes; weakened Wildkin are clearly easier to catch |
| 13 | Lazy natural recovery | `packages/world/src/recovery.ts` → `currentHp(row, maxHp, now, restless)` | Dates, pure functions | Returns the stored HP: no natural recovery (vets still heal) | `pnpm test:exercises` (recovery) passes; an injured Wildkin's HP bar refills over hours; restless ones stay frozen |
| 14 | Daily POI pickup route | `apps/api/src/routes/game.ts` → `POST /pois/:poiId/collect` | Express, Prisma interactive transactions, compound unique keys, `increment` with a cap | 501; the radar's POI sheet says "Searching for supplies is not built yet" (players still get the starter inventory and rank-up grants) | The test in `apps/api/test/battle.test.ts` ("daily pickups ... exercise #14") lists what to assert instead of 501; "Search for supplies" on the radar adds items once a day |
| 15 | Assessment checklist with progress | `apps/web/src/features/license/AssessmentChecklist.tsx` | React, TanStack Query data, Tailwind tokens | A plain list of requirement labels; the "Take assessment" button still works | Each License card shows "Observe in 3 different weathers: 1/3" with met and unmet rows styled differently |
| 16 | Live stat budget counter | `apps/manager/src/features/wildkin/BaseStatsEditor.tsx` | react-hook-form `useWatch`, Zod refinements | Four inputs; the budget error appears on submit | Typing stats in section 9 shows "240 / 300, 60 left" live, red until the total is exactly 300 |

## Earlier exercises: what changed

| # | Exercise | Status in v0.3.0 |
|---|---|---|
| 1 | Weather codes (`packages/world/src/weather.ts`) | Open. It now also unlocks the weather requirements of license assessments: while it is open live weather is always `clear`, so `ASSESSMENT_RELAX_WEATHER=true` (the default) clamps "observe in N weathers" to 1. Set it to `false` once real weather works. |
| 2 | Spawn modifiers (`packages/world/src/spawning.ts`) | Open, unchanged. |
| 3 | Capture a Wildkin (`POST /spawns/:id/capture`) | **Retired: superseded by battle capture in 0.3.0.** The route is gone (404); capture is a capsule action inside a battle. |
| 4 | Captured-only Registry data (`RegistryDetailPage.tsx` → `CapturedDetails`) | Open. The section now also holds the species' stat shape descriptors (`entry.statShape`, e.g. "Speed: Signature strength"). |
| 5 | Rename a captured Wildkin (API) | Done. `PATCH /wildkin/:id` now returns the full v0.3.0 Wildkin view (level, HP, condition). |
| 6 | Rename form (`RenameForm.tsx`) | Open, unchanged. The API side works, so the form only needs the web part. |
| 7 | Rearrange the party (API, `PUT /party`) | Open. Note: party order decides the lead (slot 0 leads into battle and collects walking and observation EXP). |
| 8 | Rearrange the party (UI, stretch) | Open, unchanged. |
| 9 | POI inspector on react-hook-form (editor) | Open, unchanged. |

## Tips

- **Tests.** Exercises 10 to 13 have tests in `*.exercise.test.ts` next to the code (`pnpm test:exercises`).
  The unit tests (`pnpm test:unit`) are written to pass both before and after you solve them, so a
  green unit run is not a hint either way. For 14, the integration test currently expects `501`; turn
  its comment into assertions (a good habit: write the test first).
- **Contracts.** `PickupResponseSchema`, `RequirementProgressSchema` and `BaseStatsSchema` already live
  in `packages/shared`. Reuse them on both sides.
- **Constants.** Every number lives in `BATTLE_RULES`, `EXP_RULES`, `RESEARCH_RULES` or `GAME_RULES`.
  Read the formula from there instead of typing literals.
- **Reference.** Finished examples are nearby: `visitVet` in `apps/api/src/game/care-service.ts`
  (range check, transaction) and `grantItems` (stack cap) for 14; `HpBar` and `ProgressBar` in
  `apps/web/src/components/field.tsx` for 15; the other `useWatch` uses in the manager form for 16.
