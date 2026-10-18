import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import type { Database } from "@wildbound/db";
import { GAME_RULES, type Player } from "@wildbound/shared";
import { HttpError } from "./http.ts";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      /** Set by requirePlayer. */
      player: Player;
    }
  }
}

export const SESSION_COOKIE = "wb_session";

// ------------------------------------------------------------------ editor

/**
 * Developer/admin authorization for editor routes: a single shared bearer
 * token (EDITOR_TOKEN). Swap for real accounts before exposing the editor.
 */
export function isEditorRequest(req: Request, token: string): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "");
  if (!match) return false;
  const given = Buffer.from(match[1]!.trim());
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function requireEditor(token: string): RequestHandler {
  return (req, _res, next) => {
    if (!isEditorRequest(req, token)) throw new HttpError(401, "unauthorized", "Editor token required");
    next();
  };
}

// ------------------------------------------------------------------ player sessions

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates a session row and sets the httpOnly cookie. Only the hash is stored. */
export async function startSession(db: Database, res: Response, playerId: string, secure: boolean): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + GAME_RULES.sessionTtlMs);
  await db.playerSession.create({ data: { playerId, tokenHash: hashToken(token), expiresAt } });
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, expires: expiresAt, path: "/" });
}

export async function endSession(db: Database, req: Request, res: Response): Promise<void> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string") await db.playerSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** Loads the player behind the session cookie into res.locals.player, or answers 401. */
export function requirePlayer(db: Database): RequestHandler {
  return async (req, res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== "string") throw new HttpError(401, "unauthenticated", "Log in first");
    const session = await db.playerSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { player: true } });
    if (!session || session.expiresAt < new Date()) throw new HttpError(401, "unauthenticated", "Session expired; log in again");
    res.locals.player = { id: session.player.id, username: session.player.username, displayName: session.player.displayName };
    next();
  };
}
