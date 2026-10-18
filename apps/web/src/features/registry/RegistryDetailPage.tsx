import { ArrowLeft, Lock } from "lucide-react";
import { Link, useParams } from "react-router";
import type { RegistryEntryView } from "@wildbound/shared";
import { Badge } from "@/components/ui/badge.tsx";
import { registryNo, wildkinSprite } from "@/lib/assets.ts";
import { useRegistry } from "@/lib/queries.ts";

/**
 * One Registry entry. Observed: name, number, description, habitat.
 * Captured: also rarity, activity and skills (the server only sends those after a capture).
 */
export function RegistryDetailPage() {
  const { creatureId } = useParams();
  const { data, isPending } = useRegistry();
  const entry = data?.entries.find((e) => e.creatureId === creatureId);

  if (isPending) return <p className="p-6 text-ink-muted">Opening the ledger…</p>;
  if (!entry || entry.status === "unknown") {
    return (
      <div className="p-6">
        <BackLink />
        <p className="mt-6 text-ink-muted">You have not recorded this Wildkin yet.</p>
      </div>
    );
  }

  return (
    <article className="flex-1">
      <div className="bg-deep-forest px-4 pt-4 pb-6 text-paper">
        <BackLink className="text-paper/80" />
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-label-md text-paper/60">{registryNo(entry.registryNumber)}</p>
            <h1 className="text-display">{entry.name}</h1>
          </div>
          <Badge variant={entry.status === "captured" ? "gold" : "dark"} className="border border-paper/30">
            {entry.status}
          </Badge>
        </div>
        <img src={wildkinSprite(entry.creatureId)} alt="" className="pixelated mx-auto mt-4 size-48 rounded-lg bg-forest-slate/60" />
      </div>

      <div className="flex flex-col gap-4 px-4 py-5">
        <Section title="Field notes">
          <p className="text-ink">{entry.description}</p>
        </Section>
        <Section title="Habitat">
          <p className="text-ink">{entry.habitatSummary}</p>
        </Section>
        <Section title="Your records">
          <p className="text-sm text-ink-muted">
            Observed {entry.timesObserved}× · Captured {entry.timesCaptured}×
            {entry.firstObservedAt && ` · First seen ${new Date(entry.firstObservedAt).toLocaleDateString()}`}
          </p>
        </Section>

        {entry.status === "captured" ? <CapturedDetails entry={entry} /> : <LockedDetails />}
      </div>
    </article>
  );
}

/**
 * The capture-only part of the Registry: rarity, activity pattern and skills.
 *
 * ------------------------------------------------------------------------
 * TODO(you): build this section. `entry.rarity`, `entry.activityPattern` and
 * `entry.skills` are non-null here (status === "captured").
 * Suggested layout (match the Stitch Registry mockup):
 *  - a row of <Badge>s: rarity (variant "gold" for rare) and activity pattern
 *    (format "sheltering_by_day" as "Sheltering by day")
 *  - a "Skills" <Section> listing each skill's name (font-serif) and description;
 *    show a small "Proposed" badge when skill.canon === "proposed"
 * You will only see it after implementing capture on the API.
 * ------------------------------------------------------------------------
 */
function CapturedDetails({ entry }: { entry: RegistryEntryView }) {
  return (
    <Section title="Captured data">
      <pre className="overflow-x-auto rounded-md bg-warm-paper p-3 text-xs text-ink-muted">
        {JSON.stringify({ rarity: entry.rarity, activityPattern: entry.activityPattern, skills: entry.skills }, null, 2)}
      </pre>
    </Section>
  );
}

function LockedDetails() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-locked/50 p-4 text-sm text-ink-muted">
      <Lock className="size-5 shrink-0 text-locked" />
      Capture this Wildkin to unlock its rarity, activity pattern and skills.
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-muted-paper bg-paper p-4">
      <h2 className="text-label-md mb-2 text-ink-muted">{title}</h2>
      {children}
    </section>
  );
}

function BackLink({ className = "text-primary-forest" }: { className?: string }) {
  return (
    <Link to="/play/registry" className={`inline-flex items-center gap-1 text-label-lg ${className}`}>
      <ArrowLeft className="size-4" /> Registry
    </Link>
  );
}
