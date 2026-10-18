import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api.ts";

/**
 * Query keys live in one place so invalidation stays consistent.
 * Rule of thumb: anything a mutation changes on the server gets invalidated here.
 */
export const keys = {
  me: ["me"] as const,
  state: ["game", "state"] as const,
  registry: ["game", "registry"] as const,
  inventory: ["game", "inventory"] as const,
  party: ["game", "party"] as const,
};

/** The logged-in player, or null when there is no session (401). */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return (await api.me()).player;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.login,
    onSuccess: ({ player }) => {
      qc.clear(); // a different save slot: drop everything cached for the previous player
      qc.setQueryData(keys.me, player);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(keys.me, null);
    },
  });
}

/** Radar state. Polls while the radar is open; spawns and weather change over time. */
export function useGameState(enabled: boolean) {
  return useQuery({ queryKey: keys.state, queryFn: api.state, enabled, refetchInterval: 10_000, staleTime: 5_000 });
}

export function useRegistry() {
  return useQuery({ queryKey: keys.registry, queryFn: api.registry });
}

export function useInventory() {
  return useQuery({ queryKey: keys.inventory, queryFn: api.inventory });
}

export function useParty() {
  return useQuery({ queryKey: keys.party, queryFn: api.party });
}

export function useObserve() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.observe,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.registry });
      void qc.invalidateQueries({ queryKey: keys.state });
    },
  });
}

export function useCapture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.capture,
    onSettled: () => {
      // A capture attempt can change all of these.
      for (const key of [keys.state, keys.registry, keys.inventory, keys.party]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}
