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
  // Read VITE_* variables from the repo-root .env shared with the API, editor and web app.
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  // Calls the API directly at VITE_API_URL with the editor bearer token (CORS), like the editor.
  server: { port: 5175, strictPort: true },
  preview: { port: 5175, strictPort: true },
  build: { chunkSizeWarningLimit: 2000 },
});
