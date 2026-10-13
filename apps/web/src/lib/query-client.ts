import { QueryClient } from "@tanstack/react-query";

/**
 * One shared client for the app. Defaults suit this app: the published world only changes when
 * the editor publishes, so there is no need to refetch on every window focus.
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
