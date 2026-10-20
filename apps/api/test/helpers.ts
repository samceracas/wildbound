import type { ApiConfig } from "../src/config.ts";

export const testConfig = (over: Partial<ApiConfig> = {}): ApiConfig => ({
  databaseUrl: "",
  port: 0,
  host: "127.0.0.1",
  editorToken: "test-editor-token",
  corsOrigins: [],
  worldTimeZone: "Asia/Manila",
  weatherApiUrl: "off",
  secureCookies: false,
  groqApiKey: "",
  groqModel: "test-model",
  groqApiUrl: "http://groq.invalid",
  pixellabApiKey: "",
  pixellabApiUrl: "http://pixellab.invalid",
  loreDocsDir: "",
  loreSource: "brief",
  loreMaxChars: 10_000,
  ...over,
});
