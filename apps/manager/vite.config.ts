import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const envDir = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => {
  // Where the dev/preview server forwards /api: API_PROXY_TARGET, else VITE_API_URL from the root .env.
  const env = loadEnv(mode, envDir, "");
  const target = (env.API_PROXY_TARGET || env.VITE_API_URL || "http://localhost:4000").replace(/\/$/, "");
  const proxy = { "/api": { target, changeOrigin: false } };

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      // Matches "paths" in tsconfig.json and "aliases" in components.json (shadcn).
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    // Read VITE_* variables from the repo-root .env shared with the API, editor and web app.
    envDir,
    define: { __API_PROXY_TARGET__: JSON.stringify(target) },
    // Same-origin /api calls proxied to the API, so CORS_ORIGINS does not need this app's origin.
    server: { port: 5175, strictPort: true, proxy },
    preview: { port: 5175, strictPort: true, proxy },
    build: { chunkSizeWarningLimit: 2000 },
  };
});
