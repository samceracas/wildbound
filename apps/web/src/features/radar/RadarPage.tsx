import { useCallback, useEffect, useState } from "react";
import { GAME_RULES, type GameStateResponse, type SpawnView } from "@wildbound/shared";
import { registryNo } from "@/lib/assets.ts";
import { useGameState, useRegistry } from "@/lib/queries.ts";
import { cn } from "@/lib/utils";
import { useLocation, type Fix } from "../location/LocationProvider.tsx";
import { PoiSheet } from "./PoiSheet.tsx";
import { RadarMap } from "./RadarMap.tsx";
import { SpawnSheet } from "./SpawnSheet.tsx";

/** Layout: Stitch screen 3 "Radar" (patches/0.1.0/mockups/3-radar.html). */
export function RadarPage() {
  const { status, fix } = useLocation();
  const state = useGameState(status === "active");
  const registry = useRegistry();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  /** Short message over the map, e.g. when the selected Wildkin wanders off. */
  const [notice, setNotice] = useState<string | null>(null);

  const spawns = state.data?.spawns ?? [];
  const pois = state.data?.pois ?? [];
  const selected = spawns.find((s) => s.id === selectedId) ?? null;
  const selectedPoi = pois.find((p) => p.id === selectedPoiId) ?? null;

  // Spawns wander server-side and despawn past the spawn radius: drop a selection
  // whose spawn is gone instead of leaving a stale sheet open.
  useEffect(() => {
    const data = state.data;
    if (!selectedId || !data || data.spawns.some((s) => s.id === selectedId)) return;
    setSelectedId(null);
    // With no usable position every spawn vanishes at once; the status line explains that.
    if (data.environment) setNotice("It wandered off.");
  }, [selectedId, state.data]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
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
          {state.data?.habitatLocked ? (
            <p className="shrink-0 rounded-sm bg-terracotta px-1 py-0.5 font-pixel text-[6px] leading-[9px] text-paper uppercase">
              {state.data.habitatLocked}
            </p>
          ) : player && (
            <p className="shrink-0 font-vt text-sm leading-none text-primary-forest">
              {player.lat.toFixed(3)}°N · {player.lng.toFixed(3)}°E
            </p>
          )}
        </div>

        <div className="relative flex-1">
          <RadarMap
            player={player}
            spawns={spawns}
            selectedId={selectedId}
            onSelect={(s) => {
              setSelectedId(s.id);
              setSelectedPoiId(null);
              setNotice(null);
            }}
            labelFor={labelFor}
            pois={pois}
            selectedPoiId={selectedPoiId}
            onSelectPoi={(p) => {
              setSelectedPoiId(p.id);
              setSelectedId(null);
              setNotice(null);
            }}
          />
          {selected && state.data && (
            <SpawnSheet spawn={selected} name={labelFor(selected)} state={state.data} onClose={() => setSelectedId(null)} />
          )}
          {selectedPoi && <PoiSheet poi={selectedPoi} onClose={() => setSelectedPoiId(null)} />}
          {!selected && !selectedPoi && notice && (
            <p
              role="status"
              className="absolute inset-x-2 bottom-2 z-20 rounded-md border-4 border-deep-forest bg-paper px-3 py-2 font-vt text-lg leading-5 text-lcd-ink shadow-[3px_3px_0_var(--primary-forest)]"
            >
              {notice}
            </p>
          )}
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
  if (state.data.habitatLocked) return `${spawns.length} Wildkin nearby. Restricted zone: observe only.`;
  return `${spawns.length} Wildkin nearby. Tap one to observe or battle it.`;
}

