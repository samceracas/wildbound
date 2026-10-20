import { Router } from "express";
import { getWorldStatus, listCreatures, loadWorld, publishDraft, saveDraft } from "@wildbound/db";
import {
  ResolveQuerySchema,
  type CreatureListResponse,
  type EditorWorldResponse,
  type PublishResponse,
  type PublishedWorldResponse,
  type SaveDraftResponse,
} from "@wildbound/shared";
import { checkIntegrity, report, schemaIssues, validateWorld } from "@wildbound/world";
import type { AppDeps } from "../app.ts";
import { requireEditor } from "../auth.ts";
import { HttpError, parseOr400 } from "../http.ts";
import { resolveWorldContext } from "../resolve.ts";

/**
 * Authoring, publishing and coordinate preview. Everything here needs the editor
 * token: resolving arbitrary coordinates and reading the whole world (including
 * where every Wildkin lives) are developer tools, not player features.
 */
export function editorRoutes({ db, config }: AppDeps): Router {
  const router = Router();
  router.use(requireEditor(config.editorToken));

  /** Species that can be used in encounter tables (soft-deleted ones are left out). */
  const creatureIds = async () => new Set((await listCreatures(db)).map((c) => c.id));
  /**
   * Saving only needs structural integrity, so a draft that still lists a species
   * deleted in the Creature Manager can be saved; validation then reports it.
   */
  const knownCreatureIds = async () => new Set((await listCreatures(db, { includeDeleted: true })).map((c) => c.id));

  /** Full editable draft plus reference data. */
  router.get("/world", async (_req, res) => {
    const [draft, creatures, status] = await Promise.all([loadWorld(db, "draft"), listCreatures(db), getWorldStatus(db)]);
    res.json({ draft, creatures, status } satisfies EditorWorldResponse);
  });

  /**
   * Creature catalog only (non-deleted). The editor refetches it on window focus,
   * so species published in the Creature Manager show up without a reload.
   */
  router.get("/creatures", async (_req, res) => {
    res.json({ creatures: await listCreatures(db) } satisfies CreatureListResponse);
  });

  /** Read-only view of what players currently get (active regions only). */
  router.get("/published", async (_req, res) => {
    const [world, creatures, status] = await Promise.all([loadWorld(db, "published"), listCreatures(db), getWorldStatus(db)]);
    const active = new Set(world.regions.filter((r) => r.active).map((r) => r.id));
    res.json({
      version: status.publishedVersion,
      publishedAt: status.lastPublishedAt,
      world: {
        regions: world.regions.filter((r) => active.has(r.id)),
        habitats: world.habitats.filter((h) => active.has(h.regionId)),
        pois: world.pois.filter((p) => active.has(p.regionId)),
        encounterTables: world.encounterTables.filter((t) => t.active && active.has(t.regionId)),
      },
      creatures,
    } satisfies PublishedWorldResponse);
  });

  /**
   * GET /api/editor/resolve?lat=&lng=[&radius=&timeOfDay=&weather=&stage=]
   * Preview what the game resolves at any coordinate (draft or published).
   */
  router.get("/resolve", async (req, res) => {
    const query = parseOr400(ResolveQuerySchema, req.query, "Invalid coordinate query");
    res.json(await resolveWorldContext(db, query, { timeZone: config.worldTimeZone }));
  });

  /**
   * Save draft: replaces the whole draft document. Rejected (400) when the
   * payload is malformed or structurally broken; spatial/content warnings and
   * publish-blocking errors are returned in `report` but do not block saving.
   */
  router.put("/draft", async (req, res) => {
    const { doc, issues } = schemaIssues(req.body);
    if (!doc) throw new HttpError(400, "invalid_world", "World document is malformed", issues);

    const integrity = checkIntegrity(doc, await knownCreatureIds());
    if (integrity.length > 0) throw new HttpError(400, "invalid_world", "World document has integrity errors", integrity);

    await saveDraft(db, doc);
    res.json({ status: await getWorldStatus(db), report: validateWorld(doc, await creatureIds()) } satisfies SaveDraftResponse);
  });

  /** Validates a posted document (e.g. unsaved editor state) without saving. */
  router.post("/validate", async (req, res) => {
    const { doc, issues } = schemaIssues(req.body);
    res.json(doc ? validateWorld(doc, await creatureIds()) : report(issues));
  });

  /** Validates the saved draft and atomically publishes it. */
  router.post("/publish", async (_req, res) => {
    const ids = await creatureIds();
    const result = await publishDraft(db, (doc) => validateWorld(doc, ids));
    if (!result.ok) throw new HttpError(409, "validation_failed", "Draft has errors and was not published", result.report.issues);
    res.json({ version: result.version, publishedAt: result.publishedAt, report: result.report } satisfies PublishResponse);
  });

  return router;
}
