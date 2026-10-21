import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import type { Database } from "@wildbound/db";
import type { ApiConfig } from "./config.ts";
import { errorHandler } from "./errors.ts";
import { HttpError } from "./http.ts";
import { authRoutes } from "./routes/auth.ts";
import { editorRoutes } from "./routes/editor.ts";
import { gameRoutes } from "./routes/game.ts";
import { artRoutes, managerRoutes } from "./routes/manager.ts";
import type { ArtGenerator } from "./manager/art.ts";
import type { WildkinAssistant } from "./manager/assistant.ts";
import type { WeatherProvider } from "./weather.ts";

export interface AppDeps {
  db: Database;
  config: ApiConfig;
  weather: WeatherProvider;
  /** Creature Manager AI assistant (Groq); null/undefined = disabled. */
  assistant?: WildkinAssistant | null;
  /** Creature Manager art generator (PixelLab); null/undefined = disabled. */
  art?: ArtGenerator | null;
  /** Overridable clock and randomness (tests). */
  now?: () => Date;
  random?: () => number;
}

/**
 * Builds the Express app without listening, so tests can drive it with supertest.
 *
 *   /api/health          public
 *   /api/auth/*          username login, session cookie
 *   /api/game/*          player game API (session required)
 *   /api/editor/*        Map Editor API (editor bearer token required)
 *   /api/manager/*       Creature Manager API (editor bearer token required)
 *   /api/art/*           public Wildkin art (PNG from the database)
 */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("query parser", "simple");

  app.use(
    cors({
      origin: deps.config.corsOrigins,
      credentials: true,
      methods: ["GET", "PUT", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/auth", authRoutes(deps));
  app.use("/api/game", gameRoutes(deps));
  app.use("/api/editor", editorRoutes(deps));
  app.use("/api/manager", managerRoutes(deps));
  app.use("/api/art", artRoutes(deps));

  app.use((_req, _res, next) => next(new HttpError(404, "not_found", "Not found")));
  app.use(errorHandler);
  return app;
}
