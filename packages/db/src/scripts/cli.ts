import { Prisma } from "../generated/prisma/client.ts";

/** A failure the script already explained; printed as-is, without a stack trace. */
export class ScriptError extends Error {}

/** Where DATABASE_URL points, without the password. */
function target(url: string | undefined): string {
  if (!url) return "the database";
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || 5432}/${u.pathname.slice(1)}`;
  } catch {
    return "the database";
  }
}

const ADAPTER_KINDS: Record<string, string> = {
  DatabaseNotReachable: "P1001",
  AuthenticationFailed: "P1000",
  DatabaseDoesNotExist: "P1003",
  TableDoesNotExist: "P2021",
  ColumnNotFound: "P2022",
};

/** Turns the usual setup mistakes into one actionable line instead of a Prisma stack dump. */
export function describeError(error: unknown, url: string | undefined): string {
  const where = target(url);
  if (error instanceof ScriptError) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientInitializationError) {
    // Raw queries report P2010 for everything; the driver adapter's kind says what actually went wrong.
    const kind = (error as { meta?: { driverAdapterError?: { cause?: { kind?: string } } } }).meta?.driverAdapterError?.cause?.kind;
    const code = (kind && ADAPTER_KINDS[kind]) ?? ("code" in error ? error.code : error.errorCode);
    switch (code) {
      case "P1001":
        return `Can't reach ${where}. Is Postgres running? Start it with \`pnpm db:up\` and check DATABASE_URL in .env.`;
      case "P1000":
        return `Postgres rejected the credentials in DATABASE_URL for ${where}.`;
      case "P1003":
        return `Database ${where} does not exist. Create it, or fix DATABASE_URL in .env.`;
      case "P2021":
      case "P2022":
        return `${where} is missing tables or columns. Run \`pnpm db:migrate\` first.`;
    }
    // Prisma prefixes the real reason with a code frame; the reason is the last line.
    const reason = error.message.trim().split("\n").filter(Boolean).at(-1) ?? error.message;
    return `${reason}${"code" in error ? ` (${error.code})` : ""}`;
  }
  if (error instanceof Error && "stderr" in error && error.stderr) {
    // A failed `prisma migrate` child process: its stderr is the useful part.
    return String(error.stderr).trim();
  }
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

/** Runs a db script body; on failure prints a readable reason and exits non-zero. */
export async function runScript(name: string, url: string | undefined, body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (error) {
    console.error(`\n✖ ${name} failed: ${describeError(error, url)}`);
    process.exitCode = 1;
  }
}
