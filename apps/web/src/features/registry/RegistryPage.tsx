import { Link } from "react-router";
import type { RegistryEntryView } from "@wildbound/shared";
import { registryNo, wildkinIcon } from "@/lib/assets.ts";
import { useRegistry } from "@/lib/queries.ts";
import { cn } from "@/lib/utils";

/**
 * The Registry list (think Pokédex): every species in registry-number order.
 * Unknown species show only a silhouette and their number.
 */
export function RegistryPage() {
  const { data, isPending, error } = useRegistry();

  return (
    <div className="flex-1 px-4 py-5">
      <div className="flex items-end justify-between">
        <h1 className="text-headline-lg text-ink">Registry</h1>
        {data && (
          <p className="text-sm text-ink-muted">
            <span className="font-bold text-ink">{data.observedCount}</span> seen ·{" "}
            <span className="font-bold text-ink">{data.capturedCount}</span> caught · {data.total} species
          </p>
        )}
      </div>

      {isPending && <p className="mt-6 text-ink-muted">Opening the ledger…</p>}
      {error && <p className="mt-6 text-terracotta">{error.message}</p>}

      <ul className="mt-4 grid grid-cols-3 gap-3">
        {data?.entries.map((e) => (
          <li key={e.creatureId}>
            <RegistryTile entry={e} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RegistryTile({ entry }: { entry: RegistryEntryView }) {
  const known = entry.status !== "unknown";
  const tile = (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border bg-paper p-2 text-center",
        entry.status === "captured" ? "border-field-gold" : "border-muted-paper",
      )}
    >
      {/* The filter goes on the image only, so the tile background stays paper-coloured. */}
      <div className="aspect-square w-full rounded-md bg-warm-paper p-1">
        <img
          src={wildkinIcon(entry.creatureId)}
          alt={known ? (entry.name ?? "") : "Unknown Wildkin"}
          className={cn("pixelated size-full", !known && "silhouette")}
        />
      </div>
      <span className="text-label-md text-ink-muted">{registryNo(entry.registryNumber)}</span>
      <span className="truncate font-serif text-sm text-ink">{known ? entry.name : "???"}</span>
    </div>
  );
  return known ? (
    <Link to={entry.creatureId} className="block focus-visible:outline-2 focus-visible:outline-primary-forest">
      {tile}
    </Link>
  ) : (
    tile
  );
}
