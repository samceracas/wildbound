# @wildbound/shared

> Detailed documentation: [docs/02-world-model.md](../../docs/02-world-model.md).

The data contract. Zod schemas and the TypeScript types inferred from them, used by the editor, Creature Manager, API, web app and database layer so everyone agrees on one shape.

## Contents

| File | What |
|---|---|
| `src/constants.ts` | Vocabularies (time of day, weather, POI types, rarities, activity patterns, `MOVEMENT_STYLES`), limits, suggested tags, the `WORLD_SRID` (4326) |
| `src/geo.ts` | GeoJSON schemas (Position, Polygon, MultiPolygon, Point), closed-ring and distinct-vertex checks, helpers |
| `src/world.ts` | `WorldRegion`, `Habitat`, `PointOfInterest`, `EncounterTable`, `EncounterEntry`, `CreatureDefinition` (with registry number, rarity, activity pattern, `SpawnModifiers`, skills, `movementStyle` default `forager`), `ConditionRules`, `WorldDocument`, slug rules |
| `src/api.ts` | Request and response schemas: resolve query, `WorldContext`, published world, editor responses (incl. `CreatureListResponse`), validation issues (entity types include `wildkin`) |
| `src/game.ts` | Player game contract: `GAME_RULES` (all anti-cheat, spawn and wandering limits: `spawnWanderStepMs` 10 s, `spawnWanderMaxSteps` 6), `ITEMS`, login, position reports, game state, Registry views, inventory, party |
| `src/wildkin.ts` | Creature Manager contract: `WildkinEntryInputSchema` (the editable Bible entry; defaults make a near-empty draft valid), `WildkinEntry`/`WildkinSummary`, statuses, `ART_KINDS` + `ART_SIZES` (icon 64, sprite 128), `WildkinStats`, `PUBLISH_REQUIRED_FIELDS`, assistant (`AssistRequest`/`AssistResponse`, `WildkinSuggestionSchema`), art (`ArtBalance`, `GenerateArtRequest`/`Response`), `ManagerConfig`, `wildkinArtPath(id, kind, version?)` |
| `src/schemas.test.ts` | Unit tests |

Everything is exported from `src/index.ts`. The package is consumed as TypeScript source (no build step).

## Conventions

- Coordinates are `[longitude, latitude]` in WGS84 (GeoJSON order).
- Slugs are lowercase letters, numbers and single hyphens, up to 64 characters.
- Empty condition lists mean "any".
- Encounter weights are integers from 1 to 1000.
- `WorldDocument` is the complete authorable world. Draft and published stages share this exact shape.

## Example

```ts
import { WorldContextSchema, ResolveQuerySchema } from "@wildbound/shared";

const query = ResolveQuerySchema.parse({ lat: "14.65", lng: "121.04" }); // coerces and validates
const context = WorldContextSchema.parse(await (await fetch(url)).json());
```
