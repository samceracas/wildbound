import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils.ts";
import { getToken, setToken } from "../lib/api.ts";
import { editorKeys } from "../lib/queries.ts";
import { useEditor } from "../store.ts";
import { Button, Input, PanelTitle } from "./ui.tsx";

export function NoticeToast() {
  const notice = useEditor((s) => s.notice);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!notice) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), notice.kind === "error" ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [notice]);
  if (!notice || !visible) return null;
  return (
    <div
      className={cn(
        "fixed bottom-12 left-1/2 z-20 max-w-[80vw] -translate-x-1/2 cursor-pointer rounded-control border border-line bg-panel-2 px-4 py-[9px] shadow-[0_6px_20px_rgba(0,0,0,0.4)]",
        notice.kind === "success" && "border-accent",
        notice.kind === "error" && "border-danger text-[#ffd6d6]",
      )}
      role="status"
      onClick={() => setVisible(false)}
    >
      {notice.text}
    </div>
  );
}

export function TokenDialog() {
  const authRequired = useEditor((s) => s.authRequired);
  const qc = useQueryClient();
  const [value, setValue] = useState(getToken());
  if (!authRequired) return null;
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/60">
      <form
        className="flex w-[360px] flex-col gap-3 rounded-[10px] border border-line bg-panel p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setToken(value.trim());
          const s = useEditor.getState();
          s.setAuthRequired(false);
          // Nothing loaded yet: load now. Otherwise keep the edits and let the user retry.
          if (!s.loaded) void qc.refetchQueries({ queryKey: editorKeys.world });
          else s.notify("info", "Token saved. Retry the last action.");
        }}
      >
        <PanelTitle>Editor access</PanelTitle>
        <p className="my-[1em] text-muted">The API rejected the editor token. Enter the EDITOR_TOKEN configured for the API.</p>
        <Input type="password" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        <Button variant="primary" type="submit">
          Connect
        </Button>
      </form>
    </div>
  );
}

export function ToolHint() {
  const tool = useEditor((s) => s.tool);
  const hints: Record<string, string> = {
    "draw-region": "Region: click to add points · double-click / Enter to finish · Backspace undo point · Esc cancel",
    "draw-habitat": "Habitat: draw inside a region · double-click / Enter to finish · Esc cancel",
    "place-poi": "POI: click inside a region to place · Esc to stop",
    preview: "Test: click to drop the player · drag it or use arrow keys to move",
  };
  const hint = hints[tool];
  return hint ? (
    <div className="pointer-events-none absolute top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-[rgba(17,22,28,0.88)] px-3.5 py-1.5 text-label">
      {hint}
    </div>
  ) : null;
}
