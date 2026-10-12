import { useEditor } from "../store.ts";

export const formatArea = (m2: number) => (m2 >= 10_000 ? `${(m2 / 10_000).toFixed(2)} ha` : `${Math.round(m2)} m²`);

/** Validation issues from the last validate/save for one entity. */
export function IssueList({ entityId }: { entityId: string }) {
  const issues = useEditor((s) => s.report)?.issues.filter((i) => i.entityId === entityId) ?? [];
  if (issues.length === 0) return null;
  return (
    <ul className="issue-inline">
      {issues.map((i, n) => (
        <li key={n} className={i.severity}>
          {i.message}
        </li>
      ))}
    </ul>
  );
}
