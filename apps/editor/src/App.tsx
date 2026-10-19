import { useEffect, useRef } from "react";
import { IssuesPanel } from "./components/IssuesPanel.tsx";
import { NoticeToast, TokenDialog, ToolHint } from "./components/Overlays.tsx";
import { PreviewPanel } from "./components/PreviewPanel.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Toolbar } from "./components/Toolbar.tsx";
import { MapView } from "./map/MapView.tsx";
import { useSaveDraft, useWorldQuery } from "./lib/queries.ts";
import { useEditor, type Tool } from "./store.ts";

const TOOL_KEYS: Record<string, Tool> = { v: "select", r: "draw-region", h: "draw-habitat", p: "place-poi", t: "preview" };

function useShortcuts() {
  const save = useSaveDraft();
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saveRef.current.isPending) saveRef.current.mutate(s.world);
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
  const world = useWorldQuery();
  const loaded = useEditor((s) => s.loaded);
  useShortcuts();

  // First successful load fills the editor. Later refetches (after save/publish)
  // only refresh server state; Reload is the explicit way to discard edits.
  useEffect(() => {
    if (world.data && !useEditor.getState().loaded) useEditor.getState().hydrate(world.data.draft);
  }, [world.data]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return (
    <div className="grid h-screen grid-rows-[auto_1fr_auto]">
      <Toolbar />
      <div className="flex min-h-0">
        <Sidebar />
        <main className="relative min-w-0 flex-1">
          <MapView />
          <ToolHint />
          {!loaded && world.isFetching && (
            <div className="absolute inset-0 grid place-items-center bg-[rgba(17,22,28,0.6)]">Loading world…</div>
          )}
        </main>
        <PreviewPanel />
      </div>
      <IssuesPanel />
      <NoticeToast />
      <TokenDialog />
    </div>
  );
}
