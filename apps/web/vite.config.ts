import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Matches "paths" in tsconfig.json and "aliases" in components.json (shadcn).
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Read VITE_* variables from the repo-root .env shared with the API and editor.
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  server: {
    port: 5174,
    strictPort: true,
    // Same-origin API calls: the session cookie is first-party and no CORS is involved.
    proxy: { "/api": { target: process.env.API_PROXY_TARGET ?? "http://localhost:4000", changeOrigin: false } },
  },
  build: { chunkSizeWarningLimit: 2000 },
});
