/**
 * Pure helpers for showing species spawn modifiers in the editor.
 * (Relative imports only: the unit tests run without the "@" alias.)
 */
import type { AvailableWildkin, CreatureDefinition, SpawnModifiers } from "@wildbound/shared";
import { TIME_OF_DAY, WEATHER } from "@wildbound/shared";
import { applySpawnModifiers, type Environment } from "@wildbound/world";

/** "rain ×0.5 · storm ×0 · night ×0.1". Multipliers of 1 are left out; "" when nothing changes. */
export function formatSpawnModifiers(mods: SpawnModifiers | undefined): string {
  if (!mods) return "";
  const parts: string[] = [];
  for (const w of WEATHER) {
    const m = mods.weather[w];
    if (m !== undefined && m !== 1) parts.push(`${w} ×${m}`);
  }
  for (const t of TIME_OF_DAY) {
    const m = mods.timeOfDay[t];
    if (m !== undefined && m !== 1) parts.push(`${t} ×${m}`);
  }
  return parts.join(" · ");
}

/** Whether the species has a weather or time-of-day modifier other than 1 that applies in `env`. */
export function hasModifierIn(mods: SpawnModifiers | undefined, env: Environment): boolean {
  return (mods?.weather[env.weather] ?? 1) !== 1 || (mods?.timeOfDay[env.timeOfDay] ?? 1) !== 1;
}

export interface ModifiedWildkin {
  creatureId: string;
  name: string;
  /** Share from encounter weights alone (what /resolve returns). */
  rawProbability: number;
  /** Share after applySpawnModifiers (equals raw when it is not implemented). */
  probability: number;
}

export interface ModifiedPreview {
  wildkin: ModifiedWildkin[];
  /**
   * - "applied": applySpawnModifiers changed the weights
   * - "neutral": no species has a modifier other than 1 here, nothing to change
   * - "unchanged": modifiers should change the weights but did not (exercise #2 not done yet)
   * - "error": applySpawnModifiers threw; raw weights are shown
   */
  status: "applied" | "neutral" | "unchanged" | "error";
  error?: string;
}

/**
 * Runs the resolved Wildkin through `applySpawnModifiers` from @wildbound/world,
 * the same function the API uses when spawning, so the Test panel shows what
 * players will actually meet in that weather and time of day.
 */
export function previewWithModifiers(
  available: readonly AvailableWildkin[],
  creatures: readonly CreatureDefinition[],
  env: Environment,
): ModifiedPreview {
  const modifiers = new Map(creatures.map((c) => [c.id, c.spawnModifiers]));
  const candidates = available.map((w) => ({ creatureId: w.creatureId, weight: w.weight }));
  const raw = (status: ModifiedPreview["status"], error?: string): ModifiedPreview => ({
    wildkin: available.map((w) => ({ creatureId: w.creatureId, name: w.name, rawProbability: w.probability, probability: w.probability })),
    status,
    error,
  });
  const expectsChange = available.some((w) => hasModifierIn(modifiers.get(w.creatureId), env));

  let modified: { creatureId: string; weight: number }[];
  try {
    modified = applySpawnModifiers(candidates, modifiers, env);
  } catch (e) {
    return raw("error", e instanceof Error ? e.message : String(e));
  }

  const weightOf = new Map(modified.map((c) => [c.creatureId, c.weight]));
  const unchanged = candidates.every((c) => weightOf.get(c.creatureId) === c.weight) && modified.length === candidates.length;
  if (unchanged) return raw(expectsChange ? "unchanged" : "neutral");

  const total = modified.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  return {
    wildkin: available.map((w) => {
      const weight = Math.max(0, weightOf.get(w.creatureId) ?? 0);
      return { creatureId: w.creatureId, name: w.name, rawProbability: w.probability, probability: total > 0 ? weight / total : 0 };
    }),
    status: "applied",
  };
}
