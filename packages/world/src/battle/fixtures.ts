import type { BattleState, Combatant } from "@wildbound/shared";

/** Test helpers: battle states built by hand (statuses are put on directly; nothing inflicts them in 0.3.0). */
export const PLAYER_A = "a0000000-0000-4000-8000-000000000001";
export const PLAYER_B = "a0000000-0000-4000-8000-000000000002";
export const PLAYER_C = "a0000000-0000-4000-8000-000000000003";

export function combatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: PLAYER_A,
    creatureId: "kawi",
    name: "Kawi",
    registryNumber: 1,
    level: 5,
    stats: { hp: 21, atk: 12, def: 10, spd: 16 },
    hp: 21,
    status: null,
    attacks: [
      { name: "Peck", approach: "pierce", power: 40, description: "", canon: "proposed", priority: false },
      { name: "Wing Buffet", approach: "strike", power: 35, description: "", canon: "proposed", priority: false },
    ],
    bodyTraits: ["feathered"],
    category: "aerial",
    restless: false,
    ...overrides,
  };
}

export function battleState(overrides: Partial<BattleState> = {}): BattleState {
  const party = overrides.party ?? [combatant(), combatant({ id: PLAYER_B, creatureId: "kantar", name: "Kantar", stats: { hp: 22, atk: 14, def: 14, spd: 9 }, hp: 22, bodyTraits: ["plated"], category: "terrestrial" })];
  return {
    kind: "wild",
    turn: 0,
    awaiting: "action",
    outcome: null,
    escapeAttempts: 0,
    wild: {
      ...combatant({
        id: "b0000000-0000-4000-8000-000000000001",
        creatureId: "mimu",
        name: "Mimu",
        registryNumber: 2,
        stats: { hp: 22, atk: 10, def: 13, spd: 15 },
        hp: 22,
        attacks: [{ name: "Nibble", approach: "pierce", power: 35, description: "", canon: "proposed", priority: false }],
        bodyTraits: ["soft-bodied"],
        category: "terrestrial",
      }),
      rarity: "common",
      observed: true,
    },
    party,
    activeId: party[0]!.id,
    participants: [party[0]!.id],
    ...overrides,
  };
}

/** A random() that returns the given values in order, then `rest`. */
export const sequence = (values: number[], rest = 0.5) => () => (values.length ? values.shift()! : rest);
