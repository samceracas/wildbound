import { Link } from "react-router";
import { GAME_RULES, type PoiType, type PoiView } from "@wildbound/shared";
import { Chip, DialoguePanel, errorText } from "@/components/field.tsx";
import { ConsoleButton } from "@/components/layout/Shell.tsx";
import { ApiError } from "@/lib/api.ts";
import { useCollectPoi, useVisitVet } from "@/lib/queries.ts";

const POI_LABELS: Record<PoiType, string> = {
  gate: "Gate",
  trail: "Trail",
  landmark: "Landmark",
  clearing: "Clearing",
  hollow: "Hollow",
  water: "Water",
  "research-station": "Research station",
  other: "Point of interest",
};

/**
 * Dialogue panel for a point of interest: the daily supply search everywhere,
 * plus the vet and assessments at field stations.
 */
export function PoiSheet({ poi, onClose }: { poi: PoiView; onClose: () => void }) {
  const collect = useCollectPoi();
  const vet = useVisitVet();
  const hasVet = poi.services.includes("vet");
  const hasAssessment = poi.services.includes("assessment");
  const busy = collect.isPending || vet.isPending;

  return (
    <DialoguePanel
      role="dialog"
      aria-label={poi.name}
      tag={hasVet ? "FIELD STATION" : "POINT OF INTEREST"}
      className="absolute inset-x-2 bottom-2 z-20 max-h-[calc(100%-1rem)]"
      bodyClassName="overflow-y-auto"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-pixel text-[11px] leading-4 text-deep-forest uppercase">{poi.name}</h2>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Chip>{POI_LABELS[poi.type]}</Chip>
            <Chip tone={poi.inRange ? "ok" : "default"}>{Math.round(poi.distanceM)} m away</Chip>
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
        {poi.description && <p className="text-ink">{poi.description}</p>}
        {!poi.inRange && <p className="text-ink-muted">Get within {GAME_RULES.interactRadiusM} m to use it.</p>}
        {collect.data && (
          <p className="text-success">
            Found:{" "}
            {collect.data.items.map((i) => `${i.quantity} ${i.name}${i.truncated ? ` (${i.truncated} did not fit)` : ""}`).join(", ") ||
              "nothing this time"}
            .
          </p>
        )}
        {collect.error && <p className="text-terracotta">{pickupError(collect.error)}</p>}
        {vet.data && (
          <>
            <p className="text-success">
              The vet treated {vet.data.healed} Wildkin. {vet.data.healed > 0 ? "Everyone is back to full strength." : ""}
            </p>
            {vet.data.untreated.map((u) => (
              <p key={u.wildkinId} className="text-ink-muted">
                {u.name} cannot be treated yet: {u.reason}
              </p>
            ))}
          </>
        )}
        {vet.error && <p className="text-terracotta">{errorText(vet.error)}</p>}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <ConsoleButton
          face="X"
          className="px-3 py-2.5"
          disabled={!poi.inRange || poi.pickedUpToday || busy || !!collect.data}
          onClick={() => collect.mutate(poi.id)}
        >
          {poi.pickedUpToday ? "Already searched today" : "Search for supplies"}
        </ConsoleButton>
        {hasVet && (
          <ConsoleButton face="A" className="px-3 py-2.5" disabled={!poi.inRange || busy} onClick={() => vet.mutate(poi.id)}>
            Visit the vet
          </ConsoleButton>
        )}
        {hasAssessment && (
          <Link
            to="/play/license"
            className="rounded-xl border-2 border-deep-forest bg-paper px-3 py-2 text-center font-pixel text-[9px] text-deep-forest uppercase hover:bg-deep-forest hover:text-paper"
          >
            Take an assessment ►
          </Link>
        )}
      </div>
    </DialoguePanel>
  );
}

function pickupError(error: Error): string {
  // Exercise #14: POST /pois/:poiId/collect answers 501 until it is built.
  if (error instanceof ApiError && error.status === 501) {
    return "Searching for supplies is not built yet (exercise #14 in apps/api/src/routes/game.ts). License rank-ups still grant items.";
  }
  return errorText(error);
}
