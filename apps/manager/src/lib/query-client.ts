import { QueryClient } from "@tanstack/react-query";

/** One shared client. Data only changes through this tool's own mutations, which invalidate it. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => {
        // Auth and "not found" errors will not fix themselves.
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 500) return false;
        return count < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});
