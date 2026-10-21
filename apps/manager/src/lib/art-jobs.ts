import type { QueryClient } from "@tanstack/react-query";
import type { ArtKind, GenerateArtResponse, WildkinEntry } from "@wildbound/shared";
import { useSyncExternalStore } from "react";

import { api, ApiRequestError } from "./api.ts";
import { keys } from "./queries.ts";

/**
 * PixelLab art generations that keep running while you use the rest of the
 * manager. The store lives outside React (module state), so leaving the entry
 * page does not cancel anything; the art dialog can be minimized into the dock
 * (ArtJobsDock) and opened again.
 *
 * Closing or reloading the page cancels running generations: the request is
 * aborted, and the API stops the PixelLab calls and saves nothing.
 */

export type ArtJobStatus = "running" | "done" | "failed" | "cancelled";

export interface ArtJob {
  /** Wildkin id (one generation per Wildkin at a time). */
  id: string;
  name: string;
  kinds: ArtKind[];
  status: ArtJobStatus;
  startedAt: number;
  finishedAt: number | null;
  result: GenerateArtResponse | null;
  error: unknown;
  /** Shown in the dock (the dialog was minimized, or its page was left). */
  minimized: boolean;
}

let jobs: ReadonlyMap<string, ArtJob> = new Map();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();

function emit(next: Map<string, ArtJob>) {
  jobs = next;
  for (const l of listeners) l();
}

function patch(id: string, change: Partial<ArtJob>) {
  const job = jobs.get(id);
  if (!job) return;
  const next = new Map(jobs);
  next.set(id, { ...job, ...change });
  emit(next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every job, newest first. */
export function useArtJobs(): ArtJob[] {
  const snapshot = useSyncExternalStore(subscribe, () => jobs);
  return [...snapshot.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export function useArtJob(id: string | null | undefined): ArtJob | null {
  const snapshot = useSyncExternalStore(subscribe, () => jobs);
  return id ? (snapshot.get(id) ?? null) : null;
}

export const isRunning = (job: ArtJob | null | undefined) => job?.status === "running";
export const anyRunning = () => [...jobs.values()].some(isRunning);

/** Starts a generation (replacing a finished job for the same Wildkin). */
export function startArtJob(
  qc: QueryClient,
  args: { id: string; name: string; kinds: ArtKind[]; extraPrompt?: string },
): void {
  if (isRunning(jobs.get(args.id))) return;
  const controller = new AbortController();
  controllers.set(args.id, controller);
  const next = new Map(jobs);
  next.set(args.id, {
    id: args.id,
    name: args.name,
    kinds: args.kinds,
    status: "running",
    startedAt: Date.now(),
    finishedAt: null,
    result: null,
    error: null,
    minimized: false,
  });
  emit(next);

  api
    .generateArt(args.id, { kinds: args.kinds, extraPrompt: args.extraPrompt }, controller.signal)
    .then((res) => {
      qc.setQueryData<WildkinEntry>(keys.entry(args.id), (old) => (old ? { ...old, art: res.art } : old));
      void qc.invalidateQueries({ queryKey: keys.entry(args.id) });
      void qc.invalidateQueries({ queryKey: keys.balance });
      void qc.invalidateQueries({ queryKey: keys.wildkin, predicate: (q) => q.queryKey[2] === "list" });
      void qc.invalidateQueries({ queryKey: keys.stats });
      patch(args.id, { status: "done", result: res, finishedAt: Date.now() });
    })
    .catch((error: unknown) => {
      const cancelled = controller.signal.aborted || (error instanceof ApiRequestError && error.code === "cancelled");
      patch(args.id, { status: cancelled ? "cancelled" : "failed", error: cancelled ? null : error, finishedAt: Date.now() });
    })
    .finally(() => controllers.delete(args.id));
}

/** Cancels a running generation (the API stops PixelLab work and saves nothing). */
export function cancelArtJob(id: string): void {
  controllers.get(id)?.abort();
}

export function setArtJobMinimized(id: string, minimized: boolean): void {
  if (jobs.get(id)?.minimized !== minimized) patch(id, { minimized });
}

/** Removes a finished job from the dock. */
export function dismissArtJob(id: string): void {
  if (isRunning(jobs.get(id))) return;
  const next = new Map(jobs);
  next.delete(id);
  emit(next);
}

// Leaving the page cancels everything still running; warn first.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (anyRunning()) e.preventDefault();
  });
  window.addEventListener("pagehide", () => {
    for (const c of controllers.values()) c.abort();
  });
}
