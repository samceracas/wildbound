import { zodResolver } from "@hookform/resolvers/zod";
import type { EncounterTable } from "@wildbound/shared";
import { ENCOUNTER_WEIGHT_MAX, ENCOUNTER_WEIGHT_MIN, EncounterTableSchema } from "@wildbound/shared";
import { describeConditions } from "@wildbound/world";
import { useMemo, useState } from "react";
import { Controller, useForm, useFormContext, useWatch } from "react-hook-form";
import { ConditionsField, EntityForm, Field, Section, TextField, ToggleField, useCommit, useFieldError } from "../components/fields.tsx";
import { Bar, Button, Input, Select } from "../components/ui.tsx";
import { useCreatures } from "../lib/queries.ts";
import { formatSpawnModifiers } from "../lib/spawn-preview.ts";
import { useEditor } from "../store.ts";
import { changedFields, createEntry, updateEncounterTable } from "../world-edit.ts";
import { IssueList } from "./common.tsx";

const TableFormSchema = EncounterTableSchema.pick({
  name: true,
  habitatId: true,
  active: true,
  conditionRules: true,
  entries: true,
});

export function EncounterTableInspector({ table }: { table: EncounterTable }) {
  const world = useEditor((s) => s.world);
  const commit = useEditor((s) => s.commit);
  const creatures = useCreatures();
  const [openEntry, setOpenEntry] = useState<string | null>(null);

  const values = useMemo(
    () => ({
      name: table.name,
      habitatId: table.habitatId,
      active: table.active,
      conditionRules: table.conditionRules,
      entries: table.entries,
    }),
    [table],
  );
  const form = useForm({ resolver: zodResolver(TableFormSchema), values });
  const save = (next: typeof values) => {
    const current = useEditor.getState().world.encounterTables.find((t) => t.id === table.id);
    if (!current) return;
    const patch = changedFields(current, next);
    if (Object.keys(patch).length) commit(updateEncounterTable(useEditor.getState().world, table.id, patch));
  };
  // Adding/removing rows is a structural edit: commit it directly, the form follows via `values`.
  const setEntries = (entries: EncounterTable["entries"]) => commit(updateEncounterTable(world, table.id, { entries }));

  // Live form values, so shares update while a weight is being edited.
  const entries = useWatch({ control: form.control, name: "entries" }) ?? table.entries;
  const total = entries.reduce((s, e) => s + (Number.isFinite(e.weight) ? e.weight : 0), 0);
  const regionHabitats = world.habitats.filter((h) => h.regionId === table.regionId);
  const unused = creatures.filter((c) => !table.entries.some((e) => e.creatureId === c.id));

  return (
    <EntityForm form={form} onCommit={save}>
      <Section title="Encounter table">
        <TextField name="name" label="Name" />
        <Controller
          control={form.control}
          name="habitatId"
          render={({ field }) => (
            <Field label="Applies to">
              <Select
                value={field.value ?? ""}
                onChange={(e) => {
                  field.onChange(e.target.value === "" ? null : e.target.value);
                  void form.handleSubmit(save)();
                }}
              >
                <option value="">Whole region: {world.regions.find((r) => r.id === table.regionId)?.name}</option>
                {regionHabitats.map((h) => (
                  <option key={h.id} value={h.id}>
                    Habitat: {h.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        />
        <ToggleField name="active" label="Active" />
        <ConditionsField name="conditionRules" label="Table conditions" />
      </Section>
      <IssueList entityId={table.id} />
      <Section
        title={`Wildkin (${table.entries.length})`}
        actions={
          unused.length > 0 ? (
            <Select
              className="w-auto px-1.5 py-0.5 text-label"
              value=""
              aria-label="Add Wildkin"
              onChange={(e) => e.target.value && setEntries([...table.entries, createEntry(e.target.value)])}
            >
              <option value="">+ Add Wildkin…</option>
              {unused.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          ) : null
        }
      >
        {entries.length === 0 && <p className="my-[1em] text-muted">Add Wildkin and give each a weight.</p>}
        <ul className="flex flex-col gap-2.5">
          {entries.map((entry, i) => {
            const share = total > 0 && Number.isFinite(entry.weight) ? entry.weight / total : 0;
            const creature = creatures.find((c) => c.id === entry.creatureId);
            const modifiers = formatSpawnModifiers(creature?.spawnModifiers);
            return (
              <li key={entry.id} className="flex flex-col gap-1">
                <EntryRow
                  index={i}
                  knownCreature={!!creature}
                  creatureId={entry.creatureId}
                  creatures={creatures}
                  onToggleConditions={() => setOpenEntry(openEntry === entry.id ? null : entry.id)}
                  onRemove={() => setEntries(table.entries.filter((e) => e.id !== entry.id))}
                />
                <Bar value={share} title={`${(share * 100).toFixed(1)}% before conditions`} />
                <div className="text-meta text-muted">
                  {(share * 100).toFixed(1)}% · {describeConditions(entry.conditions)}
                  {creature ? ` · ${creature.habitatAffinity.join(", ")}` : ""}
                </div>
                {creature && (
                  <div className="text-tiny text-muted" title="Species spawn modifiers (multiply the weight in that weather / time of day)">
                    {modifiers ? `Spawn modifiers: ${modifiers}` : "No spawn modifiers"}
                  </div>
                )}
                {openEntry === entry.id && <ConditionsField name={`entries.${i}.conditions`} />}
              </li>
            );
          })}
        </ul>
      </Section>
    </EntityForm>
  );
}

function EntryRow({
  index,
  knownCreature,
  creatureId,
  creatures,
  onToggleConditions,
  onRemove,
}: {
  index: number;
  knownCreature: boolean;
  creatureId: string;
  creatures: { id: string; name: string }[];
  onToggleConditions: () => void;
  onRemove: () => void;
}) {
  const { register } = useFormContext();
  const commit = useCommit();
  const weightError = useFieldError(`entries.${index}.weight`);
  return (
    <>
      <div className="flex items-center gap-1">
        <Select className="flex-1" {...register(`entries.${index}.creatureId`, { onChange: commit })} aria-label="Wildkin">
          {!knownCreature && <option value={creatureId}>{creatureId} (unknown)</option>}
          {creatures.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          className="w-[70px] shrink-0"
          min={ENCOUNTER_WEIGHT_MIN}
          max={ENCOUNTER_WEIGHT_MAX}
          aria-label="Weight"
          aria-invalid={weightError ? true : undefined}
          {...register(`entries.${index}.weight`, { valueAsNumber: true, onChange: commit })}
        />
        <Button variant="ghost" size="small" title="Conditions" onClick={onToggleConditions}>
          ⚙
        </Button>
        <Button variant="ghost-danger" size="small" title="Remove" onClick={onRemove}>
          ×
        </Button>
      </div>
      {weightError && <div className="text-tiny text-danger">Weight: {weightError}</div>}
    </>
  );
}
