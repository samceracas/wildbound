import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import mammoth from "mammoth";

/**
 * Lore context for the Creature Manager assistant. Two sources:
 *
 * - brief (default): `docs/lore/assistant-brief.md`, a hand-condensed summary of
 *   the three canon documents (~7k characters, ~2k tokens). Small enough for
 *   free-tier token limits; the existing species are sent separately (roster).
 * - full: the canon documents in `docs/` (Word files) in the Bible's authority
 *   order, trimmed to LORE_MAX_CHARS.
 *
 * Read once per source and cached until the API restarts.
 */

/** The condensed brief, relative to the docs folder. */
export const LORE_BRIEF_PATH = "lore/assistant-brief.md";

export interface LoreDocument {
  name: string;
  text: string;
}

/** Bible first (species canon), then the story source of truth, then the ecology reference. */
const AUTHORITY = [/wildkin_bible/i, /first_field_survey/i, /biology_and_ecology/i];
const rank = (name: string) => {
  const i = AUTHORITY.findIndex((re) => re.test(name));
  return i === -1 ? AUTHORITY.length : i;
};

export async function readLoreDocuments(dir: string): Promise<LoreDocument[]> {
  if (!dir || !existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => /^WILDBOUND_.*\.(docx|md)$/i.test(f))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const docs: LoreDocument[] = [];
  for (const file of files) {
    const path = join(dir, file);
    const text = file.toLowerCase().endsWith(".docx")
      ? (await mammoth.extractRawText({ path })).value
      : readFileSync(path, "utf8");
    docs.push({ name: file.replace(/\.(docx|md)$/i, ""), text: text.replace(/\n{3,}/g, "\n\n").trim() });
  }
  return docs;
}

/**
 * Joins documents into one context block of at most `maxChars`. The most
 * authoritative document is kept whole when it fits; the rest share what is
 * left and are cut at a paragraph boundary.
 */
export function buildLoreContext(docs: readonly LoreDocument[], maxChars: number): string {
  let budget = maxChars;
  const parts: string[] = [];
  docs.forEach((doc, i) => {
    if (budget <= 200) return;
    const share = i === 0 ? budget : Math.floor(budget / (docs.length - i));
    let text = doc.text;
    if (text.length > share) {
      const cut = text.lastIndexOf("\n", share);
      text = `${text.slice(0, cut > share / 2 ? cut : share)}\n[…truncated]`;
    }
    const part = `=== ${doc.name} ===\n${text}`;
    parts.push(part);
    budget -= part.length;
  });
  return parts.join("\n\n");
}

let cache: { key: string; value: Promise<LoreDocument[]> } | null = null;

async function readSource(dir: string, source: "brief" | "full"): Promise<LoreDocument[]> {
  const brief = dir ? join(dir, LORE_BRIEF_PATH) : "";
  if (source === "brief" && brief && existsSync(brief)) {
    return [{ name: "WILDBOUND lore brief", text: readFileSync(brief, "utf8").trim() }];
  }
  // No brief (or "full" asked for): fall back to the canon documents.
  return readLoreDocuments(dir);
}

export function loreDocuments(dir: string, source: "brief" | "full" = "brief"): Promise<LoreDocument[]> {
  const key = `${source}:${dir}`;
  if (cache?.key !== key) {
    const value = readSource(dir, source);
    // Do not cache failures.
    value.catch(() => (cache = null));
    cache = { key, value };
  }
  return cache.value;
}
