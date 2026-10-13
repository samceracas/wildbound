import { useQuery } from "@tanstack/react-query";
import type { ResolveQueryInput } from "@wildbound/shared";
import { fetchPublishedWorld, resolveCoordinate } from "./api.ts";

/**
 * Query keys in one place so invalidation and caching stay consistent.
 * Hierarchical on purpose: invalidating ["world"] refreshes everything world-related.
 */
export const queryKeys = {
  world: ["world"] as const,
  published: ["world", "published"] as const,
  resolve: (q: ResolveQueryInput) => ["world", "resolve", q] as const,
};

/** Everything the map editor has published. */
export function usePublishedWorld() {
  return useQuery({
    queryKey: queryKeys.published,
    queryFn: fetchPublishedWorld,
  });
}

/**
 * The WILDBOUND context for a simulated coordinate. Pass `null` until a position is chosen;
 * the query stays idle until then. This is the shape the future Phaser field will consume.
 */
export function useWorldContext(position: ResolveQueryInput | null) {
  return useQuery({
    queryKey: position ? queryKeys.resolve(position) : ["world", "resolve", "idle"],
    queryFn: () => resolveCoordinate(position as ResolveQueryInput),
    enabled: position !== null,
  });
}
