/**
 * Inspector form building blocks.
 *
 * Inspectors are react-hook-form forms validated by zodResolver with the
 * `@wildbound/shared` schemas. A form never owns the world: every field
 * "commits" (validate the form, then write the changed fields to the Zustand
 * store as ONE undo step) on blur for text, and on change for selects, toggles,
 * tags and chips. Undo/redo or map edits change the store, the inspector passes
 * the entity back to useForm({ values }), and the form resets to it.
 *
 * Usage (see inspectors/HabitatInspector.tsx):
 *   const form = useForm({ resolver: zodResolver(Schema), values: pickFields(entity) });
 *   <EntityForm form={form} onCommit={(values) => commitPatch(values)}>
 *     <TextField name="name" label="Name" />
 *   </EntityForm>
 */
import { createContext, useContext, useId, useState, type ReactNode } from "react";
import {
  FormProvider,
  get,
  useController,
  useFormContext,
  useFormState,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";
import type { ConditionRules, UnlockCondition } from "@wildbound/shared";
import { TIME_OF_DAY, WEATHER } from "@wildbound/shared";
import { cn } from "@/lib/utils.ts";
import { slugify } from "../world-edit.ts";
import { Button, Input, Select, Tag, Textarea } from "./ui.tsx";

// ------------------------------------------------------------------ layout

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-meta text-muted">{label}</span>
      {children}
      {error ? (
        <span className="text-tiny text-danger" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="text-tiny text-muted opacity-80">{hint}</span>
      ) : null}
    </label>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-b border-line p-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-label font-bold uppercase tracking-[0.06em]">{title}</h3>
        {actions}
      </header>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ controlled widgets (value + onChange)

export function TagInput({
  tags,
  suggestions,
  onChange,
}: {
  tags: string[];
  suggestions: readonly string[];
  onChange: (tags: string[]) => void;
}) {
  const [text, setText] = useState("");
  const listId = useId();
  const add = (raw: string) => {
    const tag = slugify(raw);
    if (raw.trim() && !tags.includes(tag)) onChange([...tags, tag]);
    setText("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-control border border-line bg-canvas p-1">
      {tags.map((t) => (
        <Tag key={t}>
          {t}
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-muted"
            aria-label={`Remove ${t}`}
            onClick={() => onChange(tags.filter((x) => x !== t))}
          >
            ×
          </button>
        </Tag>
      ))}
      <input
        type="text"
        className="w-auto min-w-[90px] flex-1 rounded-control border-0 bg-canvas px-1 py-0.5 outline-none"
        list={listId}
        value={text}
        placeholder="add tag…"
        onChange={(e) => {
          const v = e.target.value;
          // Picking from the datalist fills the whole value at once.
          if (suggestions.includes(v)) add(v);
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => text && add(text)}
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}

function ChipGroup<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: readonly T[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            className={cn(
              "cursor-pointer rounded-full border border-line bg-transparent px-2 py-px text-meta",
              on && "border-info bg-info text-[#04202e]",
            )}
            aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((x) => x !== o) : options.filter((x) => selected.includes(x) || x === o))}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** Time-of-day and weather rules. No chips selected = any. */
export function ConditionEditor({ value, onChange }: { value: ConditionRules; onChange: (v: ConditionRules) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="w-[54px] shrink-0 text-meta text-muted">Time</span>
        <ChipGroup options={TIME_OF_DAY} selected={value.timeOfDay} onChange={(timeOfDay) => onChange({ ...value, timeOfDay })} />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-[54px] shrink-0 text-meta text-muted">Weather</span>
        <ChipGroup options={WEATHER} selected={value.weather} onChange={(weather) => onChange({ ...value, weather })} />
      </div>
      <span className="text-tiny text-muted opacity-80">None selected = any</span>
    </div>
  );
}

export function UnlockEditor({ value, onChange }: { value: UnlockCondition; onChange: (v: UnlockCondition) => void }) {
  const flags = value?.requiredFlags ?? [];
  return <TagInput tags={flags} suggestions={[]} onChange={(next) => onChange(next.length ? { requiredFlags: next } : null)} />;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" className="mt-[3px] mr-[3px] mb-[3px] ml-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// ------------------------------------------------------------------ react-hook-form

const CommitContext = createContext<() => void>(() => {});

/** Validates the whole form with its resolver; when valid, hands the parsed values to `onCommit`. */
export function useCommit() {
  return useContext(CommitContext);
}

export function EntityForm<T extends FieldValues, TOut>({
  form,
  onCommit,
  children,
}: {
  form: UseFormReturn<T, unknown, TOut>;
  onCommit: (values: TOut) => void;
  children: ReactNode;
}) {
  const commit = () => void form.handleSubmit(onCommit)();
  return (
    <FormProvider {...form}>
      <CommitContext.Provider value={commit}>{children}</CommitContext.Provider>
    </FormProvider>
  );
}

/** First error message at `name` (or nested under it, e.g. one bad tag in a list). */
function firstMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const { message } = error as { message?: unknown };
  if (typeof message === "string" && message) return message;
  for (const value of Object.values(error)) {
    if (value && typeof value === "object" && !(value instanceof Element)) {
      const nested = firstMessage(value);
      if (nested) return nested;
    }
  }
  return undefined;
}

export function useFieldError(name: string): string | undefined {
  const { errors } = useFormState({ name });
  return firstMessage(get(errors, name));
}

/** Text input or textarea. Commits on blur; Enter commits, Escape reverts. */
export function TextField({
  name,
  label,
  hint,
  multiline,
  placeholder,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  multiline?: boolean;
  placeholder?: string;
}) {
  const { register, resetField } = useFormContext();
  const commit = useCommit();
  const error = useFieldError(name);
  const props = { ...register(name, { onBlur: commit }), placeholder, "aria-invalid": error ? true : undefined };
  return (
    <Field label={label} hint={hint} error={error}>
      {multiline ? (
        <Textarea {...props} />
      ) : (
        <Input
          {...props}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") resetField(name);
          }}
        />
      )}
    </Field>
  );
}

/** Slug input with a "generate from name" button. */
export function SlugField({ name = "slug", from = "name" }: { name?: string; from?: string }) {
  const { register, resetField, setValue, getValues } = useFormContext();
  const commit = useCommit();
  const error = useFieldError(name);
  return (
    <Field label="Slug" hint="Stable identifier used by game data" error={error}>
      <div className="flex items-center gap-1.5">
        <Input
          {...register(name, { onBlur: commit })}
          aria-invalid={error ? true : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") resetField(name);
          }}
        />
        <Button
          size="small"
          title="Generate from name"
          onClick={() => {
            setValue(name, slugify(String(getValues(from) ?? "")), { shouldDirty: true });
            commit();
          }}
        >
          ↻
        </Button>
      </div>
    </Field>
  );
}

/** Native select. Commits on change. */
export function SelectField({ name, label, hint, children }: { name: string; label: string; hint?: ReactNode; children: ReactNode }) {
  const { register } = useFormContext();
  const commit = useCommit();
  const error = useFieldError(name);
  return (
    <Field label={label} hint={hint} error={error}>
      <Select {...register(name, { onChange: commit })} aria-invalid={error ? true : undefined}>
        {children}
      </Select>
    </Field>
  );
}

export function ToggleField({ name, label }: { name: string; label: string }) {
  const { register } = useFormContext();
  const commit = useCommit();
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" className="mt-[3px] mr-[3px] mb-[3px] ml-1" {...register(name, { onChange: commit })} />
      <span>{label}</span>
    </label>
  );
}

/** Wraps a controlled widget: update the form value, then commit. */
function useCommittedController<V>(name: string) {
  const { field } = useController({ name });
  const commit = useCommit();
  return {
    value: field.value as V,
    onChange: (v: V) => {
      field.onChange(v);
      commit();
    },
  };
}

export function TagsField({ name, label, hint, suggestions = [] }: { name: string; label: string; hint?: ReactNode; suggestions?: readonly string[] }) {
  const { value, onChange } = useCommittedController<string[]>(name);
  const error = useFieldError(name);
  return (
    <Field label={label} hint={hint} error={error}>
      <TagInput tags={value ?? []} suggestions={suggestions} onChange={onChange} />
    </Field>
  );
}

export function ConditionsField({ name, label, hint }: { name: string; label?: string; hint?: ReactNode }) {
  const { value, onChange } = useCommittedController<ConditionRules>(name);
  const error = useFieldError(name);
  const editor = <ConditionEditor value={value} onChange={onChange} />;
  return label ? (
    <Field label={label} hint={hint} error={error}>
      {editor}
    </Field>
  ) : (
    editor
  );
}

export function UnlockField({ name, label, hint }: { name: string; label: string; hint?: ReactNode }) {
  const { value, onChange } = useCommittedController<UnlockCondition>(name);
  const error = useFieldError(name);
  return (
    <Field label={label} hint={hint} error={error}>
      <UnlockEditor value={value} onChange={onChange} />
    </Field>
  );
}
