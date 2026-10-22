import {
  BODY_TRAITS,
  DEFAULT_GENE_POOL,
  MARKING_FREQUENCY_MAX,
  SLUG_PATTERN,
  STAT_BUDGET,
  STAT_KEYS,
  WildkinEntryInputSchema,
  type AlleleOdds,
  type Attack,
  type BaseStats,
  type BodyTrait,
  type MarkingVariant,
  type SpawnModifiers,
  type TimeOfDay,
  type Weather,
  type WildkinEntry,
  type WildkinEntryData,
  type WildkinSuggestion,
  type WildkinSummary,
} from "@wildbound/shared";

/**
 * Pure helpers behind the Wildkin form (no React, unit-tested in wildkin-form.test.ts).
 * The form's values are `WildkinEntryData`: the input schema with every default applied.
 */

export type FormKey = keyof WildkinEntryData;

/** Every field the author edits, in schema order. */
export const FORM_KEYS = Object.keys(WildkinEntryInputSchema.shape) as FormKey[];

/** "Mossback Wren!" → "mossback-wren". Diacritics folded, max 64 chars, never a trailing hyphen. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}

export const isSlug = (value: string) => SLUG_PATTERN.test(value);

/** 7 → "No. 007". */
export const formatRegistryNumber = (n: number) => `No. ${String(n).padStart(3, "0")}`;

/** A blank entry with every schema default (id and name empty until the author fills them). */
export function emptyEntry(registryNumber: number): WildkinEntryData {
  const base = WildkinEntryInputSchema.parse({ id: "x", registryNumber: Math.max(1, registryNumber), name: "x" });
  return { ...base, id: "", name: "" };
}

/**
 * The editable part of a saved entry (drops status, timestamps, art). A field
 * the entry lacks (an older API or a row saved before v0.3.0) gets the schema
 * default, so `reset()` never leaves a battle field undefined.
 */
export function entryToFormValues(entry: WildkinEntry): WildkinEntryData {
  const defaults = emptyEntry(entry.registryNumber) as Record<FormKey, unknown>;
  const out = {} as Record<FormKey, unknown>;
  for (const key of FORM_KEYS) {
    const value = (entry as Partial<WildkinEntryData>)[key];
    out[key] = structuredClone(value === undefined ? defaults[key] : value);
  }
  const values = out as WildkinEntryData;
  // Attacks saved without the reserved `priority` flag still validate; keep the form shape complete.
  values.attacks = values.attacks.map((a) => ({ ...emptyAttack(), ...a }));
  return values;
}

const isEmpty = (v: unknown) =>
  v === undefined ||
  v === null ||
  (typeof v === "string" && v.trim() === "") ||
  (Array.isArray(v) && v.length === 0);

/**
 * Current form values to send as `AssistRequest.current`: only fields that are
 * filled in and valid on their own (the API validates `current`, so a half-typed
 * id or an empty name must not make the whole request fail).
 */
export function assistContext(values: Partial<WildkinEntryData>): Partial<WildkinEntryData> {
  const shape = WildkinEntryInputSchema.shape;
  const out: Record<string, unknown> = {};
  for (const key of FORM_KEYS) {
    const value = values[key];
    if (isEmpty(value)) continue;
    if (key === "spawnModifiers") {
      const m = value as SpawnModifiers;
      if (Object.keys(m.weather ?? {}).length === 0 && Object.keys(m.timeOfDay ?? {}).length === 0) continue;
    }
    if (key === "activityPattern" || key === "rarity" || key === "category") if (value === "TBD") continue;
    // An untouched gene pool is the default; sending it would only nudge the assistant to copy it.
    if (key === "genePool" && JSON.stringify(value) === JSON.stringify(DEFAULT_GENE_POOL)) continue;
    const parsed = shape[key].safeParse(value);
    if (parsed.success) out[key] = parsed.data;
  }
  return out as Partial<WildkinEntryData>;
}

/**
 * Which suggested fields to write into the form, in schema order.
 * `id` is only taken when `acceptId` (a new entry whose id the author has not
 * typed); `registryNumber` is never suggested. Undefined values are skipped.
 */
export function suggestionUpdates(
  suggestion: WildkinSuggestion,
  { acceptId }: { acceptId: boolean },
): Array<[FormKey, unknown]> {
  const updates: Array<[FormKey, unknown]> = [];
  for (const key of FORM_KEYS) {
    if (key === "registryNumber") continue;
    if (key === "id" && !acceptId) continue;
    const value = (suggestion as Record<string, unknown>)[key];
    if (value === undefined) continue;
    updates.push([key, structuredClone(value)]);
  }
  return updates;
}

/** Applies suggestionUpdates to a values object (what the form does with setValue). */
export function mergeSuggestion(
  values: WildkinEntryData,
  suggestion: WildkinSuggestion,
  opts: { acceptId: boolean },
): WildkinEntryData {
  const next = { ...values } as Record<FormKey, unknown>;
  for (const [key, value] of suggestionUpdates(suggestion, opts)) next[key] = value;
  return next as WildkinEntryData;
}

// ---------------------------------------------------------------- tags

/** Adds a tag (normalised, deduplicated). Habitat tags are slugs; free tags are trimmed text. */
export function addTag(list: readonly string[], raw: string, mode: "slug" | "free"): string[] {
  const tag = mode === "slug" ? slugify(raw) : raw.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!tag) return [...list];
  if (list.some((t) => t.toLowerCase() === tag.toLowerCase())) return [...list];
  return [...list, tag];
}

export const removeTag = (list: readonly string[], tag: string) => list.filter((t) => t !== tag);

// ---------------------------------------------------------------- spawn modifiers

export type ModifierGroup = "timeOfDay" | "weather";
export type ModifierKey<G extends ModifierGroup> = G extends "timeOfDay" ? TimeOfDay : Weather;

export const MODIFIER_MIN = 0;
export const MODIFIER_MAX = 10;

/**
 * Parses a spawn-modifier input box. Blank means "unset" (= 1, no change).
 * Returns "invalid" for anything that is not a number within 0–10.
 */
export function parseModifierInput(raw: string): number | undefined | "invalid" {
  const text = raw.trim();
  if (text === "") return undefined;
  const n = Number(text);
  if (!Number.isFinite(n) || n < MODIFIER_MIN || n > MODIFIER_MAX) return "invalid";
  return n;
}

/** Text shown in a modifier box: the multiplier, or blank when unset. */
export function modifierInputValue(mods: SpawnModifiers, group: ModifierGroup, key: string): string {
  const v = (mods[group] as Record<string, number | undefined>)[key];
  return v === undefined ? "" : String(v);
}

/** Sets (or, with undefined, clears) one multiplier without mutating the input. */
export function setSpawnModifier(
  mods: SpawnModifiers,
  group: ModifierGroup,
  key: string,
  value: number | undefined,
): SpawnModifiers {
  const nextGroup = { ...(mods[group] as Record<string, number>) };
  if (value === undefined) delete nextGroup[key];
  else nextGroup[key] = value;
  return { ...mods, [group]: nextGroup } as SpawnModifiers;
}

// ---------------------------------------------------------------- battle & genetics (v0.3.0)

/** What "Set base stats" fills in: an even split of the budget (75 / 75 / 75 / 75). */
export const DEFAULT_BASE_STATS: BaseStats = Object.fromEntries(STAT_KEYS.map((k) => [k, STAT_BUDGET / STAT_KEYS.length])) as BaseStats;

/** Sum of the four base stats while the author types; blank (NaN) inputs count as 0. Null = not set. */
export function baseStatsTotal(stats: Partial<Record<keyof BaseStats, number>> | null | undefined): number | null {
  if (!stats) return null;
  return STAT_KEYS.reduce((sum, k) => sum + (Number.isFinite(stats[k]) ? (stats[k] as number) : 0), 0);
}

export const MAX_BODY_TRAITS = 2;

/** Adds or removes a body trait; adding a third does nothing. Keeps BODY_TRAITS order. */
export function toggleBodyTrait(list: readonly BodyTrait[], trait: BodyTrait): BodyTrait[] {
  if (list.includes(trait)) return list.filter((t) => t !== trait);
  if (list.length >= MAX_BODY_TRAITS) return [...list];
  return BODY_TRAITS.filter((t) => t === trait || list.includes(t));
}

/** A new placeholder attack: neutral approach, middle power, marked proposed. */
export const emptyAttack = (): Attack => ({
  name: "",
  approach: "strike",
  power: 40,
  description: "",
  canon: "proposed",
  priority: false,
});

/**
 * Phenotype shares for a two-allele gene where each allele is the "second"
 * allele (L for Build, W for Temperament) with probability p:
 * second/second = p^2, mixed = 2p(1 - p), first/first = (1 - p)^2.
 */
export function alleleShares(p: number) {
  const q = 1 - p;
  return { firstFirst: q * q, mixed: 2 * p * q, secondSecond: p * p };
}

/** Small (SS), Typical (SL), Large (LL) shares for Build p(L). */
export function buildShares(pLarge: number) {
  const s = alleleShares(pLarge);
  return { small: s.firstFirst, typical: s.mixed, large: s.secondSecond };
}

/** Bold (BB), Steady (BW), Wary (WW) shares for Temperament p(W). */
export function temperamentShares(pWary: number) {
  const s = alleleShares(pWary);
  return { bold: s.firstFirst, steady: s.mixed, wary: s.secondSecond };
}

/** Share of individuals that express a marking (mm) at allele frequency f. */
export const markingShare = (frequency: number) => frequency * frequency;

/** 0.5625 → "56.3%", 0.25 → "25%", 0.0025 → "0.25%" (more digits for tiny shares). */
export function formatPercent(share: number): string {
  const pct = share * 100;
  const digits = pct !== 0 && Math.abs(pct) < 1 ? 2 : 1;
  return `${Number(pct.toFixed(digits))}%`;
}

/** A fresh marking variant for the "Has a marking variant" switch. */
export const defaultMarking = (): MarkingVariant => ({ name: "", description: "", frequency: 0.05 });

export const clampMarkingFrequency = (f: number) => Math.min(MARKING_FREQUENCY_MAX, Math.max(0, f));

export const MAX_HABITAT_OVERRIDES = 16;

/**
 * Adds a habitat override row. It picks the first of `suggested` (the species'
 * own habitat tags) that has no override yet, else a blank tag the author fills in,
 * and starts at the gene's default chance.
 */
export function addHabitatOverride(odds: AlleleOdds, suggested: readonly string[]): AlleleOdds {
  if (odds.byHabitatTag.length >= MAX_HABITAT_OVERRIDES) return odds;
  const used = new Set(odds.byHabitatTag.map((o) => o.tag));
  const tag = suggested.find((t) => !used.has(t)) ?? "";
  return { ...odds, byHabitatTag: [...odds.byHabitatTag, { tag, pAllele: odds.pAllele }] };
}

export function updateHabitatOverride(
  odds: AlleleOdds,
  index: number,
  patch: Partial<AlleleOdds["byHabitatTag"][number]>,
): AlleleOdds {
  return { ...odds, byHabitatTag: odds.byHabitatTag.map((o, i) => (i === index ? { ...o, ...patch } : o)) };
}

export const removeHabitatOverride = (odds: AlleleOdds, index: number): AlleleOdds => ({
  ...odds,
  byHabitatTag: odds.byHabitatTag.filter((_, i) => i !== index),
});

/** Tags that more than one override row uses (only the first one would ever apply). */
export function duplicateOverrideTags(odds: AlleleOdds): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const { tag } of odds.byHabitatTag) {
    if (tag && seen.has(tag)) dupes.add(tag);
    seen.add(tag);
  }
  return [...dupes];
}

// ---------------------------------------------------------------- status

export type StatusKind = "draft" | "published" | "edited" | "deleted";

export function statusOf(e: Pick<WildkinSummary, "status" | "hasUnpublishedChanges" | "deletedAt">): StatusKind {
  if (e.deletedAt) return "deleted";
  if (e.status === "draft") return "draft";
  return e.hasUnpublishedChanges ? "edited" : "published";
}

export const STATUS_LABELS: Record<StatusKind, string> = {
  draft: "Draft",
  published: "Published",
  edited: "Published · edited",
  deleted: "Deleted",
};

/** Human label for a form key, e.g. "habitatSummary" → "Habitat summary". */
export function fieldLabel(key: string): string {
  const special: Record<string, string> = {
    id: "Canonical ID",
    registryNumber: "Registry number",
    canonStatus: "Canon status",
    behavior: "Behaviour",
  };
  if (special[key]) return special[key];
  const words = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
