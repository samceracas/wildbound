/**
 * Controlled inputs from before the inspectors moved to react-hook-form.
 * Only PoiInspector still uses them (it is the TODO(you) exercise #9).
 * Once you have converted it, delete this file.
 */
import { useEffect, useState } from "react";
import { isValidSlug, slugify } from "../world-edit.ts";
import { Field } from "./fields.tsx";
import { Button, Input, Textarea } from "./ui.tsx";

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
    "aria-invalid": invalid || undefined,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
  };
  return multiline ? (
    <Textarea {...common} />
  ) : (
    <Input
      {...common}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
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
        <div className="flex items-center gap-1.5">
          <Input
            aria-invalid={valid ? undefined : true}
            value={slugDraft}
            onChange={(e) => setSlugDraft(e.target.value)}
            onBlur={() => (valid && slugDraft !== slug ? onSlug(slugDraft) : setSlugDraft(slug))}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <Button size="small" title="Generate from name" onClick={() => onSlug(slugify(name))}>
            ↻
          </Button>
        </div>
      </Field>
    </>
  );
}
