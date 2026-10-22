import { Lock } from "lucide-react";
import { Link, useParams } from "react-router";
import { APPROACH_NAMES, BODY_TRAIT_NAMES, CATEGORY_NAMES, TIME_OF_DAY, WEATHER, type FieldNotes, type RegistryEntryView } from "@wildbound/shared";
import { Badge } from "@/components/ui/badge.tsx";
import { FaceLetter } from "@/components/layout/Shell.tsx";
import { WildkinImage } from "@/components/WildkinImage.tsx";
import { useRegistry } from "@/lib/queries.ts";
import { cn } from "@/lib/utils";
import { TIME_LABEL, TimeIcon, WEATHER_LABEL, WeatherIcon } from "../game/environment.tsx";

/**
 * One Registry entry. Observed: name, number, description, habitat.
 * Captured: also rarity, activity and skills (the server only sends those after a capture).
 */
export function RegistryDetailPage() {
  const { creatureId } = useParams();
  const { data, isPending } = useRegistry();
  const entry = data?.entries.find((e) => e.creatureId === creatureId);

  if (isPending) return <p className="p-4 font-vt text-xl text-ink-muted">Opening the ledger…</p>;
  if (!entry || entry.status === "unknown") {
    return (
      <div className="p-3">
        <BackLink />
        <p className="mt-4 font-vt text-xl text-ink-muted">You have not recorded this Wildkin yet.</p>
      </div>
    );
  }

  const no = String(entry.registryNumber).padStart(3, "0");
  return (
    <article className="flex flex-1 flex-col gap-2.5 p-2.5">
      <BackLink />

      {/* The dossier card (Stitch screen 5, "Active dossier"). */}
      <section className="raised-panel p-2">
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-[#d4cca9] pb-1.5">
          <h1 className="font-pixel text-[11px] tracking-tight text-deep-forest uppercase">
            #{no} {entry.name}
          </h1>
          <Badge variant={entry.status === "captured" ? "moss" : "gold"} className="font-pixel text-[7px] tracking-normal">
            ● {entry.status === "captured" ? "Caught" : "Seen"}
          </Badge>
        </div>

        <div className="grid grid-cols-12 gap-2">
          <div className="inset-panel col-span-5 flex flex-col items-center justify-between border-2 border-[#867c64] bg-[#dcd5c2] p-1">
            <div className="flex w-full justify-between font-pixel text-[6px] text-[#716955]">
              <span>DATA</span>
              <span>No.{no}</span>
            </div>
            <div className="relative my-1 flex items-center justify-center">
              <span aria-hidden className="absolute size-20 rounded-full border border-success/40 bg-success/20" />
              <WildkinImage creatureId={entry.creatureId} kind="sprite" alt={entry.name ?? ""} className="pixelated relative size-28" />
            </div>
          </div>

          <div className="col-span-7 flex flex-col gap-1.5">
            <div className="inset-panel p-1.5 font-pixel text-[7px] leading-3 text-[#7d745f]">
              HABITAT: <span className="text-ink">{entry.habitatSummary}</span>
            </div>
            <p className="inset-panel bg-[#faf7ef] p-1.5 font-vt text-[17px] leading-[18px] text-deep-forest">
              “{entry.description}”
            </p>
          </div>
        </div>
      </section>

      <Section title="Your records">
        <p className="font-vt text-lg leading-5 text-ink">
          Observed {entry.timesObserved}× · Captured {entry.timesCaptured}×
          {entry.firstObservedAt && ` · First seen ${new Date(entry.firstObservedAt).toLocaleDateString()}`}
        </p>
      </Section>

      {entry.fieldNotes && <FieldNotesSection notes={entry.fieldNotes} />}

      {entry.status === "captured" ? <CapturedDetails entry={entry} /> : <LockedDetails />}
    </article>
  );
}

/**
 * The capture-only part of the Registry: rarity, activity pattern and skills.
 *
 * ------------------------------------------------------------------------
 * TODO(you): build this section. `entry.rarity`, `entry.activityPattern`,
 * `entry.skills` and `entry.statShape` are non-null here (status === "captured").
 * Suggested layout (match the Stitch Registry mockup):
 *  - a row of <Badge>s: rarity (variant "gold" for rare) and activity pattern
 *    (format "sheltering_by_day" as "Sheltering by day")
 *  - a "Skills" <Section> listing each skill's name (font-serif) and description;
 *    show a small "Proposed" badge when skill.canon === "proposed"
 *  - v0.3.0: a "Stat shape" <Section> with one row per `entry.statShape` item,
 *    e.g. "Speed: Signature strength" (the species' shape descriptors; raw stat
 *    numbers are never sent to players). Until you build it, the descriptors
 *    show up only in the JSON dump below.
 * Capture a Wildkin through a battle (radar, Battle, weaken it, use a capsule) to see it.
 * ------------------------------------------------------------------------
 */
function CapturedDetails({ entry }: { entry: RegistryEntryView }) {
  return (
    <Section title="Captured data">
      <pre className="overflow-x-auto rounded-md bg-warm-paper p-3 text-xs text-ink-muted">
        {JSON.stringify({ rarity: entry.rarity, activityPattern: entry.activityPattern, skills: entry.skills, statShape: entry.statShape }, null, 2)}
      </pre>
    </Section>
  );
}

/** What the player has learned about an observed species: category, body traits and matchups, conditions, phenotypes. */
function FieldNotesSection({ notes }: { notes: FieldNotes }) {
  return (
    <Section title="Field notes">
      <p className="font-vt text-lg leading-5 text-ink">
        Category: {notes.category === "TBD" ? "Unclassified" : CATEGORY_NAMES[notes.category]}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5 font-vt text-lg leading-5 text-ink">
        {notes.bodyTraits.map((t) => (
          <li key={t.trait}>
            <b className="font-pixel text-[8px] text-deep-forest uppercase">{BODY_TRAIT_NAMES[t.trait]}</b> · weak to{" "}
            {t.weakTo ? APPROACH_NAMES[t.weakTo] : "?"} · resists {t.resists ? APPROACH_NAMES[t.resists] : "?"}
          </li>
        ))}
      </ul>
      <p className="mt-2 font-pixel text-[6px] text-ink-muted uppercase">Observed in</p>
      <div className="mt-1 grid grid-cols-4 gap-1" aria-label="Times of day observed">
        {TIME_OF_DAY.map((t) => (
          <ConditionCell key={t} seen={notes.timesOfDay.includes(t)} label={TIME_LABEL[t]}>
            <TimeIcon timeOfDay={t} className="size-3.5" />
          </ConditionCell>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-5 gap-1" aria-label="Weathers observed">
        {WEATHER.map((w) => (
          <ConditionCell key={w} seen={notes.weathers.includes(w)} label={WEATHER_LABEL[w]}>
            <WeatherIcon weather={w} className="size-3.5" />
          </ConditionCell>
        ))}
      </div>
      {notes.phenotypes.length > 0 && (
        <p className="mt-2 font-vt text-lg leading-5 text-ink">Recorded: {notes.phenotypes.join(", ")}</p>
      )}
    </Section>
  );
}

function ConditionCell({ seen, label, children }: { seen: boolean; label: string; children: React.ReactNode }) {
  return (
    <span
      title={`${label}: ${seen ? "observed" : "not yet"}`}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded border px-0.5 py-1 font-pixel text-[5px] uppercase",
        seen ? "border-success bg-success/15 text-success" : "border-dashed border-screen-edge text-ink-muted/60",
      )}
    >
      {children}
      {label}
      <span className="sr-only">{seen ? "observed" : "not yet observed"}</span>
    </span>
  );
}

function LockedDetails() {
  return (
    <div className="flex items-center gap-3 rounded-md border-2 border-dashed border-screen-edge bg-screen-inset/60 p-3 font-vt text-lg leading-5 text-ink-muted">
      <Lock className="size-5 shrink-0 text-locked" aria-hidden />
      Capture this Wildkin to unlock its rarity, activity pattern, skills and stat shape.
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-screen-edge bg-paper p-2.5">
      <h2 className="mb-1.5 font-pixel text-[7px] text-ink-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

function BackLink() {
  return (
    <Link
      to="/play/registry"
      className="inline-flex w-fit items-center gap-1 rounded border-2 border-deep-forest bg-paper px-2 py-1 font-pixel text-[8px] text-deep-forest uppercase hover:bg-deep-forest hover:text-paper"
    >
      <FaceLetter face="B" className="size-4 text-[7px]" /> Back to registry
    </Link>
  );
}
