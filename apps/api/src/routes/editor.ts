import type { FastifyInstance } from "fastify";
import { getWorldStatus, listCreatures, loadWorld, publishDraft, saveDraft } from "@wildbound/db";
import type { EditorWorldResponse, PublishResponse, SaveDraftResponse } from "@wildbound/shared";
import { checkIntegrity, report, schemaIssues, validateWorld } from "@wildbound/world";
import { requireEditor } from "../auth.ts";
import type { AppDeps } from "../app.ts";

export async function editorRoutes(app: FastifyInstance, { db, config }: AppDeps) {
  app.addHook("preHandler", requireEditor(config.editorToken));

  const creatureIds = async () => new Set((await listCreatures(db)).map((c) => c.id));

  /** Full editable draft plus reference data. */
  app.get("/api/editor/world", async (): Promise<EditorWorldResponse> => {
    const [draft, creatures, status] = await Promise.all([loadWorld(db, "draft"), listCreatures(db), getWorldStatus(db)]);
    return { draft, creatures, status };
  });

  /** Read-only view of what players currently get. */
  app.get("/api/editor/published", async () => ({ published: await loadWorld(db, "published"), status: await getWorldStatus(db) }));

  /**
   * Save draft: replaces the whole draft document. Rejected (400) when the
   * payload is malformed or structurally broken; spatial/content warnings and
   * publish-blocking errors are returned in `report` but do not block saving.
   */
  app.put("/api/editor/draft", async (request, reply) => {
    const { doc, issues } = schemaIssues(request.body);
    if (!doc) return reply.code(400).send({ error: "invalid_world", message: "World document is malformed", issues });

    const ids = await creatureIds();
    const integrity = checkIntegrity(doc, ids);
    if (integrity.length > 0) {
      return reply.code(400).send({ error: "invalid_world", message: "World document has integrity errors", issues: integrity });
    }

    await saveDraft(db, doc);
    const body: SaveDraftResponse = { status: await getWorldStatus(db), report: validateWorld(doc, ids) };
    return body;
  });

  /** Validates a posted document (e.g. unsaved editor state) without saving. */
  app.post("/api/editor/validate", async (request) => {
    const { doc, issues } = schemaIssues(request.body);
    if (!doc) return report(issues);
    return validateWorld(doc, await creatureIds());
  });

  /** Validates the saved draft and atomically publishes it. */
  app.post("/api/editor/publish", async (_request, reply) => {
    const ids = await creatureIds();
    const result = await publishDraft(db, (doc) => validateWorld(doc, ids));
    if (!result.ok) {
      return reply
        .code(409)
        .send({ error: "validation_failed", message: "Draft has errors and was not published", issues: result.report.issues });
    }
    const body: PublishResponse = { version: result.version, publishedAt: result.publishedAt, report: result.report };
    return body;
  });
}
