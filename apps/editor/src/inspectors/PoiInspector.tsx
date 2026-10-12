import type { PointOfInterest } from "@wildbound/shared";
import { POI_TYPES } from "@wildbound/shared";
import { useEffect, useState } from "react";
import { Field, NameAndSlug, Section, TextInput, UnlockEditor } from "../components/fields.tsx";
import { useEditor } from "../store.ts";
import { isValidSlug, updatePoi } from "../world-edit.ts";
import { IssueList } from "./common.tsx";

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
          <select value={poi.type} onChange={(e) => patch({ type: e.target.value as PointOfInterest["type"] })}>
            {POI_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Region">
          <select value={poi.regionId} onChange={(e) => patch({ regionId: e.target.value })}>
            {world.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Coordinates (lat, lng)" hint="Drag the marker or type coordinates">
          <input
            type="text"
            value={coords}
            onChange={(e) => setCoords(e.target.value)}
            onBlur={commitCoords}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
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
