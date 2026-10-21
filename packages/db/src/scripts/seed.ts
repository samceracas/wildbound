import "../env.ts";
import { checkIntegrity, report, validateWorld } from "@wildbound/world";
import type { ValidationIssue } from "@wildbound/shared";
import { createDb } from "../client.ts";
import { requireEnv } from "../env.ts";
import { seedArtFile, seedCreatures, seedMabunyiWorld, seedWildkinBible } from "../seed-data.ts";
import { loadWildkinArt, saveWildkinArt, seedWildkinEntries } from "../wildkin-repo.ts";
import { ART_KINDS } from "@wildbound/shared";
import { loadWorld, publishDraft, saveDraft, upsertCreatures } from "../world-repo.ts";
import { runScript, ScriptError } from "./cli.ts";

/**
 * pnpm db:seed               creatures + sample Mabunyi draft (only if the draft is empty)
 * pnpm db:seed --force       overwrite the current draft with the sample world
 * pnpm db:seed --publish     also publish the draft after seeding
 * pnpm db:seed --creatures   creatures (+ their encyclopedia entries and art) only
 *
 * Creatures are upserted every time. Encyclopedia entries (Creature Manager)
 * and their art are only inserted when missing, so authored work is kept.
 */
const args = new Set(process.argv.slice(2));

const formatIssues = (issues: ValidationIssue[]) =>
  issues.map((i) => `  ${i.severity === "error" ? "error  " : "warning"} [${i.code}] ${i.message}`).join("\n");

const url = process.env.DATABASE_URL;
await runScript("Seed", url, async () => {
  const handle = createDb(requireEnv("DATABASE_URL"));
  try {
    const creatures = seedCreatures();
    await upsertCreatures(handle.db, creatures);
    console.log(`Seeded ${creatures.length} Wildkin: ${creatures.map((c) => c.name).join(", ")}`);

    const added = await seedWildkinEntries(handle.db, seedWildkinBible());
    let imported = 0;
    for (const c of creatures) {
      for (const kind of ART_KINDS) {
        const png = seedArtFile(c.id, kind);
        if (!png || (await loadWildkinArt(handle.db, c.id, kind))) continue;
        if (!(await handle.db.wildkinEntry.findUnique({ where: { id: c.id }, select: { id: true } }))) continue;
        await saveWildkinArt(handle.db, c.id, kind, png, { prompt: "imported", model: "pixellab (hand-generated)" });
        imported++;
      }
    }
    console.log(`Encyclopedia: ${added} new entries, ${imported} art files imported`);

    let keptDraft = false;
    if (!args.has("--creatures")) {
      const current = await loadWorld(handle.db, "draft");
      if (current.regions.length > 0 && !args.has("--force")) {
        keptDraft = true;
        console.log("Draft already has content; skipping sample world (use --force to overwrite).");
      } else {
        const world = seedMabunyiWorld();
        const creatureIds = new Set(creatures.map((c) => c.id));
        const integrity = report(checkIntegrity(world, creatureIds));
        if (!integrity.ok) throw new ScriptError(`Sample world failed integrity checks:\n${formatIssues(integrity.issues)}`);
        await saveDraft(handle.db, world);
        console.log(
          `Seeded draft: ${world.regions.length} region, ${world.habitats.length} habitats, ${world.pois.length} POIs, ${world.encounterTables.length} encounter tables`,
        );
      }
    }

    if (args.has("--publish")) {
      const creatureIds = new Set(creatures.map((c) => c.id));
      const result = await publishDraft(handle.db, (doc) => validateWorld(doc, creatureIds));
      if (!result.ok) {
        throw new ScriptError(
          `the draft did not pass validation, nothing was published:\n${formatIssues(result.report.issues)}` +
            (keptDraft
              ? "\n\nThis is the draft you edited (the sample world was skipped). Fix it in the editor, or run `pnpm db:seed --force --publish` to replace it with the sample world."
              : ""),
        );
      }
      const warnings = result.report.issues.filter((i) => i.severity === "warning");
      if (warnings.length) console.log(`Warnings:\n${formatIssues(warnings)}`);
      console.log(`Published version ${result.version}`);
    }
  } finally {
    await handle.close();
  }
});
