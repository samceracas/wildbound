# @wildbound/shared

> Detailed documentation: [docs/02-world-model.md](../../docs/02-world-model.md).

The data contract. Zod schemas and the TypeScript types inferred from them, used by the editor, Creature Manager, API, web app and database layer so everyone agrees on one shape.

## Contents

| File | What |
|---|---|
| `src/constants.ts` | Vocabularies (time of day, weather, POI types, rarities, activity patterns, `MOVEMENT_STYLES`), limits, suggested tags (incl. `mature-woodland`, `deep-pool`), the `WORLD_SRID` (4326) |
| `src/geo.ts` | GeoJSON schemas (Position, Polygon, MultiPolygon, Point), closed-ring and distinct-vertex checks, helpers |
| `src/world.ts` | `WorldRegion`, `Habitat` (+ `licenseRequirement`), `PointOfInterest`, `EncounterTable` (+ `minLevel`/`maxLevel`, default 1 to 10), `EncounterEntry` (+ optional level override), `CreatureDefinition` (with registry number, rarity, activity pattern, `SpawnModifiers`, skills, `movementStyle` default `forager`, and since v0.3.0 `category`, `bodyTraits`, `baseStats`, `attacks`, `genePool`), `ConditionRules`, `WorldDocument` (refined: `invalid-level-range`; do not `.extend()` it), slug rules |
| `src/api.ts` | Request and response schemas: resolve query, `WorldContext` (entries with effective level ranges, `AvailableWildkin.levelBands`, habitat license requirement), published world, editor responses (incl. `CreatureListResponse`), validation issues (entity types include `wildkin`), `ApiError` (with optional `details`) |
| `src/game.ts` | Player game contract: `GAME_RULES` (all anti-cheat, spawn and wandering limits: `spawnWanderStepMs` 10 s, `spawnWanderMaxSteps` 6; `poiRadiusM` 300), `ITEMS` (Field Capsule, the four category capsules, Trail Ration, Field Notebook), `ITEM_STACK_MAX` (30), `STARTER_INVENTORY`, login, position reports, game state (spawn level, hints, `inBattle`, `battleLocked`; POIs with services; `activeBattleId`, `needsStarter`, `hasUsableWildkin`, `habitatLocked`), `FIELD_STATION_TYPES`, Registry views with field notes and stat shape, observe response (researcher and lead EXP), inventory, party and Wildkin detail views, `STARTER_SPECIES` + `STARTER_LEVEL` (5), item use, vet and pickup responses |
| `src/battle.ts` | v0.3.0 battle and genetics contract: `STAT_KEYS`, `STAT_BUDGET` (300), `BaseStatsSchema` (sum refine), stat descriptors, grades and vigor words; genome, vigor and gene pool schemas (`DEFAULT_GENE_POOL`, `TYPICAL_GENOME`, `TRAIT_MODIFIERS`, Build and Temperament hints); levels and `EXP_RULES`; `APPROACHES`, `BODY_TRAITS`, `MATCHUPS` (weakness, resistance, reason, field-note lines), `AttackSchema` (power 30 to 60, reserved `priority`), `powerWord`; `STATUSES` + `STATUS_RULES`; `BATTLE_RULES`; the server-only `BattleStateSchema`, `BattleActionRequestSchema` (`{ turn, action }`), `BattleEventSchema`, `BattleViewSchema`, `BATTLE_END_LINES` |
| `src/research.ts` | v0.3.0 Field Registry licenses: `CATEGORIES`, `CATEGORY_NAMES`, `CATEGORY_CAPSULES`, `RESEARCH_RULES` (researcher EXP amounts, rank thresholds 600 / 2,000 / 5,000 / 12,000, rank-up grants), `obedienceCap`, `SCANNER_DEPTH` + `scannerShows`, `LicenseRequirementSchema`, `ASSESSMENTS` (data) and requirement labels, license and assessment views |
| `src/wildkin.ts` | Creature Manager contract: `WildkinEntryInputSchema` (the editable Bible entry; defaults make a near-empty draft valid; v0.3.0 battle fields `category`, `bodyTraits`, `baseStats`, `attacks`, `genePool`), `WildkinEntry`/`WildkinSummary`, statuses, `ART_KINDS` + `ART_SIZES` (icon 64, sprite 128), `WildkinStats` (+ `battleReady`), `GAME_FIELDS`, `PUBLISH_REQUIRED_FIELDS`, `PUBLISH_BATTLE_CHECKS` + `isBattleReady`, assistant (`AssistRequest`/`AssistResponse`, `WildkinSuggestionSchema`), art (`ArtBalance`, `GenerateArtRequest`/`Response`), `ManagerConfig`, `wildkinArtPath(id, kind, version?)` |
| `src/schemas.test.ts`, `src/battle.test.ts` | Unit tests |

Everything is exported from `src/index.ts`. The package is consumed as TypeScript source (no build step).

## Conventions

- Coordinates are `[longitude, latitude]` in WGS84 (GeoJSON order).
- Slugs are lowercase letters, numbers and single hyphens, up to 64 characters.
- Empty condition lists mean "any".
- Encounter weights are integers from 1 to 1000.
- `WorldDocument` is the complete authorable world. Draft and published stages share this exact shape.
- Every tunable game number lives in one exported constant object (`GAME_RULES`, `BATTLE_RULES`, `EXP_RULES`, `RESEARCH_RULES`), so tuning never touches logic.

## Example

```ts
import { WorldContextSchema, ResolveQuerySchema } from "@wildbound/shared";

const query = ResolveQuerySchema.parse({ lat: "14.65", lng: "121.04" }); // coerces and validates
const context = WorldContextSchema.parse(await (await fetch(url)).json());
```
