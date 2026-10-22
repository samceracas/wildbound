import {
  APPROACHES,
  APPROACH_NAMES,
  ATTACK_POWER_MAX,
  ATTACK_POWER_MIN,
  BODY_TRAITS,
  BODY_TRAIT_NAMES,
  MARKING_FREQUENCY_MAX,
  MATCHUPS,
  MAX_ATTACKS,
  SUGGESTED_HABITAT_TAGS,
  powerWord,
  type AlleleOdds,
  type Approach,
  type BodyTrait,
  type MarkingVariant,
  type WildkinEntryData,
} from "@wildbound/shared";
import { CheckIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useId, useState } from "react";
import { Controller, useFieldArray, useWatch, type Control, type FieldErrors } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  addHabitatOverride,
  buildShares,
  clampMarkingFrequency,
  defaultMarking,
  duplicateOverrideTags,
  emptyAttack,
  formatPercent,
  markingShare,
  MAX_BODY_TRAITS,
  MAX_HABITAT_OVERRIDES,
  removeHabitatOverride,
  slugify,
  temperamentShares,
  toggleBodyTrait,
  updateHabitatOverride,
} from "@/lib/wildkin-form";
import { EnumSelect, errorAt, Field, type EnumOption } from "./fields";

/** Editors for §9 "Battle & genetics" (category and base stats live in WildkinEditPage / BaseStatsEditor). */

// ---------------------------------------------------------------- body traits

/** Toggle chips for the five body traits; at most two. Each shows its matchups. */
export function BodyTraitsPicker({
  value,
  onChange,
  invalid,
}: {
  value: BodyTrait[];
  onChange: (v: BodyTrait[]) => void;
  invalid?: boolean;
}) {
  const full = value.length >= MAX_BODY_TRAITS;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-invalid={invalid || undefined}>
        {BODY_TRAITS.map((trait) => {
          const selected = value.includes(trait);
          const m = MATCHUPS[trait];
          return (
            <button
              key={trait}
              type="button"
              aria-pressed={selected}
              disabled={!selected && full}
              title={m.reason}
              onClick={() => onChange(toggleBodyTrait(value, trait))}
              className={cn(
                "flex flex-col items-start rounded-md border px-3 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                selected
                  ? "border-accent bg-accent/10 text-fg"
                  : "border-line bg-field text-muted hover:border-line-strong hover:text-fg",
              )}
            >
              <span className="flex items-center gap-1 text-sm">
                <CheckIcon className={cn("size-3.5 text-accent", !selected && "hidden")} />
                {BODY_TRAIT_NAMES[trait]}
              </span>
              <span className="text-[11px] text-faint">
                weak to {APPROACH_NAMES[m.weak]}, resists {APPROACH_NAMES[m.resist]}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-faint">
        {value.length} / {MAX_BODY_TRAITS} chosen. Pick what its anatomy shows; Strike is always neutral.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- attacks

const APPROACH_HINTS: Record<Approach, string> = {
  strike: "Plain physical hit, always neutral",
  pierce: "Points: beaks, spines, stings",
  crush: "Blunt force: bodies, tails, jaws",
  surge: "Water: splashes, soaking",
  toxin: "Poisons and irritants",
  spore: "Spores, pollen, molds",
};
const APPROACH_OPTIONS: EnumOption<Approach>[] = APPROACHES.map((a) => ({
  value: a,
  label: APPROACH_NAMES[a],
  description: APPROACH_HINTS[a],
}));

const CANON_OPTIONS = [
  { value: "proposed", description: "Not yet approved in the Wildkin Bible" },
  { value: "established", description: "Approved canon" },
] as const;

/** Placeholder attacks (max 2): name, approach, power, canon, description. Like SkillsEditor. */
export function AttacksEditor({
  control,
  errors,
}: {
  control: Control<WildkinEntryData>;
  errors: FieldErrors<WildkinEntryData>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "attacks" });
  return (
    <div className="space-y-3">
      {fields.length === 0 ? <p className="text-xs text-faint">No attacks yet. Publishing needs at least one.</p> : null}
      {fields.map((f, i) => (
        <div
          key={f.id}
          className="grid grid-cols-1 gap-3 rounded-md border border-line bg-field/50 p-3 md:grid-cols-[1fr_150px_120px_150px_auto]"
        >
          <Controller
            control={control}
            name={`attacks.${i}.name`}
            render={({ field }) => (
              <Field label="Attack name" error={errorAt(errors, `attacks.${i}.name`)}>
                {(id) => <Input id={id} {...field} aria-invalid={!!errorAt(errors, `attacks.${i}.name`) || undefined} />}
              </Field>
            )}
          />
          <Controller
            control={control}
            name={`attacks.${i}.approach`}
            render={({ field }) => (
              <Field label="Approach">
                {(id) => <EnumSelect id={id} value={field.value} onChange={field.onChange} options={APPROACH_OPTIONS} />}
              </Field>
            )}
          />
          <Controller
            control={control}
            name={`attacks.${i}.power`}
            render={({ field }) => {
              const error = errorAt(errors, `attacks.${i}.power`);
              const n = field.value;
              return (
                <Field
                  label="Power"
                  error={error}
                  hint={Number.isFinite(n) && n >= ATTACK_POWER_MIN && n <= ATTACK_POWER_MAX ? powerWord(n) : `${ATTACK_POWER_MIN} to ${ATTACK_POWER_MAX}`}
                >
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      inputMode="numeric"
                      min={ATTACK_POWER_MIN}
                      max={ATTACK_POWER_MAX}
                      step={1}
                      className="font-mono tabular-nums"
                      aria-invalid={!!error || undefined}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={Number.isFinite(n) ? n : ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? Number.NaN : e.target.valueAsNumber)}
                    />
                  )}
                </Field>
              );
            }}
          />
          <Controller
            control={control}
            name={`attacks.${i}.canon`}
            render={({ field }) => (
              <Field label="Canon">
                {(id) => <EnumSelect id={id} value={field.value} onChange={field.onChange} options={CANON_OPTIONS} />}
              </Field>
            )}
          />
          <div className="flex items-end">
            <Button size="icon" variant="destructive-ghost" aria-label="Remove attack" onClick={() => remove(i)}>
              <Trash2Icon />
            </Button>
          </div>
          <Controller
            control={control}
            name={`attacks.${i}.description`}
            render={({ field }) => (
              <Field label="Description" className="md:col-span-5" error={errorAt(errors, `attacks.${i}.description`)}>
                {(id) => <Textarea id={id} className="min-h-14" {...field} />}
              </Field>
            )}
          />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={fields.length >= MAX_ATTACKS} onClick={() => append(emptyAttack())}>
          <PlusIcon /> Add attack
        </Button>
        <span className="text-xs text-faint">
          {fields.length} / {MAX_ATTACKS}. Placeholders until the skill system; power {ATTACK_POWER_MIN} to {ATTACK_POWER_MAX}.
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- gene pool

/** A 0..1 (or 0..max) range slider with a numeric readout. */
function ProbabilitySlider({
  id,
  value,
  onChange,
  max = 1,
  step = 0.01,
  label,
}: {
  id?: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
  step?: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 min-w-0 flex-1 cursor-pointer accent-accent"
      />
      <span className="w-12 text-right font-mono text-xs text-fg tabular-nums">{value.toFixed(max < 1 ? 3 : 2)}</span>
    </div>
  );
}

function SharesReadout({ shares }: { shares: { label: string; share: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {shares.map((s) => (
        <span key={s.label} className="rounded border border-line bg-field px-1.5 py-0.5 text-muted">
          {s.label} <span className="font-mono text-fg tabular-nums">{formatPercent(s.share)}</span>
        </span>
      ))}
    </div>
  );
}

const TAG_LIST_ID = "gene-pool-habitat-tags";

/** One habitat tag box with the species' tags and SUGGESTED_HABITAT_TAGS as suggestions (a datalist). */
function OverrideTagInput({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <Input
      list={TAG_LIST_ID}
      className="h-8 font-mono text-xs"
      placeholder="habitat-tag"
      aria-label="Habitat tag"
      aria-invalid={invalid || undefined}
      value={text ?? value}
      onChange={(e) => {
        setText(e.target.value);
        // Picking from the datalist fires a change with a full suggestion: take it right away.
        if (SUGGESTED_HABITAT_TAGS.includes(e.target.value as never)) onChange(e.target.value);
      }}
      onBlur={() => {
        if (text !== null) onChange(slugify(text));
        setText(null);
      }}
    />
  );
}

type GeneKey = "build" | "temperament";

const GENES: Record<GeneKey, { title: string; allele: string; hint: string; shares: (p: number) => { label: string; share: number }[] }> = {
  build: {
    title: "Build",
    allele: "p(L)",
    hint: "Chance each allele is L. Small: HP x0.9, Speed x1.1. Large: HP x1.1, Defense x1.05, Speed x0.9.",
    shares: (p) => {
      const s = buildShares(p);
      return [
        { label: "Small", share: s.small },
        { label: "Typical", share: s.typical },
        { label: "Large", share: s.large },
      ];
    },
  },
  temperament: {
    title: "Temperament",
    allele: "p(W)",
    hint: "Chance each allele is W. Bold: Attack x1.1, Defense x0.9. Wary: Speed x1.1, Attack x0.9.",
    shares: (p) => {
      const s = temperamentShares(p);
      return [
        { label: "Bold", share: s.bold },
        { label: "Steady", share: s.steady },
        { label: "Wary", share: s.wary },
      ];
    },
  },
};

function AlleleOddsEditor({
  gene,
  value,
  onChange,
  habitatTags,
  errors,
}: {
  gene: GeneKey;
  value: AlleleOdds;
  onChange: (v: AlleleOdds) => void;
  habitatTags: readonly string[];
  errors: FieldErrors<WildkinEntryData>;
}) {
  const id = useId();
  const def = GENES[gene];
  const dupes = duplicateOverrideTags(value);
  return (
    <div className="space-y-3 rounded-md border border-line bg-field/50 p-3">
      <div className="space-y-1.5">
        <Label htmlFor={id}>
          {def.title} <span className="font-mono text-xs text-muted">{def.allele}</span>
        </Label>
        <ProbabilitySlider id={id} label={`${def.title} ${def.allele}`} value={value.pAllele} onChange={(p) => onChange({ ...value, pAllele: p })} />
        <SharesReadout shares={def.shares(value.pAllele)} />
        <p className="text-xs text-faint">{def.hint}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">Habitat overrides</p>
        {value.byHabitatTag.length === 0 ? (
          <p className="text-xs text-faint">None: every habitat uses {value.pAllele.toFixed(2)}.</p>
        ) : null}
        {value.byHabitatTag.map((o, i) => {
          const tagError = errorAt(errors, `genePool.${gene}.byHabitatTag.${i}.tag`);
          return (
            <div key={i} className="space-y-1 rounded border border-line bg-panel p-2">
              <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-2">
                <OverrideTagInput
                  value={o.tag}
                  invalid={!!tagError}
                  onChange={(tag) => onChange(updateHabitatOverride(value, i, { tag }))}
                />
                <ProbabilitySlider
                  label={`${def.allele} in ${o.tag || "this habitat"}`}
                  value={o.pAllele}
                  onChange={(p) => onChange(updateHabitatOverride(value, i, { pAllele: p }))}
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove override"
                  onClick={() => onChange(removeHabitatOverride(value, i))}
                >
                  <Trash2Icon />
                </Button>
              </div>
              <SharesReadout shares={def.shares(o.pAllele)} />
              {tagError ? <p className="text-xs text-danger">{tagError}</p> : null}
              {o.tag && dupes.includes(o.tag) ? (
                <p className="text-xs text-warning">Listed more than once: only the first {o.tag} row applies.</p>
              ) : null}
            </div>
          );
        })}
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={value.byHabitatTag.length >= MAX_HABITAT_OVERRIDES}
            onClick={() => onChange(addHabitatOverride(value, habitatTags))}
          >
            <PlusIcon /> Add override
          </Button>
          <span className="text-xs text-faint">First matching tag (in this order) wins.</span>
        </div>
      </div>
    </div>
  );
}

function MarkingEditor({
  value,
  onChange,
  errors,
}: {
  value: MarkingVariant | null;
  onChange: (v: MarkingVariant | null) => void;
  errors: FieldErrors<WildkinEntryData>;
}) {
  const switchId = useId();
  const nameId = useId();
  const freqId = useId();
  const descId = useId();
  return (
    <div className="space-y-3 rounded-md border border-line bg-field/50 p-3">
      <div className="flex items-center gap-2">
        <Switch id={switchId} checked={value !== null} onCheckedChange={(on) => onChange(on ? defaultMarking() : null)} />
        <Label htmlFor={switchId}>Marking variant</Label>
        <span className="text-xs text-faint">Cosmetic only, recessive (mm).</span>
      </div>
      {value ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              placeholder="e.g. Banded"
              value={value.name}
              aria-invalid={!!errorAt(errors, "genePool.marking.name") || undefined}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
            />
            {errorAt(errors, "genePool.marking.name") ? (
              <p className="text-xs text-danger">{errorAt(errors, "genePool.marking.name")}</p>
            ) : (
              <p className="text-xs text-faint">Named after a visible difference.</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={freqId}>
              Frequency <span className="font-mono text-xs text-muted">p(m)</span>
            </Label>
            <ProbabilitySlider
              id={freqId}
              label="Marking frequency"
              max={MARKING_FREQUENCY_MAX}
              step={0.005}
              value={value.frequency}
              onChange={(f) => onChange({ ...value, frequency: clampMarkingFrequency(f) })}
            />
            <p className="text-xs text-faint">
              Expressed in <span className="font-mono text-fg">{formatPercent(markingShare(value.frequency))}</span> of
              individuals (frequency squared).
            </p>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor={descId}>Description</Label>
            <Textarea
              id={descId}
              className="min-h-14"
              value={value.description}
              onChange={(e) => onChange({ ...value, description: e.target.value })}
            />
            {errorAt(errors, "genePool.marking.description") ? (
              <p className="text-xs text-danger">{errorAt(errors, "genePool.marking.description")}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-xs text-faint">None. Every individual looks the same.</p>
      )}
    </div>
  );
}

/** Build and Temperament allele odds (with habitat overrides) and the optional marking variant. */
export function GenePoolEditor({
  control,
  errors,
}: {
  control: Control<WildkinEntryData>;
  errors: FieldErrors<WildkinEntryData>;
}) {
  const habitatTags = useWatch({ control, name: "habitatTags" });
  const suggestions = [...habitatTags, ...SUGGESTED_HABITAT_TAGS.filter((t) => !habitatTags.includes(t))];
  return (
    <div className="space-y-3">
      <datalist id={TAG_LIST_ID}>
        {suggestions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {(["build", "temperament"] as const).map((gene) => (
          <Controller
            key={gene}
            control={control}
            name={`genePool.${gene}`}
            render={({ field }) => (
              <AlleleOddsEditor gene={gene} value={field.value} onChange={field.onChange} habitatTags={habitatTags} errors={errors} />
            )}
          />
        ))}
      </div>
      <Controller
        control={control}
        name="genePool.marking"
        render={({ field }) => <MarkingEditor value={field.value} onChange={field.onChange} errors={errors} />}
      />
      <p className="text-xs text-faint">
        At 0.5 a quarter of individuals are Small, half Typical, a quarter Large. Leave the defaults unless the species
        clearly varies.
      </p>
    </div>
  );
}
