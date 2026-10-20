import { cn } from "@/lib/utils.ts";
import { useBusy, usePublish, useReloadWorld, useSaveDraft, useValidate, useWorldStatus } from "../lib/queries.ts";
import { BASEMAPS } from "../map/basemaps.ts";
import { useEditor, type Basemap, type Tool } from "../store.ts";
import { Button, Select } from "./ui.tsx";

const TOOLS: { id: Tool; label: string; key: string; title: string }[] = [
  { id: "select", label: "Select", key: "V", title: "Select and edit (V)" },
  { id: "draw-region", label: "Region", key: "R", title: "Draw a region boundary (R)" },
  { id: "draw-habitat", label: "Habitat", key: "H", title: "Draw a habitat inside a region (H)" },
  { id: "place-poi", label: "POI", key: "P", title: "Place points of interest (P)" },
  { id: "preview", label: "Test", key: "T", title: "Drop the simulated player and resolve (T)" },
];

const chip = "rounded-full border border-line px-[9px] py-[3px] text-meta";

function StatusChip() {
  const status = useWorldStatus();
  const dirty = useEditor((s) => s.dirty);
  if (dirty) return <span className={cn(chip, "border-warning text-warning")}>Unsaved changes</span>;
  if (!status) return null;
  const draft = cn(chip, "border-info/50 text-info");
  if (status.hasUnpublishedChanges)
    return (
      <span className={draft} title={`Draft saved ${new Date(status.draftUpdatedAt!).toLocaleString()}`}>
        Draft saved · not published
      </span>
    );
  if (status.publishedVersion)
    return (
      <span className={cn(chip, "border-accent/50 text-accent")} title={`Published ${new Date(status.lastPublishedAt!).toLocaleString()}`}>
        Published v{status.publishedVersion}
      </span>
    );
  return <span className={draft}>Draft</span>;
}

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const basemap = useEditor((s) => s.basemap);
  const setBasemap = useEditor((s) => s.setBasemap);
  const busy = useBusy();
  const save = useSaveDraft();
  const validate = useValidate();
  const publish = usePublish();
  const reload = useReloadWorld();
  const world = () => useEditor.getState().world;

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-line bg-panel px-3 py-2">
      <div className="font-extrabold tracking-[0.12em] text-accent">
        WILDBOUND <span className="ml-1 font-medium tracking-[0.02em] text-muted">Map Editor</span>
      </div>
      <div className="flex items-center gap-1" role="toolbar" aria-label="Tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-control border border-line bg-transparent px-[9px] py-[5px] hover:bg-panel-2",
              tool === t.id && "border-accent bg-accent font-semibold text-accent-ink hover:bg-accent",
            )}
            title={t.title}
            onClick={() => setTool(t.id)}
          >
            {t.label}
            <kbd className="rounded-[3px] border border-current px-[3px] text-micro opacity-60">{t.key}</kbd>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          ↶
        </Button>
        <Button variant="ghost" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          ↷
        </Button>
        <Select className="w-auto" value={basemap} onChange={(e) => setBasemap(e.target.value as Basemap)} aria-label="Base map">
          {Object.entries(BASEMAPS).map(([id, b]) => (
            <option key={id} value={id}>
              {b.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex-1" />
      <StatusChip />
      <div className="flex items-center gap-1">
        <Button variant="ghost" onClick={() => void reload()} disabled={busy !== null} title="Reload the saved draft">
          Reload
        </Button>
        <Button onClick={() => validate.mutate(world())} disabled={busy !== null}>
          {busy === "validating" ? "Validating…" : "Validate"}
        </Button>
        <Button onClick={() => save.mutate(world())} disabled={busy !== null} title="Save draft (Ctrl+S)">
          {busy === "saving" ? "Saving…" : "Save draft"}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (confirm("Validate and publish the draft? Players will resolve against it immediately.")) publish.mutate();
          }}
          disabled={busy !== null}
        >
          {busy === "publishing" ? "Publishing…" : "Publish"}
        </Button>
      </div>
    </header>
  );
}
