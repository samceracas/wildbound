import type {
  CreatureDefinition,
  Position,
  PublicationStage,
  TimeOfDay,
  ValidationReport,
  Weather,
  WorldContext,
  WorldDocument,
  WorldStatus,
} from "@wildbound/shared";
import { EMPTY_WORLD, NEARBY_POI_DEFAULT_RADIUS_M } from "@wildbound/shared";
import { create } from "zustand";
import { ApiRequestError, api } from "./api.ts";
import { deleteEntity, entityExists, type Selection } from "./world-edit.ts";

export type Tool = "select" | "draw-region" | "draw-habitat" | "place-poi" | "preview";
export type Basemap = "streets" | "osm" | "satellite";

export interface PreviewState {
  point: Position | null;
  stage: PublicationStage;
  timeOfDay: TimeOfDay | "auto";
  weather: Weather;
  radius: number;
  result: WorldContext | null;
  loading: boolean;
  error: string | null;
}

export interface Notice {
  kind: "info" | "success" | "error";
  text: string;
  at: number;
}

interface EditorState {
  world: WorldDocument;
  creatures: CreatureDefinition[];
  status: WorldStatus | null;
  loaded: boolean;
  busy: null | "loading" | "saving" | "validating" | "publishing";
  authRequired: boolean;
  dirty: boolean;
  past: WorldDocument[];
  future: WorldDocument[];
  /** Snapshot taken at the start of a drag so the whole drag is one undo step. */
  transientBase: WorldDocument | null;

  selection: Selection | null;
  tool: Tool;
  basemap: Basemap;
  report: ValidationReport | null;
  showIssues: boolean;
  notice: Notice | null;
  preview: PreviewState;
  /** Bumped to ask the map to fit a selection/world. */
  focusRequest: { selection: Selection | null; nonce: number } | null;

  load: () => Promise<void>;
  save: () => Promise<boolean>;
  validate: () => Promise<void>;
  publish: () => Promise<void>;

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
  resolvePreview: () => Promise<void>;
}

const HISTORY_LIMIT = 100;

export const useEditor = create<EditorState>((set, get) => {
  const handleError = (error: unknown, fallback: string) => {
    if (error instanceof ApiRequestError) {
      if (error.status === 401) set({ authRequired: true });
      if (error.issues.length) set({ report: { ok: false, issues: error.issues }, showIssues: true });
      get().notify("error", error.message);
    } else {
      get().notify("error", fallback);
      console.error(error);
    }
  };

  return {
    world: EMPTY_WORLD,
    creatures: [],
    status: null,
    loaded: false,
    busy: null,
    authRequired: false,
    dirty: false,
    past: [],
    future: [],
    transientBase: null,
    selection: null,
    tool: "select",
    basemap: "streets",
    report: null,
    showIssues: false,
    notice: null,
    preview: {
      point: null,
      stage: "draft",
      timeOfDay: "auto",
      weather: "clear",
      radius: NEARBY_POI_DEFAULT_RADIUS_M,
      result: null,
      loading: false,
      error: null,
    },
    focusRequest: null,

    load: async () => {
      if (get().dirty && !confirm("Discard unsaved changes and reload the saved draft?")) return;
      set({ busy: "loading" });
      try {
        const res = await api.loadWorld();
        set({
          world: res.draft,
          creatures: res.creatures,
          status: res.status,
          loaded: true,
          dirty: false,
          past: [],
          future: [],
          selection: null,
          authRequired: false,
          focusRequest: { selection: null, nonce: Date.now() },
        });
      } catch (e) {
        handleError(e, "Failed to load world");
      } finally {
        set({ busy: null });
      }
    },

    save: async () => {
      set({ busy: "saving" });
      try {
        const res = await api.saveDraft(get().world);
        set({ status: res.status, dirty: false, report: res.report });
        const errors = res.report.issues.filter((i) => i.severity === "error").length;
        get().notify(
          errors ? "info" : "success",
          errors ? `Draft saved. ${errors} issue(s) must be fixed before publishing.` : "Draft saved.",
        );
        return true;
      } catch (e) {
        handleError(e, "Failed to save draft");
        return false;
      } finally {
        set({ busy: null });
      }
    },

    validate: async () => {
      set({ busy: "validating" });
      try {
        const report = await api.validate(get().world);
        set({ report, showIssues: true });
        get().notify(report.ok ? "success" : "error", report.ok ? `Valid. ${report.issues.length} warning(s).` : "Validation found errors.");
      } catch (e) {
        handleError(e, "Validation failed");
      } finally {
        set({ busy: null });
      }
    },

    publish: async () => {
      if (get().dirty) {
        const saved = await get().save();
        if (!saved) return;
      }
      set({ busy: "publishing" });
      try {
        const res = await api.publish();
        set((s) => ({
          report: res.report,
          status: s.status
            ? { ...s.status, lastPublishedAt: res.publishedAt, publishedVersion: res.version, hasUnpublishedChanges: false }
            : s.status,
        }));
        get().notify("success", `Published version ${res.version}.`);
      } catch (e) {
        handleError(e, "Publish failed");
      } finally {
        set({ busy: null });
      }
    },

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
    resolvePreview: async () => {
      const { preview } = get();
      if (!preview.point) return;
      set((s) => ({ preview: { ...s.preview, loading: true, error: null } }));
      try {
        const result = await api.resolve({
          lng: preview.point[0],
          lat: preview.point[1],
          stage: preview.stage,
          radius: preview.radius,
          weather: preview.weather,
          timeOfDay: preview.timeOfDay === "auto" ? undefined : preview.timeOfDay,
        });
        set((s) => ({ preview: { ...s.preview, result, loading: false } }));
      } catch (e) {
        const message = e instanceof Error ? e.message : "Resolve failed";
        if (e instanceof ApiRequestError && e.status === 401) set({ authRequired: true });
        set((s) => ({ preview: { ...s.preview, loading: false, error: message, result: null } }));
      }
    },
  };
});
