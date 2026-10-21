import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DbHandle } from "../src/client.ts";
import { seedCreatures } from "../src/seed-data.ts";
import { openTestDb, resetTestData } from "../src/testing.ts";
import { listCreatures, upsertCreatures } from "../src/world-repo.ts";

let handle: DbHandle;
beforeAll(async () => {
  handle = await openTestDb();
});
afterAll(async () => handle?.close());
beforeEach(async () => resetTestData(handle));

describe("upsertCreatures (pnpm db:seed)", () => {
  it("fixes registry numbers that the seed creatures hold in a different order", async () => {
    // What migration 1_players leaves in an old database: alphabetical numbers.
    const alphabetical = ["kantar", "kawi", "lumae", "mimu", "riverkin"];
    await handle.db.creature.updateMany({ data: { registryNumber: { increment: 100 } } });
    for (const [i, id] of alphabetical.entries()) {
      await handle.db.creature.update({ where: { id }, data: { registryNumber: i + 1 } });
    }

    await upsertCreatures(handle.db, seedCreatures());
    const numbers = Object.fromEntries((await listCreatures(handle.db)).map((c) => [c.id, c.registryNumber]));
    expect(numbers).toEqual({ kawi: 1, mimu: 2, lumae: 3, kantar: 4, riverkin: 5 });
  });

  it("explains a number taken by a creature that is not seed data", async () => {
    await handle.db.creature.update({ where: { id: "kawi" }, data: { registryNumber: 50 } });
    await handle.db.creature.create({ data: { id: "lampyra", registryNumber: 1, name: "Lampyra" } });
    await expect(upsertCreatures(handle.db, seedCreatures())).rejects.toThrow(/Registry number 1 is needed for "kawi" but is used by "lampyra"/);
    // Nothing was changed.
    expect((await handle.db.creature.findUnique({ where: { id: "kawi" } }))?.registryNumber).toBe(50);
  });
});
