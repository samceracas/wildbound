import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { Database } from "@wildbound/db";
import type { ApiConfig } from "./config.ts";
import { errorHandler } from "./errors.ts";
import { editorRoutes } from "./routes/editor.ts";
import { publicRoutes } from "./routes/public.ts";

export interface AppDeps {
  db: Database;
  config: ApiConfig;
}

export async function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify({ bodyLimit: 10 * 1024 * 1024, ...options });
  app.setErrorHandler(errorHandler);
  await app.register(cors, {
    origin: deps.config.corsOrigins,
    methods: ["GET", "PUT", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  await app.register(async (scope) => publicRoutes(scope, deps));
  await app.register(async (scope) => editorRoutes(scope, deps));
  return app;
}
