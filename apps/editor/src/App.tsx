import { useEffect } from "react";
import { IssuesPanel } from "./components/IssuesPanel.tsx";
import { NoticeToast, TokenDialog, ToolHint } from "./components/Overlays.tsx";
import { PreviewPanel } from "./components/PreviewPanel.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Toolbar } from "./components/Toolbar.tsx";
import { MapView } from "./map/MapView.tsx";
import { useEditor, type Tool } from "./store.ts";

const TOOL_KEYS: Record<string, Tool> = { v: "select", r: "draw-region", h: "draw-habitat", p: "place-poi", t: "preview" };

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void s.save();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod || e.altKey) return;
      const drawing = s.tool === "draw-region" || s.tool === "draw-habitat";
      const tool = TOOL_KEYS[e.key.toLowerCase()];
      if (tool && !drawing) {
        s.setTool(tool);
        return;
      }
      if (e.key === "Escape" && !drawing) {
        if (s.tool !== "select") s.setTool("select");
        else s.select(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && s.tool === "select" && s.selection) {
        e.preventDefault();
        if (confirm("Delete the selected item? (Undo with Ctrl+Z)")) s.deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function App() {
  const load = useEditor((s) => s.load);
  const loaded = useEditor((s) => s.loaded);
  const busy = useEditor((s) => s.busy);
  useShortcuts();

  useEffect(() => {
    void load();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [load]);

  return (
    <div className="app">
      <Toolbar />
      <div className="workspace">
        <Sidebar />
        <main className="map-wrap">
          <MapView />
          <ToolHint />
          {!loaded && busy === "loading" && <div className="loading">Loading world…</div>}
        </main>
        <PreviewPanel />
      </div>
      <IssuesPanel />
      <NoticeToast />
      <TokenDialog />
    </div>
  );
}
