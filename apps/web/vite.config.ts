import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Read VITE_* variables from the repo-root .env shared with the API and editor.
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  server: { port: 5174, strictPort: true },
  build: { chunkSizeWarningLimit: 2000 },
});
