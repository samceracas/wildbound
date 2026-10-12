# @wildbound/shared

The data contract. Zod schemas and the TypeScript types inferred from them, used by the editor, API, web app and database layer so everyone agrees on one shape.

## Contents

| File | What |
|---|---|
| `src/constants.ts` | Vocabularies (time of day, weather, POI types), limits, suggested tags, the `WORLD_SRID` (4326) |
| `src/geo.ts` | GeoJSON schemas (Position, Polygon, MultiPolygon, Point), closed-ring and distinct-vertex checks, helpers |
| `src/world.ts` | `WorldRegion`, `Habitat`, `PointOfInterest`, `EncounterTable`, `EncounterEntry`, `CreatureDefinition`, `ConditionRules`, `WorldDocument`, slug rules |
| `src/api.ts` | Request and response schemas: resolve query, `WorldContext`, published world, editor responses, validation issues |
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
