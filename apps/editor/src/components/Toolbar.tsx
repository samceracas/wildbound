import { useEditor, type Basemap, type Tool } from "../store.ts";
import { BASEMAPS } from "../map/basemaps.ts";

const TOOLS: { id: Tool; label: string; key: string; title: string }[] = [
  { id: "select", label: "Select", key: "V", title: "Select and edit (V)" },
  { id: "draw-region", label: "Region", key: "R", title: "Draw a region boundary (R)" },
  { id: "draw-habitat", label: "Habitat", key: "H", title: "Draw a habitat inside a region (H)" },
  { id: "place-poi", label: "POI", key: "P", title: "Place points of interest (P)" },
  { id: "preview", label: "Test", key: "T", title: "Drop the simulated player and resolve (T)" },
];

function StatusChip() {
  const status = useEditor((s) => s.status);
  const dirty = useEditor((s) => s.dirty);
  if (dirty) return <span className="status-chip unsaved">Unsaved changes</span>;
  if (!status) return null;
  if (status.hasUnpublishedChanges)
    return (
      <span className="status-chip draft" title={`Draft saved ${new Date(status.draftUpdatedAt!).toLocaleString()}`}>
        Draft saved · not published
      </span>
    );
  if (status.publishedVersion)
    return (
      <span className="status-chip published" title={`Published ${new Date(status.lastPublishedAt!).toLocaleString()}`}>
        Published v{status.publishedVersion}
      </span>
    );
  return <span className="status-chip draft">Draft</span>;
}

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const busy = useEditor((s) => s.busy);
  const save = useEditor((s) => s.save);
  const validate = useEditor((s) => s.validate);
  const publish = useEditor((s) => s.publish);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const basemap = useEditor((s) => s.basemap);
  const setBasemap = useEditor((s) => s.setBasemap);
  const load = useEditor((s) => s.load);

  return (
    <header className="toolbar">
      <div className="brand">
        WILDBOUND <span>Map Editor</span>
      </div>
      <div className="tool-group" role="toolbar" aria-label="Tools">
        {TOOLS.map((t) => (
          <button key={t.id} className={`tool ${tool === t.id ? "active" : ""}`} title={t.title} onClick={() => setTool(t.id)}>
            {t.label}
            <kbd>{t.key}</kbd>
          </button>
        ))}
      </div>
      <div className="tool-group">
        <button className="btn ghost" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          ↶
        </button>
        <button className="btn ghost" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          ↷
        </button>
        <select value={basemap} onChange={(e) => setBasemap(e.target.value as Basemap)} aria-label="Base map">
          {Object.entries(BASEMAPS).map(([id, b]) => (
            <option key={id} value={id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>
      <div className="spacer" />
      <StatusChip />
      <div className="tool-group">
        <button className="btn ghost" onClick={() => void load()} disabled={busy !== null} title="Reload the saved draft">
          Reload
        </button>
        <button className="btn" onClick={() => void validate()} disabled={busy !== null}>
          {busy === "validating" ? "Validating…" : "Validate"}
        </button>
        <button className="btn" onClick={() => void save()} disabled={busy !== null} title="Save draft (Ctrl+S)">
          {busy === "saving" ? "Saving…" : "Save draft"}
        </button>
        <button
          className="btn primary"
          onClick={() => {
            if (confirm("Validate and publish the draft? Players will resolve against it immediately.")) void publish();
          }}
          disabled={busy !== null}
        >
          {busy === "publishing" ? "Publishing…" : "Publish"}
        </button>
      </div>
    </header>
  );
}
