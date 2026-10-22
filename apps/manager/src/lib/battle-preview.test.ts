import { DEFAULT_GENE_POOL } from "@wildbound/shared";
import { describe, expect, it } from "vitest";
import { rollSample, statShape, traitMatchups } from "./battle-preview.ts";

/** A random() that returns the given values in order (then repeats the last). */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
};

describe("statShape", () => {
  it("is null until base stats are set", () => {
    expect(statShape(null)).toBeNull();
  });
  it("labels each stat with its descriptor and a bar fraction", () => {
    const rows = statShape({ hp: 100, atk: 80, def: 60, spd: 60 })!;
    expect(rows.map((r) => [r.label, r.descriptor])).toEqual([
      ["HP", "Signature strength"],
      ["Attack", "Solid"],
      ["Defense", "Modest"],
      ["Speed", "Modest"],
    ]);
    expect(rows[0]!.fraction).toBeCloseTo(100 / 150);
  });
  it("treats a blank input as 0", () => {
    const rows = statShape({ hp: Number.NaN, atk: 100, def: 100, spd: 100 })!;
    expect(rows[0]).toMatchObject({ base: 0, descriptor: "Weak point", fraction: 0 });
  });
});

describe("traitMatchups", () => {
  it("names weakness and resistance per trait", () => {
    expect(traitMatchups(["plated", "leafy"])).toEqual([
      expect.objectContaining({ label: "Plated", weakTo: "Crush", resists: "Pierce" }),
      expect.objectContaining({ label: "Leafy", weakTo: "Toxin", resists: "Surge" }),
    ]);
  });
});

describe("rollSample", () => {
  it("rolls a level 50 individual from the gene pool with no habitat", () => {
    // build L,L; temperament B,B; vigor all 0.99 -> 5.
    const s = rollSample({ hp: 75, atk: 75, def: 75, spd: 75 }, DEFAULT_GENE_POOL, seq(0.1, 0.1, 0.9, 0.9, 0.99));
    expect(s.level).toBe(50);
    expect(s.genome).toEqual({ build: ["L", "L"], temperament: ["B", "B"], marking: ["+", "+"] });
    expect(s.buildName).toBe("Large");
    expect(s.temperamentName).toBe("Bold");
    expect(s.marking).toBeNull();
    expect(s.vigor).toEqual({ hp: 5, atk: 5, def: 5, spd: 5 });
    // HP = round((75 + 50 + 10) x 1.1 x 1.05) = 156; Speed = round(80 x 0.9 x 1.05) = 76.
    expect(s.stats.hp).toBe(156);
    expect(s.stats.spd).toBe(76);
    const grades = Object.fromEntries(s.rows.map((r) => [r.key, r.grade]));
    expect(grades).toEqual({ hp: "Exceptional", atk: "Exceptional", def: "Fair", spd: "Low" });
    expect(s.rows[0]!.vigorWord).toBe("Exceptional");
    expect(s.usedFallbackStats).toBe(false);
  });
  it("uses the 75 x 4 fallback when stats are not set and names an expressed marking", () => {
    const pool = { ...DEFAULT_GENE_POOL, marking: { name: "Banded", description: "", frequency: 0.2 } };
    // build S,S; temperament W,W; marking m,m; vigor 0.
    const s = rollSample(null, pool, seq(0.9, 0.9, 0.1, 0.1, 0.1, 0.1, 0));
    expect(s.usedFallbackStats).toBe(true);
    expect(s.phenotype).toEqual({ build: "small", temperament: "wary", marked: true });
    expect(s.marking).toBe("Banded");
    expect(s.vigor).toEqual({ hp: 0, atk: 0, def: 0, spd: 0 });
    expect(s.rows.map((r) => r.vigorWord)).toEqual(["Frail", "Frail", "Frail", "Frail"]);
  });
});
