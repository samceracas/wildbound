import {
  APPROACH_NAMES,
  BODY_TRAIT_NAMES,
  CATEGORY_NAMES,
  ITEMS,
  STATUS_RULES,
  type BattleEvent,
  type BattleView,
  type ItemId,
} from "@wildbound/shared";

/**
 * Battle log lines in the field-note voice, one per server event (or none for
 * events that only drive the picture). Pure, so it is unit-tested.
 */
export function eventLine(e: BattleEvent): string | null {
  switch (e.type) {
    case "attack": {
      const who = e.side === "wild" ? `The wild ${e.attacker}` : e.attacker;
      if (e.dodged) return `${who} used ${e.attack}, but it was dodged.`;
      return `${who} used ${e.attack}.${e.line ? ` ${e.line}` : ""}`;
    }
    case "skip":
      return `${e.side === "wild" ? `The wild ${e.name}` : e.name} is ${statusName(e.status)} and cannot act.`;
    case "status":
      return e.change === "inflicted"
        ? `${e.side === "wild" ? `The wild ${e.name}` : e.name} is now ${statusName(e.status)}.`
        : `${e.side === "wild" ? `The wild ${e.name}` : e.name} is no longer ${statusName(e.status)}.`;
    case "switch":
      return `${e.from}, come back. Go, ${e.to}!`;
    case "replace":
      return `Go, ${e.to}!`;
    case "faint":
      return e.side === "wild" ? `The wild ${e.name} fainted.` : `${e.name} fainted and withdrew from the bout.`;
    case "capsule":
      return e.success ? `The ${itemName(e.itemId)} held. Gotcha!` : "It broke free!";
    case "escape":
      if (!e.success) return "You could not get away!";
      return e.reason === "moved-away" ? "You moved too far away, so the bout is over." : "You got away safely.";
    case "item":
      return `${e.target} ate a ${itemName(e.itemId)} and recovered a little.`;
    case "trapped":
      return `${e.name} is entangled and cannot get away.`;
    case "matchup-recorded":
      return `Field note recorded: ${BODY_TRAIT_NAMES[e.bodyTrait]} is ${e.effect === "weak" ? "weak to" : "resistant to"} ${APPROACH_NAMES[e.approach]}.`;
    case "exp": {
      const parts: string[] = [];
      if (e.amount > 0) parts.push(`${e.name} gained ${e.amount} EXP.`);
      if (e.newLevel !== null) parts.push(`${e.name} grew to level ${e.newLevel}!`);
      if (e.heldAtCap) parts.push(`${e.name}'s growth is held at your license cap.`);
      return parts.length > 0 ? parts.join(" ") : null;
    }
    case "researcher-exp":
      return `+${e.amount} ${CATEGORY_NAMES[e.category]} researcher EXP (${e.reason}).`;
    case "battle-end":
      return e.line;
  }
}

const statusName = (id: keyof typeof STATUS_RULES) => STATUS_RULES[id].name.toLowerCase();
const itemName = (id: string) => (id in ITEMS ? ITEMS[id as ItemId].name : id);

/** HP shown while the log plays: starts from the view before the turn and follows the events. */
export interface ShownHp {
  wild: number;
  /** Per party member id. */
  party: Record<string, number>;
  activeId: string;
}

export function shownHpOf(view: BattleView): ShownHp {
  return {
    wild: view.wild.hpFraction,
    party: Object.fromEntries(view.party.map((m) => [m.id, m.hpFraction])),
    activeId: view.activeId,
  };
}

/** Applies one event to the HP shown on screen. */
export function applyEvent(hp: ShownHp, e: BattleEvent, view: BattleView): ShownHp {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  switch (e.type) {
    case "attack":
      if (e.dodged) return hp;
      if (e.side === "player") return { ...hp, wild: clamp(hp.wild - e.damage) };
      return { ...hp, party: { ...hp.party, [hp.activeId]: clamp((hp.party[hp.activeId] ?? 0) - e.damage) } };
    case "switch":
    case "replace":
      return { ...hp, activeId: e.wildkinId };
    case "item": {
      const target = view.party.find((m) => m.name === e.target);
      if (!target) return hp;
      return { ...hp, party: { ...hp.party, [target.id]: clamp((hp.party[target.id] ?? 0) + e.healed) } };
    }
    default:
      return hp;
  }
}
