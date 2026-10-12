import {
  PublishedWorldResponseSchema,
  WorldContextSchema,
  type PublishedWorldResponse,
  type ResolveQueryInput,
  type WorldContext,
} from "@wildbound/shared";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:4000";

async function get<T>(path: string, parse: (data: unknown) => T): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`);
  } catch {
    throw new Error(`Cannot reach the API at ${API_URL}. Is it running (pnpm dev:api)?`);
  }
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string }).message ?? `Request failed (${res.status})`);
  return parse(body);
}

/** Everything the map editor has published. Public, no token. */
export const fetchPublishedWorld = (): Promise<PublishedWorldResponse> =>
  get("/api/world/published", (d) => PublishedWorldResponseSchema.parse(d));

/**
 * "What WILDBOUND context applies here?" for a simulated coordinate.
 * Not used yet. Wire it to a map click as an exercise (see README).
 */
export const resolveCoordinate = (q: ResolveQueryInput): Promise<WorldContext> => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined) params.set(k, String(v));
  return get(`/api/world/resolve?${params}`, (d) => WorldContextSchema.parse(d));
};
