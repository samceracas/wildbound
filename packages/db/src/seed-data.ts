import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CreatureDefinitionSchema, WorldDocumentSchema, type CreatureDefinition, type WorldDocument } from "@wildbound/shared";
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
