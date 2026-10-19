/**
 * Local editing state only: the world being edited, selection, tool, undo/redo
 * history and a few UI flags. Everything that lives on the server (the saved
 * draft, creatures, publish status, validation reports, resolve results) is
 * TanStack Query state; see lib/queries.ts.
 */
import type { Position, PublicationStage, ResolveQueryInput, TimeOfDay, Weather, WorldDocument } from "@wildbound/shared";
import { EMPTY_WORLD, NEARBY_POI_DEFAULT_RADIUS_M } from "@wildbound/shared";
import { create } from "zustand";
import { deleteEntity, entityExists, type Selection } from "./world-edit.ts";

export type Tool = "select" | "draw-region" | "draw-habitat" | "place-poi" | "preview";
export type Basemap = "streets" | "osm" | "satellite";

/** Inputs of the Test panel. `request` is what the panel asks the API to resolve (null = nothing yet). */
export interface PreviewState {
  point: Position | null;
  stage: PublicationStage;
  timeOfDay: TimeOfDay | "auto";
  weather: Weather;
  radius: number;
  request: ResolveQueryInput | null;
}

export interface Notice {
  kind: "info" | "success" | "error";
  text: string;
  at: number;
}

interface EditorState {
  world: WorldDocument;
  /** True once a draft from the server has been loaded into the editor. */
  loaded: boolean;
  dirty: boolean;
  past: WorldDocument[];
  future: WorldDocument[];
  /** Snapshot taken at the start of a drag so the whole drag is one undo step. */
  transientBase: WorldDocument | null;

  selection: Selection | null;
  tool: Tool;
  basemap: Basemap;
  showIssues: boolean;
  authRequired: boolean;
  notice: Notice | null;
  preview: PreviewState;
  /** Bumped to ask the map to fit a selection/world. */
  focusRequest: { selection: Selection | null; nonce: number } | null;

  /** Replace the edited world with a document from the server (load / reload). Clears history. */
  hydrate: (world: WorldDocument) => void;
  /** A save of `saved` succeeded; the editor is clean unless it changed meanwhile. */
  markSaved: (saved: WorldDocument) => void;

  /** Apply an edit as one undoable step. */
  commit: (next: WorldDocument, selection?: Selection | null) => void;
  beginTransient: () => void;
  transient: (next: WorldDocument) => void;
  endTransient: () => void;
  undo: () => void;
  redo: () => void;
  deleteSelected: () => void;

  select: (selection: Selection | null, focus?: boolean) => void;
  focus: (selection: Selection | null) => void;
  setTool: (tool: Tool) => void;
  setBasemap: (basemap: Basemap) => void;
  setShowIssues: (show: boolean) => void;
  notify: (kind: Notice["kind"], text: string) => void;
  setAuthRequired: (v: boolean) => void;

  setPreview: (patch: Partial<PreviewState>) => void;
  /** Ask the Test panel to resolve the current point and settings (the query runs in PreviewPanel). */
  resolvePreview: () => void;
}

const HISTORY_LIMIT = 100;

export const useEditor = create<EditorState>((set, get) => ({
  world: EMPTY_WORLD,
  loaded: false,
  dirty: false,
  past: [],
  future: [],
  transientBase: null,
  selection: null,
  tool: "select",
  basemap: "streets",
  showIssues: false,
  authRequired: false,
  notice: null,
  preview: {
    point: null,
    stage: "draft",
    timeOfDay: "auto",
    weather: "clear",
    radius: NEARBY_POI_DEFAULT_RADIUS_M,
    request: null,
  },
  focusRequest: null,

  hydrate: (world) =>
    set({
      world,
      loaded: true,
      dirty: false,
      past: [],
      future: [],
      transientBase: null,
      selection: null,
      authRequired: false,
      focusRequest: { selection: null, nonce: Date.now() },
    }),
  markSaved: (saved) => set((s) => ({ dirty: s.world !== saved })),

  commit: (next, selection) =>
    set((s) => ({
      world: next,
      past: [...s.past, s.world].slice(-HISTORY_LIMIT),
      future: [],
      dirty: true,
      ...(selection !== undefined ? { selection } : {}),
    })),

  beginTransient: () => set((s) => ({ transientBase: s.world })),
  transient: (next) => set({ world: next }),
  endTransient: () =>
    set((s) => {
      if (!s.transientBase || s.transientBase === s.world) return { transientBase: null };
      return {
        past: [...s.past, s.transientBase].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
        transientBase: null,
      };
    }),

  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev) return {};
      const selection = s.selection && entityExists(prev, s.selection) ? s.selection : null;
      return { world: prev, past: s.past.slice(0, -1), future: [s.world, ...s.future], dirty: true, selection };
    }),
  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next) return {};
      const selection = s.selection && entityExists(next, s.selection) ? s.selection : null;
      return { world: next, past: [...s.past, s.world], future: s.future.slice(1), dirty: true, selection };
    }),

  deleteSelected: () => {
    const { selection, world } = get();
    if (!selection) return;
    get().commit(deleteEntity(world, selection), null);
  },

  select: (selection, focus = false) => {
    set({ selection });
    if (focus) get().focus(selection);
  },
  focus: (selection) => set({ focusRequest: { selection, nonce: Date.now() } }),
  setTool: (tool) => set({ tool }),
  setBasemap: (basemap) => set({ basemap }),
  setShowIssues: (showIssues) => set({ showIssues }),
  notify: (kind, text) => set({ notice: { kind, text, at: Date.now() } }),
  setAuthRequired: (authRequired) => set({ authRequired }),

  setPreview: (patch) => set((s) => ({ preview: { ...s.preview, ...patch } })),
  resolvePreview: () =>
    set((s) => {
      const { point, stage, radius, weather, timeOfDay } = s.preview;
      if (!point) return {};
      const request: ResolveQueryInput = {
        lng: point[0],
        lat: point[1],
        stage,
        radius,
        weather,
        timeOfDay: timeOfDay === "auto" ? undefined : timeOfDay,
      };
      return { preview: { ...s.preview, request } };
    }),
}));
