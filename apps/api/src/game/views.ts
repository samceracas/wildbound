import type { CreatureDefinition, RegistryEntryView } from "@wildbound/shared";
import type { RegistryEntryModel } from "@wildbound/db";

/**
 * Builds what a player may see about one species. Observe unlocks the basics;
 * capture unlocks the rest. Anything locked is sent as null, never hidden in CSS.
 */
export function registryView(creature: CreatureDefinition, entry: RegistryEntryModel | null): RegistryEntryView {
  const status = !entry ? "unknown" : entry.firstCapturedAt ? "captured" : "observed";
  const observed = status !== "unknown";
  const captured = status === "captured";
  return {
    creatureId: creature.id,
    registryNumber: creature.registryNumber,
    status,
    name: observed ? creature.name : null,
    description: observed ? creature.description : null,
    habitatSummary: observed ? creature.habitatSummary : null,
    rarity: captured ? creature.rarity : null,
    activityPattern: captured ? creature.activityPattern : null,
    skills: captured ? creature.skills : null,
    timesObserved: entry?.timesObserved ?? 0,
    timesCaptured: entry?.timesCaptured ?? 0,
    firstObservedAt: entry?.firstObservedAt.toISOString() ?? null,
    firstCapturedAt: entry?.firstCapturedAt?.toISOString() ?? null,
  };
}
