import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import mammoth from "mammoth";

/**
 * Lore context for the Creature Manager assistant: the canon documents in
 * `docs/` (Word files), in the Bible's authority order. Read once and cached.
 */

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

export function loreDocuments(dir: string): Promise<LoreDocument[]> {
  if (cache?.key !== dir) {
    const value = readLoreDocuments(dir);
    // Do not cache failures.
    value.catch(() => (cache = null));
    cache = { key: dir, value };
  }
  return cache.value;
}
