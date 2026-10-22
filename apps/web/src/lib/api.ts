import {
  ApiErrorSchema,
  AssessmentResponseSchema,
  BattleActionResponseSchema,
  BattleResponseSchema,
  GameStateResponseSchema,
  InventoryResponseSchema,
  LicensesResponseSchema,
  MeResponseSchema,
  ObserveResponseSchema,
  PartyResponseSchema,
  PickupResponseSchema,
  PositionResponseSchema,
  RegistryResponseSchema,
  StarterOptionsResponseSchema,
  StarterResponseSchema,
  UseItemResponseSchema,
  VetResponseSchema,
  WildkinDetailResponseSchema,
  type BattleActionRequest,
  type Category,
  type LoginRequest,
  type PositionReport,
  type RenameWildkinRequest,
  type StarterRequest,
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
    /** Extra machine-readable detail (e.g. the running battle's id). */
    readonly details: Record<string, unknown> = {},
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
    throw err.success
      ? new ApiError(res.status, err.data.error, err.data.message, err.data.details)
      : new ApiError(res.status, "http_error", res.statusText);
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

  starterOptions: () => request(StarterOptionsResponseSchema, "/api/game/starter"),
  chooseStarter: (body: StarterRequest) => request(StarterResponseSchema, "/api/game/starter", post(body)),

  startBattle: (spawnId: string) => request(BattleResponseSchema, `/api/game/spawns/${spawnId}/battle`, post()),
  currentBattle: () => request(BattleResponseSchema, "/api/game/battles/current"),
  battle: (id: string) => request(BattleResponseSchema, `/api/game/battles/${id}`),
  battleAction: (id: string, body: BattleActionRequest) =>
    request(BattleActionResponseSchema, `/api/game/battles/${id}/actions`, post(body)),

  registry: () => request(RegistryResponseSchema, "/api/game/registry"),
  inventory: () => request(InventoryResponseSchema, "/api/game/inventory"),
  party: () => request(PartyResponseSchema, "/api/game/party"),
  /** Server answers 204 (null) or the new PartyResponse, depending on how you implement PUT /party. */
  updateParty: (body: UpdatePartyRequest) =>
    request(PartyResponseSchema.nullable(), "/api/game/party", { method: "PUT", body: JSON.stringify(body) }),
  wildkin: (id: string) => request(WildkinDetailResponseSchema, `/api/game/wildkin/${id}`),
  useItem: (itemId: string, wildkinId: string) => request(UseItemResponseSchema, `/api/game/items/${itemId}/use`, post({ wildkinId })),
  visitVet: (poiId: string) => request(VetResponseSchema, `/api/game/stations/${poiId}/heal`, post()),
  collectPoi: (poiId: string) => request(PickupResponseSchema, `/api/game/pois/${poiId}/collect`, post()),

  licenses: () => request(LicensesResponseSchema, "/api/game/licenses"),
  takeAssessment: (category: Category) => request(AssessmentResponseSchema, `/api/game/licenses/${category}/assessment`, post()),

  renameWildkin: (id: string, body: RenameWildkinRequest) =>
    request(CapturedWildkinViewSchema, `/api/game/wildkin/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
};
