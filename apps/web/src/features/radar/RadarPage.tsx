import { useCallback, useState } from "react";
import { Link } from "react-router";
import { GAME_RULES, type GameStateResponse, type SpawnView } from "@wildbound/shared";
import { ConsoleButton } from "@/components/layout/Shell.tsx";
import { ApiError } from "@/lib/api.ts";
import { registryNo, wildkinIcon } from "@/lib/assets.ts";
import { useCapture, useGameState, useObserve, useRegistry } from "@/lib/queries.ts";
import { cn } from "@/lib/utils";
import { useLocation, type Fix } from "../location/LocationProvider.tsx";
import { RadarMap } from "./RadarMap.tsx";

/** Layout: Stitch screen 3 "Radar" (patches/0.1.0/mockups/3-radar.html). */
export function RadarPage() {
  const { status, fix } = useLocation();
  const state = useGameState(status === "active");
  const registry = useRegistry();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const spawns = state.data?.spawns ?? [];
  const selected = spawns.find((s) => s.id === selectedId) ?? null;
  // Show where the SERVER thinks you are; fall back to the raw fix until the first answer.
  const player = state.data?.position ?? fix;

  const entries = registry.data?.entries;
  const labelFor = useCallback(
    (s: SpawnView) => {
      const entry = entries?.find((e) => e.creatureId === s.creatureId);
      return entry?.name ?? `??? ${registryNo(s.registryNumber)}`;
    },
    [entries],
  );

  return (
    <div className="flex flex-1 flex-col p-2">
      <div className="relative flex flex-1 flex-col overflow-hidden rounded-xl border border-ink/15 bg-paper">
        <div className="z-20 flex items-center justify-between gap-2 border-b border-ink/10 bg-screen-panel px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="flex size-3.5 shrink-0 items-center justify-center rounded bg-primary-forest font-pixel text-[8px] text-paper">
              +
            </span>
            <h1 className="truncate font-pixel text-[8px] leading-3 text-ink uppercase">
              Sector: {state.data?.habitat?.name ?? state.data?.region?.name ?? "unsurveyed"}
            </h1>
          </div>
          {player && (
            <p className="shrink-0 font-vt text-sm leading-none text-primary-forest">
              {player.lat.toFixed(3)}°N · {player.lng.toFixed(3)}°E
            </p>
          )}
        </div>

        <div className="relative flex-1">
          <RadarMap
            player={player}
            accuracy={fix}
            spawns={spawns}
            selectedId={selectedId}
            onSelect={(s) => setSelectedId(s.id)}
            labelFor={labelFor}
          />
          {selected && <SpawnSheet spawn={selected} name={labelFor(selected)} onClose={() => setSelectedId(null)} />}
        </div>

        <div className="z-20 flex items-center justify-between gap-3 border-t border-ink/10 bg-screen-panel px-3 py-1.5">
          <p className="min-w-0 font-vt text-lg leading-5 text-ink" role="status">
            {radarStatus(state, fix)}
          </p>
          {fix && (
            <span
              className={cn(
                "shrink-0 font-pixel text-[7px]",
                fix.accuracy <= GAME_RULES.maxAccuracyM ? "text-ink-muted" : "text-terracotta",
              )}
              title={`Fixes worse than ±${GAME_RULES.maxAccuracyM} m are ignored`}
            >
              ACC ±{Math.round(fix.accuracy)}/{GAME_RULES.maxAccuracyM}M
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One line explaining the radar. The server only resolves a region from a
 * position it accepted recently, so "no region" has several causes; name the
 * real one instead of blaming the map.
 */
function radarStatus(state: { isPending: boolean; error: Error | null; data?: GameStateResponse }, fix: Fix | null): string {
  if (state.isPending) return "Scanning the area…";
  if (!state.data) return `Can't reach the survey server${state.error ? ` (${state.error.message})` : ""}. Retrying…`;
  const { position, environment, region, lockedUntil, spawns } = state.data;
  // environment is null whenever the server has no usable position for us.
  if (!position || !environment) {
    if (lockedUntil) return "Survey paused after impossible GPS jumps. It resumes shortly.";
    if (fix && fix.accuracy > GAME_RULES.maxAccuracyM) {
      return `GPS too imprecise (±${Math.round(fix.accuracy)} m, need ±${GAME_RULES.maxAccuracyM} m). Step outside or turn on precise location.`;
    }
    return position ? "Your last position is out of date. Waiting for a fresh GPS fix…" : "Waiting for your first GPS fix to be accepted…";
  }
  if (!region) return "No surveyed habitat here. Head into a published region to find Wildkin.";
  if (spawns.length === 0) return "Nothing stirring nearby. Wildkin come and go with the weather and time of day.";
  return `${spawns.length} Wildkin nearby. Tap one to observe or capture it.`;
}

/** Dialogue panel for one spawn: Observe and Capture. */
function SpawnSheet({ spawn, name, onClose }: { spawn: SpawnView; name: string; onClose: () => void }) {
  const registry = useRegistry();
  const observe = useObserve();
  const capture = useCapture();
  const entry = registry.data?.entries.find((e) => e.creatureId === spawn.creatureId);
  const known = entry && entry.status !== "unknown";
  const busy = observe.isPending || capture.isPending;
  const error = observe.error ?? capture.error;

  return (
    <div
      role="dialog"
      aria-label={name}
      className="absolute inset-x-2 bottom-2 z-20 rounded-md border-4 border-[#143224] bg-[#f8fbf4] p-3 pt-4 shadow-[3px_3px_0_#27533c]"
    >
      <span className="absolute -top-2.5 left-3 rounded-sm bg-[#143224] px-1.5 py-0.5 font-pixel text-[7px] text-[#86efac]">
        {spawn.inRange ? "IN RANGE" : "SIGHTING"}
      </span>
      <div className="flex items-start gap-3">
        <div className="relative flex size-16 shrink-0 items-center justify-center rounded border-2 border-[#867c64] bg-screen-inset">
          <span aria-hidden className="absolute size-12 rounded-full bg-success/20" />
          <img src={wildkinIcon(spawn.creatureId)} alt="" className={cn("pixelated relative size-14", !known && "silhouette")} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-pixel text-[8px] text-ink-muted">{registryNo(spawn.registryNumber)}</p>
          <h2 className="mt-1 truncate font-pixel text-[12px] leading-4 text-deep-forest uppercase">
            {known ? entry.name : "Unidentified"}
          </h2>
          <div className="mt-1.5 flex flex-wrap gap-1 font-pixel text-[7px] uppercase">
            <span className={cn("rounded border px-1.5 py-0.5", spawn.inRange ? "border-success bg-success/15 text-success" : "border-screen-edge text-ink-muted")}>
              {Math.round(spawn.distanceM)} m away
            </span>
            {spawn.observed && <span className="rounded border border-[#b08a3a] bg-field-gold/30 px-1.5 py-0.5 text-ink">Observed</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded border-2 border-[#143224] px-1.5 py-0.5 font-pixel text-[8px] text-[#143224] hover:bg-[#143224] hover:text-paper"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 font-vt text-lg leading-5 text-lcd-ink" aria-live="polite">
        {!spawn.inRange && <p>Get within 60 m to observe or capture. Walk toward the marker.</p>}
        {observe.data && (
          <p className="text-success">
            {observe.data.firstObservation ? "New Registry entry: " : "Observation recorded: "}
            <Link className="underline" to={`/play/registry/${spawn.creatureId}`}>
              {observe.data.entry.name}
            </Link>
          </p>
        )}
        {capture.data && (
          <p className="text-success">
            {capture.data.success ? "Captured! " : capture.data.fled ? "It slipped away. " : "It broke free. "}
            {capture.data.capsulesLeft} capsules left.
          </p>
        )}
        {error && <p className="text-terracotta">{describe(error)}</p>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <ConsoleButton face="X" className="px-3 py-2.5" disabled={!spawn.inRange || busy} onClick={() => observe.mutate(spawn.id)}>
          Observe
        </ConsoleButton>
        <ConsoleButton face="A" className="px-3 py-2.5" disabled={!spawn.inRange || busy} onClick={() => capture.mutate(spawn.id)}>
          Capture
        </ConsoleButton>
      </div>
    </div>
  );
}

function describe(error: Error): string {
  if (error instanceof ApiError && error.status === 501) {
    return "Capturing isn't built yet. Implement the TODO(you) in apps/api/src/routes/game.ts.";
  }
  return error.message;
}
