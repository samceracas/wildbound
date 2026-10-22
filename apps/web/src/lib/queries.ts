import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BattleAction, BattleView, Category, GameStateResponse } from "@wildbound/shared";
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
  wildkin: (id: string) => ["game", "wildkin", id] as const,
  /** Every Wildkin detail page at once (for invalidation). */
  allWildkin: ["game", "wildkin"] as const,
  battle: (id: string) => ["game", "battle", id] as const,
  currentBattle: ["game", "battle", "current"] as const,
  starter: ["game", "starter"] as const,
  licenses: ["game", "licenses"] as const,
};

/** Everything about the player's Wildkin and progress that a battle, a vet or an item can change. */
const AFTER_CARE = [keys.party, keys.allWildkin, keys.inventory, keys.state] as const;

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

// ---------------------------------------------------------------- starter

export function useStarterOptions() {
  return useQuery({ queryKey: keys.starter, queryFn: api.starterOptions, staleTime: Infinity });
}

export function useChooseStarter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.chooseStarter,
    onSuccess: () => {
      // So the layout does not send the player straight back to the starter screen before the refetch lands.
      qc.setQueryData<GameStateResponse>(keys.state, (s) => s && { ...s, needsStarter: false, hasUsableWildkin: true });
      for (const key of [keys.state, keys.party, keys.registry]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

// ---------------------------------------------------------------- battles

export function useStartBattle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.startBattle,
    onSuccess: ({ battle }) => {
      qc.setQueryData(keys.battle(battle.id), battle);
      void qc.invalidateQueries({ queryKey: keys.state });
    },
  });
}

/** One battle, any outcome (own battles only). */
export function useBattle(id: string) {
  return useQuery({ queryKey: keys.battle(id), queryFn: async () => (await api.battle(id)).battle });
}

/** The running battle, or null. */
export function useCurrentBattle() {
  return useQuery({
    queryKey: keys.currentBattle,
    queryFn: async () => {
      try {
        return (await api.currentBattle()).battle;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
}

/**
 * One battle action: sends `{ turn, action }` for the turn the client saw and
 * writes the new battle into the cache. A stale turn (double tap, second tab)
 * refetches the battle instead. When the battle ends, everything it can change
 * is refetched.
 */
export function useBattleAction(battle: BattleView | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: BattleAction) => {
      if (!battle) throw new Error("The battle is still loading");
      return api.battleAction(battle.id, { turn: battle.turn, action });
    },
    onSuccess: ({ battle: next }) => {
      qc.setQueryData(keys.battle(next.id), next);
      if (next.outcome) {
        qc.setQueryData(keys.currentBattle, null);
        for (const key of [...AFTER_CARE, keys.registry, keys.licenses]) void qc.invalidateQueries({ queryKey: key });
      } else {
        // Party HP is written every turn.
        void qc.invalidateQueries({ queryKey: keys.party });
      }
    },
    onError: (e) => {
      if (battle && e instanceof ApiError && (e.code === "stale_turn" || e.code === "battle_over")) {
        void qc.invalidateQueries({ queryKey: keys.battle(battle.id) });
      }
    },
  });
}

// ---------------------------------------------------------------- party care

export function useWildkin(id: string) {
  return useQuery({ queryKey: keys.wildkin(id), queryFn: async () => (await api.wildkin(id)).wildkin });
}

/** Use a field item (Trail Ration) on one Wildkin. */
export function useUseItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, wildkinId }: { itemId: string; wildkinId: string }) => api.useItem(itemId, wildkinId),
    onSuccess: () => {
      for (const key of AFTER_CARE) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useVisitVet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.visitVet,
    onSuccess: () => {
      for (const key of AFTER_CARE) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/** Daily POI pickup (exercise #14: the API answers 501 until it is built). */
export function useCollectPoi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.collectPoi,
    onSettled: () => {
      for (const key of [keys.inventory, keys.state]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

// ---------------------------------------------------------------- licenses

export function useLicenses() {
  return useQuery({ queryKey: keys.licenses, queryFn: api.licenses });
}

export function useTakeAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (category: Category) => api.takeAssessment(category),
    onSuccess: () => {
      for (const key of [...AFTER_CARE, keys.licenses]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}
