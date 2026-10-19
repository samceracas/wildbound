import { cn } from "@/lib/utils.ts";
import { useReport } from "../lib/queries.ts";

export const formatArea = (m2: number) => (m2 >= 10_000 ? `${(m2 / 10_000).toFixed(2)} ha` : `${Math.round(m2)} m²`);

/** Validation issues from the last validate/save for one entity. */
export function IssueList({ entityId }: { entityId: string }) {
  const issues = useReport()?.issues.filter((i) => i.entityId === entityId) ?? [];
  if (issues.length === 0) return null;
  return (
    <ul className="m-0 list-disc border-b border-line py-2 pr-3 pl-7">
      {issues.map((i, n) => (
        <li key={n} className={cn(i.severity === "error" ? "text-danger" : "text-warning")}>
          {i.message}
        </li>
      ))}
    </ul>
  );
}
