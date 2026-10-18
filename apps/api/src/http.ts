import type { ApiError, ValidationIssue } from "@wildbound/shared";
import type { z } from "zod";

/** Throw from any handler; the error middleware turns it into a JSON response. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: ValidationIssue[],
  ) {
    super(message);
  }

  toBody(): ApiError {
    return { error: this.code, message: this.message, ...(this.issues ? { issues: this.issues } : {}) };
  }
}

export const notImplemented = (what: string) =>
  new HttpError(501, "not_implemented", `${what} is not implemented yet (see the TODO(you) in the API source)`);

export function zodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((i) => ({
    severity: "error" as const,
    code: "schema",
    entityType: "world" as const,
    message: `${i.path.join(".") || "(root)"}: ${i.message}`,
  }));
}

/** Parses `input` with `schema` or throws a 400 listing every problem. */
export function parseOr400<S extends z.ZodType>(schema: S, input: unknown, message = "Invalid request"): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "bad_request", message, zodIssues(parsed.error));
  return parsed.data;
}
