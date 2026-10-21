import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CreatureDefinitionSchema,
  WildkinEntryInputSchema,
  WorldDocumentSchema,
  type ArtKind,
  type CreatureDefinition,
  type WildkinEntryData,
  type WorldDocument,
} from "@wildbound/shared";
import { z } from "zod";

const read = (name: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../seed/${name}`, import.meta.url)), "utf8"));

/** The five opening Wildkin. */
export function seedCreatures(): CreatureDefinition[] {
  return z.array(CreatureDefinitionSchema).parse(read("creatures.json"));
}

/** Sample Mabunyi Nature Reserve world (1 region, 3 habitats, 7 POIs, 3 encounter tables). */
export function seedMabunyiWorld(): WorldDocument {
  return WorldDocumentSchema.parse(read("mabunyi.world.json"));
}

/** Wildkin Bible entries for the five opening Wildkin (Creature Manager encyclopedia). */
export function seedWildkinBible(): WildkinEntryData[] {
  return z.array(WildkinEntryInputSchema).parse(read("wildkin.json"));
}

/**
 * The hand-made PixelLab art shipped in apps/web/public/wildkin, imported into
 * the database by `pnpm db:seed` so the API can serve every Wildkin's art the
 * same way. Returns null when the file does not exist.
 */
export function seedArtFile(creatureId: string, kind: ArtKind): Uint8Array | null {
  const dir = kind === "icon" ? "icons" : "sprites";
  const path = fileURLToPath(new URL(`../../../apps/web/public/wildkin/${dir}/${creatureId}.png`, import.meta.url));
  return existsSync(path) ? readFileSync(path) : null;
}
