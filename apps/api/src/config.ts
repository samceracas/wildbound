import { requireEnv } from "@wildbound/db";

export interface ApiConfig {
  databaseUrl: string;
  port: number;
  host: string;
  editorToken: string;
  corsOrigins: string[];
  /** Fallback zone for time of day when neither the weather service nor the client supplies one. */
  worldTimeZone: string;
  /** Open-Meteo forecast endpoint (key-free). */
  weatherApiUrl: string;
  /** Send the session cookie with `Secure` (enable behind HTTPS). */
  secureCookies: boolean;
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
    weatherApiUrl: process.env.WEATHER_API_URL ?? "https://api.open-meteo.com/v1/forecast",
    secureCookies: process.env.SECURE_COOKIES === "true",
    ...overrides,
  };
}
