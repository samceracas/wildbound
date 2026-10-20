/**
 * Pure, immutable edits on a WorldDocument. The store wraps these with
 * history/selection; keeping them pure makes core editor behavior testable.
 */
import * as turf from "@turf/turf";
import type {
  AreaGeometry,
  EncounterEntry,
  EncounterTable,
  Habitat,
  PointOfInterest,
  Polygon,
  Position,
  WorldDocument,
  WorldRegion,
} from "@wildbound/shared";
import { EMPTY_CONDITIONS, SLUG_PATTERN, polygonsOf } from "@wildbound/shared";

export type EntityKind = "region" | "habitat" | "poi" | "encounterTable";
export interface Selection {
  kind: EntityKind;
  id: string;
}

export const newId = (): string => crypto.randomUUID();

// ------------------------------------------------------------------ slugs

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug || "item";
}

export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = slugify(base);
  if (!used.has(root)) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root.slice(0, 60)}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

export const isValidSlug = (s: string) => s.length > 0 && s.length <= 64 && SLUG_PATTERN.test(s);

function uniqueName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base} ${n}`)) return `${base} ${n}`;
}

// ------------------------------------------------------------------ geometry helpers

/** Closes an open vertex list into a GeoJSON polygon. */
export function polygonFromVertices(vertices: Position[]): Polygon {
  if (vertices.length < 3) throw new Error("A polygon needs at least 3 vertices");
  return { type: "Polygon", coordinates: [[...vertices, vertices[0]!]] };
}

export function isSelfIntersecting(vertices: Position[]): boolean {
  if (vertices.length < 4) return false;
  return turf.kinks(turf.polygon(polygonFromVertices(vertices).coordinates)).features.length > 0;
}

/** Index path of an editable vertex: polygon part, ring, vertex. */
export interface VertexRef {
  part: number;
  ring: number;
  index: number;
}

/** Open (unclosed) rings of an area, in the same part/ring order as the geometry. */
export function editableRings(geometry: AreaGeometry): Position[][][] {
  return polygonsOf(geometry).map((rings) => rings.map((ring) => ring.slice(0, -1)));
}

function rebuild<G extends AreaGeometry>(geometry: G, parts: Position[][][]): G {
  const closed = parts.map((rings) => rings.map((r) => [...r, r[0]!]));
  return (geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: closed[0]! }
    : { type: "MultiPolygon", coordinates: closed }) as G;
}

export function moveVertex<G extends AreaGeometry>(geometry: G, ref: VertexRef, to: Position): G {
  const parts = editableRings(geometry);
  const ring = parts[ref.part]?.[ref.ring];
  if (!ring || ref.index < 0 || ref.index >= ring.length) return geometry;
  ring[ref.index] = to;
  return rebuild(geometry, parts);
}

/** Inserts a vertex after `ref.index`. */
export function insertVertex<G extends AreaGeometry>(geometry: G, ref: VertexRef, at: Position): G {
  const parts = editableRings(geometry);
  const ring = parts[ref.part]?.[ref.ring];
  if (!ring) return geometry;
  ring.splice(ref.index + 1, 0, at);
  return rebuild(geometry, parts);
}

/** Removes a vertex; refuses to go below 3 vertices. */
export function removeVertex<G extends AreaGeometry>(geometry: G, ref: VertexRef): G {
  const parts = editableRings(geometry);
  const ring = parts[ref.part]?.[ref.ring];
  if (!ring || ring.length <= 3) return geometry;
  ring.splice(ref.index, 1);
  return rebuild(geometry, parts);
}

/** Region whose boundary contains the point; smallest area wins (matches the resolver). */
export function regionAt(world: WorldDocument, point: Position): WorldRegion | undefined {
  return world.regions
    .filter((r) => turf.booleanPointInPolygon(point, turf.feature(r.geometry)))
    .sort((a, b) => turf.area(a.geometry) - turf.area(b.geometry))[0];
}

// ------------------------------------------------------------------ create

export function createRegion(world: WorldDocument, geometry: AreaGeometry): { world: WorldDocument; region: WorldRegion } {
  const name = uniqueName("New Region", world.regions.map((r) => r.name));
  const region: WorldRegion = {
    id: newId(),
    slug: uniqueSlug(name, world.regions.map((r) => r.slug)),
    name,
    description: "",
    geometry,
    biomeTags: [],
    unlockCondition: null,
    storyStateRequirements: [],
    active: true,
  };
  return { world: { ...world, regions: [...world.regions, region] }, region };
}

export function createHabitat(
  world: WorldDocument,
  regionId: string,
  geometry: Polygon,
): { world: WorldDocument; habitat: Habitat } {
  const siblings = world.habitats.filter((h) => h.regionId === regionId);
  const name = uniqueName("New Habitat", siblings.map((h) => h.name));
  const habitat: Habitat = {
    id: newId(),
    regionId,
    slug: uniqueSlug(name, siblings.map((h) => h.slug)),
    name,
    description: "",
    geometry,
    habitatTags: [],
    conditionRules: EMPTY_CONDITIONS,
  };
  return { world: { ...world, habitats: [...world.habitats, habitat] }, habitat };
}

export function createPoi(
  world: WorldDocument,
  regionId: string,
  at: Position,
): { world: WorldDocument; poi: PointOfInterest } {
  const siblings = world.pois.filter((p) => p.regionId === regionId);
  const name = uniqueName("New POI", siblings.map((p) => p.name));
  const poi: PointOfInterest = {
    id: newId(),
    regionId,
    slug: uniqueSlug(name, siblings.map((p) => p.slug)),
    name,
    description: "",
    type: "landmark",
    location: { type: "Point", coordinates: at },
    interactionId: null,
    unlockCondition: null,
  };
  return { world: { ...world, pois: [...world.pois, poi] }, poi };
}

export function createEncounterTable(
  world: WorldDocument,
  regionId: string,
  habitatId: string | null,
): { world: WorldDocument; table: EncounterTable } {
  const habitat = habitatId ? world.habitats.find((h) => h.id === habitatId) : undefined;
  const region = world.regions.find((r) => r.id === regionId);
  const base = `${habitat?.name ?? region?.name ?? "New"} Encounters`;
  const table: EncounterTable = {
    id: newId(),
    name: uniqueName(base, world.encounterTables.map((t) => t.name)),
    regionId,
    habitatId,
    conditionRules: EMPTY_CONDITIONS,
    active: true,
    entries: [],
  };
  return { world: { ...world, encounterTables: [...world.encounterTables, table] }, table };
}

export function createEntry(creatureId: string, weight = 10): EncounterEntry {
  return { id: newId(), creatureId, weight, conditions: EMPTY_CONDITIONS };
}

// ------------------------------------------------------------------ update

type Patch<T> = Partial<Omit<T, "id">>;

export function updateRegion(world: WorldDocument, id: string, patch: Patch<WorldRegion>): WorldDocument {
  return { ...world, regions: world.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

/**
 * Updating a habitat's region moves its encounter tables with it so the
 * table→habitat→region chain stays consistent.
 */
export function updateHabitat(world: WorldDocument, id: string, patch: Patch<Habitat>): WorldDocument {
  const next = { ...world, habitats: world.habitats.map((h) => (h.id === id ? { ...h, ...patch } : h)) };
  if (patch.regionId) {
    next.encounterTables = world.encounterTables.map((t) =>
      t.habitatId === id ? { ...t, regionId: patch.regionId! } : t,
    );
  }
  return next;
}

export function updatePoi(world: WorldDocument, id: string, patch: Patch<PointOfInterest>): WorldDocument {
  return { ...world, pois: world.pois.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

export function updateEncounterTable(world: WorldDocument, id: string, patch: Patch<EncounterTable>): WorldDocument {
  return {
    ...world,
    encounterTables: world.encounterTables.map((t) => {
      if (t.id !== id) return t;
      const next = { ...t, ...patch };
      // Picking a habitat pins the table to that habitat's region.
      if (patch.habitatId) {
        const habitat = world.habitats.find((h) => h.id === patch.habitatId);
        if (habitat) next.regionId = habitat.regionId;
      }
      return next;
    }),
  };
}

export function setGeometry(world: WorldDocument, sel: Selection, geometry: AreaGeometry): WorldDocument {
  if (sel.kind === "region") return updateRegion(world, sel.id, { geometry });
  if (sel.kind === "habitat" && geometry.type === "Polygon") return updateHabitat(world, sel.id, { geometry });
  return world;
}

// ------------------------------------------------------------------ delete (cascading)

export function deleteEntity(world: WorldDocument, sel: Selection): WorldDocument {
  switch (sel.kind) {
    case "region": {
      const habitatIds = new Set(world.habitats.filter((h) => h.regionId === sel.id).map((h) => h.id));
      return {
        regions: world.regions.filter((r) => r.id !== sel.id),
        habitats: world.habitats.filter((h) => h.regionId !== sel.id),
        pois: world.pois.filter((p) => p.regionId !== sel.id),
        encounterTables: world.encounterTables.filter(
          (t) => t.regionId !== sel.id && !(t.habitatId && habitatIds.has(t.habitatId)),
        ),
      };
    }
    case "habitat":
      return {
        ...world,
        habitats: world.habitats.filter((h) => h.id !== sel.id),
        encounterTables: world.encounterTables.filter((t) => t.habitatId !== sel.id),
      };
    case "poi":
      return { ...world, pois: world.pois.filter((p) => p.id !== sel.id) };
    case "encounterTable":
      return { ...world, encounterTables: world.encounterTables.filter((t) => t.id !== sel.id) };
  }
}

export function entityExists(world: WorldDocument, sel: Selection): boolean {
  const list =
    sel.kind === "region"
      ? world.regions
      : sel.kind === "habitat"
        ? world.habitats
        : sel.kind === "poi"
          ? world.pois
          : world.encounterTables;
  return list.some((e) => e.id === sel.id);
}

export function entityLabel(world: WorldDocument, sel: Selection): string {
  const all = [...world.regions, ...world.habitats, ...world.pois, ...world.encounterTables];
  return all.find((e) => e.id === sel.id)?.name ?? "(deleted)";
}

/**
 * The entries of `values` that differ from `current` (deep, by JSON). Inspector
 * forms submit all their fields; committing only the changed ones keeps no-op
 * blurs out of the undo history.
 */
export function changedFields<T extends object>(current: T, values: Partial<T>): Partial<T> {
  const changed: Partial<T> = {};
  for (const key of Object.keys(values) as (keyof T)[]) {
    if (JSON.stringify(values[key]) !== JSON.stringify(current[key])) changed[key] = values[key];
  }
  return changed;
}
