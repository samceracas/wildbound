import { z } from "zod";

/**
 * GeoJSON geometry schemas (RFC 7946). Positions are [longitude, latitude]
 * in WGS84. Altitude is intentionally not supported.
 */

export const Longitude = z.number().min(-180).max(180);
export const Latitude = z.number().min(-90).max(90);

export const PositionSchema = z.tuple([Longitude, Latitude]);
export type Position = z.infer<typeof PositionSchema>;

const samePosition = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

export const LinearRingSchema = z
  .array(PositionSchema)
  .min(4, "A polygon ring needs at least 3 distinct vertices (4 positions including the closing one)")
  .refine((ring) => samePosition(ring[0]!, ring[ring.length - 1]!), {
    message: "A polygon ring must be closed (first and last positions equal)",
  })
  .refine((ring) => new Set(ring.slice(0, -1).map((p) => `${p[0]},${p[1]}`)).size >= 3, {
    message: "A polygon ring needs at least 3 distinct vertices",
  });
export type LinearRing = z.infer<typeof LinearRingSchema>;

export const PolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(LinearRingSchema).min(1),
});
export type Polygon = z.infer<typeof PolygonSchema>;

export const MultiPolygonSchema = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(LinearRingSchema).min(1)).min(1),
});
export type MultiPolygon = z.infer<typeof MultiPolygonSchema>;

export const AreaGeometrySchema = z.discriminatedUnion("type", [PolygonSchema, MultiPolygonSchema]);
export type AreaGeometry = z.infer<typeof AreaGeometrySchema>;

export const PointSchema = z.object({
  type: z.literal("Point"),
  coordinates: PositionSchema,
});
export type Point = z.infer<typeof PointSchema>;

export const CoordinateSchema = z.object({ lat: Latitude, lng: Longitude });
export type Coordinate = z.infer<typeof CoordinateSchema>;

/** Returns the polygons of an area geometry as a uniform list. */
export function polygonsOf(geometry: AreaGeometry): Position[][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

/** Normalizes an area geometry to MultiPolygon (the storage form for regions). */
export function toMultiPolygon(geometry: AreaGeometry): MultiPolygon {
  return geometry.type === "MultiPolygon"
    ? geometry
    : { type: "MultiPolygon", coordinates: [geometry.coordinates] };
}
