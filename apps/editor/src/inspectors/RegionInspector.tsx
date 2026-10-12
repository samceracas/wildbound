import type { WorldRegion } from "@wildbound/shared";
import { SUGGESTED_BIOME_TAGS } from "@wildbound/shared";
import { areaSquareMeters } from "@wildbound/world";
import { Field, NameAndSlug, Section, TagInput, TextInput, Toggle, UnlockEditor } from "../components/fields.tsx";
import { useEditor } from "../store.ts";
import { createEncounterTable, updateRegion } from "../world-edit.ts";
import { formatArea, IssueList } from "./common.tsx";

export function RegionInspector({ region }: { region: WorldRegion }) {
  const world = useEditor((s) => s.world);
  const commit = useEditor((s) => s.commit);
  const select = useEditor((s) => s.select);
  const setTool = useEditor((s) => s.setTool);
  const patch = (p: Partial<WorldRegion>) => commit(updateRegion(world, region.id, p));

  const habitats = world.habitats.filter((h) => h.regionId === region.id);
  const pois = world.pois.filter((p) => p.regionId === region.id);
  const regionTables = world.encounterTables.filter((t) => t.regionId === region.id && t.habitatId === null);

  return (
    <>
      <Section title="Region">
        <NameAndSlug name={region.name} slug={region.slug} onName={(name) => patch({ name })} onSlug={(slug) => patch({ slug })} />
        <Field label="Description">
          <TextInput multiline value={region.description} onCommit={(description) => patch({ description })} />
        </Field>
        <Field label="Biome tags">
          <TagInput tags={region.biomeTags} suggestions={SUGGESTED_BIOME_TAGS} onChange={(biomeTags) => patch({ biomeTags })} />
        </Field>
        <Toggle label="Active (resolvable once published)" checked={region.active} onChange={(active) => patch({ active })} />
        <Field label="Unlock: required story flags" hint="Stored for the game; not evaluated in the POC">
          <UnlockEditor value={region.unlockCondition} onChange={(unlockCondition) => patch({ unlockCondition })} />
        </Field>
        <Field label="Story state requirements">
          <TagInput
            tags={region.storyStateRequirements}
            suggestions={[]}
            onChange={(storyStateRequirements) => patch({ storyStateRequirements })}
          />
        </Field>
        <p className="muted small">
          Area {formatArea(areaSquareMeters(region.geometry))} · drag white handles to reshape, drag midpoints to add vertices,
          right-click a vertex to delete it.
        </p>
      </Section>
      <IssueList entityId={region.id} />
      <Section
        title={`Habitats (${habitats.length})`}
        actions={
          <button className="btn small" onClick={() => setTool("draw-habitat")}>
            + Draw
          </button>
        }
      >
        <ul className="link-list">
          {habitats.map((h) => (
            <li key={h.id}>
              <button className="link" onClick={() => select({ kind: "habitat", id: h.id }, true)}>
                {h.name}
              </button>
            </li>
          ))}
          {habitats.length === 0 && <li className="muted">None yet</li>}
        </ul>
      </Section>
      <Section
        title={`POIs (${pois.length})`}
        actions={
          <button className="btn small" onClick={() => setTool("place-poi")}>
            + Place
          </button>
        }
      >
        <ul className="link-list">
          {pois.map((p) => (
            <li key={p.id}>
              <button className="link" onClick={() => select({ kind: "poi", id: p.id }, true)}>
                {p.name}
              </button>
              <span className="muted small"> {p.type}</span>
            </li>
          ))}
          {pois.length === 0 && <li className="muted">None yet</li>}
        </ul>
      </Section>
      <Section
        title="Region-wide encounters"
        actions={
          <button
            className="btn small"
            onClick={() => {
              const { world: next, table } = createEncounterTable(world, region.id, null);
              commit(next, { kind: "encounterTable", id: table.id });
            }}
          >
            + Table
          </button>
        }
      >
        <ul className="link-list">
          {regionTables.map((t) => (
            <li key={t.id}>
              <button className="link" onClick={() => select({ kind: "encounterTable", id: t.id })}>
                {t.name}
              </button>
              <span className="muted small"> {t.entries.length} Wildkin</span>
            </li>
          ))}
          {regionTables.length === 0 && <li className="muted">Optional: applies everywhere in the region</li>}
        </ul>
      </Section>
    </>
  );
}
