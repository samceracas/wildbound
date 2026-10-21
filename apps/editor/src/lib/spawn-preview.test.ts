import type { AvailableWildkin, CreatureDefinition } from "@wildbound/shared";
import { CreatureDefinitionSchema } from "@wildbound/shared";
import { applySpawnModifiers } from "@wildbound/world";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatSpawnModifiers, hasModifierIn, previewWithModifiers } from "./spawn-preview.ts";

// applySpawnModifiers is exercise #2. Mock it so these tests describe the editor's
// handling of each outcome, whether or not the exercise has been done.
vi.mock("@wildbound/world", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@wildbound/world")>()),
  applySpawnModifiers: vi.fn(),
}));
const mockedApply = vi.mocked(applySpawnModifiers);

const creature = (id: string, spawnModifiers: CreatureDefinition["spawnModifiers"]): CreatureDefinition =>
  CreatureDefinitionSchema.parse({ id, registryNumber: 1, name: id, description: "", habitatAffinity: [], spawnModifiers });

const creatures = [creature("kawi", { weather: { rain: 0.5 }, timeOfDay: { night: 0.1 } }), creature("mimu", { weather: {}, timeOfDay: {} })];
const available: AvailableWildkin[] = [
  { creatureId: "kawi", name: "Kawi", weight: 60, probability: 0.6, levelBands: [{ minLevel: 2, maxLevel: 6, weight: 60 }] },
  { creatureId: "mimu", name: "Mimu", weight: 40, probability: 0.4, levelBands: [{ minLevel: 2, maxLevel: 6, weight: 40 }] },
];

describe("formatSpawnModifiers", () => {
  it("lists weather then time multipliers and skips neutral ones", () => {
    expect(formatSpawnModifiers({ weather: { storm: 0, rain: 0.5, clear: 1 }, timeOfDay: { night: 2 } })).toBe("rain ×0.5 · storm ×0 · night ×2");
  });
  it("is empty without modifiers", () => {
    expect(formatSpawnModifiers({ weather: {}, timeOfDay: {} })).toBe("");
    expect(formatSpawnModifiers(undefined)).toBe("");
  });
});

describe("hasModifierIn", () => {
  it("only counts modifiers for the current weather and time", () => {
    const mods = creatures[0]!.spawnModifiers;
    expect(hasModifierIn(mods, { weather: "rain", timeOfDay: "day" })).toBe(true);
    expect(hasModifierIn(mods, { weather: "clear", timeOfDay: "night" })).toBe(true);
    expect(hasModifierIn(mods, { weather: "clear", timeOfDay: "day" })).toBe(false);
  });
});

describe("previewWithModifiers", () => {
  beforeEach(() => {
    mockedApply.mockReset();
  });

  it("uses the modified weights", () => {
    mockedApply.mockReturnValue([
      { creatureId: "kawi", weight: 30 },
      { creatureId: "mimu", weight: 40 },
    ]);
    const res = previewWithModifiers(available, creatures, { weather: "rain", timeOfDay: "day" });
    expect(res.status).toBe("applied");
    expect(res.wildkin.map((w) => w.probability)).toEqual([30 / 70, 40 / 70]);
    expect(res.wildkin[0]!.rawProbability).toBe(0.6);
    expect(mockedApply).toHaveBeenCalledWith(
      [
        { creatureId: "kawi", weight: 60 },
        { creatureId: "mimu", weight: 40 },
      ],
      expect.any(Map),
      { weather: "rain", timeOfDay: "day" },
    );
  });

  it("gives removed species 0%", () => {
    mockedApply.mockReturnValue([{ creatureId: "mimu", weight: 40 }]);
    const res = previewWithModifiers(available, creatures, { weather: "rain", timeOfDay: "night" });
    expect(res.wildkin.map((w) => w.probability)).toEqual([0, 1]);
  });

  it("flags unchanged weights when modifiers should apply (exercise not done)", () => {
    mockedApply.mockImplementation((c) => c.map((x) => ({ ...x })));
    expect(previewWithModifiers(available, creatures, { weather: "rain", timeOfDay: "day" }).status).toBe("unchanged");
    expect(previewWithModifiers(available, creatures, { weather: "clear", timeOfDay: "day" }).status).toBe("neutral");
  });

  it("falls back to raw weights when applySpawnModifiers throws", () => {
    mockedApply.mockImplementation(() => {
      throw new Error("not implemented");
    });
    const res = previewWithModifiers(available, creatures, { weather: "rain", timeOfDay: "day" });
    expect(res.status).toBe("error");
    expect(res.error).toBe("not implemented");
    expect(res.wildkin.map((w) => w.probability)).toEqual([0.6, 0.4]);
  });
});
