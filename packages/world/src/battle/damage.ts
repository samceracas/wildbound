import { BATTLE_RULES } from "@wildbound/shared";

/**
 * Damage of one hit:
 *
 *   base   = floor( floor( floor(2 x L_att / 5 + 2) x power x ATK_att / DEF_def ) / 50 ) + 2
 *   damage = max(1, floor( base x matchup x randomFactor ))     randomFactor uniform in [0.85, 1.00]
 *
 * No critical hits in 0.3.0.
 */
export function baseDamage(attackerLevel: number, power: number, atk: number, def: number): number {
  const levelFactor = Math.floor((2 * attackerLevel) / 5 + 2);
  return Math.floor(Math.floor((levelFactor * power * atk) / Math.max(1, def)) / 50) + 2;
}

export const damageRandomFactor = (random: () => number) =>
  BATTLE_RULES.damageRandomMin + random() * (BATTLE_RULES.damageRandomMax - BATTLE_RULES.damageRandomMin);

export function damage(args: {
  attackerLevel: number;
  power: number;
  atk: number;
  def: number;
  matchup: number;
  random: () => number;
}): number {
  const base = baseDamage(args.attackerLevel, args.power, args.atk, args.def);
  return Math.max(1, Math.floor(base * args.matchup * damageRandomFactor(args.random)));
}
