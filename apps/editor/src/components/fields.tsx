import { useEffect, useId, useState, type ReactNode } from "react";
import type { ConditionRules, UnlockCondition } from "@wildbound/shared";
import { TIME_OF_DAY, WEATHER } from "@wildbound/shared";
import { isValidSlug, slugify } from "../world-edit.ts";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

/** Text input that commits on blur/Enter so each edit is one undo step. */
export function TextInput({
  value,
  onCommit,
  placeholder,
  multiline,
  invalid,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const common = {
    value: draft,
    placeholder,
    className: invalid ? "invalid" : undefined,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
  };
  return multiline ? (
    <textarea rows={3} {...common} />
  ) : (
    <input
      type="text"
      {...common}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

export function NameAndSlug({
  name,
  slug,
  onName,
  onSlug,
}: {
  name: string;
  slug: string;
  onName: (v: string) => void;
  onSlug: (v: string) => void;
}) {
  const [slugDraft, setSlugDraft] = useState(slug);
  useEffect(() => setSlugDraft(slug), [slug]);
  const valid = isValidSlug(slugDraft);
  return (
    <>
      <Field label="Name">
        <TextInput value={name} onCommit={(v) => onName(v.trim() || name)} />
      </Field>
      <Field label="Slug" hint={valid ? "Stable identifier used by game data" : "Lowercase letters, numbers and hyphens"}>
        <div className="row">
          <input
            type="text"
            className={valid ? undefined : "invalid"}
            value={slugDraft}
            onChange={(e) => setSlugDraft(e.target.value)}
            onBlur={() => (valid && slugDraft !== slug ? onSlug(slugDraft) : setSlugDraft(slug))}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
          <button type="button" className="btn small" title="Generate from name" onClick={() => onSlug(slugify(name))}>
            ↻
          </button>
        </div>
      </Field>
    </>
  );
}

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
    <div className="tags">
      {tags.map((t) => (
        <span key={t} className="tag">
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
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
    <div className="chips">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            className={`chip ${on ? "on" : ""}`}
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
    <div className="conditions">
      <div className="conditions-row">
        <span className="muted">Time</span>
        <ChipGroup options={TIME_OF_DAY} selected={value.timeOfDay} onChange={(timeOfDay) => onChange({ ...value, timeOfDay })} />
      </div>
      <div className="conditions-row">
        <span className="muted">Weather</span>
        <ChipGroup options={WEATHER} selected={value.weather} onChange={(weather) => onChange({ ...value, weather })} />
      </div>
      <span className="field-hint">None selected = any</span>
    </div>
  );
}

export function UnlockEditor({ value, onChange }: { value: UnlockCondition; onChange: (v: UnlockCondition) => void }) {
  const flags = value?.requiredFlags ?? [];
  return (
    <TagInput
      tags={flags}
      suggestions={[]}
      onChange={(next) => onChange(next.length ? { requiredFlags: next } : null)}
    />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="section">
      <header className="section-header">
        <h3>{title}</h3>
        {actions}
      </header>
      {children}
    </section>
  );
}
