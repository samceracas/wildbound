import type { EncounterEntry, EncounterTable } from "@wildbound/shared";
import { ENCOUNTER_WEIGHT_MAX, ENCOUNTER_WEIGHT_MIN } from "@wildbound/shared";
import { describeConditions } from "@wildbound/world";
import { useState } from "react";
import { ConditionEditor, Field, Section, TextInput, Toggle } from "../components/fields.tsx";
import { useEditor } from "../store.ts";
import { createEntry, updateEncounterTable } from "../world-edit.ts";
import { IssueList } from "./common.tsx";

export function EncounterTableInspector({ table }: { table: EncounterTable }) {
  const world = useEditor((s) => s.world);
  const creatures = useEditor((s) => s.creatures);
  const commit = useEditor((s) => s.commit);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const patch = (p: Partial<EncounterTable>) => commit(updateEncounterTable(world, table.id, p));
  const patchEntry = (id: string, p: Partial<EncounterEntry>) =>
    patch({ entries: table.entries.map((e) => (e.id === id ? { ...e, ...p } : e)) });

  const total = table.entries.reduce((s, e) => s + e.weight, 0);
  const regionHabitats = world.habitats.filter((h) => h.regionId === table.regionId);
  const unused = creatures.filter((c) => !table.entries.some((e) => e.creatureId === c.id));

  return (
    <>
      <Section title="Encounter table">
        <Field label="Name">
          <TextInput value={table.name} onCommit={(name) => patch({ name: name.trim() || table.name })} />
        </Field>
        <Field label="Applies to">
          <select
            value={table.habitatId ?? ""}
            onChange={(e) => patch({ habitatId: e.target.value === "" ? null : e.target.value })}
          >
            <option value="">Whole region: {world.regions.find((r) => r.id === table.regionId)?.name}</option>
            {regionHabitats.map((h) => (
              <option key={h.id} value={h.id}>
                Habitat: {h.name}
              </option>
            ))}
          </select>
        </Field>
        <Toggle label="Active" checked={table.active} onChange={(active) => patch({ active })} />
        <Field label="Table conditions">
          <ConditionEditor value={table.conditionRules} onChange={(conditionRules) => patch({ conditionRules })} />
        </Field>
      </Section>
      <IssueList entityId={table.id} />
      <Section
        title={`Wildkin (${table.entries.length})`}
        actions={
          unused.length > 0 ? (
            <select
              className="small"
              value=""
              aria-label="Add Wildkin"
              onChange={(e) => e.target.value && patch({ entries: [...table.entries, createEntry(e.target.value)] })}
            >
              <option value="">+ Add Wildkin…</option>
              {unused.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : null
        }
      >
        {table.entries.length === 0 && <p className="muted">Add Wildkin and give each a weight.</p>}
        <ul className="entries">
          {table.entries.map((entry) => {
            const share = total > 0 ? entry.weight / total : 0;
            const creature = creatures.find((c) => c.id === entry.creatureId);
            return (
              <li key={entry.id} className="entry">
                <div className="entry-row">
                  <select
                    value={entry.creatureId}
                    onChange={(e) => patchEntry(entry.id, { creatureId: e.target.value })}
                    aria-label="Wildkin"
                  >
                    {!creature && <option value={entry.creatureId}>{entry.creatureId} (unknown)</option>}
                    {creatures.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="weight"
                    min={ENCOUNTER_WEIGHT_MIN}
                    max={ENCOUNTER_WEIGHT_MAX}
                    value={entry.weight}
                    aria-label="Weight"
                    onChange={(e) => {
                      const w = Math.round(Number(e.target.value));
                      if (w >= ENCOUNTER_WEIGHT_MIN && w <= ENCOUNTER_WEIGHT_MAX) patchEntry(entry.id, { weight: w });
                    }}
                  />
                  <button className="btn small ghost" title="Conditions" onClick={() => setOpenEntry(openEntry === entry.id ? null : entry.id)}>
                    ⚙
                  </button>
                  <button
                    className="btn small ghost danger"
                    title="Remove"
                    onClick={() => patch({ entries: table.entries.filter((e) => e.id !== entry.id) })}
                  >
                    ×
                  </button>
                </div>
                <div className="bar" title={`${(share * 100).toFixed(1)}% before conditions`}>
                  <span style={{ width: `${share * 100}%` }} />
                </div>
                <div className="muted small">
                  {(share * 100).toFixed(1)}% · {describeConditions(entry.conditions)}
                  {creature ? ` · ${creature.habitatAffinity.join(", ")}` : ""}
                </div>
                {openEntry === entry.id && (
                  <ConditionEditor value={entry.conditions} onChange={(conditions) => patchEntry(entry.id, { conditions })} />
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    </>
  );
}
