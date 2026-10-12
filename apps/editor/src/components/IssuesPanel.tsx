import { useEditor } from "../store.ts";
import type { EntityKind } from "../world-edit.ts";

export function IssuesPanel() {
  const report = useEditor((s) => s.report);
  const show = useEditor((s) => s.showIssues);
  const setShow = useEditor((s) => s.setShowIssues);
  const select = useEditor((s) => s.select);
  const counts = useEditor((s) => s.world);
  const errors = report?.issues.filter((i) => i.severity === "error").length ?? 0;
  const warnings = (report?.issues.length ?? 0) - errors;

  return (
    <footer className={`issues ${show ? "open" : ""}`}>
      <button className="issues-bar" onClick={() => setShow(!show)}>
        <span>
          {counts.regions.length} regions · {counts.habitats.length} habitats · {counts.pois.length} POIs · {counts.encounterTables.length} encounter
          tables
        </span>
        <span className="spacer" />
        {report ? (
          <>
            <span className={errors ? "count error" : "count ok"}>{errors} errors</span>
            <span className={warnings ? "count warning" : "count ok"}>{warnings} warnings</span>
          </>
        ) : (
          <span className="muted">Not validated yet</span>
        )}
        <span className="chev">{show ? "▾" : "▴"}</span>
      </button>
      {show && report && (
        <ul className="issues-list">
          {report.issues.length === 0 && <li className="ok">No issues. Ready to publish.</li>}
          {report.issues.map((i, n) => (
            <li key={n} className={i.severity}>
              <span className="sev">{i.severity}</span>
              {i.entityId && i.entityType !== "world" ? (
                <button className="link" onClick={() => select({ kind: i.entityType as EntityKind, id: i.entityId! }, true)}>
                  {i.message}
                </button>
              ) : (
                <span>{i.message}</span>
              )}
              <code className="muted small">{i.code}</code>
            </li>
          ))}
        </ul>
      )}
    </footer>
  );
}
