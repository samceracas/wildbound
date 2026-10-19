import {
  keepPreviousData,
  skipToken,
  useIsFetching,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { EditorWorldResponse, ResolveQueryInput, ValidationReport, WorldDocument, WorldStatus } from "@wildbound/shared";
import { useEditor } from "../store.ts";
import { api, ApiRequestError } from "./api.ts";

/**
 * Query keys live in one place so invalidation stays consistent.
 * Rule of thumb: anything a mutation changes on the server gets invalidated here.
 */
export const editorKeys = {
  all: ["editor"] as const,
  /** Saved draft + creatures + publish status (GET /api/editor/world). */
  world: ["editor", "world"] as const,
  /** Last validation report (from Validate, Save or Publish). Written by mutations, never fetched. */
  report: ["editor", "report"] as const,
  resolveAll: ["editor", "resolve"] as const,
  resolve: (q: ResolveQueryInput | null) => ["editor", "resolve", q] as const,
};

const mutationKeys = {
  save: ["editor", "save"] as const,
  validate: ["editor", "validate"] as const,
  publish: ["editor", "publish"] as const,
};

// ------------------------------------------------------------------ queries

export const worldQueryOptions = {
  queryKey: editorKeys.world,
  queryFn: api.loadWorld,
  meta: { errorMessage: "Failed to load world" },
};

/** The saved draft, the creature catalog and the publish status. The *edited* world lives in the store. */
export function useWorldQuery() {
  return useQuery(worldQueryOptions);
}

/** Creature catalog (for encounter tables and the preview's spawn modifiers). */
export function useCreatures() {
  return useQuery({ ...worldQueryOptions, select: (d) => d.creatures }).data ?? [];
}

export function useWorldStatus(): WorldStatus | null {
  return useQuery({ ...worldQueryOptions, select: (d) => d.status }).data ?? null;
}

/** Latest validation report, or null before the first Validate/Save. */
export function useReport(): ValidationReport | null {
  return useQuery<ValidationReport>({ queryKey: editorKeys.report, queryFn: skipToken }).data ?? null;
}

/** What the API resolves at the Test panel's point. Keeps the last result on screen while a new point loads. */
export function useResolve(request: ResolveQueryInput | null) {
  return useQuery({
    queryKey: editorKeys.resolve(request),
    queryFn: request ? () => api.resolve(request) : skipToken,
    placeholderData: keepPreviousData,
    // "time: now" depends on the clock, so a revisit refetches.
    staleTime: 0,
  });
}

/** Which server operation is running, for disabling buttons and labels. */
export function useBusy(): null | "loading" | "saving" | "validating" | "publishing" {
  const loading = useIsFetching({ queryKey: editorKeys.world }) > 0;
  const saving = useIsMutating({ mutationKey: mutationKeys.save }) > 0;
  const validating = useIsMutating({ mutationKey: mutationKeys.validate }) > 0;
  const publishing = useIsMutating({ mutationKey: mutationKeys.publish }) > 0;
  if (saving) return "saving";
  if (publishing) return "publishing";
  if (validating) return "validating";
  if (loading) return "loading";
  return null;
}

// ------------------------------------------------------------------ mutations

function setReport(qc: QueryClient, report: ValidationReport, show = false) {
  qc.setQueryData(editorKeys.report, report);
  if (show) useEditor.getState().setShowIssues(true);
}

/** Validation issues sent with an API error (e.g. a rejected save) go to the issues panel. */
function reportIssues(qc: QueryClient, error: Error) {
  if (error instanceof ApiRequestError && error.issues.length) setReport(qc, { ok: false, issues: error.issues }, true);
}

function patchStatus(qc: QueryClient, patch: (status: WorldStatus) => WorldStatus) {
  qc.setQueryData<EditorWorldResponse>(editorKeys.world, (old) => (old ? { ...old, status: patch(old.status) } : old));
}

export function useSaveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.save,
    mutationFn: (doc: WorldDocument) => api.saveDraft(doc),
    meta: { errorMessage: "Failed to save draft" },
    onSuccess: (res, doc) => {
      useEditor.getState().markSaved(doc);
      setReport(qc, res.report);
      patchStatus(qc, () => res.status);
      // The server's draft changed: refresh it, and any draft-stage Test results.
      void qc.invalidateQueries({ queryKey: editorKeys.world });
      void qc.invalidateQueries({ queryKey: editorKeys.resolveAll });
      const errors = res.report.issues.filter((i) => i.severity === "error").length;
      useEditor
        .getState()
        .notify(
          errors ? "info" : "success",
          errors ? `Draft saved. ${errors} issue(s) must be fixed before publishing.` : "Draft saved.",
        );
    },
    onError: (error) => reportIssues(qc, error),
  });
}

export function useValidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.validate,
    mutationFn: (doc: WorldDocument) => api.validate(doc),
    meta: { errorMessage: "Validation failed" },
    onSuccess: (report) => {
      setReport(qc, report, true);
      useEditor
        .getState()
        .notify(report.ok ? "success" : "error", report.ok ? `Valid. ${report.issues.length} warning(s).` : "Validation found errors.");
    },
    onError: (error) => reportIssues(qc, error),
  });
}

/** Publishes the saved draft. Saves first when there are unsaved edits. */
export function usePublish() {
  const qc = useQueryClient();
  const save = useSaveDraft();
  return useMutation({
    mutationKey: mutationKeys.publish,
    mutationFn: async () => {
      const { dirty, world } = useEditor.getState();
      if (dirty) await save.mutateAsync(world);
      return api.publish();
    },
    meta: { errorMessage: "Publish failed" },
    onSuccess: (res) => {
      setReport(qc, res.report);
      patchStatus(qc, (s) => ({ ...s, lastPublishedAt: res.publishedAt, publishedVersion: res.version, hasUnpublishedChanges: false }));
      void qc.invalidateQueries({ queryKey: editorKeys.world });
      void qc.invalidateQueries({ queryKey: editorKeys.resolveAll });
      useEditor.getState().notify("success", `Published version ${res.version}.`);
    },
    onError: (error) => reportIssues(qc, error),
  });
}

/** Discard local edits and load the saved draft again. */
export function useReloadWorld() {
  const qc = useQueryClient();
  return async () => {
    const s = useEditor.getState();
    if (s.dirty && !confirm("Discard unsaved changes and reload the saved draft?")) return;
    try {
      const data = await qc.fetchQuery({ ...worldQueryOptions, staleTime: 0 });
      useEditor.getState().hydrate(data.draft);
    } catch {
      /* reported by the query cache (toast / token dialog) */
    }
  };
}
