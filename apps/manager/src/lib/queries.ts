import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { WildkinEntry, WildkinEntryInput } from "@wildbound/shared";
import { api, type DeletedFilter } from "./api.ts";

/**
 * Query keys live in one place so invalidation stays consistent.
 * Everything Wildkin-related sits under ["manager", "wildkin"], so one
 * invalidation refreshes lists and entries together.
 */
export const keys = {
  all: ["manager"] as const,
  config: ["manager", "config"] as const,
  stats: ["manager", "stats"] as const,
  wildkin: ["manager", "wildkin"] as const,
  list: (deleted: DeletedFilter) => ["manager", "wildkin", "list", deleted] as const,
  entry: (id: string) => ["manager", "wildkin", "entry", id] as const,
  balance: ["manager", "art", "balance"] as const,
};

/** After any write: the entry itself is known; lists and stats are refetched. */
function afterWrite(qc: QueryClient, entry?: WildkinEntry) {
  if (entry) qc.setQueryData(keys.entry(entry.id), entry);
  void qc.invalidateQueries({ queryKey: keys.wildkin, predicate: (q) => q.queryKey[2] === "list" });
  void qc.invalidateQueries({ queryKey: keys.stats });
}

export function useManagerConfig() {
  return useQuery({ queryKey: keys.config, queryFn: api.config, staleTime: 5 * 60_000 });
}

export function useStats() {
  return useQuery({ queryKey: keys.stats, queryFn: api.stats });
}

export function useWildkinList(deleted: DeletedFilter) {
  return useQuery({ queryKey: keys.list(deleted), queryFn: () => api.list(deleted) });
}

export function useWildkinEntry(id: string | undefined) {
  return useQuery({ queryKey: keys.entry(id ?? ""), queryFn: () => api.get(id!), enabled: !!id });
}

export function useCreateWildkin() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: WildkinEntryInput) => api.create(body), onSuccess: (e) => afterWrite(qc, e) });
}

export function useUpdateWildkin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: WildkinEntryInput }) => api.update(id, body),
    onSuccess: (e) => afterWrite(qc, e),
  });
}

export function usePublishWildkin() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.publish(id), onSuccess: (e) => afterWrite(qc, e) });
}

export function useDeleteWildkin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, permanent = false }: { id: string; permanent?: boolean }) => api.remove(id, permanent),
    onSuccess: (_, { id, permanent }) => {
      if (permanent) qc.removeQueries({ queryKey: keys.entry(id) });
      else void qc.invalidateQueries({ queryKey: keys.entry(id) });
      afterWrite(qc);
    },
  });
}

/** What a permanent delete would also remove (fetched when the delete dialog asks for it). */
export function useWildkinUsage(id: string | null) {
  return useQuery({
    queryKey: ["manager", "wildkin", "usage", id ?? ""],
    queryFn: () => api.usage(id!),
    enabled: !!id,
    staleTime: 0,
  });
}

export function useRestoreWildkin() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.restore(id), onSuccess: (e) => afterWrite(qc, e) });
}

export function useAssist() {
  return useMutation({ mutationFn: api.assist });
}

/** PixelLab balance. Always fetched fresh when the art dialog opens. */
export function useArtBalance(enabled: boolean) {
  return useQuery({ queryKey: keys.balance, queryFn: api.artBalance, enabled, staleTime: 0 });
}
