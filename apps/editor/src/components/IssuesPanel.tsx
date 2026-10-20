import { cn } from "@/lib/utils.ts";
import { useReport } from "../lib/queries.ts";
import { useEditor } from "../store.ts";
import type { EntityKind } from "../world-edit.ts";
import { LinkButton } from "./ui.tsx";

const sevColor = { error: "text-danger", warning: "text-warning" } as const;

export function IssuesPanel() {
  const report = useReport();
  const show = useEditor((s) => s.showIssues);
  const setShow = useEditor((s) => s.setShowIssues);
  const select = useEditor((s) => s.select);
  const counts = useEditor((s) => s.world);
  const errors = report?.issues.filter((i) => i.severity === "error").length ?? 0;
  const warnings = (report?.issues.length ?? 0) - errors;

  return (
    <footer className="border-t border-line bg-panel">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-3 py-1.5 text-label text-muted"
        onClick={() => setShow(!show)}
      >
        <span>
          {counts.regions.length} regions · {counts.habitats.length} habitats · {counts.pois.length} POIs · {counts.encounterTables.length} encounter
          tables
        </span>
        <span className="flex-1" />
        {report ? (
          <>
            <span className={errors ? "text-danger" : "text-accent"}>{errors} errors</span>
            <span className={warnings ? "text-warning" : "text-accent"}>{warnings} warnings</span>
          </>
        ) : (
          <span className="text-muted">Not validated yet</span>
        )}
        <span>{show ? "▾" : "▴"}</span>
      </button>
      {show && report && (
        <ul className="flex max-h-[180px] flex-col gap-1 overflow-auto px-3 pb-2">
          {report.issues.length === 0 && <li className="flex items-baseline gap-2.5 text-accent">No issues. Ready to publish.</li>}
          {report.issues.map((i, n) => (
            <li key={n} className={cn("flex items-baseline gap-2.5", sevColor[i.severity])}>
              <span className="w-14 shrink-0 text-micro uppercase">{i.severity}</span>
              {i.entityId && i.entityType !== "world" ? (
                <LinkButton onClick={() => select({ kind: i.entityType as EntityKind, id: i.entityId! }, true)}>{i.message}</LinkButton>
              ) : (
                <span>{i.message}</span>
              )}
              <code className="text-meta text-muted">{i.code}</code>
            </li>
          ))}
        </ul>
      )}
    </footer>
  );
}
