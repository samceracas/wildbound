import { zodResolver } from "@hookform/resolvers/zod";
import type { Habitat } from "@wildbound/shared";
import { HabitatSchema, SUGGESTED_HABITAT_TAGS } from "@wildbound/shared";
import { areaSquareMeters, describeConditions } from "@wildbound/world";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { ConditionsField, EntityForm, Section, SelectField, SlugField, TagsField, TextField } from "../components/fields.tsx";
import { Button, LinkButton } from "../components/ui.tsx";
import { useEditor } from "../store.ts";
import { changedFields, createEncounterTable, updateHabitat } from "../world-edit.ts";
import { formatArea, IssueList } from "./common.tsx";

/** The fields this inspector edits, validated with the shared schema (geometry is edited on the map). */
const HabitatFormSchema = HabitatSchema.pick({
  name: true,
  slug: true,
  regionId: true,
  description: true,
  habitatTags: true,
  conditionRules: true,
});

export function HabitatInspector({ habitat }: { habitat: Habitat }) {
  const world = useEditor((s) => s.world);
  const commit = useEditor((s) => s.commit);
  const select = useEditor((s) => s.select);
  const tables = world.encounterTables.filter((t) => t.habitatId === habitat.id);

  // `values` (not defaultValues): when the habitat changes in the store (undo/redo,
  // another edit), the form resets to it. A new object every render would be fine
  // too (react-hook-form deep-compares), memo just skips that work.
  const values = useMemo(
    () => ({
      name: habitat.name,
      slug: habitat.slug,
      regionId: habitat.regionId,
      description: habitat.description,
      habitatTags: habitat.habitatTags,
      conditionRules: habitat.conditionRules,
    }),
    [habitat],
  );
  const form = useForm({ resolver: zodResolver(HabitatFormSchema), values });

  // Valid, parsed values (e.g. a trimmed name) arrive here. One commit = one undo step.
  const save = (next: typeof values) => {
    const current = useEditor.getState().world.habitats.find((h) => h.id === habitat.id);
    if (!current) return;
    const patch = changedFields(current, next);
    if (Object.keys(patch).length) commit(updateHabitat(useEditor.getState().world, habitat.id, patch));
  };

  return (
    <EntityForm form={form} onCommit={save}>
      <Section title="Habitat">
        <TextField name="name" label="Name" />
        <SlugField />
        <SelectField name="regionId" label="Parent region">
          {world.regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </SelectField>
        <TextField name="description" label="Description" multiline />
        <TagsField
          name="habitatTags"
          label="Habitat tags"
          hint="Semantic hints for encounters and the future Phaser field"
          suggestions={SUGGESTED_HABITAT_TAGS}
        />
        <ConditionsField name="conditionRules" label="Condition rules" hint="When unmet, this habitat's encounter tables are closed" />
        <p className="my-[1em] text-meta text-muted">Area {formatArea(areaSquareMeters(habitat.geometry))}</p>
      </Section>
      <IssueList entityId={habitat.id} />
      <Section
        title="Encounter tables"
        actions={
          <Button
            size="small"
            onClick={() => {
              const { world: next, table } = createEncounterTable(world, habitat.regionId, habitat.id);
              commit(next, { kind: "encounterTable", id: table.id });
            }}
          >
            + Table
          </Button>
        }
      >
        <ul className="flex flex-col gap-1">
          {tables.map((t) => (
            <li key={t.id}>
              <LinkButton onClick={() => select({ kind: "encounterTable", id: t.id })}>{t.name}</LinkButton>
              <span className="text-meta text-muted">
                {" "}
                {t.entries.length} Wildkin · {describeConditions(t.conditionRules)}
                {t.active ? "" : " · inactive"}
              </span>
            </li>
          ))}
          {tables.length === 0 && <li className="text-muted">No encounter table yet</li>}
        </ul>
      </Section>
    </EntityForm>
  );
}
