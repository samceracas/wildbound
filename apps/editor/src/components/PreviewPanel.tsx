import { useEffect, useState } from "react";
import type { WorldContext } from "@wildbound/shared";
import { NEARBY_POI_MAX_RADIUS_M, TIME_OF_DAY, WEATHER } from "@wildbound/shared";
import { describeConditions } from "@wildbound/world";
import { useEditor } from "../store.ts";

function CoordinateInput() {
  const point = useEditor((s) => s.preview.point);
  const setPreview = useEditor((s) => s.setPreview);
  const resolvePreview = useEditor((s) => s.resolvePreview);
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
    void resolvePreview();
  };
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input type="text" placeholder="lat, lng (or click the map)" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn primary small" type="submit">
        Resolve
      </button>
    </form>
  );
}

function Result({ ctx }: { ctx: WorldContext }) {
  if (!ctx.region) {
    return (
      <div className="preview-empty">
        <strong>Outside the WILDBOUND world</strong>
        <p className="muted small">No active {ctx.stage} region covers this coordinate. This is a normal, empty context.</p>
      </div>
    );
  }
  return (
    <div className="preview-result">
      <div className="ctx-card">
        <div className="ctx-kicker">Region</div>
        <div className="ctx-title">{ctx.region.name}</div>
        <div className="muted small">{ctx.region.slug}</div>
      </div>
      <div className="ctx-card">
        <div className="ctx-kicker">Habitat</div>
        {ctx.habitat ? (
          <>
            <div className="ctx-title">{ctx.habitat.name}</div>
            {!ctx.habitat.conditionsMet && (
              <div className="warning small">Habitat conditions not met ({describeConditions(ctx.habitat.conditionRules)})</div>
            )}
          </>
        ) : (
          <div className="muted">None (open region ground)</div>
        )}
      </div>
      <div className="ctx-tags">
        <span className="pill">{ctx.environment.timeOfDay}</span>
        <span className="pill">{ctx.environment.weather}</span>
        {ctx.environment.tags.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </div>

      <h4>Available Wildkin</h4>
      {ctx.availableWildkin.length === 0 ? (
        <p className="muted small">Nothing can appear under these conditions.</p>
      ) : (
        <ul className="wildkin">
          {ctx.availableWildkin.map((w) => (
            <li key={w.creatureId}>
              <span className="wk-name">{w.name}</span>
              <div className="bar">
                <span style={{ width: `${w.probability * 100}%` }} />
              </div>
              <span className="wk-pct">{(w.probability * 100).toFixed(0)}%</span>
            </li>
          ))}
        </ul>
      )}

      <h4>Encounter tables</h4>
      {ctx.encounterTables.length === 0 && <p className="muted small">No active tables here.</p>}
      {ctx.encounterTables.map((t) => (
        <details key={t.id} className={`ctx-table ${t.applicable ? "" : "closed"}`}>
          <summary>
            {t.name} <span className="muted small">({t.scope}{t.applicable ? "" : ", not applicable"})</span>
          </summary>
          <ul>
            {t.entries.map((e) => (
              <li key={e.creatureId} className={e.available ? "" : "muted"}>
                {e.creatureName} · w{e.weight} · {e.available ? `${(e.probability * 100).toFixed(0)}%` : `needs ${describeConditions(e.conditions)}`}
              </li>
            ))}
          </ul>
        </details>
      ))}

      <h4>Nearby POIs</h4>
      {ctx.nearbyPois.length === 0 && <p className="muted small">None within radius.</p>}
      <ul className="link-list">
        {ctx.nearbyPois.map((p) => (
          <li key={p.id}>
            {p.name} <span className="muted small">· {p.type} · {Math.round(p.distanceMeters)} m</span>
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
  const status = useEditor((s) => s.status);
  const [showJson, setShowJson] = useState(false);

  if (tool !== "preview" && !preview.point) return null;

  const change = (patch: Parameters<typeof setPreview>[0]) => {
    setPreview(patch);
    if (preview.point) void resolvePreview();
  };

  return (
    <aside className="preview">
      <header className="preview-header">
        <h2>Test location</h2>
        <button className="btn small ghost" title="Remove simulated player" onClick={() => setPreview({ point: null, result: null })}>
          ×
        </button>
      </header>
      <p className="muted small">Click the map, drag the pink player, or use arrow keys (Shift = bigger steps) in Test mode.</p>
      <CoordinateInput />
      <div className="preview-controls">
        <div className="segmented">
          {(["draft", "published"] as const).map((stage) => (
            <button key={stage} className={preview.stage === stage ? "on" : ""} onClick={() => change({ stage })}>
              {stage}
            </button>
          ))}
        </div>
        <select value={preview.timeOfDay} onChange={(e) => change({ timeOfDay: e.target.value as typeof preview.timeOfDay })} aria-label="Time of day">
          <option value="auto">time: now</option>
          {TIME_OF_DAY.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={preview.weather} onChange={(e) => change({ weather: e.target.value as typeof preview.weather })} aria-label="Weather">
          {WEATHER.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <label className="radius">
          POI radius
          <input
            type="number"
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
      {preview.stage === "draft" && dirty && <div className="warning small">Resolving the saved draft. Save to include unsaved edits.</div>}
      {preview.stage === "published" && !status?.publishedVersion && <div className="warning small">Nothing has been published yet.</div>}
      {preview.loading && <p className="muted">Resolving…</p>}
      {preview.error && <div className="error small">{preview.error}</div>}
      {preview.result && !preview.loading && <Result ctx={preview.result} />}
      {preview.result && (
        <div className="json-toggle">
          <button className="btn small ghost" onClick={() => setShowJson(!showJson)}>
            {showJson ? "Hide" : "Show"} API response
          </button>
          {showJson && <pre className="json">{JSON.stringify(preview.result, null, 2)}</pre>}
        </div>
      )}
    </aside>
  );
}
