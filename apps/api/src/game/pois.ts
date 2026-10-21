import { Prisma, type Executor } from "@wildbound/db";
import { FIELD_STATION_TYPES, GAME_RULES, type PoiType } from "@wildbound/shared";

export interface NearbyPoi {
  id: string;
  name: string;
  description: string;
  type: PoiType;
  lat: number;
  lng: number;
  distanceM: number;
}

export const isFieldStation = (type: string) => (FIELD_STATION_TYPES as readonly string[]).includes(type);

/** Published POIs within `radiusM` of a point (any region), nearest first. */
export async function poisNear(db: Executor, at: { lat: number; lng: number }, radiusM: number): Promise<NearbyPoi[]> {
  const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${at.lng}::float8, ${at.lat}::float8), 4326)`;
  const rows = await db.$queryRaw<{ id: string; name: string; description: string; type: string; lat: number; lng: number; d: number }[]>`
    SELECT id, name, description, type, ST_Y(geom) AS lat, ST_X(geom) AS lng, ST_Distance(geom::geography, ${point}::geography) AS d
    FROM points_of_interest
    WHERE stage = 'published' AND ST_DWithin(geom::geography, ${point}::geography, ${radiusM}::float8)
    ORDER BY d ASC, id ASC
    LIMIT 50`;
  return rows.map((r) => ({ ...r, type: r.type as PoiType, lat: Number(r.lat), lng: Number(r.lng), distanceM: Number(r.d) }));
}

/** One published POI by id, with its distance from a point. */
export async function poiById(db: Executor, id: string, at: { lat: number; lng: number }): Promise<NearbyPoi | null> {
  const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${at.lng}::float8, ${at.lat}::float8), 4326)`;
  const [row] = await db.$queryRaw<{ id: string; name: string; description: string; type: string; lat: number; lng: number; d: number }[]>`
    SELECT id, name, description, type, ST_Y(geom) AS lat, ST_X(geom) AS lng, ST_Distance(geom::geography, ${point}::geography) AS d
    FROM points_of_interest
    WHERE stage = 'published' AND id = ${id}::uuid`;
  return row ? { ...row, type: row.type as PoiType, lat: Number(row.lat), lng: Number(row.lng), distanceM: Number(row.d) } : null;
}

/** The nearest field station (vet + assessments) within interact range, if any. */
export async function stationInRange(db: Executor, at: { lat: number; lng: number }): Promise<NearbyPoi | null> {
  return (await poisNear(db, at, GAME_RULES.interactRadiusM)).find((p) => isFieldStation(p.type)) ?? null;
}
