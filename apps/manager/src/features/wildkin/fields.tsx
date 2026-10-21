import { SUGGESTED_HABITAT_TAGS, TIME_OF_DAY, WEATHER, type SpawnModifiers, type WildkinEntryData } from "@wildbound/shared";
import { CheckIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Controller, useFieldArray, type Control, type FieldErrors } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  addTag,
  modifierInputValue,
  parseModifierInput,
  removeTag,
  setSpawnModifier,
  slugify,
  type ModifierGroup,
} from "@/lib/wildkin-form";

// ---------------------------------------------------------------- layout

/** Label + control + hint/error. `htmlFor` defaults to a generated id passed to the render prop. */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

/** A section of the entry form, styled like a Bible chapter. */
export function Section({
  id,
  number,
  title,
  description,
  children,
}: {
  id: string;
  number: number;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-lg border border-line bg-panel">
      <header className="flex items-baseline gap-3 border-b border-line px-5 py-3">
        <span className="font-mono text-xs text-gold">§{number}</span>
        <h2 className="font-serif text-base text-fg">{title}</h2>
        {description ? <p className="ml-auto text-xs text-faint">{description}</p> : null}
      </header>
      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">{children}</div>
    </section>
  );
}

/** Error message at a (possibly nested) path, e.g. "skills.0.name". */
export function errorAt(errors: FieldErrors<WildkinEntryData>, path: string): string | undefined {
  let cur: unknown = errors;
  for (const part of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  const msg = (cur as { message?: unknown } | undefined)?.message;
  return typeof msg === "string" ? msg : undefined;
}

// ---------------------------------------------------------------- selects

export interface EnumOption<T extends string> {
  value: T;
  label?: string;
  description?: string;
}

export function EnumSelect<T extends string>({
  id,
  value,
  onChange,
  options,
  invalid,
}: {
  id?: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly EnumOption<T>[];
  invalid?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger id={id} aria-invalid={invalid || undefined}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} description={o.description}>
            {o.label ?? o.value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------- tags

function Chips({ tags, onRemove, mono }: { tags: readonly string[]; onRemove: (t: string) => void; mono?: boolean }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <Badge key={t} variant="accent" className={cn("pr-1", mono && "font-mono")}>
          {t}
          <button
            type="button"
            className="rounded-full p-0.5 hover:bg-accent/20"
            onClick={() => onRemove(t)}
            aria-label={`Remove ${t}`}
          >
            <XIcon />
          </button>
        </Badge>
      ))}
    </div>
  );
}

/** Habitat tags: a combobox over SUGGESTED_HABITAT_TAGS that also accepts custom slugs. */
export function HabitatTagsInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id?: string;
  value: string[];
  onChange: (v: string[]) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const custom = slugify(query);
  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = SUGGESTED_HABITAT_TAGS.filter((t) => !q || t.includes(q) || t.includes(custom)) as string[];
    const extra = custom && !SUGGESTED_HABITAT_TAGS.includes(custom as never) ? [custom] : [];
    return [...base, ...extra];
  }, [query, custom]);

  useEffect(() => setActive(0), [query]);

  const toggle = (tag: string) => {
    onChange(value.includes(tag) ? removeTag(value, tag) : addTag(value, tag, "slug"));
    setQuery("");
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <Input
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid || undefined}
            autoComplete="off"
            placeholder="Add habitat tags (type to filter or add a custom slug)…"
            value={query}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(options.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const pick = options[active];
                if (pick) toggle(pick);
              } else if (e.key === "Escape") {
                setOpen(false);
              } else if (e.key === "Backspace" && !query && value.length) {
                onChange(value.slice(0, -1));
              }
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          className="max-h-64 w-(--radix-popover-trigger-width) min-w-64 overflow-y-auto p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (e.target instanceof HTMLElement && e.target.id === id) e.preventDefault();
          }}
        >
          {options.length === 0 ? <p className="px-2 py-1.5 text-xs text-faint">Type a tag name.</p> : null}
          {options.map((tag, i) => {
            const selected = value.includes(tag);
            const isCustom = !SUGGESTED_HABITAT_TAGS.includes(tag as never);
            return (
              <button
                key={tag}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left font-mono text-xs",
                  i === active ? "bg-panel-2" : "hover:bg-panel-2/60",
                )}
                onMouseEnter={() => setActive(i)}
                onClick={() => toggle(tag)}
              >
                <CheckIcon className={cn("size-3.5 text-accent", !selected && "invisible")} />
                {isCustom && !selected ? <span className="font-sans text-muted">Add</span> : null}
                {tag}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
      <Chips tags={value} onRemove={(t) => onChange(removeTag(value, t))} mono />
    </div>
  );
}

/** Free-form tags: Enter or comma adds, chips remove. */
export function FreeTagInput({
  id,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  id?: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [text, setText] = useState("");
  const commit = () => {
    if (!text.trim()) return;
    onChange(addTag(value, text, "free"));
    setText("");
  };
  return (
    <div className="space-y-2">
      <Input
        id={id}
        value={text}
        aria-invalid={invalid || undefined}
        placeholder={placeholder ?? "Type and press Enter…"}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
      />
      <Chips tags={value} onRemove={(t) => onChange(removeTag(value, t))} />
    </div>
  );
}

// ---------------------------------------------------------------- lists

/** Editable list of short strings (open questions). */
export function StringListEditor({
  value,
  onChange,
  max,
  placeholder,
  addLabel,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  max: number;
  placeholder?: string;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {value.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2 w-5 shrink-0 text-right font-mono text-xs text-faint">{i + 1}.</span>
          <Textarea
            className="min-h-9"
            rows={1}
            value={item}
            placeholder={placeholder}
            onChange={(e) => onChange(value.map((v, j) => (j === i ? e.target.value : v)))}
          />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Remove"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" disabled={value.length >= max} onClick={() => onChange([...value, ""])}>
        <PlusIcon /> {addLabel}
      </Button>
    </div>
  );
}

const CANON_OPTIONS = [
  { value: "proposed", description: "Not yet approved in the Wildkin Bible" },
  { value: "established", description: "Approved canon" },
] as const;

/** Skills (max 8): name, description, canon. */
export function SkillsEditor({
  control,
  errors,
}: {
  control: Control<WildkinEntryData>;
  errors: FieldErrors<WildkinEntryData>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "skills" });
  return (
    <div className="space-y-3">
      {fields.length === 0 ? <p className="text-xs text-faint">No skills yet.</p> : null}
      {fields.map((f, i) => (
        <div key={f.id} className="grid grid-cols-1 gap-3 rounded-md border border-line bg-field/50 p-3 md:grid-cols-[1fr_180px_auto]">
          <Controller
            control={control}
            name={`skills.${i}.name`}
            render={({ field }) => (
              <Field label="Skill name" error={errorAt(errors, `skills.${i}.name`)}>
                {(id) => <Input id={id} {...field} aria-invalid={!!errorAt(errors, `skills.${i}.name`) || undefined} />}
              </Field>
            )}
          />
          <Controller
            control={control}
            name={`skills.${i}.canon`}
            render={({ field }) => (
              <Field label="Canon">
                {(id) => <EnumSelect id={id} value={field.value} onChange={field.onChange} options={CANON_OPTIONS} />}
              </Field>
            )}
          />
          <div className="flex items-end">
            <Button size="icon" variant="destructive-ghost" aria-label="Remove skill" onClick={() => remove(i)}>
              <Trash2Icon />
            </Button>
          </div>
          <Controller
            control={control}
            name={`skills.${i}.description`}
            render={({ field }) => (
              <Field label="Description" className="md:col-span-3" error={errorAt(errors, `skills.${i}.description`)}>
                {(id) => <Textarea id={id} className="min-h-14" {...field} />}
              </Field>
            )}
          />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          disabled={fields.length >= 8}
          onClick={() => append({ name: "", description: "", canon: "proposed" })}
        >
          <PlusIcon /> Add skill
        </Button>
        <span className="text-xs text-faint">{fields.length} / 8</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- spawn modifiers

function ModifierInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: number | undefined) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  // Follow outside changes (AI suggestion, reset) without fighting the user's typing.
  useEffect(() => {
    setText((t) => {
      const parsed = parseModifierInput(t);
      const current = parsed === "invalid" ? undefined : parsed;
      return String(current ?? "") === value ? t : value;
    });
  }, [value]);
  const parsed = parseModifierInput(text);
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="font-mono text-[11px] capitalize">
        {label}
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        placeholder="1"
        className="h-8 text-center tabular-nums"
        aria-invalid={parsed === "invalid" || undefined}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const p = parseModifierInput(e.target.value);
          if (p !== "invalid") onChange(p);
        }}
        onBlur={() => setText(value)}
      />
    </div>
  );
}

/** Multipliers 0–10 per time of day and weather; blank = unset (1). */
export function SpawnModifiersEditor({
  value,
  onChange,
}: {
  value: SpawnModifiers;
  onChange: (v: SpawnModifiers) => void;
}) {
  const groups: Array<{ group: ModifierGroup; title: string; keys: readonly string[] }> = [
    { group: "timeOfDay", title: "Time of day", keys: TIME_OF_DAY },
    { group: "weather", title: "Weather", keys: WEATHER },
  ];
  return (
    <div className="space-y-3">
      {groups.map(({ group, title, keys }) => (
        <div key={group}>
          <p className="mb-1.5 text-xs font-medium text-muted">{title}</p>
          <div className="grid grid-cols-5 gap-2">
            {keys.map((k) => (
              <ModifierInput
                key={k}
                label={k}
                value={modifierInputValue(value, group, k)}
                onChange={(n) => onChange(setSpawnModifier(value, group, k, n))}
              />
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-faint">Multiplies encounter weight. Blank = 1 (no change), 0 = never spawns, max 10.</p>
    </div>
  );
}
