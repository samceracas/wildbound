import { Link, useNavigate } from "react-router";
import { CATEGORY_NAMES, GAME_RULES, type GameStateResponse, type SpawnView } from "@wildbound/shared";
import { Chip, DialoguePanel, errorText } from "@/components/field.tsx";
import { ConsoleButton } from "@/components/layout/Shell.tsx";
import { WildkinImage } from "@/components/WildkinImage.tsx";
import { ApiError } from "@/lib/api.ts";
import { registryNo } from "@/lib/assets.ts";
import { useObserve, useRegistry, useStartBattle } from "@/lib/queries.ts";
import { cn } from "@/lib/utils";

/** Why the Battle button is disabled for this spawn, or null when a battle can start. */
export function battleBlockedReason(spawn: SpawnView, state: GameStateResponse): string | null {
  if (state.activeBattleId) return "A battle is already running.";
  if (!spawn.inRange) return `Get within ${GAME_RULES.interactRadiusM} m to observe or battle. Walk toward the marker.`;
  if (spawn.inBattle) return "It is busy in a battle.";
  if (spawn.battleLocked) return `${spawn.battleLocked}. You can still observe here.`;
  if (!state.hasUsableWildkin) return "Your party needs rest: visit a vet or let first aid work.";
  return null;
}

/** Dialogue panel for one spawn: Observe and Battle (capture happens inside the battle). */
export function SpawnSheet({
  spawn,
  name,
  state,
  onClose,
}: {
  spawn: SpawnView;
  name: string;
  state: GameStateResponse;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const registry = useRegistry();
  const observe = useObserve();
  const startBattle = useStartBattle();
  const entry = registry.data?.entries.find((e) => e.creatureId === spawn.creatureId);
  const known = entry && entry.status !== "unknown";
  const busy = observe.isPending || startBattle.isPending;
  const error = observe.error ?? startBattle.error;
  const blocked = battleBlockedReason(spawn, state);
  const hints = spawn.hints ? [spawn.hints.build, spawn.hints.temperament, spawn.hints.marking].filter((h): h is string => !!h) : [];

  const battle = () =>
    startBattle.mutate(spawn.id, {
      onSuccess: ({ battle: b }) => navigate(`/play/battle/${b.id}`),
      onError: (e) => {
        // Another tab started one meanwhile: go to it.
        if (e instanceof ApiError && e.code === "battle_in_progress" && typeof e.details.battleId === "string") {
          navigate(`/play/battle/${e.details.battleId}`);
        }
      },
    });

  return (
    <DialoguePanel
      role="dialog"
      aria-label={name}
      tag={spawn.inBattle ? "IN BATTLE" : spawn.inRange ? "IN RANGE" : "SIGHTING"}
      className="absolute inset-x-2 bottom-2 z-20 max-h-[calc(100%-1rem)]"
      bodyClassName="overflow-y-auto"
    >
      <div className="flex items-start gap-3">
        <div className="relative flex size-16 shrink-0 items-center justify-center rounded border-2 border-screen-edge bg-screen-inset">
          <span aria-hidden className="absolute size-12 rounded-full bg-success/20" />
          <WildkinImage creatureId={spawn.creatureId} className={cn("pixelated relative size-14", !known && "silhouette")} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-pixel text-[8px] text-ink-muted">{registryNo(spawn.registryNumber)}</p>
          <h2 className="mt-1 truncate font-pixel text-[12px] leading-4 text-deep-forest uppercase">
            {known ? entry.name : "Unidentified"}
            {spawn.level !== null && <span className="ml-1.5 text-[9px] text-primary-forest">Lv {spawn.level}</span>}
          </h2>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Chip tone={spawn.inRange ? "ok" : "default"}>{Math.round(spawn.distanceM)} m away</Chip>
            {spawn.observed && <Chip tone="warn">Observed</Chip>}
            {spawn.inBattle && <Chip tone="alert">In battle</Chip>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded border-2 border-deep-forest px-1.5 py-0.5 font-pixel text-[8px] text-deep-forest hover:bg-deep-forest hover:text-paper"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 font-vt text-lg leading-5 text-lcd-ink" aria-live="polite">
        {hints.length > 0 && <p className="text-ink">Field notes: {hints.join(". ")}.</p>}
        {observe.data && (
          <>
            <p className="text-success">
              {observe.data.firstObservation ? "New Registry entry: " : "Observation recorded: "}
              <Link className="underline" to={`/play/registry/${spawn.creatureId}`}>
                {observe.data.entry.name}
              </Link>
            </p>
            {observe.data.researcherExp.map((g, i) => (
              <p key={i} className="text-ink-muted">
                +{g.amount} {CATEGORY_NAMES[g.category]} researcher EXP ({g.reason})
              </p>
            ))}
            {observe.data.leadExp && (
              <p className="text-ink-muted">
                {observe.data.leadExp.name} gained {observe.data.leadExp.amount} EXP
                {observe.data.leadExp.newLevel !== null && ` and grew to level ${observe.data.leadExp.newLevel}`}.
              </p>
            )}
          </>
        )}
        {blocked && <p className="text-ink-muted">{blocked}</p>}
        {error && <p className="text-terracotta">{errorText(error)}</p>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <ConsoleButton face="X" className="px-3 py-2.5" disabled={!spawn.inRange || spawn.inBattle || busy} onClick={() => observe.mutate(spawn.id)}>
          Observe
        </ConsoleButton>
        {state.activeBattleId ? (
          <ConsoleButton face="A" className="px-3 py-2.5" onClick={() => navigate(`/play/battle/${state.activeBattleId}`)}>
            Return
          </ConsoleButton>
        ) : (
          <ConsoleButton face="A" className="px-3 py-2.5" disabled={!!blocked || busy} onClick={battle}>
            Battle
          </ConsoleButton>
        )}
      </div>
    </DialoguePanel>
  );
}
