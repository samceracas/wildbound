import { GenomeSchema, TYPICAL_GENOME, AVERAGE_VIGOR, VigorSchema } from "@wildbound/shared";
import { individualStats } from "@wildbound/world";
import type { Database } from "./client.ts";
import { listCreatures } from "./world-repo.ts";

/**
 * Keeps captured Wildkin HP within their real maximum. Migration
 * 5_battle_system backfilled HP for Wildkin caught before v0.3.0 from the
 * proposed seed stats; once `pnpm db:seed` has written the species' actual
 * base stats this lowers any HP above the maximum. Returns how many rows changed.
 */
export async function clampCapturedHp(db: Database): Promise<number> {
  const creatures = new Map((await listCreatures(db, { includeDeleted: true })).map((c) => [c.id, c]));
  const rows = await db.capturedWildkin.findMany({ select: { id: true, creatureId: true, level: true, genome: true, vigor: true, currentHp: true } });
  let changed = 0;
  for (const row of rows) {
    const genome = GenomeSchema.safeParse(row.genome).data ?? TYPICAL_GENOME;
    const vigor = VigorSchema.safeParse(row.vigor).data ?? AVERAGE_VIGOR;
    const maxHp = individualStats(creatures.get(row.creatureId)?.baseStats ?? null, row.level, genome, vigor).hp;
    if (row.currentHp > maxHp) {
      await db.capturedWildkin.update({ where: { id: row.id }, data: { currentHp: maxHp } });
      changed++;
    }
  }
  return changed;
}
