import type { FastifyInstance } from "fastify";
import { getWorldStatus, listCreatures, loadWorld } from "@wildbound/db";
import { ResolveQuerySchema, type PublishedWorldResponse } from "@wildbound/shared";
import { isEditorRequest } from "../auth.ts";
import type { AppDeps } from "../app.ts";
import { resolveWorldContext } from "../resolve.ts";
import { badRequestFromZod } from "../errors.ts";

export async function publicRoutes(app: FastifyInstance, { db, config }: AppDeps) {
  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/creatures", async () => ({ creatures: await listCreatures(db) }));

  /**
   * GET /api/world/published
   * The published world, public. Inactive regions (and everything under them)
   * are left out, matching what /api/world/resolve can return.
   */
  app.get("/api/world/published", async (): Promise<PublishedWorldResponse> => {
    const [world, creatures, status] = await Promise.all([loadWorld(db, "published"), listCreatures(db), getWorldStatus(db)]);
    const activeRegions = new Set(world.regions.filter((r) => r.active).map((r) => r.id));
    return {
      version: status.publishedVersion,
      publishedAt: status.lastPublishedAt,
      world: {
        regions: world.regions.filter((r) => activeRegions.has(r.id)),
        habitats: world.habitats.filter((h) => activeRegions.has(h.regionId)),
        pois: world.pois.filter((p) => activeRegions.has(p.regionId)),
        encounterTables: world.encounterTables.filter((t) => t.active && activeRegions.has(t.regionId)),
      },
      creatures,
    };
  });

  /**
   * GET /api/world/resolve?lat=&lng=[&radius=&timeOfDay=&weather=&stage=]
   * Published data by default. stage=draft is editor-only (preview).
   */
  app.get("/api/world/resolve", async (request, reply) => {
    const parsed = ResolveQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(badRequestFromZod(parsed.error, "Invalid coordinate query"));
    if (parsed.data.stage === "draft" && !isEditorRequest(request, config.editorToken)) {
      return reply.code(401).send({ error: "unauthorized", message: "Draft resolution requires the editor token" });
    }
    return resolveWorldContext(db, parsed.data, { timeZone: config.worldTimeZone });
  });
}
