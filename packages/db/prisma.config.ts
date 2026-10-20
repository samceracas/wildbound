import { defineConfig } from "prisma/config";
import "./src/env.ts";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/wildbound" },
});
