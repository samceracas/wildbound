import { useState } from "react";
import { Link } from "react-router";
import type { RegistryEntryView, RegistryStatus } from "@wildbound/shared";
import { ScreenTitle } from "@/components/layout/Shell.tsx";
import { WildkinImage } from "@/components/WildkinImage.tsx";
import { useRegistry } from "@/lib/queries.ts";
import { cn } from "@/lib/utils";

const FILTERS: { id: "all" | RegistryStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "captured", label: "Caught" },
  { id: "observed", label: "Seen" },
  { id: "unknown", label: "Unknown" },
];

/**
 * The Registry list (think Pokédex): every species in registry-number order.
 * Unknown species show only a silhouette and their number.
 * Layout: the "Index roster" of Stitch screen 5 (patches/0.1.0/mockups/5-registry.html).
 */
export function RegistryPage() {
  const { data, isPending, error } = useRegistry();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");

  const entries = data?.entries.filter((e) => filter === "all" || e.status === filter) ?? [];
  const pct = (n: number) => (data && data.total > 0 ? `${(n / data.total) * 100}%` : "0%");

  return (
    <div className="flex flex-1 flex-col gap-2.5 p-2.5">
      <section>
        <ScreenTitle
          title="Mabunyi registry"
          right={
            data && (
              <span className="inset-panel shrink-0 px-2 py-0.5 font-pixel text-[8px] text-ink-muted">
                LOGGED: <b className="text-deep-forest">{data.observedCount}</b>/{data.total}
              </span>
            )
          }
        />
        {data && (
          <div
            className="inset-panel mt-2 flex h-2 overflow-hidden"
            role="img"
            aria-label={`${data.capturedCount} caught, ${data.observedCount - data.capturedCount} seen, of ${data.total}`}
          >
            <div className="h-full border-r border-[#2d6b52] bg-success" style={{ width: pct(data.capturedCount) }} />
            <div className="h-full bg-field-gold" style={{ width: pct(data.observedCount - data.capturedCount) }} />
          </div>
        )}
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1 font-pixel text-[7px] uppercase" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-[3px] px-2 py-1.5",
                filter === f.id
                  ? "border-b-2 border-chassis-deep bg-deep-forest text-field-gold"
                  : "border border-screen-edge bg-[#e4ddcc] text-deep-forest hover:bg-[#d8d0be]",
              )}
            >
              {filter === f.id && <span aria-hidden className="size-1.5 rounded-full bg-field-gold" />}
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <section className="raised-panel flex-1 p-2">
        <div className="mb-1.5 flex justify-between px-1 font-pixel text-[7px] text-ink-muted uppercase">
          <span>Index roster</span>
          <span>Status / discovery</span>
        </div>
        {isPending && <p className="p-2 font-vt text-xl text-ink-muted">Opening the ledger…</p>}
        {error && <p className="p-2 font-vt text-xl text-terracotta">{error.message}</p>}
        <ul className="flex flex-col gap-1.5">
          {entries.map((e) => (
            <li key={e.creatureId}>
              <RosterRow entry={e} />
            </li>
          ))}
        </ul>
        {data && entries.length === 0 && <p className="p-2 font-vt text-xl text-ink-muted">No entries here yet.</p>}
      </section>
    </div>
  );
}

const STATUS_PILL: Record<RegistryStatus, { label: string; className: string }> = {
  captured: { label: "Caught", className: "border-success bg-success/15 text-success" },
  observed: { label: "Seen", className: "border-[#b08a3a] bg-field-gold/25 text-[#7c5900]" },
  unknown: { label: "Locked", className: "border-screen-edge bg-screen-inset text-locked" },
};

function RosterRow({ entry }: { entry: RegistryEntryView }) {
  const known = entry.status !== "unknown";
  const pill = STATUS_PILL[entry.status];
  const row = (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-2 py-1.5",
        known ? "border-screen-edge bg-paper hover:border-primary-forest" : "border-dashed border-screen-edge bg-screen-inset/60",
      )}
    >
      <span className="inset-panel shrink-0 px-1 py-0.5 font-pixel text-[7px] text-ink-muted">#{String(entry.registryNumber).padStart(3, "0")}</span>
      {/* The filter goes on the image only, so the row background stays paper-coloured. */}
      <WildkinImage
        creatureId={entry.creatureId}
        alt={known ? "" : "Unknown Wildkin"}
        className={cn("pixelated size-9 shrink-0", !known && "silhouette")}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-pixel text-[9px] leading-3 uppercase", known ? "text-deep-forest" : "text-locked")}>
          {known ? entry.name : "Unknown specimen"}
        </p>
        <p className={cn("truncate font-vt text-lg leading-5", known ? "text-ink" : "text-locked")}>
          {known ? entry.habitatSummary : "Habitat unsurveyed"}
        </p>
      </div>
      <span className={cn("shrink-0 rounded border px-1.5 py-1 font-pixel text-[7px] uppercase", pill.className)}>{pill.label}</span>
    </div>
  );
  return known ? (
    <Link to={entry.creatureId} className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary-forest">
      {row}
    </Link>
  ) : (
    row
  );
}
