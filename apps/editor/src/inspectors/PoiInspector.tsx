import type { PointOfInterest } from "@wildbound/shared";
import { POI_TYPES } from "@wildbound/shared";
import { useEffect, useState } from "react";
import { Field, Section, UnlockEditor } from "../components/fields.tsx";
import { NameAndSlug, TextInput } from "../components/legacy-fields.tsx";
import { Input, Select } from "../components/ui.tsx";
import { useEditor } from "../store.ts";
import { isValidSlug, updatePoi } from "../world-edit.ts";
import { IssueList } from "./common.tsx";

/**
 * Point-of-interest inspector. It works, but it is the last inspector still on
 * hand-rolled controlled inputs (components/legacy-fields.tsx) instead of
 * react-hook-form + zodResolver like the others.
 *
 * ------------------------------------------------------------------------
 * TODO(you): convert this inspector to react-hook-form + zodResolver.
 * Copy the pattern from inspectors/HabitatInspector.tsx (the closest match);
 * the field components are in components/fields.tsx.
 *  1. Schema: PointOfInterestSchema.pick({ name, slug, type, regionId,
 *     interactionId, description, unlockCondition }) from @wildbound/shared.
 *     Leave `location` out for now (step 5).
 *  2. Form: useForm({ resolver: zodResolver(PoiFormSchema), values }) where
 *     `values` is a useMemo of those fields from `poi`. Using `values` (not
 *     defaultValues) makes the form follow undo/redo and marker drags.
 *  3. Commit: a `save(next)` that runs changedFields(current, next) (world-edit.ts)
 *     and, when something changed, commit(updatePoi(world, poi.id, patch)).
 *     Read the world with useEditor.getState() inside save, as HabitatInspector does.
 *     Wrap the sections in <EntityForm form={form} onCommit={save}>.
 *  4. Fields: <TextField name="name">, <SlugField />, <SelectField name="type">
 *     and <SelectField name="regionId">, <TextField name="description" multiline>,
 *     <UnlockField name="unlockCondition" ...>. Keep the labels and hints below.
 *     interactionId is `string | null` but an <input> holds a string: map "" to
 *     null with register("interactionId", { setValueAs: (v) => (v.trim() ? v.trim() : null) })
 *     (you will need a small field for that, or a `setValueAs` prop on TextField).
 *     The schema then shows "Slug must be lowercase…" under the field for free,
 *     so the isValidSlug() check below can go.
 *  5. Stretch: the "lat, lng" text box. Add a `coords` string to the form schema
 *     with .extend({ coords: z.string().regex(...) }) or a .transform() that
 *     parses it into location: { type: "Point", coordinates: [lng, lat] },
 *     and reject |lat| > 90 or |lng| > 180 with a message.
 *  6. Delete components/legacy-fields.tsx once nothing imports it.
 * How you know it works: editing each field, then Ctrl+Z / Ctrl+Shift+Z, steps
 * through one change at a time; an invalid slug or empty name shows the zod
 * message and is not saved; dragging the POI marker updates the coordinates.
 * ------------------------------------------------------------------------
 */
export function PoiInspector({ poi }: { poi: PointOfInterest }) {
  const world = useEditor((s) => s.world);
  const commit = useEditor((s) => s.commit);
  const patch = (p: Partial<PointOfInterest>) => commit(updatePoi(world, poi.id, p));
  const [lng, lat] = poi.location.coordinates;
  const [coords, setCoords] = useState(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
  useEffect(() => setCoords(`${lat.toFixed(6)}, ${lng.toFixed(6)}`), [lat, lng]);

  const commitCoords = () => {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(coords);
    const nLat = m ? Number(m[1]) : NaN;
    const nLng = m ? Number(m[2]) : NaN;
    if (Math.abs(nLat) <= 90 && Math.abs(nLng) <= 180) {
      if (nLat !== lat || nLng !== lng) patch({ location: { type: "Point", coordinates: [nLng, nLat] } });
    } else setCoords(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
  };

  return (
    <>
      <Section title="Point of interest">
        <NameAndSlug name={poi.name} slug={poi.slug} onName={(name) => patch({ name })} onSlug={(slug) => patch({ slug })} />
        <Field label="Type">
          <Select value={poi.type} onChange={(e) => patch({ type: e.target.value as PointOfInterest["type"] })}>
            {POI_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Region">
          <Select value={poi.regionId} onChange={(e) => patch({ regionId: e.target.value })}>
            {world.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Coordinates (lat, lng)" hint="Drag the marker or type coordinates">
          <Input
            value={coords}
            onChange={(e) => setCoords(e.target.value)}
            onBlur={commitCoords}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </Field>
        <Field label="Interaction id" hint="Optional slug the game uses to trigger an interaction">
          <TextInput
            value={poi.interactionId ?? ""}
            invalid={!!poi.interactionId && !isValidSlug(poi.interactionId)}
            onCommit={(v) => patch({ interactionId: v.trim() ? v.trim() : null })}
          />
        </Field>
        <Field label="Description">
          <TextInput multiline value={poi.description} onCommit={(description) => patch({ description })} />
        </Field>
        <Field label="Unlock: required story flags">
          <UnlockEditor value={poi.unlockCondition} onChange={(unlockCondition) => patch({ unlockCondition })} />
        </Field>
      </Section>
      <IssueList entityId={poi.id} />
    </>
  );
}
