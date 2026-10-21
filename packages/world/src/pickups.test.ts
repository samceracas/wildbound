import { describe, expect, it } from "vitest";
import { seededRandom } from "./encounters.ts";
import { rollPickup } from "./pickups.ts";
import { sequence } from "./battle/fixtures.ts";

describe("rollPickup", () => {
  it("always finds 2 Field Capsules, sometimes more", () => {
    expect(rollPickup("landmark", () => 0.99)).toEqual({ "field-capsule": 2 });
    expect(rollPickup("landmark", () => 0)).toEqual({ "field-capsule": 3, "trail-ration": 1 });
  });

  it("finds the category capsule of the POI type", () => {
    expect(rollPickup("water", sequence([0.9, 0.9, 0.1]))).toEqual({ "field-capsule": 2, "current-capsule": 1 });
    expect(rollPickup("clearing", sequence([0.9, 0.9, 0.1]))).toEqual({ "field-capsule": 2, "bloom-capsule": 1 });
    expect(rollPickup("hollow", sequence([0.9, 0.9, 0.1]))).toEqual({ "field-capsule": 2, "burrow-capsule": 1 });
    expect(rollPickup("trail", sequence([0.9, 0.9, 0.1]))).toEqual({ "field-capsule": 2, "canopy-capsule": 1 });
    expect(rollPickup("gate", sequence([0.9, 0.9, 0.1]))).toEqual({ "field-capsule": 2 });
  });

  it("hits the documented odds over many rolls", () => {
    const random = seededRandom(17);
    let rations = 0;
    let capsules = 0;
    for (let i = 0; i < 20000; i++) {
      const loot = rollPickup("water", random);
      if (loot["trail-ration"]) rations++;
      if (loot["current-capsule"]) capsules++;
    }
    expect(rations / 20000).toBeCloseTo(0.3, 1);
    expect(capsules / 20000).toBeCloseTo(0.15, 1);
  });
});
