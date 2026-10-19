import { zodResolver } from "@hookform/resolvers/zod";
import type { WorldRegion } from "@wildbound/shared";
import { SUGGESTED_BIOME_TAGS, WorldRegionSchema } from "@wildbound/shared";
import { areaSquareMeters } from "@wildbound/world";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { EntityForm, Section, SlugField, TagsField, TextField, ToggleField, UnlockField } from "../components/fields.tsx";
import { Button, LinkButton } from "../components/ui.tsx";
import { useEditor } from "../store.ts";
import { changedFields, createEncounterTable, updateRegion } from "../world-edit.ts";
import { formatArea, IssueList } from "./common.tsx";

const RegionFormSchema = WorldRegionSchema.pick({
  name: true,
  slug: true,
  description: true,
  biomeTags: true,
  active: true,
  unlockCondition: true,
  storyStateRequirements: true,
});

export function RegionInspector({ region }: { region: WorldRegion }) {
  const world = useEditor((s) => s.world);
  const commit = useEditor((s) => s.commit);
  const select = useEditor((s) => s.select);
  const setTool = useEditor((s) => s.setTool);

  const values = useMemo(
    () => ({
      name: region.name,
      slug: region.slug,
      description: region.description,
      biomeTags: region.biomeTags,
      active: region.active,
      unlockCondition: region.unlockCondition,
      storyStateRequirements: region.storyStateRequirements,
    }),
    [region],
  );
  const form = useForm({ resolver: zodResolver(RegionFormSchema), values });
  const save = (next: typeof values) => {
    const current = useEditor.getState().world.regions.find((r) => r.id === region.id);
    if (!current) return;
    const patch = changedFields(current, next);
    if (Object.keys(patch).length) commit(updateRegion(useEditor.getState().world, region.id, patch));
  };

  const habitats = world.habitats.filter((h) => h.regionId === region.id);
  const pois = world.pois.filter((p) => p.regionId === region.id);
  const regionTables = world.encounterTables.filter((t) => t.regionId === region.id && t.habitatId === null);

  return (
    <EntityForm form={form} onCommit={save}>
      <Section title="Region">
        <TextField name="name" label="Name" />
        <SlugField />
        <TextField name="description" label="Description" multiline />
        <TagsField name="biomeTags" label="Biome tags" suggestions={SUGGESTED_BIOME_TAGS} />
        <ToggleField name="active" label="Active (resolvable once published)" />
        <UnlockField name="unlockCondition" label="Unlock: required story flags" hint="Stored for the game; not evaluated in the POC" />
        <TagsField name="storyStateRequirements" label="Story state requirements" />
        <p className="my-[1em] text-meta text-muted">
          Area {formatArea(areaSquareMeters(region.geometry))} · drag white handles to reshape, drag midpoints to add vertices,
          right-click a vertex to delete it.
        </p>
      </Section>
      <IssueList entityId={region.id} />
      <Section
        title={`Habitats (${habitats.length})`}
        actions={
          <Button size="small" onClick={() => setTool("draw-habitat")}>
            + Draw
          </Button>
        }
      >
        <ul className="flex flex-col gap-1">
          {habitats.map((h) => (
            <li key={h.id}>
              <LinkButton onClick={() => select({ kind: "habitat", id: h.id }, true)}>{h.name}</LinkButton>
            </li>
          ))}
          {habitats.length === 0 && <li className="text-muted">None yet</li>}
        </ul>
      </Section>
      <Section
        title={`POIs (${pois.length})`}
        actions={
          <Button size="small" onClick={() => setTool("place-poi")}>
            + Place
          </Button>
        }
      >
        <ul className="flex flex-col gap-1">
          {pois.map((p) => (
            <li key={p.id}>
              <LinkButton onClick={() => select({ kind: "poi", id: p.id }, true)}>{p.name}</LinkButton>
              <span className="text-meta text-muted"> {p.type}</span>
            </li>
          ))}
          {pois.length === 0 && <li className="text-muted">None yet</li>}
        </ul>
      </Section>
      <Section
        title="Region-wide encounters"
        actions={
          <Button
            size="small"
            onClick={() => {
              const { world: next, table } = createEncounterTable(world, region.id, null);
              commit(next, { kind: "encounterTable", id: table.id });
            }}
          >
            + Table
          </Button>
        }
      >
        <ul className="flex flex-col gap-1">
          {regionTables.map((t) => (
            <li key={t.id}>
              <LinkButton onClick={() => select({ kind: "encounterTable", id: t.id })}>{t.name}</LinkButton>
              <span className="text-meta text-muted"> {t.entries.length} Wildkin</span>
            </li>
          ))}
          {regionTables.length === 0 && <li className="text-muted">Optional: applies everywhere in the region</li>}
        </ul>
      </Section>
    </EntityForm>
  );
}
