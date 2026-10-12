import { useEditor } from "../store.ts";
import { EncounterTableInspector } from "../inspectors/EncounterTableInspector.tsx";
import { HabitatInspector } from "../inspectors/HabitatInspector.tsx";
import { PoiInspector } from "../inspectors/PoiInspector.tsx";
import { RegionInspector } from "../inspectors/RegionInspector.tsx";
import type { Selection } from "../world-edit.ts";

function TreeItem({ sel, label, meta, depth }: { sel: Selection; label: string; meta?: string; depth: number }) {
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);
  const issues = useEditor((s) => s.report)?.issues.filter((i) => i.entityId === sel.id) ?? [];
  const active = selection?.kind === sel.kind && selection.id === sel.id;
  const hasError = issues.some((i) => i.severity === "error");
  return (
    <li>
      <button
        className={`tree-item ${active ? "active" : ""} kind-${sel.kind}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => select(sel, true)}
      >
        <span className="tree-dot" />
        <span className="tree-label">{label}</span>
        {issues.length > 0 && <span className={`tree-badge ${hasError ? "error" : "warning"}`}>{issues.length}</span>}
        {meta && <span className="tree-meta">{meta}</span>}
      </button>
    </li>
  );
}

function WorldTree() {
  const world = useEditor((s) => s.world);
  const setTool = useEditor((s) => s.setTool);
  if (world.regions.length === 0) {
    return (
      <div className="empty">
        <p>No regions yet.</p>
        <button className="btn primary" onClick={() => setTool("draw-region")}>
          Draw first region (R)
        </button>
        <p className="muted small">Click on the map to add boundary points; double-click or Enter to finish.</p>
      </div>
    );
  }
  return (
    <ul className="tree">
      {world.regions.map((r) => {
        const habitats = world.habitats.filter((h) => h.regionId === r.id);
        const pois = world.pois.filter((p) => p.regionId === r.id);
        const regionTables = world.encounterTables.filter((t) => t.regionId === r.id && t.habitatId === null);
        return (
          <li key={r.id}>
            <ul>
              <TreeItem sel={{ kind: "region", id: r.id }} label={r.name} meta={r.active ? undefined : "inactive"} depth={0} />
              {habitats.map((h) => (
                <li key={h.id}>
                  <ul>
                    <TreeItem sel={{ kind: "habitat", id: h.id }} label={h.name} depth={1} />
                    {world.encounterTables
                      .filter((t) => t.habitatId === h.id)
                      .map((t) => (
                        <TreeItem key={t.id} sel={{ kind: "encounterTable", id: t.id }} label={t.name} meta={`${t.entries.length}`} depth={2} />
                      ))}
                  </ul>
                </li>
              ))}
              {regionTables.map((t) => (
                <TreeItem key={t.id} sel={{ kind: "encounterTable", id: t.id }} label={t.name} meta="region" depth={1} />
              ))}
              {pois.map((p) => (
                <TreeItem key={p.id} sel={{ kind: "poi", id: p.id }} label={p.name} meta={p.type} depth={1} />
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

function Inspector() {
  const selection = useEditor((s) => s.selection);
  const world = useEditor((s) => s.world);
  const deleteSelected = useEditor((s) => s.deleteSelected);
  if (!selection) {
    return <p className="muted inspector-empty">Select something on the map or in the tree to edit it.</p>;
  }
  let body: React.ReactNode = null;
  if (selection.kind === "region") {
    const r = world.regions.find((x) => x.id === selection.id);
    if (r) body = <RegionInspector key={r.id} region={r} />;
  } else if (selection.kind === "habitat") {
    const h = world.habitats.find((x) => x.id === selection.id);
    if (h) body = <HabitatInspector key={h.id} habitat={h} />;
  } else if (selection.kind === "poi") {
    const p = world.pois.find((x) => x.id === selection.id);
    if (p) body = <PoiInspector key={p.id} poi={p} />;
  } else {
    const t = world.encounterTables.find((x) => x.id === selection.id);
    if (t) body = <EncounterTableInspector key={t.id} table={t} />;
  }
  if (!body) return null;
  const cascade =
    selection.kind === "region"
      ? " and all of its habitats, POIs and encounter tables"
      : selection.kind === "habitat"
        ? " and its encounter tables"
        : "";
  return (
    <div className="inspector">
      {body}
      <div className="danger-zone">
        <button
          className="btn danger"
          onClick={() => {
            if (confirm(`Delete this ${selection.kind === "encounterTable" ? "encounter table" : selection.kind}${cascade}? (Undo with Ctrl+Z)`))
              deleteSelected();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-tree">
        <h2>World</h2>
        <WorldTree />
      </div>
      <div className="sidebar-inspector">
        <Inspector />
      </div>
    </aside>
  );
}
