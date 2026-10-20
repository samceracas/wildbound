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

const FIELD_GUIDE = `
Fields of "entry" (all optional; omit what you would not change):
- id: canonical id, lowercase slug (letters, digits, single hyphens), usually the name lowercased.
- name: short, pronounceable species name that fits the existing roster (Kawi, Mimu, Lumae, Kantar, Riverkin; Filipino-flavoured sounds are welcome).
- classification: header line, e.g. "Canopy Bird Wildkin".
- canonStatus: what is ESTABLISHED vs PROPOSED/TBD for this species. New species are PROPOSED until approved.
- identity: one-line identity (one sentence).
- inspiration: real-world design reference (a reference, not a claim it is that animal).
- habitat: habitat and distribution prose.
- habitatTags: array of lowercase slug tags. Prefer: ${SUGGESTED_HABITAT_TAGS.join(", ")}.
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

Answer with ONE JSON object: {"entry": {...fields...}, "notes": ["..."]}.
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
  return `Existing Wildkin roster:\n${roster || "(none)"}\n\nCurrent form values:\n${current}\n\nAuthor's idea / request:\n${request.prompt}\n\nReturn the JSON object now. Fill every field you can for a new species; for an existing one, return only fields that should change plus any that are empty.`;
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

/** Validates each field on its own and drops the ones that fail. */
export function sanitizeSuggestion(raw: RawSuggestion): { suggestion: WildkinSuggestion; notes: string[]; dropped: string[] } {
  const entry = raw.entry && typeof raw.entry === "object" ? (raw.entry as Record<string, unknown>) : {};
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
    let parsed: { entry?: unknown; notes?: unknown };
    try {
      parsed = JSON.parse(content) as typeof parsed;
    } catch {
      throw new AssistantError("Groq did not return valid JSON");
    }
    // Some models answer with the fields at the top level instead of under "entry".
    return parsed.entry ? { entry: parsed.entry, notes: parsed.notes } : { entry: parsed, notes: [] };
  }
}
