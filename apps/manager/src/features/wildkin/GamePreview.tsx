import {
  APPROACH_NAMES,
  CATEGORY_NAMES,
  STAT_BUDGET,
  powerWord,
  statTotal,
  type WildkinArtInfo,
  type WildkinEntryData,
} from "@wildbound/shared";
import { DicesIcon, GamepadIcon, PawPrintIcon, SwordsIcon } from "lucide-react";
import { useState } from "react";
import { useWatch, type Control } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { artUrl } from "@/lib/api";
import { rollSample, SAMPLE_LEVEL, statShape, traitMatchups, type SampleIndividual } from "@/lib/battle-preview";
import { cn } from "@/lib/utils";

/**
 * Live preview of how the Wildkin looks in the game (apps/web), drawn from the
 * form's *current* values and the saved art. It only uses the fields that
 * publishing copies to the game (marked "In game" on the form), so it doubles
 * as a guide to what players actually see.
 *
 * The look copies the game's "Field Nav" console (apps/web/src/styles.css,
 * RegistryPage / RegistryDetailPage / RadarMap); colors are hard-coded here
 * because the manager has its own dark theme.
 */

type Tab = "dossier" | "row" | "radar";
const TABS: { id: Tab; label: string }[] = [
  { id: "dossier", label: "Registry entry" },
  { id: "row", label: "Registry list" },
  { id: "radar", label: "Radar" },
];

const C = {
  forest: "#183f36",
  ink: "#24302d",
  inkMuted: "#64706a",
  paper: "#fffdf7",
  screen: "#f6f3e7",
  panel: "#f0ebe0",
  inset: "#e7e1d1",
  edge: "#cec6b3",
  gold: "#d5a84c",
  moss: "#6f8f5f",
};

export function GamePreview({
  control,
  id,
  art,
  publishedAt,
  edited,
}: {
  control: Control<WildkinEntryData>;
  id: string | null;
  art: WildkinArtInfo | null;
  publishedAt: string | null;
  edited: boolean;
}) {
  const [tab, setTab] = useState<Tab>("dossier");
  const [name, registryNumber, registryDescription, habitatSummary, rarity, activityPattern, skills] = useWatch({
    control,
    name: ["name", "registryNumber", "registryDescription", "habitatSummary", "rarity", "activityPattern", "skills"],
  });
  const no = Number.isFinite(registryNumber) ? String(registryNumber).padStart(3, "0") : "???";

  return (
    <section className="rounded-lg border border-line bg-panel">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <GamepadIcon className="size-4 text-accent" />
        <h2 className="font-serif text-base">In-game preview</h2>
      </header>
      <div className="space-y-3 p-4">
        <div className="flex gap-1 rounded-md bg-field p-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 rounded px-2 py-1 text-xs",
                tab === t.id ? "bg-panel-2 text-fg" : "text-muted hover:text-fg",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* the game's paper "screen" */}
        <div className="game-screen rounded-md p-2.5" style={{ background: C.screen, border: `2px solid ${C.edge}`, color: C.ink }}>
          {tab === "dossier" ? (
            <div className="space-y-2">
              <div className="rounded-md p-2" style={{ background: C.panel, border: `2px solid ${C.edge}` }}>
                <div className="mb-2 flex items-center justify-between gap-2 pb-1.5" style={{ borderBottom: "1px solid #d4cca9" }}>
                  <h3 className="font-pixel text-[10px] uppercase" style={{ color: C.forest }}>
                    #{no} {name || "???"}
                  </h3>
                  <span className="rounded-full px-1.5 py-0.5 font-pixel text-[7px]" style={{ background: C.gold, color: C.forest }}>
                    ● Seen
                  </span>
                </div>
                <div className="grid grid-cols-12 gap-2">
                  <div
                    className="col-span-5 flex flex-col items-center justify-between p-1"
                    style={{ background: "#dcd5c2", border: "2px solid #867c64" }}
                  >
                    <div className="flex w-full justify-between font-pixel text-[6px]" style={{ color: "#716955" }}>
                      <span>DATA</span>
                      <span>No.{no}</span>
                    </div>
                    <div className="relative my-1 flex items-center justify-center">
                      <span aria-hidden className="absolute size-16 rounded-full" style={{ background: "#4f8a6833", border: "1px solid #4f8a6866" }} />
                      <Art id={id} art={art} kind="sprite" size={96} />
                    </div>
                  </div>
                  <div className="col-span-7 flex flex-col gap-1.5">
                    <div className="p-1.5 font-pixel text-[7px] leading-3" style={{ background: C.inset, color: "#7d745f" }}>
                      HABITAT: <span style={{ color: C.ink }}>{habitatSummary || <Missing>habitat summary</Missing>}</span>
                    </div>
                    <p className="p-1.5 font-vt text-[16px] leading-[17px]" style={{ background: "#faf7ef", color: C.forest }}>
                      {registryDescription ? `“${registryDescription}”` : <Missing>registry description</Missing>}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-md p-2" style={{ background: C.paper, border: `1px solid ${C.edge}` }}>
                <p className="mb-1 font-pixel text-[7px] uppercase" style={{ color: C.inkMuted }}>
                  Unlocked after capture
                </p>
                <div className="mb-1 flex flex-wrap gap-1 font-vt text-[15px]">
                  <Chip>{rarity === "TBD" ? "Rarity TBD" : rarity}</Chip>
                  <Chip>{activityPattern === "TBD" ? "Activity TBD" : activityPattern.replace(/_/g, " ")}</Chip>
                </div>
                {skills.length ? (
                  <ul className="space-y-0.5 font-vt text-[15px] leading-4">
                    {skills.map((s, i) => (
                      <li key={i}>
                        <span className="font-serif text-[12px] font-bold">{s.name || "Unnamed skill"}</span>
                        {s.canon === "proposed" ? <span style={{ color: C.inkMuted }}> (proposed)</span> : null}: {s.description}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-vt text-[15px]" style={{ color: C.inkMuted }}>
                    No skills yet.
                  </p>
                )}
              </div>
            </div>
          ) : tab === "row" ? (
            <div className="space-y-1.5">
              <RegistryRow no={no} name={name} id={id} art={art} habitat={habitatSummary} known />
              <RegistryRow no={no} name={name} id={id} art={art} habitat={habitatSummary} known={false} />
              <p className="font-vt text-[14px] leading-4" style={{ color: C.inkMuted }}>
                Top: after observing. Bottom: before (silhouette, number only).
              </p>
            </div>
          ) : (
            <div className="relative h-44 overflow-hidden rounded" style={{ background: "#dfe8d4" }}>
              <span
                aria-hidden
                className="absolute top-1/2 left-1/2 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ border: `1px dashed ${C.forest}`, background: "#1f6b5714" }}
              />
              <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1">
                <span className="rounded px-1.5 py-0.5 font-pixel text-[7px] text-white shadow" style={{ background: "#4c7a5ccc" }}>
                  {name || "???"}
                </span>
                <div className="flex size-11 items-center justify-center rounded-full bg-white shadow">
                  <Art id={id} art={art} kind="icon" size={36} />
                </div>
              </div>
              <span className="absolute right-2 bottom-1 font-vt text-[13px]" style={{ color: C.inkMuted }}>
                Marker after observing (before: “??? No. {no}”)
              </span>
            </div>
          )}
        </div>

        <BattlePreview control={control} />

        <p className="text-xs text-faint">
          Uses the form as you type and the saved art.{" "}
          {publishedAt
            ? edited
              ? "Players still see the last published version until you publish again."
              : "This is what players see now."
            : "Players see it once you publish."}
        </p>
      </div>
    </section>
  );
}

function RegistryRow({
  no,
  name,
  id,
  art,
  habitat,
  known,
}: {
  no: string;
  name: string;
  id: string | null;
  art: WildkinArtInfo | null;
  habitat: string;
  known: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md p-1.5" style={{ background: C.paper, border: `1px solid ${C.edge}` }}>
      <div className="flex size-10 items-center justify-center rounded" style={{ background: C.inset }}>
        <Art id={id} art={art} kind="icon" size={36} silhouette={!known} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-pixel text-[8px]" style={{ color: C.inkMuted }}>
          No. {no}
        </p>
        <p className="truncate font-vt text-[17px] leading-5" style={{ color: C.forest }}>
          {known ? name || "???" : "???"}
        </p>
        {known ? (
          <p className="truncate font-vt text-[14px] leading-4" style={{ color: C.inkMuted }}>
            {habitat}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Art({
  id,
  art,
  kind,
  size,
  silhouette,
}: {
  id: string | null;
  art: WildkinArtInfo | null;
  kind: "icon" | "sprite";
  size: number;
  silhouette?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const has = id && art && (kind === "icon" ? art.icon : art.sprite) && !broken;
  if (!has) return <PawPrintIcon style={{ width: size * 0.5, height: size * 0.5, color: "#a39a83" }} />;
  return (
    <img
      src={artUrl(id, kind, art.version)}
      alt=""
      width={size}
      height={size}
      className="pixelated relative"
      style={silhouette ? { filter: "brightness(0) opacity(0.55)" } : undefined}
      onError={() => setBroken(true)}
    />
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded px-1.5 capitalize" style={{ background: C.inset, border: `1px solid ${C.edge}` }}>
      {children}
    </span>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#c96a5b" }}>(no {children} yet)</span>;
}

// ---------------------------------------------------------------- battle & genetics

/**
 * Authoring view of §9 (manager tokens, not the game's look): stat shape bars
 * with descriptors, category and body-trait matchups, attacks with their power
 * word, and a locally rolled level 50 sample. The game never shows raw numbers;
 * this panel does, because it is for the author.
 */
function BattlePreview({ control }: { control: Control<WildkinEntryData> }) {
  const [category, bodyTraits, baseStats, attacks, genePool] = useWatch({
    control,
    name: ["category", "bodyTraits", "baseStats", "attacks", "genePool"],
  });
  const [sample, setSample] = useState<SampleIndividual | null>(null);
  const shape = statShape(baseStats);
  const total = baseStats ? statTotal(baseStats) : null;
  const matchups = traitMatchups(bodyTraits);

  return (
    <div className="space-y-3 rounded-md border border-line bg-field/50 p-3 text-xs">
      <div className="flex items-center gap-2">
        <SwordsIcon className="size-3.5 text-accent" />
        <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Battle &amp; genetics</h3>
        <span className="ml-auto rounded border border-line px-1.5 py-0.5 text-muted">
          {category === "TBD" ? "Category TBD" : CATEGORY_NAMES[category]}
        </span>
      </div>

      {/* stat shape */}
      {shape ? (
        <div className="space-y-1">
          {shape.map((row) => (
            <div key={row.key} className="grid grid-cols-[3.5rem_minmax(0,1fr)_2rem_7.5rem] items-center gap-2">
              <span className="text-muted">{row.label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-panel-2">
                <div
                  className={cn("h-full rounded-full", row.descriptor === "Weak point" ? "bg-line-strong" : "bg-accent")}
                  style={{ width: `${row.fraction * 100}%` }}
                />
              </div>
              <span className="text-right font-mono text-fg tabular-nums">{Number.isFinite(row.base) ? row.base : "?"}</span>
              <span className="truncate text-faint">{row.descriptor}</span>
            </div>
          ))}
          {total !== null && total !== STAT_BUDGET ? (
            <p className="text-danger">
              Total {Number.isFinite(total) ? total : "?"}, needs exactly {STAT_BUDGET}.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-faint">Base stats not set (the game would use 75 / 75 / 75 / 75).</p>
      )}

      {/* body traits */}
      {matchups.length ? (
        <ul className="space-y-1">
          {matchups.map((m) => (
            <li key={m.trait}>
              <span className="font-medium text-fg">{m.label}</span>
              <span className="text-muted">
                : weak to <span className="text-warning">{m.weakTo}</span>, resists <span className="text-info">{m.resists}</span>
              </span>
              <p className="text-faint">{m.reason}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-faint">No body traits yet.</p>
      )}

      {/* attacks */}
      {attacks.length ? (
        <ul className="space-y-0.5">
          {attacks.map((a, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="font-medium text-fg">{a.name || "Unnamed attack"}</span>
              <span className="text-muted">
                {APPROACH_NAMES[a.approach]}, {Number.isFinite(a.power) ? `${powerWord(a.power)} (${a.power})` : "power ?"}
              </span>
              {a.canon === "proposed" ? <span className="text-faint">proposed</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-faint">No attacks yet (the game would fall back to Lunge).</p>
      )}

      {/* sample */}
      <div className="space-y-2 border-t border-line pt-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setSample(rollSample(baseStats, genePool))}>
            <DicesIcon /> Roll a sample
          </Button>
          <span className="text-faint">Level {SAMPLE_LEVEL}, no habitat (gene pool defaults).</span>
        </div>
        {sample ? (
          <div className="space-y-1.5">
            <p className="text-muted">
              <span className="text-fg">{sample.buildName}</span>, <span className="text-fg">{sample.temperamentName}</span>
              {sample.marking ? (
                <>
                  , <span className="text-gold">{sample.marking}</span>
                </>
              ) : null}
              <span className="ml-1.5 font-mono text-faint">
                {sample.genotype.build} {sample.genotype.temperament} {sample.genotype.marking}
              </span>
            </p>
            <table className="w-full">
              <thead>
                <tr className="text-left text-faint">
                  <th className="font-normal">Stat</th>
                  <th className="text-right font-normal">Lv {sample.level}</th>
                  <th className="pl-3 font-normal">Grade</th>
                  <th className="font-normal">Vigor</th>
                </tr>
              </thead>
              <tbody>
                {sample.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="text-muted">{r.label}</td>
                    <td className="text-right font-mono text-fg tabular-nums">{r.value}</td>
                    <td className="pl-3 text-fg">{r.grade}</td>
                    <td className="text-muted">
                      {r.vigorWord} <span className="font-mono text-faint">({r.vigor})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sample.usedFallbackStats ? <p className="text-faint">Rolled on the 75 / 75 / 75 / 75 fallback.</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
