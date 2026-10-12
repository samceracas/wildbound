import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import type { ApiError } from "@wildbound/shared";
import type { z } from "zod";

export function badRequestFromZod(error: z.ZodError, message: string): ApiError {
  return {
    error: "bad_request",
    message,
    issues: error.issues.map((i) => ({
      severity: "error" as const,
      code: "schema",
      entityType: "world" as const,
      message: `${i.path.join(".") || "(root)"}: ${i.message}`,
    })),
  };
}

interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
  message: string;
}

/** Maps database constraint failures to client errors; everything else is a 500. */
export function errorHandler(error: FastifyError & PgError, request: FastifyRequest, reply: FastifyReply) {
  const pgCode = error.code ?? (error.cause as PgError | undefined)?.code;
  const pg = (error.cause as PgError | undefined) ?? error;
  if (pgCode === "23514" || pgCode === "XX000" || pgCode === "22023") {
    return reply.code(400).send({ error: "invalid_geometry", message: pg.message });
  }
  if (pgCode === "23505") {
    return reply.code(409).send({ error: "conflict", message: pg.detail ?? pg.message });
  }
  if (pgCode === "23503") {
    return reply.code(400).send({ error: "invalid_reference", message: pg.detail ?? pg.message });
  }
  if (error.statusCode && error.statusCode < 500) {
    return reply.code(error.statusCode).send({ error: "bad_request", message: error.message });
  }
  request.log.error(error);
  return reply.code(500).send({ error: "internal", message: "Internal server error" });
}
