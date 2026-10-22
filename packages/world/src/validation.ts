import type { ValidationIssue, ValidationReport, WorldDocument } from "@wildbound/shared";
import { RESEARCH_RULES, WorldDocumentSchema, levelRangeProblems, rankForLevel } from "@wildbound/shared";
import { effectiveLevelRange } from "./encounters.ts";
import { fractionOutside, isSimpleArea, overlapSquareMeters, pointInArea } from "./geometry.ts";

/** More than this share of a habitat outside its region is "clearly outside" and blocks publishing. */
export const HABITAT_OUTSIDE_ERROR_FRACTION = 0.5;
/** Any share above this (but under the error threshold) produces a warning. */
export const HABITAT_OUTSIDE_WARNING_FRACTION = 0.01;
/** Every region needs a habitat whose wild Wildkin start at or below this level (players do not choose where they live). */
export const ENTRY_HABITAT_MAX_LEVEL = 10;

const err = (i: Omit<ValidationIssue, "severity">): ValidationIssue => ({ severity: "error", ...i });
const warn = (i: Omit<ValidationIssue, "severity">): ValidationIssue => ({ severity: "warning", ...i });

export function report(issues: ValidationIssue[]): ValidationReport {
  return { ok: !issues.some((i) => i.severity === "error"), issues };
}

/** Turns Zod issues on a world document into validation issues. */
export function schemaIssues(input: unknown): { doc: WorldDocument | null; issues: ValidationIssue[] } {
  const parsed = WorldDocumentSchema.safeParse(input);
  if (parsed.success) return { doc: parsed.data, issues: [] };
  return {
    doc: null,
    issues: parsed.error.issues.map((i) => {
      const custom = i.code === "custom" ? (i.params as { code?: string } | undefined)?.code : undefined;
      if (custom) {
        // Level range issues sit at ["encounterTables", index, ...]: point at that table so the editor can open it.
        const index = i.path[0] === "encounterTables" && typeof i.path[1] === "number" ? i.path[1] : null;
        const tables = (input as { encounterTables?: { id?: unknown }[] } | null)?.encounterTables;
        const id = index !== null && Array.isArray(tables) ? tables[index]?.id : undefined;
        return err({ code: custom, entityType: "encounterTable", ...(typeof id === "string" ? { entityId: id } : {}), message: i.message });
      }
      return err({ code: "schema", entityType: "world", message: `${i.path.join(".") || "(root)"}: ${i.message}` });
    }),
  };
}

/**
 * Structural integrity. These rules block saving a draft: broken references,
 * duplicate ids/slugs, unknown creatures and self-intersecting geometry.
 */
export function checkIntegrity(doc: WorldDocument, creatureIds: ReadonlySet<string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const seenIds = new Set<string>();
  const allEntities = [
    ...doc.regions.map((e) => ["region", e.id] as const),
    ...doc.habitats.map((e) => ["habitat", e.id] as const),
    ...doc.pois.map((e) => ["poi", e.id] as const),
    ...doc.encounterTables.map((e) => ["encounterTable", e.id] as const),
  ];
  for (const [entityType, id] of allEntities) {
    if (seenIds.has(id)) issues.push(err({ code: "duplicate-id", entityType, entityId: id, message: `Duplicate id ${id}` }));
    seenIds.add(id);
  }

  const regions = new Map(doc.regions.map((r) => [r.id, r]));
  const habitats = new Map(doc.habitats.map((h) => [h.id, h]));

  // Region slugs are unique world-wide.
  const regionSlugs = new Set<string>();
  for (const r of doc.regions) {
    if (regionSlugs.has(r.slug)) {
      issues.push(err({ code: "duplicate-slug", entityType: "region", entityId: r.id, message: `Region slug "${r.slug}" is already used` }));
    }
    regionSlugs.add(r.slug);
    if (!isSimpleArea(r.geometry)) {
      issues.push(err({ code: "invalid-geometry", entityType: "region", entityId: r.id, message: `Region "${r.name}" boundary crosses itself` }));
    }
  }

  // Habitat and POI slugs are unique within their region.
  const scopedSlugs = new Set<string>();
  for (const h of doc.habitats) {
    if (!regions.has(h.regionId)) {
      issues.push(err({ code: "missing-region", entityType: "habitat", entityId: h.id, message: `Habitat "${h.name}" has no parent region` }));
    }
    const key = `habitat:${h.regionId}:${h.slug}`;
    if (scopedSlugs.has(key)) {
      issues.push(err({ code: "duplicate-slug", entityType: "habitat", entityId: h.id, message: `Habitat slug "${h.slug}" is already used in this region` }));
    }
    scopedSlugs.add(key);
    if (!isSimpleArea(h.geometry)) {
      issues.push(err({ code: "invalid-geometry", entityType: "habitat", entityId: h.id, message: `Habitat "${h.name}" boundary crosses itself` }));
    }
  }

  for (const p of doc.pois) {
    if (!regions.has(p.regionId)) {
      issues.push(err({ code: "missing-region", entityType: "poi", entityId: p.id, message: `POI "${p.name}" has no parent region` }));
    }
    const key = `poi:${p.regionId}:${p.slug}`;
    if (scopedSlugs.has(key)) {
      issues.push(err({ code: "duplicate-slug", entityType: "poi", entityId: p.id, message: `POI slug "${p.slug}" is already used in this region` }));
    }
    scopedSlugs.add(key);
  }

  for (const t of doc.encounterTables) {
    if (!regions.has(t.regionId)) {
      issues.push(err({ code: "missing-region", entityType: "encounterTable", entityId: t.id, message: `Encounter table "${t.name}" has no region` }));
    }
    if (t.habitatId !== null) {
      const habitat = habitats.get(t.habitatId);
      if (!habitat) {
        issues.push(err({ code: "missing-habitat", entityType: "encounterTable", entityId: t.id, message: `Encounter table "${t.name}" references a missing habitat` }));
      } else if (habitat.regionId !== t.regionId) {
        issues.push(err({ code: "habitat-region-mismatch", entityType: "encounterTable", entityId: t.id, message: `Encounter table "${t.name}" habitat belongs to a different region` }));
      }
    }
    for (const message of levelRangeProblems(t)) {
      issues.push(err({ code: "invalid-level-range", entityType: "encounterTable", entityId: t.id, message }));
    }
    const seenEntryIds = new Set<string>();
    for (const e of t.entries) {
      if (!creatureIds.has(e.creatureId)) {
        issues.push(err({ code: "unknown-creature", entityType: "encounterTable", entityId: t.id, message: `Encounter table "${t.name}" references unknown Wildkin "${e.creatureId}"` }));
      }
      if (seenEntryIds.has(e.id) || seenIds.has(e.id)) {
        issues.push(err({ code: "duplicate-id", entityType: "encounterTable", entityId: t.id, message: `Duplicate encounter entry id ${e.id}` }));
      }
      seenEntryIds.add(e.id);
    }
  }

  return issues;
}

/**
 * Full validation used before publishing: integrity rules plus spatial and
 * content rules. Errors block publishing; warnings never block.
 */
export function validateWorld(doc: WorldDocument, creatureIds: ReadonlySet<string>): ValidationReport {
  const issues = checkIntegrity(doc, creatureIds);
  const regions = new Map(doc.regions.map((r) => [r.id, r]));

  if (!doc.regions.some((r) => r.active)) {
    issues.push(warn({ code: "no-active-region", entityType: "world", message: "No active region: published world will resolve nothing" }));
  }

  for (const r of doc.regions) {
    if (!doc.habitats.some((h) => h.regionId === r.id)) {
      issues.push(warn({ code: "region-without-habitats", entityType: "region", entityId: r.id, message: `Region "${r.name}" has no habitats` }));
    }
  }

  for (const h of doc.habitats) {
    const region = regions.get(h.regionId);
    if (!region || !isSimpleArea(h.geometry) || !isSimpleArea(region.geometry)) continue;
    const outside = fractionOutside(h.geometry, region.geometry);
    if (outside > HABITAT_OUTSIDE_ERROR_FRACTION) {
      issues.push(err({ code: "habitat-outside-region", entityType: "habitat", entityId: h.id, message: `Habitat "${h.name}" is mostly outside region "${region.name}" (${Math.round(outside * 100)}% outside)` }));
    } else if (outside > HABITAT_OUTSIDE_WARNING_FRACTION) {
      issues.push(warn({ code: "habitat-partially-outside-region", entityType: "habitat", entityId: h.id, message: `Habitat "${h.name}" extends ${Math.round(outside * 100)}% outside region "${region.name}"` }));
    }
    if (!doc.encounterTables.some((t) => t.habitatId === h.id)) {
      issues.push(warn({ code: "habitat-without-encounters", entityType: "habitat", entityId: h.id, message: `Habitat "${h.name}" has no encounter table` }));
    }
  }

  // Overlapping habitats are allowed (the smallest containing habitat wins) but flagged.
  for (let i = 0; i < doc.habitats.length; i++) {
    for (let j = i + 1; j < doc.habitats.length; j++) {
      const a = doc.habitats[i]!;
      const b = doc.habitats[j]!;
      if (a.regionId !== b.regionId || !isSimpleArea(a.geometry) || !isSimpleArea(b.geometry)) continue;
      if (overlapSquareMeters(a.geometry, b.geometry) > 1) {
        issues.push(warn({ code: "habitats-overlap", entityType: "habitat", entityId: a.id, message: `Habitats "${a.name}" and "${b.name}" overlap; the smaller one wins where they do` }));
      }
    }
  }

  for (const p of doc.pois) {
    const region = regions.get(p.regionId);
    if (region && isSimpleArea(region.geometry) && !pointInArea(p.location, region.geometry)) {
      issues.push(err({ code: "poi-outside-region", entityType: "poi", entityId: p.id, message: `POI "${p.name}" is outside region "${region.name}"` }));
    }
  }

  for (const t of doc.encounterTables) {
    if (t.active && t.entries.length === 0) {
      issues.push(err({ code: "empty-encounter-table", entityType: "encounterTable", entityId: t.id, message: `Active encounter table "${t.name}" has no Wildkin` }));
    }
    const creatures = t.entries.map((e) => e.creatureId);
    if (new Set(creatures).size !== creatures.length) {
      issues.push(warn({ code: "duplicate-creature-entry", entityType: "encounterTable", entityId: t.id, message: `Encounter table "${t.name}" lists the same Wildkin more than once` }));
    }
    // A range that crosses a license band (a multiple of 20) puts some spawns out of reach of a rank.
    const ranges = [{ minLevel: t.minLevel, maxLevel: t.maxLevel }, ...t.entries.map((e) => effectiveLevelRange(t, e))];
    const crossing = ranges.find((r) => r.minLevel <= r.maxLevel && rankForLevel(r.minLevel) !== rankForLevel(r.maxLevel));
    if (crossing) {
      issues.push(warn({ code: "level-range-crosses-band", entityType: "encounterTable", entityId: t.id, message: `Encounter table "${t.name}" has wild levels ${crossing.minLevel} to ${crossing.maxLevel}, which crosses a license band (every ${RESEARCH_RULES.levelsPerRank} levels)` }));
    }
  }

  // Every region needs an easy entry habitat: difficulty should rise within a region, not between neighbourhoods.
  for (const r of doc.regions) {
    if (!r.active) continue;
    const easy = doc.encounterTables.some(
      (t) =>
        t.active &&
        t.regionId === r.id &&
        t.entries.some((e) => effectiveLevelRange(t, e).minLevel <= ENTRY_HABITAT_MAX_LEVEL),
    );
    if (!easy) {
      issues.push(warn({ code: "region-without-entry-habitat", entityType: "region", entityId: r.id, message: `Region "${r.name}" has no habitat where wild Wildkin start at level ${ENTRY_HABITAT_MAX_LEVEL} or below; new players there could not battle anything` }));
    }
  }

  return report(issues);
}
