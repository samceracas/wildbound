import { cn } from "@/lib/utils.ts";
import { useReport } from "../lib/queries.ts";
import { useEditor } from "../store.ts";
import { EncounterTableInspector } from "../inspectors/EncounterTableInspector.tsx";
import { HabitatInspector } from "../inspectors/HabitatInspector.tsx";
import { PoiInspector } from "../inspectors/PoiInspector.tsx";
import { RegionInspector } from "../inspectors/RegionInspector.tsx";
import type { EntityKind, Selection } from "../world-edit.ts";
import { Button, PanelTitle } from "./ui.tsx";

const DOT: Record<EntityKind, string> = {
  region: "bg-region",
  habitat: "bg-accent",
  poi: "rounded-full bg-white",
  encounterTable: "size-1.5 rounded-full bg-info",
};

function TreeItem({ sel, label, meta, depth }: { sel: Selection; label: string; meta?: string; depth: number }) {
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);
  const issues = useReport()?.issues.filter((i) => i.entityId === sel.id) ?? [];
  const active = selection?.kind === sel.kind && selection.id === sel.id;
  const hasError = issues.some((i) => i.severity === "error");
  return (
    <li>
      <button
        type="button"
        className={cn(
          "flex w-full cursor-pointer items-center gap-[7px] rounded border-0 bg-transparent px-2 py-1 text-left hover:bg-panel-2",
          active && "bg-accent/18 hover:bg-accent/18",
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => select(sel, true)}
      >
        <span className={cn("size-2 shrink-0 rounded-[2px]", DOT[sel.kind])} />
        <span className="flex-1 truncate">{label}</span>
        {issues.length > 0 && (
          <span className={cn("rounded-full px-[5px] text-micro text-[#111]", hasError ? "bg-danger" : "bg-warning")}>{issues.length}</span>
        )}
        {meta && <span className="text-tiny text-muted">{meta}</span>}
      </button>
    </li>
  );
}

function WorldTree() {
  const world = useEditor((s) => s.world);
  const setTool = useEditor((s) => s.setTool);
  if (world.regions.length === 0) {
    return (
      <div className="px-1 py-3 text-center">
        <p className="my-[1em]">No regions yet.</p>
        <Button variant="primary" onClick={() => setTool("draw-region")}>
          Draw first region (R)
        </Button>
        <p className="my-[1em] text-meta text-muted">Click on the map to add boundary points; double-click or Enter to finish.</p>
      </div>
    );
  }
  return (
    <ul>
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
    return <p className="my-[1em] p-4 text-muted">Select something on the map or in the tree to edit it.</p>;
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
    <div>
      {body}
      <div className="p-3">
        <Button
          variant="danger"
          onClick={() => {
            if (confirm(`Delete this ${selection.kind === "encounterTable" ? "encounter table" : selection.kind}${cascade}? (Undo with Ctrl+Z)`))
              deleteSelected();
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="flex min-h-0 w-[340px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="max-h-[40%] shrink-0 overflow-auto border-b border-line p-3">
        <PanelTitle>World</PanelTitle>
        <WorldTree />
      </div>
      <div className="flex-1 overflow-auto">
        <Inspector />
      </div>
    </aside>
  );
}
