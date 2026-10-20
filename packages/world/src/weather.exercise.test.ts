import { describe, expect, it } from "vitest";
import { weatherFromWmoCode } from "./weather.ts";

/**
 * Exercise: make these pass by implementing weatherFromWmoCode (weather.ts).
 * Run with: pnpm test:exercises
 */
describe("weatherFromWmoCode", () => {
  it.each([
    [0, "clear"],
    [1, "clear"],
    [2, "cloudy"],
    [3, "cloudy"],
    [45, "fog"],
    [48, "fog"],
    [51, "rain"],
    [61, "rain"],
    [65, "rain"],
    [73, "rain"],
    [80, "rain"],
    [82, "rain"],
    [95, "storm"],
    [99, "storm"],
    [42, "cloudy"],
    [-1, "cloudy"],
  ] as const)("code %i -> %s", (code, expected) => {
    expect(weatherFromWmoCode(code)).toBe(expected);
  });
});
