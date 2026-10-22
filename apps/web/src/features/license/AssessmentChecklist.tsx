import type { RequirementProgress } from "@wildbound/shared";

/**
 * The next assessment's checklist on a License card.
 *
 * ------------------------------------------------------------------------
 * TODO(you): exercise #15. Show the progress of each requirement, not just
 * its label. Each `RequirementProgress` (packages/shared/src/research.ts)
 * already carries everything:
 *   { type, label: "Observe in 3 different weathers", required: 3, current: 1, met: false }
 * (`required` is already clamped to what the current world makes possible.)
 *
 *  1. Render one <li> per requirement with the label and the progress, e.g.
 *     "Observe in 3 different weathers: 1/3". Cap the shown count at the
 *     requirement (`Math.min(r.current, r.required)`) so it never reads 7/5.
 *  2. Style met and unmet rows differently with Tailwind tokens only (no raw
 *     colours): for example a "✓" in `text-success` for met rows and a "○" in
 *     `text-ink-muted` for unmet ones, and `line-through` or `text-ink-muted`
 *     on the met label. The tokens live in apps/web/src/styles.css (@theme).
 *  3. Optional: a tiny progress bar per row. `ProgressBar` in
 *     components/field.tsx takes `value` and `max`.
 *  4. Accessibility: say "done" / "not done" for screen readers
 *     (e.g. `<span className="sr-only">done</span>`), since colour alone is not enough.
 *
 * Finished examples nearby: `HpBar` / `ProgressBar` in components/field.tsx,
 * and the researcher EXP bar in LicensePage.tsx (same data, same card).
 * The data comes from TanStack Query (`useLicenses()` in lib/queries.ts);
 * this component only renders it, so no fetching here.
 * ------------------------------------------------------------------------
 *
 * Until then (the fallback): the plain labels. The "Take assessment" button on
 * the card still works, because the server checks the checklist itself.
 */
export function AssessmentChecklist({ requirements }: { requirements: RequirementProgress[] }) {
  return (
    <ul className="flex flex-col gap-0.5 font-vt text-base leading-5 text-ink">
      {requirements.map((r) => (
        <li key={r.type}>• {r.label}</li>
      ))}
    </ul>
  );
}
