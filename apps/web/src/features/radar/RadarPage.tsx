import { useState } from "react";
import { Link } from "react-router";
import type { SpawnView } from "@wildbound/shared";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ApiError } from "@/lib/api.ts";
import { registryNo, wildkinIcon } from "@/lib/assets.ts";
import { useCapture, useGameState, useObserve, useRegistry } from "@/lib/queries.ts";
import { useLocation } from "../location/LocationProvider.tsx";
import { RadarMap } from "./RadarMap.tsx";

export function RadarPage() {
  const { status, fix } = useLocation();
  const state = useGameState(status === "active");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const spawns = state.data?.spawns ?? [];
  const selected = spawns.find((s) => s.id === selectedId) ?? null;
  // Show where the SERVER thinks you are; fall back to the raw fix until the first answer.
  const player = state.data?.position ?? fix;

  return (
    <div className="relative flex-1">
      <RadarMap player={player} spawns={spawns} selectedId={selectedId} onSelect={(s) => setSelectedId(s.id)} />

      {!selected && (
        <div className="absolute inset-x-3 bottom-3 z-10 rounded-lg border border-muted-paper bg-paper/95 px-4 py-3 text-sm text-ink">
          {state.isPending
            ? "Scanning the area…"
            : !state.data?.region
              ? "No surveyed habitat here. Head into a published region to find Wildkin."
              : spawns.length === 0
                ? "Nothing stirring nearby. Wildkin come and go with the weather and the time of day."
                : `${spawns.length} Wildkin nearby. Tap one to observe or capture it.`}
        </div>
      )}

      {selected && <SpawnSheet spawn={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

/** Bottom sheet for one spawn: Observe and Capture. */
function SpawnSheet({ spawn, onClose }: { spawn: SpawnView; onClose: () => void }) {
  const registry = useRegistry();
  const observe = useObserve();
  const capture = useCapture();
  const entry = registry.data?.entries.find((e) => e.creatureId === spawn.creatureId);
  const known = entry && entry.status !== "unknown";
  const busy = observe.isPending || capture.isPending;
  const error = observe.error ?? capture.error;

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-xl border-t border-muted-paper bg-paper p-5 shadow-card">
      <div className="flex items-start gap-4">
        <div className="size-16 shrink-0 rounded-md bg-warm-paper p-1">
          <img src={wildkinIcon(spawn.creatureId)} alt="" className={`pixelated size-full ${known ? "" : "silhouette"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-label-md text-ink-muted">{registryNo(spawn.registryNumber)}</p>
          <h2 className="font-serif text-2xl text-ink">{known ? entry.name : "Unidentified Wildkin"}</h2>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge variant={spawn.inRange ? "moss" : "outline"}>{Math.round(spawn.distanceM)} m away</Badge>
            {spawn.observed && <Badge variant="gold">Observed</Badge>}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
          Close
        </Button>
      </div>

      {!spawn.inRange && (
        <p className="mt-3 text-sm text-ink-muted">Get within 60 m to observe or capture. Walk toward the marker.</p>
      )}

      {observe.data && (
        <p className="mt-3 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          {observe.data.firstObservation ? "New Registry entry: " : "Observation recorded: "}
          <Link className="font-bold underline" to={`/play/registry/${spawn.creatureId}`}>
            {observe.data.entry.name}
          </Link>
        </p>
      )}
      {capture.data && (
        <p className="mt-3 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          {capture.data.success ? "Captured! " : capture.data.fled ? "It slipped away. " : "It broke free. "}
          {capture.data.capsulesLeft} capsules left.
        </p>
      )}
      {error && <p className="mt-3 rounded-md bg-terracotta/10 px-3 py-2 text-sm text-terracotta">{describe(error)}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" disabled={!spawn.inRange || busy} onClick={() => observe.mutate(spawn.id)}>
          Observe
        </Button>
        <Button disabled={!spawn.inRange || busy} onClick={() => capture.mutate(spawn.id)}>
          Capture
        </Button>
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
