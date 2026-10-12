import type { Habitat } from "@wildbound/shared";
import { SUGGESTED_HABITAT_TAGS } from "@wildbound/shared";
import { areaSquareMeters, describeConditions } from "@wildbound/world";
import { ConditionEditor, Field, NameAndSlug, Section, TagInput, TextInput } from "../components/fields.tsx";
import { useEditor } from "../store.ts";
import { createEncounterTable, updateHabitat } from "../world-edit.ts";
import { formatArea, IssueList } from "./common.tsx";

export function HabitatInspector({ habitat }: { habitat: Habitat }) {
  const world = useEditor((s) => s.world);
  const commit = useEditor((s) => s.commit);
  const select = useEditor((s) => s.select);
  const patch = (p: Partial<Habitat>) => commit(updateHabitat(world, habitat.id, p));
  const tables = world.encounterTables.filter((t) => t.habitatId === habitat.id);

  return (
    <>
      <Section title="Habitat">
        <NameAndSlug name={habitat.name} slug={habitat.slug} onName={(name) => patch({ name })} onSlug={(slug) => patch({ slug })} />
        <Field label="Parent region">
          <select value={habitat.regionId} onChange={(e) => patch({ regionId: e.target.value })}>
            {world.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <TextInput multiline value={habitat.description} onCommit={(description) => patch({ description })} />
        </Field>
        <Field label="Habitat tags" hint="Semantic hints for encounters and the future Phaser field">
          <TagInput tags={habitat.habitatTags} suggestions={SUGGESTED_HABITAT_TAGS} onChange={(habitatTags) => patch({ habitatTags })} />
        </Field>
        <Field label="Condition rules" hint="When unmet, this habitat's encounter tables are closed">
          <ConditionEditor value={habitat.conditionRules} onChange={(conditionRules) => patch({ conditionRules })} />
        </Field>
        <p className="muted small">Area {formatArea(areaSquareMeters(habitat.geometry))}</p>
      </Section>
      <IssueList entityId={habitat.id} />
      <Section
        title="Encounter tables"
        actions={
          <button
            className="btn small"
            onClick={() => {
              const { world: next, table } = createEncounterTable(world, habitat.regionId, habitat.id);
              commit(next, { kind: "encounterTable", id: table.id });
            }}
          >
            + Table
          </button>
        }
      >
        <ul className="link-list">
          {tables.map((t) => (
            <li key={t.id}>
              <button className="link" onClick={() => select({ kind: "encounterTable", id: t.id })}>
                {t.name}
              </button>
              <span className="muted small">
                {" "}
                {t.entries.length} Wildkin · {describeConditions(t.conditionRules)}
                {t.active ? "" : " · inactive"}
              </span>
            </li>
          ))}
          {tables.length === 0 && <li className="muted">No encounter table yet</li>}
        </ul>
      </Section>
    </>
  );
}
