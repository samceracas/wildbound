import { useEffect, useState } from "react";
import { getToken, setToken } from "../api.ts";
import { useEditor } from "../store.ts";

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
    <div className={`toast ${notice.kind}`} role="status" onClick={() => setVisible(false)}>
      {notice.text}
    </div>
  );
}

export function TokenDialog() {
  const authRequired = useEditor((s) => s.authRequired);
  const load = useEditor((s) => s.load);
  const [value, setValue] = useState(getToken());
  if (!authRequired) return null;
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          setToken(value.trim());
          void load();
        }}
      >
        <h2>Editor access</h2>
        <p className="muted">The API rejected the editor token. Enter the EDITOR_TOKEN configured for the API.</p>
        <input type="password" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        <button className="btn primary" type="submit">
          Connect
        </button>
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
  return hint ? <div className="tool-hint">{hint}</div> : null;
}
