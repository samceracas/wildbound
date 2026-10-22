import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { WorldContext } from "@wildbound/shared";
import { NEARBY_POI_MAX_RADIUS_M, TIME_OF_DAY, WEATHER } from "@wildbound/shared";
import { describeConditions } from "@wildbound/world";
import { cn } from "@/lib/utils.ts";
import { editorKeys, useCreatures, useResolve, useWorldStatus } from "../lib/queries.ts";
import { battleLockLabel, formatLevelBands, formatLevelRange } from "../lib/level-form.ts";
import { previewWithModifiers } from "../lib/spawn-preview.ts";
import { useEditor } from "../store.ts";
import { Bar, Button, Input, PanelTitle, Pill, Select, SubTitle, Tag } from "./ui.tsx";

function CoordinateInput() {
  const point = useEditor((s) => s.preview.point);
  const setPreview = useEditor((s) => s.setPreview);
  const resolvePreview = useEditor((s) => s.resolvePreview);
  const qc = useQueryClient();
  const format = (p: [number, number] | null) => (p ? `${p[1].toFixed(6)}, ${p[0].toFixed(6)}` : "");
  const [text, setText] = useState(format(point));
  useEffect(() => setText(format(point)), [point]);
  const submit = () => {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
    if (!m) return;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    setPreview({ point: [lng, lat] });
    resolvePreview();
    // Same point again: "Resolve" still means "ask the server again".
    void qc.invalidateQueries({ queryKey: editorKeys.resolveAll });
  };
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input placeholder="lat, lng (or click the map)" value={text} onChange={(e) => setText(e.target.value)} />
      <Button variant="primary" size="small" type="submit">
        Resolve
      </Button>
    </form>
  );
}

const card = "rounded-control border-l-[3px] bg-panel-2 px-2.5 py-2";
const kicker = "text-kicker uppercase tracking-[0.08em] text-muted";

/** Available Wildkin: shares from encounter weights, then after species spawn modifiers (exercise #2). */
function AvailableWildkin({ ctx }: { ctx: WorldContext }) {
  const creatures = useCreatures();
  if (ctx.availableWildkin.length === 0) return <p className="my-[1em] text-meta text-muted">Nothing can appear under these conditions.</p>;
  const preview = previewWithModifiers(ctx.availableWildkin, creatures, ctx.environment);
  const levels = new Map(ctx.availableWildkin.map((w) => [w.creatureId, formatLevelBands(w.levelBands ?? [])]));
  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {preview.wildkin.map((w) => {
          const changed = Math.abs(w.probability - w.rawProbability) >= 0.005;
          return (
            <li key={w.creatureId} className={cn("flex flex-wrap items-center gap-x-2", w.probability === 0 && "opacity-50")}>
              <span className="w-[70px] font-semibold">{w.name}</span>
              <Bar value={w.probability} title={`${(w.rawProbability * 100).toFixed(1)}% from encounter weights`} />
              <span className="w-9 text-right text-muted">{(w.probability * 100).toFixed(0)}%</span>
              {preview.status === "applied" && (
                <span className="w-9 text-right text-tiny text-muted line-through" title="Before species spawn modifiers">
                  {changed ? `${(w.rawProbability * 100).toFixed(0)}%` : ""}
                </span>
              )}
              {levels.get(w.creatureId) && (
                <span className="basis-full pl-[78px] text-tiny text-muted" title="Wild level range(s) this Wildkin can spawn at here">
                  {levels.get(w.creatureId)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {preview.status === "applied" && (
        <p className="m-0 text-tiny text-muted">
          After species spawn modifiers for {ctx.environment.weather} / {ctx.environment.timeOfDay} (struck through: from weights alone).
        </p>
      )}
      {preview.status === "unchanged" && (
        <p className="m-0 text-tiny text-warning">
          Species spawn modifiers have no effect yet: implement exercise #2, applySpawnModifiers in packages/world/src/spawning.ts.
        </p>
      )}
      {preview.status === "error" && (
        <p className="m-0 text-tiny text-warning" title={preview.error}>
          applySpawnModifiers threw ({preview.error}), so these are raw weights. See exercise #2 in packages/world/src/spawning.ts.
        </p>
      )}
    </>
  );
}

function Result({ ctx }: { ctx: WorldContext }) {
  if (!ctx.region) {
    return (
      <div className="rounded-control bg-panel-2 p-3">
        <strong>Outside the WILDBOUND world</strong>
        <p className="my-[1em] text-meta text-muted">No active {ctx.stage} region covers this coordinate. This is a normal, empty context.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className={cn(card, "border-region")}>
        <div className={kicker}>Region</div>
        <div className="text-title font-bold">{ctx.region.name}</div>
        <div className="text-meta text-muted">{ctx.region.slug}</div>
      </div>
      <div className={cn(card, "border-accent")}>
        <div className={kicker}>Habitat</div>
        {ctx.habitat ? (
          <>
            <div className="text-title font-bold">{ctx.habitat.name}</div>
            {!ctx.habitat.conditionsMet && (
              <div className="text-meta text-warning">Habitat conditions not met ({describeConditions(ctx.habitat.conditionRules)})</div>
            )}
            {ctx.habitat.licenseRequirement && (
              <div className="text-meta text-warning" title="Spawns can still be observed; battle and capture are refused below this rank">
                {battleLockLabel(ctx.habitat.licenseRequirement)}
              </div>
            )}
          </>
        ) : (
          <div className="text-muted">None (open region ground)</div>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <Pill>{ctx.environment.timeOfDay}</Pill>
        <Pill>{ctx.environment.weather}</Pill>
        {ctx.environment.tags.map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
      </div>

      <SubTitle>Available Wildkin</SubTitle>
      <AvailableWildkin ctx={ctx} />

      <SubTitle>Encounter tables</SubTitle>
      {ctx.encounterTables.length === 0 && <p className="my-[1em] text-meta text-muted">No active tables here.</p>}
      {ctx.encounterTables.map((t) => (
        <details key={t.id} className={cn("rounded-control bg-panel-2 px-2.5 py-1.5", !t.applicable && "opacity-60")}>
          <summary className="cursor-pointer">
            {t.name}{" "}
            <span className="text-meta text-muted">
              ({t.scope}
              {t.applicable ? "" : ", not applicable"})
            </span>
          </summary>
          <ul className="mt-1.5 list-disc pl-4">
            {t.entries.map((e) => (
              <li key={e.creatureId} className={e.available ? "" : "text-muted"}>
                {e.creatureName} · w{e.weight} · {formatLevelRange(e.minLevel, e.maxLevel)} · {e.available ? `${(e.probability * 100).toFixed(0)}%` : `needs ${describeConditions(e.conditions)}`}
              </li>
            ))}
          </ul>
        </details>
      ))}

      <SubTitle>Nearby POIs</SubTitle>
      {ctx.nearbyPois.length === 0 && <p className="my-[1em] text-meta text-muted">None within radius.</p>}
      <ul className="flex flex-col gap-1">
        {ctx.nearbyPois.map((p) => (
          <li key={p.id}>
            {p.name}{" "}
            <span className="text-meta text-muted">
              · {p.type} · {Math.round(p.distanceMeters)} m
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PreviewPanel() {
  const tool = useEditor((s) => s.tool);
  const preview = useEditor((s) => s.preview);
  const setPreview = useEditor((s) => s.setPreview);
  const resolvePreview = useEditor((s) => s.resolvePreview);
  const dirty = useEditor((s) => s.dirty);
  const status = useWorldStatus();
  const resolve = useResolve(preview.request);
  const [showJson, setShowJson] = useState(false);

  if (tool !== "preview" && !preview.point) return null;

  const change = (patch: Parameters<typeof setPreview>[0]) => {
    setPreview(patch);
    if (preview.point) resolvePreview();
  };
  const result = resolve.isError ? null : (resolve.data ?? null);

  return (
    <aside className="flex w-[340px] shrink-0 flex-col gap-2.5 overflow-auto border-l border-line bg-panel p-3">
      <header className="flex items-center justify-between">
        <PanelTitle className="m-0">Test location</PanelTitle>
        <Button variant="ghost" size="small" title="Remove simulated player" onClick={() => setPreview({ point: null, request: null })}>
          ×
        </Button>
      </header>
      <p className="my-[1em] text-meta text-muted">Click the map, drag the pink player, or use arrow keys (Shift = bigger steps) in Test mode.</p>
      <CoordinateInput />
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex overflow-hidden rounded-control border border-line">
          {(["draft", "published"] as const).map((stage) => (
            <button
              key={stage}
              type="button"
              className={cn(
                "cursor-pointer border-0 bg-transparent px-2.5 py-1",
                preview.stage === stage && "bg-accent font-semibold text-accent-ink",
              )}
              onClick={() => change({ stage })}
            >
              {stage}
            </button>
          ))}
        </div>
        <Select
          className="w-auto"
          value={preview.timeOfDay}
          onChange={(e) => change({ timeOfDay: e.target.value as typeof preview.timeOfDay })}
          aria-label="Time of day"
        >
          <option value="auto">time: now</option>
          {TIME_OF_DAY.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Select className="w-auto" value={preview.weather} onChange={(e) => change({ weather: e.target.value as typeof preview.weather })} aria-label="Weather">
          {WEATHER.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-1 text-meta text-muted">
          POI radius
          <Input
            type="number"
            className="w-[70px]"
            min={10}
            max={NEARBY_POI_MAX_RADIUS_M}
            step={50}
            value={preview.radius}
            onChange={(e) => {
              const r = Math.round(Number(e.target.value));
              if (r >= 1 && r <= NEARBY_POI_MAX_RADIUS_M) change({ radius: r });
            }}
          />
          m
        </label>
      </div>
      {preview.stage === "draft" && dirty && <div className="text-meta text-warning">Resolving the saved draft. Save to include unsaved edits.</div>}
      {preview.stage === "published" && !status?.publishedVersion && <div className="text-meta text-warning">Nothing has been published yet.</div>}
      {resolve.isFetching && !result && <p className="my-[1em] text-muted">Resolving…</p>}
      {resolve.error && <div className="text-meta text-danger">{resolve.error.message}</div>}
      {result && <Result ctx={result} />}
      {result && (
        <div>
          <Button variant="ghost" size="small" onClick={() => setShowJson(!showJson)}>
            {showJson ? "Hide" : "Show"} API response
          </Button>
          {showJson && (
            <pre className="my-[1em] max-h-[320px] overflow-auto rounded-control bg-canvas p-2 text-tiny">{JSON.stringify(result, null, 2)}</pre>
          )}
        </div>
      )}
    </aside>
  );
}
