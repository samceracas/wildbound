import { Router } from "express";
import { LoginRequestSchema, STARTER_INVENTORY, type MeResponse } from "@wildbound/shared";
import type { AppDeps } from "../app.ts";
import { endSession, requirePlayer, startSession } from "../auth.ts";
import { parseOr400 } from "../http.ts";

/**
 * Username-only login: the username is the save slot. Logging in with a new
 * name creates the player (with starter items); an existing name resumes it.
 * There is deliberately no password yet, so anyone who knows a username can
 * load that save. Add one before sharing the game publicly.
 */
export function authRoutes({ db, config }: AppDeps): Router {
  const router = Router();

  router.post("/login", async (req, res) => {
    const { username } = parseOr400(LoginRequestSchema, req.body, "Invalid username");
    const key = username.toLowerCase();

    const player = await db.player.upsert({
      where: { username: key },
      update: { lastSeenAt: new Date() },
      create: {
        username: key,
        displayName: username,
        inventory: {
          create: Object.entries(STARTER_INVENTORY).map(([itemId, quantity]) => ({ itemId, quantity: quantity ?? 0 })),
        },
      },
    });

    await startSession(db, res, player.id, config.secureCookies);
    res.json({ player: { id: player.id, username: player.username, displayName: player.displayName } } satisfies MeResponse);
  });

  router.post("/logout", async (req, res) => {
    await endSession(db, req, res);
    res.status(204).end();
  });

  router.get("/me", requirePlayer(db), (_req, res) => {
    res.json({ player: res.locals.player } satisfies MeResponse);
  });

  return router;
}
