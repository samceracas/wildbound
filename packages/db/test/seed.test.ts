import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DbHandle } from "../src/client.ts";
import { validateWorld } from "@wildbound/world";
import { clampCapturedHp } from "../src/player-repo.ts";
import { seedCreatures, seedMabunyiWorld, seedWildkinBible } from "../src/seed-data.ts";
import { createTestPlayer, createTestWildkin, maxHpOf, openTestDb, resetTestData } from "../src/testing.ts";
import { backfillBattleFields, getWildkin, seedWildkinEntries } from "../src/wildkin-repo.ts";
import { listCreatures, loadWorld, publishDraft, saveDraft, upsertCreatures } from "../src/world-repo.ts";

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

describe("v0.3.0 game data", () => {
  it("seeds every species battle-ready: category, traits, stats summing to 300, attacks, gene pool", async () => {
    const creatures = await listCreatures(handle.db);
    for (const c of creatures) {
      expect(c.category).not.toBe("TBD");
      expect(c.bodyTraits.length).toBeGreaterThan(0);
      expect(c.baseStats && c.baseStats.hp + c.baseStats.atk + c.baseStats.def + c.baseStats.spd).toBe(300);
      expect(c.attacks.length).toBeGreaterThan(0);
    }
    const kantar = creatures.find((c) => c.id === "kantar")!;
    expect(kantar.genePool.build.byHabitatTag[0]).toEqual({ tag: "mature-woodland", pAllele: 0.75 });
    expect(kantar.genePool.marking?.name).toBe("Banded");
  });

  it("saves, loads and publishes wild level ranges and license requirements", async () => {
    const world = seedMabunyiWorld();
    world.habitats[2]!.licenseRequirement = { category: "aquatic", rank: 3 };
    await saveDraft(handle.db, world);
    const draft = await loadWorld(handle.db, "draft");
    const creek = draft.encounterTables.find((t) => t.name === "Silayan Creekside Encounters")!;
    expect([creek.minLevel, creek.maxLevel]).toEqual([4, 10]);
    expect(creek.entries.find((e) => e.creatureId === "riverkin")).toMatchObject({ minLevel: 5, maxLevel: 12 });
    expect(creek.entries.find((e) => e.creatureId === "kantar")).toMatchObject({ minLevel: null, maxLevel: null });
    expect(draft.habitats.find((h) => h.id === world.habitats[2]!.id)?.licenseRequirement).toEqual({ category: "aquatic", rank: 3 });

    const creatureIds = new Set(seedCreatures().map((c) => c.id));
    const result = await publishDraft(handle.db, (doc) => validateWorld(doc, creatureIds));
    expect(result.ok).toBe(true);
    expect(result.report.issues.map((i) => i.code)).not.toContain("region-without-entry-habitat");
    const published = await loadWorld(handle.db, "published");
    expect(published.encounterTables.map((t) => [t.name, t.minLevel, t.maxLevel]).sort()).toEqual([
      ["Forest Edge Encounters", 2, 6],
      ["Silayan Creekside Encounters", 4, 10],
      ["Sunbreak Clearing Encounters", 3, 8],
    ]);
    expect(published.habitats.filter((h) => h.licenseRequirement).length).toBe(1);
  });

  it("fills the battle fields into encyclopedia entries from before v0.3.0, once", async () => {
    const bible = seedWildkinBible();
    await seedWildkinEntries(handle.db, bible);
    const { category: _c, bodyTraits: _b, baseStats: _s, attacks: _a, genePool: _g, id: _id, registryNumber: _r, name: _n, ...old } = bible[0]!;
    await handle.db.wildkinEntry.update({ where: { id: "kawi" }, data: { content: { ...old, attacks: [] } } });
    expect(await backfillBattleFields(handle.db, bible)).toBe(1);
    const kawi = await getWildkin(handle.db, "kawi");
    expect(kawi.category).toBe("aerial");
    expect(kawi.attacks.map((a) => a.name)).toEqual(["Peck", "Wing Buffet"]);
    expect(await backfillBattleFields(handle.db, bible)).toBe(0);
  });

  it("clamps captured HP to the species maximum", async () => {
    const player = await createTestPlayer(handle.db, { licenses: { aquatic: { rank: 2 } } });
    expect(await handle.db.researcherLicense.count({ where: { playerId: player.id } })).toBe(4);
    const full = await createTestWildkin(handle.db, { playerId: player.id, creatureId: "kawi", level: 5 });
    expect(full.currentHp).toBe(await maxHpOf(handle.db, "kawi", 5));
    const over = await createTestWildkin(handle.db, { playerId: player.id, creatureId: "mimu", level: 5, hp: 999, partySlot: 1 });
    expect(await clampCapturedHp(handle.db)).toBe(1);
    expect((await handle.db.capturedWildkin.findUnique({ where: { id: over.id } }))?.currentHp).toBe(await maxHpOf(handle.db, "mimu", 5));
  });
});
