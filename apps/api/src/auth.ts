import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Developer/admin authorization for editor routes. The POC uses a single
 * shared bearer token (EDITOR_TOKEN); swap for real accounts later without
 * touching route handlers.
 */
export function isEditorRequest(request: FastifyRequest, token: string): boolean {
  const header = request.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  const given = Buffer.from(match[1]!.trim());
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function requireEditor(token: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isEditorRequest(request, token)) {
      return reply.code(401).send({ error: "unauthorized", message: "Editor token required" });
    }
  };
}
