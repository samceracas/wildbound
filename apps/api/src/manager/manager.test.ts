import { describe, expect, it } from "vitest";
import { WildkinEntryInputSchema } from "@wildbound/shared";
import { artPrompt, canAfford, faceDetails, pickPose, poseOf, SPRITE_POSES } from "./art.ts";
import { sanitizeSuggestion } from "./assistant.ts";
import { fileURLToPath } from "node:url";
import { buildLoreContext, loreDocuments } from "./lore.ts";

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

describe("loreDocuments", () => {
  const docsDir = fileURLToPath(new URL("../../../../docs", import.meta.url));

  it("sends the condensed brief by default, small enough for free-tier limits", async () => {
    const docs = await loreDocuments(docsDir, "brief");
    expect(docs).toHaveLength(1);
    expect(docs[0]!.text).toMatch(/Mabunyi Forest Reserve/);
    expect(docs[0]!.text.length).toBeLessThan(10_000);
  });

  it("can send the full canon documents in authority order", async () => {
    const docs = await loreDocuments(docsDir, "full");
    expect(docs.map((d) => d.name)[0]).toMatch(/Wildkin_Bible/);
    expect(docs.length).toBe(3);
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

  it("asks for the face only on icons, without body details", () => {
    const icon = artPrompt(entry, "icon");
    expect(icon).toMatch(/^Headshot of Lampyra, a Glowing Moth Wildkin: extreme close-up of the face only/);
    expect(icon).toMatch(/no body/);
    expect(icon).toMatch(/glowing eye-spots/);
    expect(icon).not.toMatch(/wings|Full body|Pose:/);
  });

  it("asks for the whole body in a pose picked for the movement style", () => {
    const sprite = artPrompt(entry, "sprite", "on a leaf", { random: () => 0 });
    expect(sprite).toMatch(/^Full body of Lampyra/);
    expect(sprite).toMatch(new RegExp(`Pose: ${SPRITE_POSES.forager[0]}\\.`));
    expect(sprite).toMatch(/dusty violet wings/);
    expect(sprite).toMatch(/on a leaf/);
    expect(sprite).toMatch(/no background scenery/);
    expect(sprite).not.toMatch(/Headshot/);
    expect(poseOf(sprite)).toBe(SPRITE_POSES.forager[0]);
    // Regenerating never repeats the previous pose.
    expect(poseOf(artPrompt(entry, "sprite", undefined, { random: () => 0, previousPrompt: sprite }))).toBe(SPRITE_POSES.forager[1]);
  });
});

describe("faceDetails", () => {
  it("keeps head details and drops body parts", () => {
    expect(
      faceDetails("A small bird, smaller than a crow, with a compact rounded body, short hooked beak, dark-edged wings, a warm rust-colored breast patch, and long expressive tail feathers."),
    ).toBe("A small bird, short hooked beak, a warm rust-colored breast patch");
  });
});

describe("pickPose", () => {
  it("varies with the random roll and fits the movement style", () => {
    const poses = new Set(Array.from({ length: 9 }, (_, i) => pickPose("darter", () => i / 9)));
    expect(poses.size).toBe(9);
    expect(pickPose("darter", () => 0)).toBe(SPRITE_POSES.darter[0]);
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
