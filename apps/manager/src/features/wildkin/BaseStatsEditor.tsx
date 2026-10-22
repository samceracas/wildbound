import { BASE_STAT_MAX, BASE_STAT_MIN, STAT_BUDGET, STAT_KEYS, STAT_NAMES, type WildkinEntryData } from "@wildbound/shared";
import { EraserIcon, PlusIcon } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_BASE_STATS } from "@/lib/wildkin-form";
import { errorAt } from "./fields";

/**
 * Base stats editor (§9 "Battle & genetics"): four number inputs for HP,
 * Attack, Defense and Speed. `baseStats` may be null (not set yet); a draft can
 * stay that way, publishing needs it set and summing to exactly STAT_BUDGET.
 *
 * The budget rule lives in the schema (`BaseStatsSchema` in
 * packages/shared/src/battle.ts, a Zod `.refine`), so the form shows
 * "Base stats must add up to exactly 300" when you save. Until exercise #16 is
 * done, that submit-time error is the only budget feedback.
 */

// TODO(you): Exercise #16, live stat budget counter.
//
// Goal: while the author types, show "240 / 300, 60 left" under the inputs.
// It turns red (the `text-danger` Tailwind token; this app has no "destructive"
// colour) whenever the total is not exactly STAT_BUDGET, and reads
// "300 / 300" in the normal colour once it fits. Over budget it should say
// "320 / 300, 20 over".
//
// Practises: react-hook-form `useWatch` (re-render on field changes without
// re-rendering the whole form) and Zod refinements (the rule you mirror is the
// `.refine` on BaseStatsSchema).
//
// Steps:
// 1. Watch the four values. Inside this component you already have `control`
//    from useFormContext(). Call
//      const stats = useWatch({ control, name: "baseStats" });
//    It is null when the stats are not set (render nothing then) and an
//    object `{ hp, atk, def, spd }` otherwise. Do NOT use `watch()` from
//    useForm: it re-renders the whole page on every keystroke.
//    Finished example nearby: `useWatch` with several names in GamePreview.tsx,
//    and `useWatch({ control, name: "name" })` in WildkinEditPage.tsx.
// 2. Sum them. The inputs use `valueAsNumber`, so an empty box is NaN, not 0.
//    `baseStatsTotal(stats)` in src/lib/wildkin-form.ts already treats NaN as 0
//    (it is unit-tested); use it, or write your own with Number.isFinite.
// 3. Work out the text: `${total} / ${STAT_BUDGET}`, then ", N left" when
//    total < STAT_BUDGET or ", N over" when total > STAT_BUDGET. Tip: put
//    this in a small pure function next to baseStatsTotal and add a test for
//    it in wildkin-form.test.ts (same style as the formatPercent test).
// 4. Render it in the slot marked "exercise #16" below, e.g.
//      <p aria-live="polite" className={cn("text-xs tabular-nums", ok ? "text-muted" : "text-danger")}>...</p>
//    (`cn` is in @/lib/utils). aria-live lets screen readers hear the change.
// 5. Zod refinement, the stretch part: instead of comparing with STAT_BUDGET
//    yourself, run `BaseStatsSchema.safeParse(stats)` (from @wildbound/shared)
//    and, when it fails, show the first issue's `message` next to the counter.
//    That way the live hint and the submit error can never disagree, and a
//    value outside 10 to 150 shows up too. Read how `.refine(check, { message })`
//    is declared in packages/shared/src/battle.ts.
// 6. Check it: `pnpm dev:manager`, open a Wildkin, set base stats, type
//    60 / 60 / 60 / 60 and see "240 / 300, 60 left" in red, then make one of
//    them 120 and see "300 / 300" turn normal.
// When you are done, remove the "Exercise #16" hint paragraph below.

export function BaseStatsEditor() {
  const { control, register, setValue, formState } = useFormContext<WildkinEntryData>();
  const errors = formState.errors;
  // Only re-renders when stats switch between set and not set (not on every keystroke).
  const isSet = useWatch({ control, name: "baseStats", compute: (v) => v !== null });
  const totalError = errorAt(errors, "baseStats");

  const set = (value: WildkinEntryData["baseStats"]) =>
    setValue("baseStats", value, { shouldDirty: true, shouldValidate: formState.isSubmitted });

  if (!isSet) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-line-strong bg-field/50 p-3">
        <p className="text-xs text-muted">
          Not set yet. The game uses an even 75 / 75 / 75 / 75 until you set them, and publishing needs them.
        </p>
        <Button size="sm" variant="outline" onClick={() => set({ ...DEFAULT_BASE_STATS })}>
          <PlusIcon /> Set base stats
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STAT_KEYS.map((key) => {
          const id = `base-stat-${key}`;
          const error = errorAt(errors, `baseStats.${key}`);
          return (
            <div key={key} className="flex flex-col gap-1">
              <Label htmlFor={id} className="text-xs">
                {STAT_NAMES[key]}
              </Label>
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={BASE_STAT_MIN}
                max={BASE_STAT_MAX}
                step={1}
                className="text-center font-mono tabular-nums"
                aria-invalid={!!(error || totalError) || undefined}
                {...register(`baseStats.${key}`, { valueAsNumber: true })}
              />
              {error ? <p className="text-xs text-danger">{error}</p> : null}
            </div>
          );
        })}
      </div>

      {/* exercise #16: the live budget counter goes here */}

      {totalError ? <p className="text-xs text-danger">{totalError}</p> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-xs text-faint">
          Each {BASE_STAT_MIN} to {BASE_STAT_MAX}; the four must add up to exactly {STAT_BUDGET}. Rarity is not strength.
        </p>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => set(null)}>
          <EraserIcon /> Clear
        </Button>
      </div>
      <p className="text-xs text-faint">
        Exercise #16 (not built yet): a live &ldquo;240 / 300, 60 left&rdquo; counter. For now the total is checked when you save.
      </p>
    </div>
  );
}
