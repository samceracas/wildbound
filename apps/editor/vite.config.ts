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
  // Read VITE_* variables from the repo-root .env shared with the API.
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 2000 },
});
