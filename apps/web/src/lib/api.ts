import {
  ApiErrorSchema,
  CaptureResponseSchema,
  GameStateResponseSchema,
  InventoryResponseSchema,
  MeResponseSchema,
  ObserveResponseSchema,
  PartyResponseSchema,
  PositionResponseSchema,
  RegistryResponseSchema,
  type LoginRequest,
  type PositionReport,
  type RenameWildkinRequest,
  type UpdatePartyRequest,
  CapturedWildkinViewSchema,
} from "@wildbound/shared";
import type { z } from "zod";

/** An API error with the server's status and machine-readable code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Same-origin fetch: Vite proxies /api to the API (see vite.config.ts), so the
 * httpOnly session cookie just works. Every response is validated with Zod, so
 * a contract mismatch fails loudly here instead of deep inside a component.
 */
async function request<S extends z.ZodType>(schema: S, path: string, init: RequestInit = {}): Promise<z.infer<S>> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = ApiErrorSchema.safeParse(body);
    throw new ApiError(res.status, err.success ? err.data.error : "http_error", err.success ? err.data.message : res.statusText);
  }
  return schema.parse(body);
}

const post = (body?: unknown): RequestInit => ({ method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  me: () => request(MeResponseSchema, "/api/auth/me"),
  login: (body: LoginRequest) => request(MeResponseSchema, "/api/auth/login", post(body)),
  logout: () => fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }),

  reportPosition: (body: PositionReport) => request(PositionResponseSchema, "/api/game/position", post(body)),
  state: () => request(GameStateResponseSchema, "/api/game/state"),
  observe: (spawnId: string) => request(ObserveResponseSchema, `/api/game/spawns/${spawnId}/observe`, post()),
  capture: (spawnId: string) => request(CaptureResponseSchema, `/api/game/spawns/${spawnId}/capture`, post()),

  registry: () => request(RegistryResponseSchema, "/api/game/registry"),
  inventory: () => request(InventoryResponseSchema, "/api/game/inventory"),
  party: () => request(PartyResponseSchema, "/api/game/party"),
  /** Server answers 204 (null) or the new PartyResponse, depending on how you implement PUT /party. */
  updateParty: (body: UpdatePartyRequest) =>
    request(PartyResponseSchema.nullable(), "/api/game/party", { method: "PUT", body: JSON.stringify(body) }),
  renameWildkin: (id: string, body: RenameWildkinRequest) =>
    request(CapturedWildkinViewSchema, `/api/game/wildkin/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
};
