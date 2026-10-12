import * as turf from "@turf/turf";
import type { AreaGeometry, Point, Polygon } from "@wildbound/shared";
import { polygonsOf } from "@wildbound/shared";

/** Below this many square meters, overlaps/outside slivers are treated as digitizing noise. */
export const AREA_TOLERANCE_M2 = 1;

/** True when no ring of the geometry crosses itself or another ring. */
export function isSimpleArea(geometry: AreaGeometry): boolean {
  return polygonsOf(geometry).every(
    (rings) => turf.kinks(turf.polygon(rings)).features.length === 0,
  );
}

export function areaSquareMeters(geometry: AreaGeometry): number {
  return turf.area(turf.feature(geometry));
}

/** Fraction (0..1) of `inner`'s area lying outside `outer`. */
export function fractionOutside(inner: Polygon, outer: AreaGeometry): number {
  const innerArea = turf.area(inner);
  if (innerArea <= 0) return 1;
  const diff = turf.difference(turf.featureCollection([turf.feature(inner), turf.feature(outer)]));
  if (!diff) return 0;
  const outsideArea = turf.area(diff);
  return outsideArea < AREA_TOLERANCE_M2 ? 0 : Math.min(1, outsideArea / innerArea);
}

/** Overlap area in m² between two polygons (0 when they only touch). */
export function overlapSquareMeters(a: Polygon, b: Polygon): number {
  const inter = turf.intersect(turf.featureCollection([turf.feature(a), turf.feature(b)]));
  return inter ? turf.area(inter) : 0;
}

export function pointInArea(point: Point, area: AreaGeometry): boolean {
  return turf.booleanPointInPolygon(point.coordinates, turf.feature(area));
}

/** Geographic centroid, used to frame the map and place new POIs. */
export function centroidOf(geometry: AreaGeometry): [number, number] {
  const c = turf.centroid(turf.feature(geometry)).geometry.coordinates;
  return [c[0]!, c[1]!];
}

/** [minLng, minLat, maxLng, maxLat] */
export function bboxOf(geometries: readonly (AreaGeometry | Point)[]): [number, number, number, number] | null {
  if (geometries.length === 0) return null;
  const b = turf.bbox(turf.featureCollection(geometries.map((g) => turf.feature(g))));
  return [b[0], b[1], b[2], b[3]];
}
