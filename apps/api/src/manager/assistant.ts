import {
  ACTIVITY_PATTERNS,
  MOVEMENT_STYLES,
  RARITIES,
  SUGGESTED_HABITAT_TAGS,
  TIME_OF_DAY,
  WEATHER,
  WildkinSuggestionSchema,
  type AssistRequest,
  type WildkinSuggestion,
  type WildkinSummary,
} from "@wildbound/shared";

/**
 * AI assistant for the Creature Manager. A provider turns an author's idea into
 * a raw JSON object; `sanitizeSuggestion` keeps only fields that validate, so
 * a model can never put malformed data into a form.
 */

export interface AssistContext {
  /** Canon documents, already trimmed to the prompt budget. */
  lore: string;
  /** Existing Wildkin (published and drafts), so the model avoids duplicates. */
  roster: Pick<WildkinSummary, "id" | "registryNumber" | "name" | "classification" | "status">[];
  /** One-liners for the roster, keyed by id. */
  identities: Record<string, string>;
}

export interface RawSuggestion {
  entry: unknown;
  notes: unknown;
}

export interface WildkinAssistant {
  readonly model: string;
  suggest(request: AssistRequest, context: AssistContext): Promise<RawSuggestion>;
}

export class AssistantError extends Error {}

/** The habitat tags the manager's dropdown offers; the assistant may only pick these. */
const ALLOWED_HABITAT_TAGS: ReadonlySet<string> = new Set(SUGGESTED_HABITAT_TAGS);

const FIELD_GUIDE = `
Fields of "entry" (all optional; omit what you would not change):
- id: canonical id, lowercase slug (letters, digits, single hyphens), usually the name lowercased.
- name: short, pronounceable species name that fits the existing roster (Kawi, Mimu, Lumae, Kantar, Riverkin; Filipino-flavoured sounds are welcome).
- classification: header line, e.g. "Canopy Bird Wildkin".
- canonStatus: what is ESTABLISHED vs PROPOSED/TBD for this species. New species are PROPOSED until approved.
- identity: one-line identity (one sentence, encyclopedia).
- registryDescription: the text players read in the in-game Registry after observing it. 1-3 sentences in the
  game's grounded field-research voice (like "A curious, compact canopy bird ... Often heard before it is seen."),
  consistent with the lore above and with the author's idea. If the author's request contains a description,
  keep its meaning and facts and only polish it; otherwise write one. Never contradict the other fields.
- inspiration: real-world design reference (a reference, not a claim it is that animal).
- habitat: habitat and distribution prose.
- habitatTags: 1-4 tags chosen ONLY from this list (no other tags are allowed): ${SUGGESTED_HABITAT_TAGS.join(", ")}.
- habitatSummary: short habitat line for the in-game Registry (max ~80 chars).
- diet (prose) and dietTags (short lowercase words).
- activityPattern: one of ${ACTIVITY_PATTERNS.join(", ")}. activityNotes: prose (mark proposals).
- temperament (prose) and temperamentTags (short words).
- rarity: one of ${RARITIES.join(", ")} (rarity is not strength). rarityNotes: prose.
- role: gameplay/narrative role.
- physicalDescription: a vivid, concrete paragraph (body plan, size, colours, signature features) — it is used to generate sprites.
- visualHook: the one or two signature features, short phrase.
- visualDesignNotes: silhouette/readability guidance for small pixel art.
- behavior: behaviour and movement.
- movementStyle: one of ${MOVEMENT_STYLES.join(", ")} (still = barely moves, skulker = short cautious moves with long pauses, forager = slow meandering, roamer = steady travel, darter = quick bursts with frequent stops).
- ecology, fieldSigns ("Encounter and field signs"), gameplayProfile, assetNeeds: prose.
- openQuestions: array of short strings.
- spawnModifiers: {"timeOfDay": {${TIME_OF_DAY.map((t) => `"${t}"`).join(", ")}: number 0-10}, "weather": {${WEATHER.map((w) => `"${w}"`).join(", ")}: number 0-10}} — multipliers on encounter weight, 1 = unchanged, 0 = never. They must agree with activityPattern.
- skills: up to 4 items {"name", "description", "canon": "proposed"} built from reusable effects (damage, heal, shield, stat change, damage over time, short control, cleanse, counter).
`;

export function systemPrompt(lore: string): string {
  return `You are the Wildkin designer for WILDBOUND, a location-aware creature research game. You help the developer draft new Wildkin species (or refine one) as Wildkin Bible entries that fit the world's lore, tone and ecology.

Rules (from the Wildkin Bible):
- Wildkin are living species with ecological needs and behaviour, not disposable battle units. Observation precedes capture.
- Every species needs a recognizable visual hook, an ecological role, a clear gameplay purpose and a small content footprint.
- Do not equate rarity with strength. Real-world animals are design references only.
- Mark invented details as PROPOSED; keep unknowns as TBD rather than inventing definitive canon. Never contradict ESTABLISHED canon.
- Check the existing roster: do not duplicate an existing Wildkin's visual, ecological and gameplay role; mention overlaps in notes.
- Keep it reusable: no bespoke engine mechanics for one creature.
- Tone: grounded field-research naturalism with a gentle sense of wonder (Mabunyi Nature Reserve, tropical Philippine forest setting).

Answer with ONE JSON object. "entry" is an OBJECT whose keys are the field names below (never an array, never a list
of {field, value} pairs). Example shape:
{"entry": {"id": "kalikot", "name": "Kalikot", "classification": "...", "registryDescription": "...",
"habitatTags": ["canopy"], "rarity": "uncommon", "activityPattern": "nocturnal", "skills": [{"name": "...",
"description": "...", "canon": "proposed"}]}, "notes": ["..."]}
"notes" lists canon conflicts, overlaps with existing Wildkin, and which details are proposals. Write all prose in English.
${FIELD_GUIDE}
=== WILDBOUND canon documents (authority order) ===
${lore}`;
}

export function userPrompt(request: AssistRequest, context: AssistContext): string {
  const roster = context.roster
    .map((w) => `- No. ${w.registryNumber} ${w.name} (${w.id}, ${w.status}): ${w.classification}. ${context.identities[w.id] ?? ""}`.trim())
    .join("\n");
  const current = request.current ? JSON.stringify(request.current, null, 1) : "(empty form: create a new species)";
  return `Existing Wildkin roster:\n${roster || "(none)"}\n\nCurrent form values:\n${current}\n\nAuthor's idea / request:\n${request.prompt}\n\nReturn the JSON object now. Fill every field you can for a new species; for an existing one, return only fields that should change plus any that are empty. Always include registryDescription, matching the idea above and the lore.`;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

/** Light coercion of common model slips before validation. */
function coerce(key: string, value: unknown): unknown {
  if ((key === "id" || key === "habitatTags") && value != null) {
    return key === "id" ? slugify(String(value)) : Array.isArray(value) ? [...new Set(value.map((v) => slugify(String(v))).filter(Boolean))] : value;
  }
  if ((key === "dietTags" || key === "temperamentTags" || key === "openQuestions") && typeof value === "string") {
    return value.split(/[;,]\s*/).filter(Boolean);
  }
  if (key === "skills" && Array.isArray(value)) {
    return value.slice(0, 8).map((s) => ({ canon: "proposed", ...(s as object) }));
  }
  if ((key === "rarity" || key === "activityPattern" || key === "movementStyle") && typeof value === "string") {
    return key === "rarity" && value.toLowerCase() === "tbd" ? "TBD" : value.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/^tbd$/, "TBD");
  }
  return value;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Turns whatever shape a model used for the entry into one object of fields.
 * Models do not always follow the requested `{"entry": {...}}` shape; seen and
 * accepted here:
 *   - the object itself, possibly as a JSON string
 *   - a list of partial objects (`[{name…}, {habitat…}, …]`), merged in order
 *   - a list of pairs (`[{"field": "name", "value": "…"}, …]`, also key/name + value)
 *   - a list of wrapped answers (`[{"entry": {…}}]`)
 *   - one more level of wrapping (`{"wildkin": {…}}`, `{"entry": {"entry": {…}}}`)
 */
export function normalizeEntry(value: unknown, depth = 0): Record<string, unknown> {
  if (depth > 3) return {};
  if (typeof value === "string") {
    try {
      return normalizeEntry(JSON.parse(value), depth + 1);
    } catch {
      return {};
    }
  }
  if (Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const item of value) {
      if (!isRecord(item)) continue;
      const key = item.field ?? item.key ?? item.name;
      if ("value" in item && typeof key === "string" && Object.keys(item).length <= 3) out[key] = item.value;
      else Object.assign(out, normalizeEntry(item.entry ?? item, depth + 1));
    }
    return out;
  }
  if (!isRecord(value)) return {};
  const shape = WildkinSuggestionSchema.shape;
  const known = Object.keys(value).filter((k) => k in shape).length;
  // A wrapper object with a single nested entry and no fields of its own.
  if (known === 0) {
    const nested = Object.values(value).find((v) => isRecord(v) || Array.isArray(v));
    if (nested !== undefined) return normalizeEntry(nested, depth + 1);
  }
  return value;
}

/** Validates each field on its own and drops the ones that fail. */
export function sanitizeSuggestion(raw: RawSuggestion): { suggestion: WildkinSuggestion; notes: string[]; dropped: string[] } {
  const entry = normalizeEntry(raw.entry);
  const shape = WildkinSuggestionSchema.shape;
  const suggestion: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(entry)) {
    if (!(key in shape) || value === null || value === undefined) {
      if (value !== null && value !== undefined && key !== "registryNumber") dropped.push(key);
      continue;
    }
    const parsed = shape[key as keyof typeof shape].safeParse(coerce(key, value));
    if (parsed.success && parsed.data !== undefined) suggestion[key] = parsed.data;
    else dropped.push(key);
  }
  const notes = Array.isArray(raw.notes) ? raw.notes.filter((n): n is string => typeof n === "string") : [];

  // Habitat tags must come from the editor's list (the manager's dropdown); drop invented ones.
  if (Array.isArray(suggestion.habitatTags)) {
    const tags = suggestion.habitatTags as string[];
    const allowed = tags.filter((t) => ALLOWED_HABITAT_TAGS.has(t));
    const invented = tags.filter((t) => !ALLOWED_HABITAT_TAGS.has(t));
    if (invented.length) notes.push(`Left out habitat tags that are not in the list: ${invented.join(", ")}.`);
    if (allowed.length) suggestion.habitatTags = allowed;
    else {
      delete suggestion.habitatTags;
      dropped.push("habitatTags");
    }
  }
  if (Object.keys(suggestion).length === 0) {
    notes.push("The model's answer had no usable fields (it may have used an unexpected format). Try again, or rephrase the idea.");
  }
  return { suggestion: suggestion as WildkinSuggestion, notes, dropped };
}

/** Groq (OpenAI-compatible chat completions) with JSON mode. */
export class GroqAssistant implements WildkinAssistant {
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly baseUrl = "https://api.groq.com/openai/v1",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async suggest(request: AssistRequest, context: AssistContext): Promise<RawSuggestion> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.8,
          max_tokens: 4096,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt(context.lore) },
            { role: "user", content: userPrompt(request, context) },
          ],
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      throw new AssistantError(`Could not reach Groq: ${(error as Error).message}`);
    }
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      choices?: { message?: { content?: string } }[];
    };
    if (!res.ok) throw new AssistantError(`Groq returned ${res.status}: ${body.error?.message ?? "unknown error"}`);
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new AssistantError("Groq returned an empty answer");
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new AssistantError("Groq did not return valid JSON");
    }
    // Some models answer with the fields at the top level (or as a list) instead of under "entry".
    const result = isRecord(parsed) && "entry" in parsed ? { entry: parsed.entry, notes: parsed.notes } : { entry: parsed, notes: [] };
    if (Object.keys(normalizeEntry(result.entry)).length === 0) {
      console.warn(`[assistant] ${this.model} answered in an unexpected shape:`, content.slice(0, 2000));
    }
    return result;
  }
}
