# @wildbound/world

> Detailed documentation: [docs/07-game-systems.md](../../docs/07-game-systems.md).

Pure WILDBOUND domain logic. No database, no React, no network: the same functions run in the API, the editor, tests and, later, the game client.

## Modules

| Module | What it does |
|---|---|
| `conditions.ts` | `conditionsMatch` (empty list means any), `timeOfDayForHour`, `timeOfDayAt(date, timeZone)`, `describeConditions` |
| `encounters.ts` | `evaluateEncounterTable` (availability and probabilities), `combineAvailableWildkin` (merge across tables, with each Wildkin's `levelBands`), `effectiveLevelRange`, `rollLevel`, `rollEncounter` (weighted pick), `seededRandom` (reproducible tests and previews) |
| `geometry.ts` | Turf-based helpers: self-intersection check, area, fraction outside a region, overlap, point-in-area, bounds, centroid |
| `validation.ts` | `checkIntegrity` (blocks saving), `validateWorld` (blocks publishing, plus warnings, incl. `level-range-crosses-band` and `region-without-entry-habitat`), `schemaIssues` (incl. `invalid-level-range`) |
| `context.ts` | `assembleWorldContext`: turns spatial lookup results plus environment into the `WorldContext` clients receive |
| `movement.ts` | `distanceMeters` (haversine), `checkMovement` (the anti-teleport plausibility check), `canAct` |
| `spawning.ts` | `applySpawnModifiers` (**exercise #2**), `randomPointNear`, `planSpawns` (each `PlannedSpawn` has a `level`) |
| `wandering.ts` | Spawn wandering (experimental, v0.2.0): `WANDER_PROFILES` per movement style (`still`, `skulker`, `forager`, `roamer`, `darter`), `isActivePeriod` (35 % speed outside it), `offsetMeters`, `wanderStep` (one step: pause, turn, move), `wander` (steps of random length, `STEP_JITTER` ±50 % around 10 s, that fit the elapsed time; returns `usedMs`; capped; stops when leaving the radius), so spawns never move in lockstep |
| `weather.ts` | `weatherFromWmoCode`: Open-Meteo WMO code → WILDBOUND weather (**exercise #1**) |
| `stats.ts` | v0.3.0. `computeStats(base, level, traitMods, vigor)`, `statDescriptor` (Signature strength, Solid, Modest, Weak point), `individualMultiplier`, `statGrade` (Low to Exceptional), `vigorWord` |
| `genetics.ts` | `rollGenome(pool, habitatTags, random)` (first matching habitat override wins), `rollVigor`, `phenotype`, `traitModifiers`, `genotypeText`, `individualStats` (falls back to 75 / 75 / 75 / 75 when base stats are not set), `inheritGenome` (breeding groundwork, not called yet) |
| `levels.ts` | `totalExpForLevel` (L³), `levelForExp`, `nextLevelGap`, `applyExpGain(current, amount, cap)` (EXP beyond the cap is lost), `expCapFor` (a restless Wildkin may grow to the top of its own license band), `levelProgress` |
| `exp.ts` | EXP yields: `battleExp` (gap scaling), `sharedBattleExp` (catch-up share), `walkingExp`, `observationExp`, `explorationExp`, `captureExp`, `remainingToday`, `restedCharges`, `advanceWalkMeter` (segments under 3 m/s only), `dayKey(date, timeZone)` |
| `battle/engine.ts` | `resolveTurn(state, action, { random })` → `{ state, events, discoveries }`: validation, priority actions (switch, item, capsule, escape) before attacks, status checks, attack order, dodge, damage, matchups, faints, free replace, end of turn. Also `endBattle`, `pickLead`, `isUsable`, `attacksOf` (`FALLBACK_ATTACK` "Lunge"), `BattleActionError`. It never touches inventory, EXP or the database |
| `battle/turn-order.ts` | `attackOrder` and `escapeChance` (**exercise #10**), `dodgeChance` |
| `battle/matchups.ts` | `matchupMultiplier` (**exercise #11**), `traitEffect`, `evaluateMatchup` (multiplier, effect, field-note line, discoveries) |
| `battle/capture.ts` | `battleCaptureChance` (**exercise #12**), `captureBase`, `capsuleBonus` (category capsule match) |
| `battle/damage.ts`, `battle/statuses.ts` | Damage formula with its random factor; status durations, effects, ticking and capture bonus (framework only: nothing inflicts a status yet) |
| `recovery.ts` | `currentHp(row, maxHp, now, restless)` (**exercise #13**: lazy natural recovery, frozen while restless), `msUntilFull` |
| `research.ts` | Researcher EXP (`observationResearcherExp`, `phenotypeRecordTraits`, `phenotypeRecordExp`, `splitResearcherExp` and `categoryWeights` for habitat visits), `categoryPresence`, `achievableAssessmentLimits(world, creatures, category)`, `assessmentProgress(requirements, counts, limits, { relaxWeather })`, `rankThreshold` |
| `pickups.ts` | `rollPickup(poiType, random)`: daily POI loot (the route itself is exercise #14) |

The old `capture.ts` (`captureChance`, flee on failure) was removed in v0.3.0: capture happens in battle.

## Why it is separate

PostGIS answers "which region and habitat contain this point?". This package decides what that means: which tables apply, which Wildkin are available, and with what probability. Keeping the rules independent of storage and UI makes them deterministic and testable.

Rules worth knowing:

- A habitat's encounter tables only apply while the habitat's own condition rules pass. Region-wide tables still apply.
- Habitat tables are listed before region tables; each group is sorted by name then id, so output is deterministic.
- Overlapping habitats are allowed (warning); the smaller one wins at resolution time.
- A habitat more than 50% outside its region blocks publishing; a smaller overlap is a warning.
- Wandering is deterministic given `random`: the API passes its injected RNG, tests pass `seededRandom()`. The API despawns a spawn when `wander` reports `outOfBounds` (beyond `GAME_RULES.spawnRadiusM`). Kept as it is in v0.3.0.
- All randomness in the v0.3.0 modules (genome, vigor, level, turn order, damage, capture, pickups) is injected the same way, and every constant comes from `BATTLE_RULES`, `EXP_RULES` or `RESEARCH_RULES` in `@wildbound/shared`.

## Tests

```bash
pnpm test:unit
pnpm test:exercises   # spawning, weather, battle/turn-order, battle/matchups, battle/capture and recovery
                      # *.exercise.test.ts: fail until you implement them
```

Shared fixtures live in `src/__fixtures__/world.ts` (also used by the API and database integration tests) and `src/battle/fixtures.ts` (combatants and battle states). The unit tests pass both before and after the exercises are solved.
