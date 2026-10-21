import { STATUS_RULES, type StatusId, type StatusState } from "@wildbound/shared";

/**
 * Status framework. Nothing inflicts a status in 0.3.0 (skills will, in
 * 0.4.0); battle tests put statuses on a state directly. One status at a time
 * per Wildkin; statuses end when the battle ends. Speed does not shorten them.
 */

export function rollStatusDuration(status: StatusId, random: () => number): number {
  const { minTurns, maxTurns } = STATUS_RULES[status];
  return minTurns + Math.floor(random() * (maxTurns - minTurns + 1));
}

/** Puts a status on, unless the Wildkin already has one. */
export function inflictStatus(current: StatusState | null, status: StatusId, random: () => number): StatusState | null {
  return current ?? { id: status, turnsLeft: rollStatusDuration(status, random) };
}

/**
 * Does the status cancel this turn's attack? Asleep and Stunned always do;
 * Numbed does 25% of the time. Only rolls `random` when the chance is partial.
 */
export function statusSkipsAttack(status: StatusState | null, random: () => number): boolean {
  if (!status) return false;
  const chance = STATUS_RULES[status.id].skipAttackChance;
  if (chance >= 1) return true;
  if (chance <= 0) return false;
  return random() < chance;
}

/** Entangled: cannot switch out or escape. */
export const statusTraps = (status: StatusState | null) => status !== null && STATUS_RULES[status.id].trapped;

/** Exhausted: ATK x0.75. */
export const statusAtkMultiplier = (status: StatusState | null) => (status ? STATUS_RULES[status.id].atkMultiplier : 1);

export const statusCaptureBonus = (status: StatusState | null) => (status ? STATUS_RULES[status.id].captureBonus : 0);

/** End of turn: one turn less; null when it wore off. */
export function tickStatus(status: StatusState | null): StatusState | null {
  if (!status) return null;
  const turnsLeft = status.turnsLeft - 1;
  return turnsLeft > 0 ? { ...status, turnsLeft } : null;
}
