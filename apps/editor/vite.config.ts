import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Read VITE_* variables from the repo-root .env shared with the API.
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 2000 },
});
