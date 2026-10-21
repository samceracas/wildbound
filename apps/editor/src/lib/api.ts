import {
  CreatureListResponseSchema,
  EditorWorldResponseSchema,
  PublishResponseSchema,
  SaveDraftResponseSchema,
  ValidationReportSchema,
  WorldContextSchema,
  type ResolveQueryInput,
  type ValidationIssue,
  type WorldDocument,
} from "@wildbound/shared";
import type { z } from "zod";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:4000";
const TOKEN_KEY = "wildbound.editorToken";

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
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable */
  }
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: ValidationIssue[] = [],
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
    throw new ApiRequestError(`Cannot reach the API at ${API_URL}. Is it running (pnpm dev:api)?`, 0);
  }
  const body = (await res.json().catch(() => ({}))) as { message?: string; issues?: ValidationIssue[] };
  if (!res.ok) throw new ApiRequestError(body.message ?? `Request failed (${res.status})`, res.status, body.issues ?? []);
  return schema.parse(body);
}

export const api = {
  loadWorld: () => request(EditorWorldResponseSchema, "/api/editor/world"),
  creatures: () => request(CreatureListResponseSchema, "/api/editor/creatures"),
  saveDraft: (doc: WorldDocument) =>
    request(SaveDraftResponseSchema, "/api/editor/draft", { method: "PUT", body: JSON.stringify(doc) }),
  validate: (doc: WorldDocument) =>
    request(ValidationReportSchema, "/api/editor/validate", { method: "POST", body: JSON.stringify(doc) }),
  publish: () => request(PublishResponseSchema, "/api/editor/publish", { method: "POST" }),
  resolve: (q: ResolveQueryInput) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined) params.set(k, String(v));
    return request(WorldContextSchema, `/api/editor/resolve?${params}`);
  },
};
