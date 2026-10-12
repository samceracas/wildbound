import "../env.ts";
import { checkIntegrity, report, validateWorld } from "@wildbound/world";
import { createDb } from "../client.ts";
import { requireEnv } from "../env.ts";
import { seedCreatures, seedMabunyiWorld } from "../seed-data.ts";
import { loadWorld, publishDraft, saveDraft, upsertCreatures } from "../world-repo.ts";

/**
 * pnpm db:seed               creatures + sample Mabunyi draft (only if the draft is empty)
 * pnpm db:seed --force       overwrite the current draft with the sample world
 * pnpm db:seed --publish     also publish the draft after seeding
 * pnpm db:seed --creatures   creatures only
 */
const args = new Set(process.argv.slice(2));
const handle = createDb(requireEnv("DATABASE_URL"));

try {
  const creatures = seedCreatures();
  await upsertCreatures(handle.db, creatures);
  console.log(`Seeded ${creatures.length} Wildkin: ${creatures.map((c) => c.name).join(", ")}`);

  if (!args.has("--creatures")) {
    const current = await loadWorld(handle.db, "draft");
    if (current.regions.length > 0 && !args.has("--force")) {
      console.log("Draft already has content; skipping sample world (use --force to overwrite).");
    } else {
      const world = seedMabunyiWorld();
      const creatureIds = new Set(creatures.map((c) => c.id));
      const integrity = report(checkIntegrity(world, creatureIds));
      if (!integrity.ok) throw new Error(`Sample world failed integrity checks: ${JSON.stringify(integrity.issues)}`);
      await saveDraft(handle.db, world);
      console.log(
        `Seeded draft: ${world.regions.length} region, ${world.habitats.length} habitats, ${world.pois.length} POIs, ${world.encounterTables.length} encounter tables`,
      );
    }
  }

  if (args.has("--publish")) {
    const creatureIds = new Set(creatures.map((c) => c.id));
    const result = await publishDraft(handle.db, (doc) => validateWorld(doc, creatureIds));
    if (!result.ok) throw new Error(`Publish failed: ${JSON.stringify(result.report.issues)}`);
    console.log(`Published version ${result.version}`);
  }
} finally {
  await handle.close();
}
