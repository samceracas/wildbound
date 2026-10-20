import {
  ArtBalanceSchema,
  AssistResponseSchema,
  GenerateArtResponseSchema,
  ManagerConfigSchema,
  WildkinEntrySchema,
  WildkinListResponseSchema,
  WildkinStatsSchema,
  wildkinArtPath,
  type ArtKind,
  type AssistRequest,
  type GenerateArtRequest,
  type WildkinEntryInput,
} from "@wildbound/shared";
import { z } from "zod";

export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:4000";
const TOKEN_KEY = "wildbound.editorToken";

/** The editor token (shared with the Map Editor): localStorage first, then VITE_EDITOR_TOKEN. */
export function getToken(): string {
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) return stored;
  } catch {
    /* storage unavailable */
  }
  return (import.meta.env.VITE_EDITOR_TOKEN as string | undefined) ?? "";
}

export function setToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** One entry of an error's `issues` list (e.g. publish_incomplete). Parsed leniently. */
export interface ApiIssue {
  severity: string;
  code: string;
  message: string;
}

const ErrorBodySchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
  issues: z
    .array(
      z.looseObject({
        severity: z.string().optional(),
        code: z.string().optional(),
        message: z.string(),
      }),
    )
    .optional(),
});

/** An API error with the server's status, machine-readable code and optional issue list. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly issues: ApiIssue[] = [],
  ) {
    super(message);
  }
}

async function request<S extends z.ZodType>(schema: S, path: string, init: RequestInit = {}): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${getToken()}`,
        ...init.headers,
      },
    });
  } catch {
    throw new ApiRequestError(`Cannot reach the API at ${API_URL}. Is it running (pnpm dev:api)?`, 0, "network");
  }
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ErrorBodySchema.safeParse(body);
    const err = parsed.success ? parsed.data : {};
    throw new ApiRequestError(
      err.message ?? `Request failed (${res.status} ${res.statusText})`,
      res.status,
      err.error ?? "http_error",
      (err.issues ?? []).map((i) => ({ severity: i.severity ?? "error", code: i.code ?? "", message: i.message })),
    );
  }
  return schema.parse(body);
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

const BASE = "/api/manager";
const enc = encodeURIComponent;

export type DeletedFilter = "exclude" | "include" | "only";

export const api = {
  config: () => request(ManagerConfigSchema, `${BASE}/config`),
  stats: () => request(WildkinStatsSchema, `${BASE}/stats`),
  list: (deleted: DeletedFilter = "exclude") =>
    request(WildkinListResponseSchema, `${BASE}/wildkin${deleted === "exclude" ? "" : `?deleted=${deleted}`}`),
  get: (id: string) => request(WildkinEntrySchema, `${BASE}/wildkin/${enc(id)}`),
  create: (body: WildkinEntryInput) => request(WildkinEntrySchema, `${BASE}/wildkin`, json("POST", body)),
  update: (id: string, body: WildkinEntryInput) =>
    request(WildkinEntrySchema, `${BASE}/wildkin/${enc(id)}`, json("PUT", body)),
  publish: (id: string) => request(WildkinEntrySchema, `${BASE}/wildkin/${enc(id)}/publish`, json("POST")),
  remove: (id: string) => request(z.null(), `${BASE}/wildkin/${enc(id)}`, json("DELETE")),
  restore: (id: string) => request(WildkinEntrySchema, `${BASE}/wildkin/${enc(id)}/restore`, json("POST")),
  assist: (body: AssistRequest) => request(AssistResponseSchema, `${BASE}/assist`, json("POST", body)),
  artBalance: () => request(ArtBalanceSchema, `${BASE}/art/balance`),
  generateArt: (id: string, body: GenerateArtRequest) =>
    request(GenerateArtResponseSchema, `${BASE}/wildkin/${enc(id)}/art`, json("POST", body)),
};

/** Public URL of a Wildkin's generated art (no token needed). */
export const artUrl = (id: string, kind: ArtKind, version: string | null) =>
  `${API_URL}${wildkinArtPath(id, kind, version)}`;
