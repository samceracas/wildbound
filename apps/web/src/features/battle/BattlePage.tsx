import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  APPROACH_NAMES,
  BATTLE_END_LINES,
  BODY_TRAIT_NAMES,
  CAPSULE_ITEM_IDS,
  STATUS_RULES,
  type BattleAction,
  type BattleEvent,
  type BattlePartyMemberView,
  type BattleView,
  type StatusId,
} from "@wildbound/shared";
import { BackLink, Chip, DialoguePanel, errorText, HpBar } from "@/components/field.tsx";
import { ConsoleButton } from "@/components/layout/Shell.tsx";
import { WildkinImage } from "@/components/WildkinImage.tsx";
import { ApiError } from "@/lib/api.ts";
import { useBattle, useBattleAction } from "@/lib/queries.ts";
import { cn } from "@/lib/utils";
import { applyEvent, eventLine, shownHpOf, type ShownHp } from "./battle-log.ts";

/** Delay between two battle log lines. */
const LINE_MS = 900;

type Menu = "main" | "attack" | "switch" | "satchel" | "ration";

interface Playback {
  /** The battle as it was before the turn (shown until the log has played). */
  before: BattleView;
  events: BattleEvent[];
  /** Events shown so far. */
  shown: number;
  hp: ShownHp;
}

/**
 * A wild battle (Pokemon style, one active Wildkin per side). The server
 * resolves each turn; this screen sends one action and plays the returned
 * events back as field notes, with short delays.
 */
export function BattlePage() {
  const { battleId = "" } = useParams();
  const battle = useBattle(battleId);
  const view = battle.data;
  const act = useBattleAction(view);
  const [menu, setMenu] = useState<Menu>("main");
  const [log, setLog] = useState<string[]>([]);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const logEnd = useRef<HTMLLIElement>(null);

  // Play the events one by one.
  useEffect(() => {
    if (!playback) return;
    if (playback.shown >= playback.events.length) {
      const done = setTimeout(() => setPlayback(null), LINE_MS / 2);
      return () => clearTimeout(done);
    }
    const timer = setTimeout(
      () => {
        const e = playback.events[playback.shown]!;
        const line = eventLine(e);
        if (line) setLog((l) => [...l, line]);
        setPlayback({ ...playback, shown: playback.shown + 1, hp: applyEvent(playback.hp, e, playback.before) });
      },
      playback.shown === 0 ? 150 : LINE_MS,
    );
    return () => clearTimeout(timer);
  }, [playback]);

  useEffect(() => logEnd.current?.scrollIntoView({ block: "nearest" }), [log]);

  if (battle.isPending) return <p className="p-4 font-vt text-xl text-ink-muted">Bracing for the bout…</p>;
  if (!view) {
    return (
      <div className="flex flex-col gap-3 p-3">
        <BackLink to="/play">Back to radar</BackLink>
        <p className="font-vt text-xl text-terracotta">{battle.error ? errorText(battle.error) : "No such battle."}</p>
      </div>
    );
  }

  const shown = playback ? playback.before : view;
  const hp = playback ? playback.hp : shownHpOf(view);
  const active = shown.party.find((m) => m.id === hp.activeId) ?? shown.party.find((m) => m.active)!;
  const busy = act.isPending || playback !== null;

  const send = (action: BattleAction) => {
    const before = view;
    act.mutate(action, {
      onSuccess: ({ events }) => {
        setMenu("main");
        setPlayback({ before, events, shown: 0, hp: shownHpOf(before) });
      },
      onError: (e) => {
        if (e instanceof ApiError && e.code === "stale_turn") setLog((l) => [...l, "That turn already happened. Catching up…"]);
      },
    });
  };

  const over = view.outcome !== null && !playback;

  return (
    <div className="flex flex-1 flex-col gap-2 p-2">
      {/* The field: wild at the top, yours at the bottom. */}
      <section className="relative overflow-hidden rounded-xl border-2 border-deep-forest bg-screen-inset" aria-label="Battlefield">
        <div className="flex items-start justify-between gap-2 p-2">
          <SideCard
            name={`Wild ${shown.wild.name}`}
            level={shown.wild.level}
            hp={hp.wild}
            status={shown.wild.status}
            chips={shown.wild.bodyTraits.map((t) => BODY_TRAIT_NAMES[t])}
          />
          <WildkinImage creatureId={shown.wild.creatureId} kind="sprite" alt={shown.wild.name} className="pixelated size-24 shrink-0" />
        </div>
        <div className="flex items-end justify-between gap-2 border-t border-dashed border-screen-edge p-2">
          {active && (
            <WildkinImage
              creatureId={active.creatureId}
              kind="sprite"
              alt={active.name}
              // Your Wildkin faces the wild one.
              className="pixelated size-24 shrink-0 -scale-x-100"
            />
          )}
          {active && <SideCard name={active.name} level={active.level} hp={hp.party[active.id] ?? active.hpFraction} status={active.status} align="right" />}
        </div>
      </section>

      {/* The log. */}
      <DialoguePanel tag={over ? "BOUT OVER" : `TURN ${shown.turn + 1}`} bodyClassName="p-2 pt-3">
        <ol className="max-h-32 min-h-12 overflow-y-auto font-vt text-lg leading-5 text-lcd-ink" aria-live="polite">
          {log.length === 0 && <li>A wild {view.wild.name} squares up to you. What will you do?</li>}
          {log.map((line, i) => (
            <li key={i} className={i === log.length - 1 ? "text-ink" : "text-ink-muted"}>
              {line}
            </li>
          ))}
          <li ref={logEnd} aria-hidden />
        </ol>
        {act.error && !(act.error instanceof ApiError && act.error.code === "stale_turn") && (
          <p className="mt-1 font-vt text-lg leading-5 text-terracotta">{errorText(act.error)}</p>
        )}
      </DialoguePanel>

      {over ? (
        <EndScreen battle={view} />
      ) : view.awaiting === "replace" && !playback ? (
        <PartyList
          title="Choose who goes next"
          party={view.party}
          disabled={busy}
          onPick={(m) => send({ type: "replace", wildkinId: m.id })}
        />
      ) : (
        <ActionMenu battle={view} menu={menu} setMenu={setMenu} busy={busy} send={send} />
      )}
    </div>
  );
}

function SideCard({
  name,
  level,
  hp,
  status,
  chips = [],
  align = "left",
}: {
  name: string;
  level: number;
  hp: number;
  status: StatusId | null;
  chips?: string[];
  align?: "left" | "right";
}) {
  return (
    <div className={cn("min-w-0 flex-1 rounded-md border-2 border-deep-forest bg-paper p-1.5", align === "right" && "text-right")}>
      <p className="truncate font-pixel text-[9px] leading-3 text-deep-forest uppercase">
        {name} <span className="text-primary-forest">Lv {level}</span>
      </p>
      <HpBar fraction={hp} className="mt-1.5" />
      {(status || chips.length > 0) && (
        <div className={cn("mt-1 flex flex-wrap gap-1", align === "right" && "justify-end")}>
          {status && <Chip tone="alert">{STATUS_RULES[status].name}</Chip>}
          {chips.map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionMenu({
  battle,
  menu,
  setMenu,
  busy,
  send,
}: {
  battle: BattleView;
  menu: Menu;
  setMenu: (m: Menu) => void;
  busy: boolean;
  send: (a: BattleAction) => void;
}) {
  const back = (
    <button
      type="button"
      onClick={() => setMenu("main")}
      className="w-fit rounded border-2 border-deep-forest bg-paper px-2 py-1 font-pixel text-[8px] text-deep-forest uppercase hover:bg-deep-forest hover:text-paper"
    >
      ◄ Back
    </button>
  );

  if (menu === "attack") {
    return (
      <div className="flex flex-col gap-2">
        {battle.attacks.map((a) => (
          <ConsoleButton
            key={a.index}
            face="A"
            className="px-3 py-2.5"
            disabled={busy}
            onClick={() => send({ type: "attack", attackIndex: a.index })}
            trailing={<span className="font-pixel text-[7px]">{a.powerWord}</span>}
          >
            {a.name} <span className="text-[7px] opacity-80">· {APPROACH_NAMES[a.approach]}</span>
          </ConsoleButton>
        ))}
        {back}
      </div>
    );
  }

  if (menu === "switch") {
    return (
      <div className="flex flex-col gap-2">
        <PartyList
          title="Switch (uses your turn)"
          party={battle.party.filter((m) => !m.active)}
          disabled={busy}
          onPick={(m) => send({ type: "switch", wildkinId: m.id })}
        />
        {back}
      </div>
    );
  }

  if (menu === "ration") {
    return (
      <div className="flex flex-col gap-2">
        <PartyList
          title="Give a Trail Ration to (uses your turn)"
          party={battle.party}
          // Restless Wildkin refuse treatment; fainted ones cannot eat mid-bout.
          canPick={(m) => (m.restless ? m.unusableReason ?? "Restless" : m.fainted ? "Fainted" : m.hpFraction >= 1 ? "Full strength" : null)}
          disabled={busy}
          onPick={(m) => send({ type: "item", itemId: "trail-ration", wildkinId: m.id })}
        />
        {back}
      </div>
    );
  }

  if (menu === "satchel") {
    const capsuleIds: readonly string[] = CAPSULE_ITEM_IDS;
    const rations = battle.items.find((i) => i.itemId === "trail-ration");
    const capsules = battle.items.filter((i) => capsuleIds.includes(i.itemId));
    return (
      <div className="flex flex-col gap-2">
        <ConsoleButton
          face="Y"
          className="px-3 py-2.5"
          disabled={busy || !rations || rations.quantity === 0}
          onClick={() => setMenu("ration")}
          trailing={`×${rations?.quantity ?? 0}`}
        >
          Trail Ration
        </ConsoleButton>
        {capsules.map((c) => (
          <ConsoleButton
            key={c.itemId}
            face="A"
            className="px-3 py-2.5"
            disabled={busy || c.quantity === 0}
            onClick={() => send({ type: "capsule", itemId: c.itemId as (typeof CAPSULE_ITEM_IDS)[number] })}
            trailing={`×${c.quantity}`}
          >
            {c.name}
          </ConsoleButton>
        ))}
        {capsules.length === 0 && <p className="font-vt text-lg text-ink-muted">No capsules left in the satchel.</p>}
        {back}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <ConsoleButton face="A" className="px-3 py-3" disabled={busy} onClick={() => setMenu("attack")}>
        Attack
      </ConsoleButton>
      <ConsoleButton face="Y" className="px-3 py-3" disabled={busy} onClick={() => setMenu("switch")}>
        Switch
      </ConsoleButton>
      <ConsoleButton face="X" className="px-3 py-3" disabled={busy} onClick={() => setMenu("satchel")}>
        Satchel
      </ConsoleButton>
      <ConsoleButton face="B" className="px-3 py-3" disabled={busy} onClick={() => send({ type: "escape" })}>
        Escape
      </ConsoleButton>
    </div>
  );
}

/** Party members to pick from; members that cannot be picked are disabled with the reason. */
function PartyList({
  title,
  party,
  onPick,
  disabled,
  canPick = (m) => (m.usable ? null : (m.unusableReason ?? "Cannot battle")),
}: {
  title: string;
  party: BattlePartyMemberView[];
  onPick: (m: BattlePartyMemberView) => void;
  disabled: boolean;
  /** The reason a member cannot be picked, or null. */
  canPick?: (m: BattlePartyMemberView) => string | null;
}) {
  return (
    <section className="flex flex-col gap-1.5" aria-label={title}>
      <h2 className="px-1 font-pixel text-[8px] text-deep-forest uppercase">{title}</h2>
      {party.length === 0 && <p className="font-vt text-lg text-ink-muted">Nobody else is in your party.</p>}
      {party.map((m) => {
        const reason = canPick(m);
        return (
          <button
            key={m.id}
            type="button"
            disabled={disabled || reason !== null}
            onClick={() => onPick(m)}
            className="flex w-full items-center gap-2 rounded-md border-2 border-screen-edge bg-paper p-1.5 text-left outline-none hover:border-primary-forest focus-visible:ring-2 focus-visible:ring-primary-forest disabled:opacity-60 disabled:hover:border-screen-edge"
          >
            <WildkinImage creatureId={m.creatureId} className="pixelated size-9 shrink-0 rounded border border-screen-edge bg-screen-inset" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-pixel text-[8px] text-deep-forest uppercase">
                {m.name} <span className="text-primary-forest">Lv {m.level}</span>
              </span>
              <HpBar fraction={m.hpFraction} className="mt-1" />
              {reason && <span className="block truncate font-vt text-base leading-4 text-ink-muted">{reason}</span>}
            </span>
          </button>
        );
      })}
    </section>
  );
}

const END_TITLES = { won: "Won", captured: "Captured", lost: "Lost", escaped: "Escaped", abandoned: "Abandoned" } as const;

function EndScreen({ battle }: { battle: BattleView }) {
  const outcome = battle.outcome!;
  const navigate = useNavigate();
  return (
    <DialoguePanel tag={END_TITLES[outcome].toUpperCase()} bodyClassName="flex flex-col gap-2">
      <h2 className="font-pixel text-[12px] text-deep-forest uppercase">{END_TITLES[outcome]}</h2>
      <p className="font-vt text-xl leading-6 text-ink">{BATTLE_END_LINES[outcome].replaceAll("{name}", battle.wild.name)}</p>
      {battle.expGained.length > 0 && (
        <ul className="font-vt text-lg leading-5 text-ink-muted">
          {battle.expGained.map((g) => (
            <li key={g.wildkinId}>
              {g.name}: +{g.amount} EXP
            </li>
          ))}
        </ul>
      )}
      {outcome === "captured" && battle.capturedWildkinId && (
        <Link to={`/play/party/${battle.capturedWildkinId}`} className="font-pixel text-[8px] text-primary-forest uppercase underline">
          Meet your new companion ►
        </Link>
      )}
      <ConsoleButton face="A" className="mt-1" trailing="►" onClick={() => navigate("/play")}>
        Back to radar
      </ConsoleButton>
    </DialoguePanel>
  );
}
