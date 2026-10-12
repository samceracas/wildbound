import { describe, expect, it } from "vitest";
import { square } from "./__fixtures__/world.ts";
import { areaSquareMeters, bboxOf, fractionOutside, isSimpleArea, overlapSquareMeters, pointInArea } from "./geometry.ts";

describe("geometry helpers", () => {
  const outer = square(121, 14.65, 0.005);
  it("measures containment", () => {
    expect(fractionOutside(square(121, 14.65, 0.001), outer)).toBe(0);
    expect(fractionOutside(square(122, 14.65, 0.001), outer)).toBe(1);
    expect(fractionOutside(square(121.005, 14.65, 0.001), outer)).toBeCloseTo(0.5, 2);
  });
  it("detects self-intersection", () => {
    expect(isSimpleArea(outer)).toBe(true);
    expect(
      isSimpleArea({ type: "Polygon", coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] }),
    ).toBe(false);
  });
  it("computes area, overlap, bbox and point-in-area", () => {
    expect(areaSquareMeters(outer)).toBeGreaterThan(1_100_000);
    expect(overlapSquareMeters(square(121, 14.65, 0.001), square(121.003, 14.65, 0.001))).toBe(0);
    expect(overlapSquareMeters(square(121, 14.65, 0.001), square(121.001, 14.65, 0.001))).toBeGreaterThan(0);
    bboxOf([outer])!.forEach((v, i) => expect(v).toBeCloseTo([120.995, 14.645, 121.005, 14.655][i]!, 9));
    expect(bboxOf([])).toBeNull();
    expect(pointInArea({ type: "Point", coordinates: [121, 14.65] }, outer)).toBe(true);
    expect(pointInArea({ type: "Point", coordinates: [121.01, 14.65] }, outer)).toBe(false);
  });
});
