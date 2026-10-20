import { WildkinEntryInputSchema, type WildkinEntry } from "@wildbound/shared";
import { describe, expect, it } from "vitest";
import {
  addTag,
  assistContext,
  emptyEntry,
  entryToFormValues,
  fieldLabel,
  formatRegistryNumber,
  mergeSuggestion,
  modifierInputValue,
  parseModifierInput,
  removeTag,
  setSpawnModifier,
  slugify,
  statusOf,
  suggestionUpdates,
} from "./wildkin-form.ts";

describe("slugify", () => {
  it("makes schema-valid slugs", () => {
    expect(slugify("Mossback Wren")).toBe("mossback-wren");
    expect(slugify("  Él  Niño!! ")).toBe("el-nino");
    expect(slugify("a--b__c")).toBe("a-b-c");
    expect(slugify("!!!")).toBe("");
  });
  it("caps at 64 chars without a trailing hyphen", () => {
    const s = slugify(`${"a".repeat(63)} b`);
    expect(s.length).toBeLessThanOrEqual(64);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("formatRegistryNumber", () => {
  it("pads to three digits", () => {
    expect(formatRegistryNumber(1)).toBe("No. 001");
    expect(formatRegistryNumber(42)).toBe("No. 042");
    expect(formatRegistryNumber(1234)).toBe("No. 1234");
  });
});

describe("emptyEntry", () => {
  it("has every default and blank id/name", () => {
    const e = emptyEntry(7);
    expect(e.id).toBe("");
    expect(e.name).toBe("");
    expect(e.registryNumber).toBe(7);
    expect(e.rarity).toBe("TBD");
    expect(e.movementStyle).toBe("forager");
    expect(e.spawnModifiers).toEqual({ weather: {}, timeOfDay: {} });
    expect(e.skills).toEqual([]);
  });
  it("becomes valid once id and name are set", () => {
    expect(WildkinEntryInputSchema.safeParse({ ...emptyEntry(3), id: "x", name: "X" }).success).toBe(true);
  });
});

describe("entryToFormValues", () => {
  it("keeps only editable fields", () => {
    const entry = {
      ...emptyEntry(1),
      id: "mossback-wren",
      name: "Mossback Wren",
      status: "published",
      hasUnpublishedChanges: false,
      createdAt: "",
      updatedAt: "",
      publishedAt: null,
      deletedAt: null,
      art: { icon: true, sprite: true, version: "1" },
    } satisfies WildkinEntry;
    const values = entryToFormValues(entry);
    expect(values).not.toHaveProperty("status");
    expect(values).not.toHaveProperty("art");
    expect(values.name).toBe("Mossback Wren");
    expect(values.spawnModifiers).not.toBe(entry.spawnModifiers); // cloned
  });
});

describe("assistContext", () => {
  it("drops empty, default-TBD and individually invalid fields", () => {
    const ctx = assistContext({ ...emptyEntry(1), id: "Bad Id", name: "Wren", habitatTags: ["creek"] });
    expect(ctx).toEqual({ registryNumber: 1, name: "Wren", habitatTags: ["creek"], movementStyle: "forager" });
    expect(WildkinEntryInputSchema.partial().safeParse(ctx).success).toBe(true);
  });
});

describe("suggestion merge", () => {
  const values = { ...emptyEntry(5), id: "keep-me", name: "Old" };
  const suggestion = { id: "new-id", name: "New", rarity: "rare" as const, habitatTags: ["moss"] };

  it("never takes id unless allowed, and never registryNumber", () => {
    const updates = suggestionUpdates({ ...suggestion, registryNumber: 99 } as never, { acceptId: false });
    expect(updates.map(([k]) => k)).toEqual(["name", "habitatTags", "rarity"]);
  });
  it("takes id on a new entry", () => {
    expect(mergeSuggestion(values, suggestion, { acceptId: true }).id).toBe("new-id");
  });
  it("keeps untouched fields", () => {
    const merged = mergeSuggestion(values, suggestion, { acceptId: false });
    expect(merged).toMatchObject({ id: "keep-me", name: "New", rarity: "rare", registryNumber: 5, diet: "" });
  });
});

describe("tags", () => {
  it("slugs habitat tags and dedupes", () => {
    expect(addTag(["moss"], "Forest Edge", "slug")).toEqual(["moss", "forest-edge"]);
    expect(addTag(["moss"], "moss", "slug")).toEqual(["moss"]);
    expect(addTag(["moss"], "  ", "slug")).toEqual(["moss"]);
  });
  it("keeps free tags as text, case-insensitively unique", () => {
    expect(addTag(["Shy"], "  nectar   feeder ", "free")).toEqual(["Shy", "nectar feeder"]);
    expect(addTag(["Shy"], "shy", "free")).toEqual(["Shy"]);
    expect(removeTag(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("spawn modifiers", () => {
  it("parses blank as unset and rejects out-of-range values", () => {
    expect(parseModifierInput("")).toBeUndefined();
    expect(parseModifierInput(" 1.5 ")).toBe(1.5);
    expect(parseModifierInput("0")).toBe(0);
    expect(parseModifierInput("11")).toBe("invalid");
    expect(parseModifierInput("-1")).toBe("invalid");
    expect(parseModifierInput("abc")).toBe("invalid");
  });
  it("sets and clears without mutating", () => {
    const mods = { weather: { rain: 2 }, timeOfDay: {} };
    const set = setSpawnModifier(mods, "timeOfDay", "night", 3);
    expect(set).toEqual({ weather: { rain: 2 }, timeOfDay: { night: 3 } });
    expect(mods.timeOfDay).toEqual({});
    const cleared = setSpawnModifier(set, "weather", "rain", undefined);
    expect(cleared.weather).toEqual({});
    expect(modifierInputValue(set, "timeOfDay", "night")).toBe("3");
    expect(modifierInputValue(set, "timeOfDay", "dawn")).toBe("");
  });
});

describe("statusOf / fieldLabel", () => {
  it("derives the status badge", () => {
    expect(statusOf({ status: "draft", hasUnpublishedChanges: true, deletedAt: null })).toBe("draft");
    expect(statusOf({ status: "published", hasUnpublishedChanges: false, deletedAt: null })).toBe("published");
    expect(statusOf({ status: "published", hasUnpublishedChanges: true, deletedAt: null })).toBe("edited");
    expect(statusOf({ status: "published", hasUnpublishedChanges: false, deletedAt: "x" })).toBe("deleted");
  });
  it("labels fields", () => {
    expect(fieldLabel("habitatSummary")).toBe("Habitat summary");
    expect(fieldLabel("id")).toBe("Canonical ID");
  });
});
