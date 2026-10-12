import { requireEnv } from "@wildbound/db";

export interface ApiConfig {
  databaseUrl: string;
  port: number;
  host: string;
  editorToken: string;
  corsOrigins: string[];
  worldTimeZone: string;
}

export function loadConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    databaseUrl: requireEnv("DATABASE_URL"),
    port: Number(process.env.API_PORT ?? 4000),
    host: process.env.API_HOST ?? "127.0.0.1",
    editorToken: requireEnv("EDITOR_TOKEN"),
    corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:5174")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    worldTimeZone: process.env.WORLD_TIMEZONE ?? "Asia/Manila",
    ...overrides,
  };
}
