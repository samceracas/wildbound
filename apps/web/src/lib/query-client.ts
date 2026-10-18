import { QueryClient } from "@tanstack/react-query";

/**
 * One shared client for the app. Game data changes because of the player's own
 * actions (mutations invalidate it) or on the radar's polling interval, so there
 * is no need to refetch on every window focus.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
