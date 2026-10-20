import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { useEditor } from "../store.ts";
import { ApiRequestError } from "./api.ts";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: { errorMessage?: string };
    mutationMeta: { errorMessage?: string };
  }
}

/**
 * Errors from any query or mutation land here once: a 401 opens the token
 * dialog, and requests that carry `meta.errorMessage` show a toast.
 * (Validation issues returned with an error are put in the report by the
 * mutations themselves, see queries.ts.)
 */
function onError(error: Error, meta: { errorMessage?: string } | undefined) {
  const s = useEditor.getState();
  if (error instanceof ApiRequestError && error.status === 401) s.setAuthRequired(true);
  if (!meta?.errorMessage) return;
  if (error instanceof ApiRequestError) s.notify("error", error.message);
  else {
    s.notify("error", meta.errorMessage);
    console.error(error);
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (error, query) => onError(error, query.meta) }),
  mutationCache: new MutationCache({ onError: (error, _vars, _ctx, mutation) => onError(error, mutation.meta) }),
  defaultOptions: {
    queries: {
      // Editor data only changes through the editor itself (mutations invalidate it).
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      // Retry network hiccups once, never auth or validation errors.
      retry: (count, error) => count < 1 && !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500),
    },
  },
});
