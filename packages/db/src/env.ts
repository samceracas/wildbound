import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Loads the repo-root .env once (Node's built-in loader; existing env vars win). */
const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}
