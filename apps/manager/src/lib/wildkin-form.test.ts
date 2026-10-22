import { DEFAULT_GENE_POOL, WildkinEntryInputSchema, type WildkinEntry } from "@wildbound/shared";
import { describe, expect, it } from "vitest";
import {
  addHabitatOverride,
  addTag,
  alleleShares,
  assistContext,
  baseStatsTotal,
  buildShares,
  clampMarkingFrequency,
  DEFAULT_BASE_STATS,
  defaultMarking,
  duplicateOverrideTags,
  emptyAttack,
  emptyEntry,
  entryToFormValues,
  fieldLabel,
  formatPercent,
  formatRegistryNumber,
  markingShare,
  mergeSuggestion,
  modifierInputValue,
  parseModifierInput,
  removeHabitatOverride,
  removeTag,
  setSpawnModifier,
  slugify,
  statusOf,
  suggestionUpdates,
  temperamentShares,
  toggleBodyTrait,
  updateHabitatOverride,
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
  it("fills battle fields an older entry lacks with the schema defaults", () => {
    const { genePool: _g, baseStats: _b, attacks: _a, category: _c, bodyTraits: _t, ...old } = {
      ...emptyEntry(2),
      id: "old",
      name: "Old",
      status: "published" as const,
      hasUnpublishedChanges: false,
      createdAt: "",
      updatedAt: "",
      publishedAt: null,
      deletedAt: null,
      art: { icon: false, sprite: false, version: null },
    };
    const values = entryToFormValues(old as unknown as WildkinEntry);
    expect(values.genePool).toEqual(DEFAULT_GENE_POOL);
    expect(values.genePool).not.toBe(DEFAULT_GENE_POOL); // never shares the constant
    expect(values).toMatchObject({ baseStats: null, attacks: [], category: "TBD", bodyTraits: [] });
  });
  it("keeps saved battle fields and completes attacks without the reserved priority flag", () => {
    const entry = {
      ...emptyEntry(1),
      id: "kawi",
      name: "Kawi",
      category: "aerial",
      bodyTraits: ["feathered"],
      baseStats: { hp: 60, atk: 70, def: 60, spd: 110 },
      attacks: [{ name: "Peck", approach: "pierce", power: 40, description: "", canon: "proposed" }],
      genePool: { ...DEFAULT_GENE_POOL, marking: { name: "Banded", description: "", frequency: 0.05 } },
      status: "published",
      hasUnpublishedChanges: false,
      createdAt: "",
      updatedAt: "",
      publishedAt: null,
      deletedAt: null,
      art: { icon: false, sprite: false, version: null },
    } as unknown as WildkinEntry;
    const values = entryToFormValues(entry);
    expect(values.baseStats).toEqual({ hp: 60, atk: 70, def: 60, spd: 110 });
    expect(values.attacks[0]).toEqual({ name: "Peck", approach: "pierce", power: 40, description: "", canon: "proposed", priority: false });
    expect(values.genePool.marking?.name).toBe("Banded");
    expect(WildkinEntryInputSchema.safeParse(values).success).toBe(true);
  });
});

describe("base stats", () => {
  it("defaults to an even split of the budget", () => {
    expect(DEFAULT_BASE_STATS).toEqual({ hp: 75, atk: 75, def: 75, spd: 75 });
    expect(baseStatsTotal(DEFAULT_BASE_STATS)).toBe(300);
  });
  it("is null when not set and counts blank (NaN) inputs as 0", () => {
    expect(baseStatsTotal(null)).toBeNull();
    expect(baseStatsTotal({ hp: 60, atk: Number.NaN, def: 60, spd: 60 })).toBe(180);
  });
  it("lets a draft keep null, and the schema reports a total that is not 300 on the baseStats path", () => {
    const base = { ...emptyEntry(1), id: "x", name: "X" };
    expect(WildkinEntryInputSchema.safeParse({ ...base, baseStats: null }).success).toBe(true);
    const bad = WildkinEntryInputSchema.safeParse({ ...base, baseStats: { hp: 60, atk: 60, def: 60, spd: 60 } });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues).toEqual([expect.objectContaining({ path: ["baseStats"], message: "Base stats must add up to exactly 300" })]);
    expect(WildkinEntryInputSchema.safeParse({ ...base, baseStats: DEFAULT_BASE_STATS }).success).toBe(true);
  });
});

describe("body traits", () => {
  it("toggles, keeps the vocabulary order and stops at two", () => {
    expect(toggleBodyTrait([], "slick")).toEqual(["slick"]);
    expect(toggleBodyTrait(["slick"], "plated")).toEqual(["plated", "slick"]);
    expect(toggleBodyTrait(["plated", "slick"], "leafy")).toEqual(["plated", "slick"]);
    expect(toggleBodyTrait(["plated", "slick"], "plated")).toEqual(["slick"]);
  });
});

describe("attacks", () => {
  it("starts a valid proposed placeholder once named", () => {
    const a = emptyAttack();
    expect(a).toMatchObject({ approach: "strike", power: 40, canon: "proposed", priority: false });
    const entry = { ...emptyEntry(1), id: "x", name: "X" };
    expect(WildkinEntryInputSchema.safeParse({ ...entry, attacks: [a] }).success).toBe(false); // empty name
    expect(WildkinEntryInputSchema.safeParse({ ...entry, attacks: [{ ...a, name: "Lunge" }] }).success).toBe(true);
    expect(emptyAttack()).not.toBe(a);
  });
});

describe("gene pool readouts", () => {
  it("computes Hardy-Weinberg shares", () => {
    expect(alleleShares(0.5)).toEqual({ firstFirst: 0.25, mixed: 0.5, secondSecond: 0.25 });
    expect(buildShares(0.75)).toEqual({ small: 0.0625, typical: 0.375, large: 0.5625 });
    expect(temperamentShares(0)).toEqual({ bold: 1, steady: 0, wary: 0 });
    expect(temperamentShares(1)).toEqual({ bold: 0, steady: 0, wary: 1 });
    const s = buildShares(0.3);
    expect(s.small + s.typical + s.large).toBeCloseTo(1);
  });
  it("formats percentages", () => {
    expect(formatPercent(0.25)).toBe("25%");
    expect(formatPercent(0.5625)).toBe("56.3%");
    expect(formatPercent(markingShare(0.05))).toBe("0.25%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1)).toBe("100%");
  });
  it("clamps the marking frequency to 0..0.2", () => {
    expect(clampMarkingFrequency(0.5)).toBe(0.2);
    expect(clampMarkingFrequency(-1)).toBe(0);
    expect(defaultMarking()).toEqual({ name: "", description: "", frequency: 0.05 });
  });
});

describe("habitat overrides", () => {
  const odds = { pAllele: 0.4, byHabitatTag: [] as { tag: string; pAllele: number }[] };
  it("adds the first unused species tag at the default chance, else a blank tag", () => {
    const one = addHabitatOverride(odds, ["creek", "moss"]);
    expect(one.byHabitatTag).toEqual([{ tag: "creek", pAllele: 0.4 }]);
    const two = addHabitatOverride(one, ["creek", "moss"]);
    expect(two.byHabitatTag.map((o) => o.tag)).toEqual(["creek", "moss"]);
    expect(addHabitatOverride(two, ["creek", "moss"]).byHabitatTag[2]).toEqual({ tag: "", pAllele: 0.4 });
    expect(odds.byHabitatTag).toEqual([]); // not mutated
  });
  it("updates and removes rows by index and flags duplicates", () => {
    const two = { pAllele: 0.5, byHabitatTag: [{ tag: "creek", pAllele: 0.5 }, { tag: "moss", pAllele: 0.5 }] };
    const updated = updateHabitatOverride(two, 1, { tag: "creek", pAllele: 0.9 });
    expect(updated.byHabitatTag[1]).toEqual({ tag: "creek", pAllele: 0.9 });
    expect(duplicateOverrideTags(updated)).toEqual(["creek"]);
    expect(duplicateOverrideTags(two)).toEqual([]);
    expect(removeHabitatOverride(updated, 0).byHabitatTag).toEqual([{ tag: "creek", pAllele: 0.9 }]);
  });
  it("produces a gene pool the schema accepts", () => {
    const build = addHabitatOverride(DEFAULT_GENE_POOL.build, ["deep-pool"]);
    const entry = { ...emptyEntry(1), id: "x", name: "X", genePool: { ...DEFAULT_GENE_POOL, build } };
    expect(WildkinEntryInputSchema.safeParse(entry).success).toBe(true);
    const blank = { ...entry, genePool: { ...DEFAULT_GENE_POOL, build: addHabitatOverride(DEFAULT_GENE_POOL.build, []) } };
    expect(WildkinEntryInputSchema.safeParse(blank).success).toBe(false);
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
