import { fileURLToPath } from "node:url";
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
  /** Groq API key for the Creature Manager's AI assistant (empty = assistant disabled). */
  groqApiKey: string;
  /** Groq chat model. */
  groqModel: string;
  groqApiUrl: string;
  /** PixelLab API key for Wildkin art generation (empty = art generation disabled). */
  pixellabApiKey: string;
  pixellabApiUrl: string;
  /** Folder with the canon documents (.docx/.md) fed to the assistant as lore context. */
  loreDocsDir: string;
  /** Upper bound on lore characters sent per assistant request (keeps prompts within model limits). */
  loreMaxChars: number;
}

export function loadConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    databaseUrl: requireEnv("DATABASE_URL"),
    port: Number(process.env.API_PORT ?? 4000),
    host: process.env.API_HOST ?? "127.0.0.1",
    editorToken: requireEnv("EDITOR_TOKEN"),
    corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:5174,http://localhost:5175")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    worldTimeZone: process.env.WORLD_TIMEZONE ?? "Asia/Manila",
    weatherApiUrl: process.env.WEATHER_API_URL ?? "https://api.open-meteo.com/v1/forecast",
    secureCookies: process.env.SECURE_COOKIES === "true",
    groqApiKey: process.env.GROQ_API_KEY ?? "",
    groqModel: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    groqApiUrl: process.env.GROQ_API_URL || "https://api.groq.com/openai/v1",
    pixellabApiKey: process.env.PIXELLAB_API_KEY ?? "",
    pixellabApiUrl: process.env.PIXELLAB_API_URL || "https://api.pixellab.ai/v2",
    loreDocsDir: process.env.LORE_DOCS_DIR || fileURLToPath(new URL("../../../docs", import.meta.url)),
    loreMaxChars: Number(process.env.LORE_MAX_CHARS ?? 30_000),
    ...overrides,
  };
}
