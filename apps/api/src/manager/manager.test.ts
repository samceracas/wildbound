import { describe, expect, it } from "vitest";
import { WildkinEntryInputSchema } from "@wildbound/shared";
import { artPrompt, canAfford } from "./art.ts";
import { sanitizeSuggestion } from "./assistant.ts";
import { buildLoreContext } from "./lore.ts";

describe("buildLoreContext", () => {
  const docs = [
    { name: "Bible", text: "B".repeat(500) },
    { name: "Survey", text: "S".repeat(5000) },
    { name: "Ecology", text: "E".repeat(5000) },
  ];

  it("keeps the most authoritative document whole and trims the rest to the budget", () => {
    const ctx = buildLoreContext(docs, 2000);
    expect(ctx).toContain("B".repeat(500));
    expect(ctx).toContain("=== Ecology ===");
    expect(ctx.length).toBeLessThanOrEqual(2100);
    expect(ctx).toContain("[…truncated]");
  });

  it("returns everything when it fits", () => {
    expect(buildLoreContext(docs, 100_000)).not.toContain("truncated");
  });
});

describe("artPrompt", () => {
  const entry = WildkinEntryInputSchema.parse({
    id: "lampyra",
    registryNumber: 6,
    name: "Lampyra",
    classification: "Glowing Moth Wildkin",
    physicalDescription: "A palm-sized moth with dusty violet wings.",
    visualHook: "two pale glowing eye-spots",
  });

  it("builds the prompt from the physical description and visual hook", () => {
    const icon = artPrompt(entry, "icon");
    expect(icon).toMatch(/Lampyra, a Glowing Moth Wildkin/);
    expect(icon).toMatch(/dusty violet wings/);
    expect(icon).toMatch(/glowing eye-spots/);
    expect(icon).toMatch(/portrait/);
    expect(artPrompt(entry, "sprite", "on a leaf")).toMatch(/Full body.*on a leaf/);
  });
});

describe("canAfford", () => {
  it("uses subscription generations first, then credits", () => {
    expect(canAfford({ generations: 2, usd: 0 }, 2)).toBe(true);
    expect(canAfford({ generations: 1, usd: 0 }, 2)).toBe(false);
    expect(canAfford({ generations: null, usd: 1 }, 2)).toBe(true);
  });
});

describe("sanitizeSuggestion", () => {
  it("keeps valid fields, drops invalid ones and never adds defaults", () => {
    const { suggestion, dropped } = sanitizeSuggestion({ entry: { name: "Lampyra", rarity: "legendary" }, notes: "x" });
    expect(suggestion).toEqual({ name: "Lampyra" });
    expect(dropped).toEqual(["rarity"]);
  });
});
