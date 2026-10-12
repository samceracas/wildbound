# @wildbound/world

Pure WILDBOUND domain logic. No database, no React, no network: the same functions run in the API, the editor, tests and, later, the game client.

## Modules

| Module | What it does |
|---|---|
| `conditions.ts` | `conditionsMatch` (empty list means any), `timeOfDayForHour`, `timeOfDayAt(date, timeZone)`, `describeConditions` |
| `encounters.ts` | `evaluateEncounterTable` (availability and probabilities), `combineAvailableWildkin` (merge across tables), `rollEncounter` (weighted pick), `seededRandom` (reproducible tests and previews) |
| `geometry.ts` | Turf-based helpers: self-intersection check, area, fraction outside a region, overlap, point-in-area, bounds, centroid |
| `validation.ts` | `checkIntegrity` (blocks saving), `validateWorld` (blocks publishing, plus warnings), `schemaIssues` |
| `context.ts` | `assembleWorldContext`: turns spatial lookup results plus environment into the `WorldContext` clients receive |

## Why it is separate

PostGIS answers "which region and habitat contain this point?". This package decides what that means: which tables apply, which Wildkin are available, and with what probability. Keeping the rules independent of storage and UI makes them deterministic and testable.

Rules worth knowing:

- A habitat's encounter tables only apply while the habitat's own condition rules pass. Region-wide tables still apply.
- Habitat tables are listed before region tables; each group is sorted by name then id, so output is deterministic.
- Overlapping habitats are allowed (warning); the smaller one wins at resolution time.
- A habitat more than 50% outside its region blocks publishing; a smaller overlap is a warning.

## Tests

```bash
pnpm test:unit
```

Shared fixtures live in `src/__fixtures__/world.ts` (also used by the API and database integration tests).
