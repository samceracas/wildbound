import type { ErrorRequestHandler } from "express";
import { Prisma } from "@wildbound/db";
import { HttpError } from "./http.ts";

/** Postgres SQLSTATE behind a Prisma error (raw queries report it via the driver adapter). */
function pgCode(error: Prisma.PrismaClientKnownRequestError): { code?: string; message?: string } {
  const cause = (error.meta?.driverAdapterError as { cause?: { originalCode?: string; originalMessage?: string } } | undefined)
    ?.cause;
  return { code: cause?.originalCode, message: cause?.originalMessage };
}

/** Maps HttpErrors, body-parser errors and database constraint failures to JSON; everything else is a 500. */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json(error.toBody());
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const pg = pgCode(error);
    const message = pg.message ?? error.message;
    if (pg.code === "23514" || pg.code === "XX000" || pg.code === "22023") {
      res.status(400).json({ error: "invalid_geometry", message });
      return;
    }
    if (pg.code === "23505" || error.code === "P2002") {
      res.status(409).json({ error: "conflict", message });
      return;
    }
    if (pg.code === "23503" || error.code === "P2003") {
      res.status(400).json({ error: "invalid_reference", message });
      return;
    }
  }
  // express.json() errors (malformed JSON, too large) carry a 4xx status.
  const status = typeof error?.status === "number" ? error.status : 500;
  if (status < 500) {
    res.status(status).json({ error: "bad_request", message: String(error.message ?? "Bad request") });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "internal", message: "Internal server error" });
};
