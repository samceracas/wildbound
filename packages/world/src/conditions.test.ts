import { describe, expect, it } from "vitest";
import { conditionsMatch, describeConditions, timeOfDayAt, timeOfDayForHour } from "./conditions.ts";

describe("conditionsMatch", () => {
  const env = { timeOfDay: "dawn", weather: "rain" } as const;
  it("treats empty lists as any", () => {
    expect(conditionsMatch({ timeOfDay: [], weather: [] }, env)).toBe(true);
  });
  it("requires every non-empty list to include the current value", () => {
    expect(conditionsMatch({ timeOfDay: ["dawn", "day"], weather: [] }, env)).toBe(true);
    expect(conditionsMatch({ timeOfDay: ["night"], weather: [] }, env)).toBe(false);
    expect(conditionsMatch({ timeOfDay: ["dawn"], weather: ["clear"] }, env)).toBe(false);
    expect(conditionsMatch({ timeOfDay: ["dawn"], weather: ["rain", "storm"] }, env)).toBe(true);
  });
});

describe("time of day", () => {
  it.each([
    [0, "night"],
    [4, "night"],
    [5, "dawn"],
    [6, "dawn"],
    [7, "day"],
    [16, "day"],
    [17, "dusk"],
    [18, "dusk"],
    [19, "night"],
    [23, "night"],
  ] as const)("hour %i is %s", (hour, expected) => {
    expect(timeOfDayForHour(hour)).toBe(expected);
  });

  it("rejects invalid hours", () => {
    expect(() => timeOfDayForHour(24)).toThrow(RangeError);
    expect(() => timeOfDayForHour(1.5)).toThrow(RangeError);
  });

  it("uses the configured time zone", () => {
    // 22:30 UTC = 06:30 next day in Manila (UTC+8) → dawn; 22:30 in UTC itself → night.
    const instant = new Date("2026-10-03T22:30:00Z");
    expect(timeOfDayAt(instant, "Asia/Manila")).toBe("dawn");
    expect(timeOfDayAt(instant, "UTC")).toBe("night");
  });

  it("describes rules", () => {
    expect(describeConditions({ timeOfDay: [], weather: [] })).toBe("always");
    expect(describeConditions({ timeOfDay: ["dawn", "day"], weather: ["rain"] })).toBe("dawn/day · rain");
  });
});
