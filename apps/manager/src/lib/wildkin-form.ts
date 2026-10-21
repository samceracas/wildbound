import {
  SLUG_PATTERN,
  WildkinEntryInputSchema,
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

/** The editable part of a saved entry (drops status, timestamps, art). */
export function entryToFormValues(entry: WildkinEntry): WildkinEntryData {
  const out = {} as Record<FormKey, unknown>;
  for (const key of FORM_KEYS) out[key] = structuredClone(entry[key]);
  return out as WildkinEntryData;
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
    if (key === "activityPattern" || key === "rarity") if (value === "TBD") continue;
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
