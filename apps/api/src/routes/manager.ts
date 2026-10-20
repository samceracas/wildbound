import { Router } from "express";
import {
  createWildkin,
  getWildkin,
  listWildkin,
  loadWildkinArt,
  publishWildkin,
  restoreWildkin,
  saveWildkinArt,
  softDeleteWildkin,
  updateWildkin,
  wildkinStats,
  WildkinRepoError,
  type DeletedFilter,
} from "@wildbound/db";
import {
  ART_SIZES,
  ArtKindSchema,
  AssistRequestSchema,
  GenerateArtRequestSchema,
  SlugSchema,
  WildkinEntryInputSchema,
  type ArtBalance,
  type AssistResponse,
  type GenerateArtResponse,
  type ManagerConfig,
  type WildkinListResponse,
} from "@wildbound/shared";
import type { RequestHandler } from "express";
import { z } from "zod";
import type { AppDeps } from "../app.ts";
import { requireEditor } from "../auth.ts";
import { HttpError, parseOr400 } from "../http.ts";
import { ArtError, artPrompt, canAfford, GENERATIONS_PER_IMAGE } from "../manager/art.ts";
import { AssistantError, sanitizeSuggestion } from "../manager/assistant.ts";
import { buildLoreContext, loreDocuments } from "../manager/lore.ts";

const IdParamsSchema = z.object({ id: SlugSchema });
const ListQuerySchema = z.object({ deleted: z.enum(["exclude", "include", "only"]).default("exclude") });

/** Repository errors → HTTP. */
function mapRepoError(error: unknown): never {
  if (error instanceof WildkinRepoError) {
    const status = { not_found: 404, conflict: 409, publish_incomplete: 400, deleted: 409 }[error.code];
    throw new HttpError(status, error.code, error.message, error.issues.length ? error.issues : undefined);
  }
  throw error;
}
const repo = async <T>(fn: () => Promise<T>): Promise<T> => fn().catch(mapRepoError);

/**
 * Creature Manager API (editor token). Authors Wildkin encyclopedia entries,
 * publishes them into the game's `creatures` table, asks the AI assistant for
 * lore-aligned drafts and generates art with PixelLab.
 */
export function managerRoutes(deps: AppDeps): Router {
  const { db, config, assistant, art } = deps;
  const now = () => deps.now?.() ?? new Date();
  const router = Router();
  router.use(requireEditor(config.editorToken));

  router.get("/config", (_req, res) => {
    res.json({
      assistant: { enabled: Boolean(assistant), model: assistant?.model ?? null },
      art: { enabled: Boolean(art), model: art?.model ?? "pixellab/pixen" },
    } satisfies ManagerConfig);
  });

  router.get("/stats", async (_req, res) => {
    res.json(await wildkinStats(db));
  });

  router.get("/wildkin", async (req, res) => {
    const { deleted } = parseOr400(ListQuerySchema, req.query, "Invalid query");
    res.json({ wildkin: await listWildkin(db, deleted as DeletedFilter) } satisfies WildkinListResponse);
  });

  router.get("/wildkin/:id", async (req, res) => {
    const { id } = parseOr400(IdParamsSchema, req.params, "Invalid id");
    res.json(await repo(() => getWildkin(db, id)));
  });

  router.post("/wildkin", async (req, res) => {
    const data = parseOr400(WildkinEntryInputSchema, req.body, "Invalid Wildkin entry");
    res.status(201).json(await repo(() => createWildkin(db, data, now())));
  });

  router.put("/wildkin/:id", async (req, res) => {
    const { id } = parseOr400(IdParamsSchema, req.params, "Invalid id");
    const data = parseOr400(WildkinEntryInputSchema, req.body, "Invalid Wildkin entry");
    if (data.id !== id) throw new HttpError(400, "bad_request", "The id of a Wildkin cannot change");
    res.json(await repo(() => updateWildkin(db, data, now())));
  });

  router.post("/wildkin/:id/publish", async (req, res) => {
    const { id } = parseOr400(IdParamsSchema, req.params, "Invalid id");
    res.json(await repo(() => publishWildkin(db, id, now())));
  });

  router.delete("/wildkin/:id", async (req, res) => {
    const { id } = parseOr400(IdParamsSchema, req.params, "Invalid id");
    await repo(() => softDeleteWildkin(db, id, now()));
    res.status(204).end();
  });

  router.post("/wildkin/:id/restore", async (req, res) => {
    const { id } = parseOr400(IdParamsSchema, req.params, "Invalid id");
    res.json(await repo(() => restoreWildkin(db, id)));
  });

  // ---------------------------------------------------------------- AI assistant

  router.post("/assist", async (req, res) => {
    if (!assistant) throw new HttpError(503, "assistant_unavailable", "The AI assistant is not configured (set GROQ_API_KEY)");
    const request = parseOr400(AssistRequestSchema, req.body, "Invalid assist request");

    const [docs, roster] = await Promise.all([loreDocuments(config.loreDocsDir), listWildkin(db)]);
    const identities: Record<string, string> = {};
    for (const w of roster) identities[w.id] = (await getWildkin(db, w.id)).identity;

    let raw;
    try {
      raw = await assistant.suggest(request, { lore: buildLoreContext(docs, config.loreMaxChars), roster, identities });
    } catch (error) {
      if (error instanceof AssistantError) throw new HttpError(502, "assistant_failed", error.message);
      throw error;
    }
    res.json({ ...sanitizeSuggestion(raw), model: assistant.model } satisfies AssistResponse);
  });

  // ---------------------------------------------------------------- art (PixelLab)

  const requireArt = () => {
    if (!art) throw new HttpError(503, "art_unavailable", "Art generation is not configured (set PIXELLAB_API_KEY)");
    return art;
  };
  const artCall = async <T>(fn: () => Promise<T>): Promise<T> =>
    fn().catch((error: unknown) => {
      if (error instanceof ArtError) throw new HttpError(502, "art_failed", error.message);
      throw error;
    });

  router.get("/art/balance", async (_req, res) => {
    const generator = requireArt();
    res.json(await artCall(() => generator.balance()));
  });

  /** Generates art from the saved entry. Always checks the balance first. */
  router.post("/wildkin/:id/art", async (req, res) => {
    const generator = requireArt();
    const { id } = parseOr400(IdParamsSchema, req.params, "Invalid id");
    const { kinds, extraPrompt } = parseOr400(GenerateArtRequestSchema, req.body ?? {}, "Invalid art request");
    const entry = await repo(() => getWildkin(db, id));
    if (entry.deletedAt) throw new HttpError(409, "deleted", "Restore this Wildkin before generating art");
    if (!entry.physicalDescription && !entry.identity) {
      throw new HttpError(400, "bad_request", "Write a physical description (or identity) first; the art is generated from it");
    }

    const balanceBefore = await artCall(() => generator.balance());
    if (!canAfford(balanceBefore, kinds.length)) {
      throw new HttpError(
        402,
        "insufficient_credits",
        `PixelLab balance too low: ${describeBalance(balanceBefore)} (needs ${kinds.length * GENERATIONS_PER_IMAGE} generations)`,
      );
    }

    const prompts: Record<string, string> = {};
    const generated: GenerateArtResponse["generated"] = [];
    for (const kind of kinds) {
      const prompt = artPrompt(entry, kind, extraPrompt);
      prompts[kind] = prompt;
      const png = await artCall(() => generator.generate({ description: prompt, size: ART_SIZES[kind], kind }));
      await saveWildkinArt(db, id, kind, png, { prompt, model: generator.model }, now());
      generated.push(kind);
    }
    const balanceAfter = await generator.balance().catch(() => null);
    res.json({
      art: (await getWildkin(db, id)).art,
      generated,
      balanceBefore,
      balanceAfter,
      prompts,
    } satisfies GenerateArtResponse);
  });

  return router;
}

const describeBalance = (b: ArtBalance) =>
  [b.generations !== null ? `${b.generations} generations` : null, b.usd !== null ? `$${b.usd.toFixed(2)}` : null]
    .filter(Boolean)
    .join(", ") || "unknown";

const ArtParamsSchema = z.object({ id: SlugSchema, kind: ArtKindSchema });

/** Public: Wildkin art from the database (any non-deleted encyclopedia entry). */
export function artRoutes({ db }: AppDeps): Router {
  const router = Router();
  const serve: RequestHandler = async (req, res) => {
    const { id, kind } = parseOr400(ArtParamsSchema, req.params, "Invalid art path");
    const art = await loadWildkinArt(db, id, kind);
    if (!art) throw new HttpError(404, "not_found", "No art for this Wildkin");
    res.set("Content-Type", "image/png");
    // URLs carry ?v=<version> when the caller knows it; otherwise revalidate often.
    res.set("Cache-Control", req.query.v ? "public, max-age=31536000, immutable" : "public, max-age=60");
    res.set("Last-Modified", art.createdAt.toUTCString());
    res.send(Buffer.from(art.png));
  };
  router.get("/wildkin/:id/:kind.png", serve);
  return router;
}
