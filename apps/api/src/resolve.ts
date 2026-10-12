import { findSpatialContext, listCreatures, type Executor } from "@wildbound/db";
import type { ResolveQuery, WorldContext } from "@wildbound/shared";
import { assembleWorldContext, timeOfDayAt } from "@wildbound/world";

/**
 * Coordinate → WILDBOUND world context. PostGIS does the spatial work;
 * @wildbound/world applies the game rules. This is the entry point the
 * future Phaser field will call.
 */
export async function resolveWorldContext(
  db: Executor,
  query: ResolveQuery,
  options: { timeZone: string; now?: Date },
): Promise<WorldContext> {
  const environment = {
    timeOfDay: query.timeOfDay ?? timeOfDayAt(options.now ?? new Date(), options.timeZone),
    weather: query.weather ?? ("clear" as const),
  };

  const [spatial, creatures] = await Promise.all([
    findSpatialContext(db, { stage: query.stage, lat: query.lat, lng: query.lng, radiusMeters: query.radius }),
    listCreatures(db),
  ]);

  return assembleWorldContext({
    coordinate: { lat: query.lat, lng: query.lng },
    stage: query.stage,
    version: spatial.version,
    environment,
    region: spatial.region,
    habitat: spatial.habitat,
    nearbyPois: spatial.pois,
    encounterTables: spatial.tables,
    creatureNames: new Map(creatures.map((c) => [c.id, c.name])),
  });
}
