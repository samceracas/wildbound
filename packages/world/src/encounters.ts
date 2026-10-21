import type {
  AvailableWildkin,
  EncounterEntry,
  EncounterTable,
  LevelBand,
  ResolvedEncounterTable,
} from "@wildbound/shared";
import { conditionsMatch, type Environment } from "./conditions.ts";

export type EncounterScope = "habitat" | "region";

/** An entry's wild level range: its own override when both bounds are set, else its table's. */
export function effectiveLevelRange(
  table: Pick<EncounterTable, "minLevel" | "maxLevel">,
  entry: Pick<EncounterEntry, "minLevel" | "maxLevel">,
): { minLevel: number; maxLevel: number } {
  return entry.minLevel !== null && entry.maxLevel !== null
    ? { minLevel: entry.minLevel, maxLevel: entry.maxLevel }
    : { minLevel: table.minLevel, maxLevel: table.maxLevel };
}

/**
 * Evaluates one encounter table under an environment.
 * `gateOpen` lets callers close a table for reasons outside the table itself
 * (e.g. its habitat's condition rules are not met).
 */
export function evaluateEncounterTable(
  table: EncounterTable,
  scope: EncounterScope,
  env: Environment,
  creatureNames: ReadonlyMap<string, string>,
  gateOpen = true,
): ResolvedEncounterTable {
  const applicable = gateOpen && table.active && conditionsMatch(table.conditionRules, env);
  const evaluated = table.entries.map((entry) => ({
    entry,
    available: applicable && conditionsMatch(entry.conditions, env),
  }));
  const totalAvailable = evaluated.reduce((sum, e) => sum + (e.available ? e.entry.weight : 0), 0);

  return {
    id: table.id,
    name: table.name,
    scope,
    conditionRules: table.conditionRules,
    applicable,
    entries: evaluated.map(({ entry, available }) => ({
      creatureId: entry.creatureId,
      creatureName: creatureNames.get(entry.creatureId) ?? entry.creatureId,
      weight: entry.weight,
      conditions: entry.conditions,
      available,
      probability: available && totalAvailable > 0 ? entry.weight / totalAvailable : 0,
      ...effectiveLevelRange(table, entry),
    })),
  };
}

/**
 * Merges every available entry across applicable tables into one weighted
 * Wildkin list. Weights for the same creature are summed, and every entry
 * keeps its own level band. Sorted by weight (desc) then id so the output is
 * deterministic.
 */
export function combineAvailableWildkin(tables: readonly ResolvedEncounterTable[]): AvailableWildkin[] {
  const byCreature = new Map<string, { name: string; weight: number; levelBands: LevelBand[] }>();
  for (const table of tables) {
    if (!table.applicable) continue;
    for (const entry of table.entries) {
      if (!entry.available) continue;
      const current = byCreature.get(entry.creatureId);
      byCreature.set(entry.creatureId, {
        name: entry.creatureName,
        weight: (current?.weight ?? 0) + entry.weight,
        levelBands: [...(current?.levelBands ?? []), { minLevel: entry.minLevel, maxLevel: entry.maxLevel, weight: entry.weight }],
      });
    }
  }
  const total = [...byCreature.values()].reduce((s, c) => s + c.weight, 0);
  return [...byCreature.entries()]
    .map(([creatureId, c]) => ({
      creatureId,
      name: c.name,
      weight: c.weight,
      probability: total > 0 ? c.weight / total : 0,
      levelBands: c.levelBands,
    }))
    .sort((a, b) => b.weight - a.weight || a.creatureId.localeCompare(b.creatureId));
}

/**
 * Picks one creature by weight. `random` must return a number in [0, 1).
 * Returns null when nothing is available.
 */
export function rollEncounter(
  candidates: readonly { creatureId: string; weight: number }[],
  random: () => number,
): string | null {
  const pool = candidates.filter((c) => c.weight > 0);
  const total = pool.reduce((s, c) => s + c.weight, 0);
  if (total <= 0) return null;
  let threshold = random() * total;
  for (const c of pool) {
    threshold -= c.weight;
    if (threshold < 0) return c.creatureId;
  }
  return pool[pool.length - 1]!.creatureId;
}

/** Picks a level band by weight, then a level uniformly in it. Bands with weight 0 are skipped. */
export function rollLevel(bands: readonly LevelBand[], random: () => number): number {
  const pool = bands.filter((b) => b.weight > 0);
  if (pool.length === 0) return 1;
  const total = pool.reduce((s, b) => s + b.weight, 0);
  let threshold = random() * total;
  let band = pool[pool.length - 1]!;
  for (const b of pool) {
    threshold -= b.weight;
    if (threshold < 0) {
      band = b;
      break;
    }
  }
  const lo = Math.min(band.minLevel, band.maxLevel);
  const hi = Math.max(band.minLevel, band.maxLevel);
  return lo + Math.min(hi - lo, Math.floor(random() * (hi - lo + 1)));
}

/** Small deterministic PRNG (mulberry32) for reproducible encounter rolls in tests and previews. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
