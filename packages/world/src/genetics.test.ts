import { describe, expect, it } from "vitest";
import { DEFAULT_GENE_POOL, type GenePool, type Genome } from "@wildbound/shared";
import { seededRandom } from "./encounters.ts";
import { alleleChance, genotypeText, inheritGenome, phenotype, rollGenome, rollVigor, traitModifiers } from "./genetics.ts";

const kantarPool: GenePool = {
  build: {
    pAllele: 0.5,
    byHabitatTag: [
      { tag: "mature-woodland", pAllele: 0.75 },
      { tag: "forest-floor", pAllele: 0.6 },
    ],
  },
  temperament: { pAllele: 0.6, byHabitatTag: [] },
  marking: { name: "Banded", description: "", frequency: 0.05 },
};

const share = <T>(n: number, roll: () => T, test: (v: T) => boolean) => {
  let hits = 0;
  for (let i = 0; i < n; i++) if (test(roll())) hits++;
  return hits / n;
};

describe("alleleChance", () => {
  it("uses the first matching habitat tag in authored order, else the default", () => {
    expect(alleleChance(kantarPool.build, ["forest-floor", "mature-woodland"])).toBe(0.75);
    expect(alleleChance(kantarPool.build, ["forest-floor"])).toBe(0.6);
    expect(alleleChance(kantarPool.build, ["creek"])).toBe(0.5);
    expect(alleleChance(kantarPool.build, [])).toBe(0.5);
  });
});

describe("rollGenome", () => {
  it("produces Hardy-Weinberg shares over many seeded rolls", () => {
    const random = seededRandom(11);
    const n = 20000;
    const large = share(n, () => phenotype(rollGenome(DEFAULT_GENE_POOL, [], random)), (p) => p.build === "large");
    expect(large).toBeCloseTo(0.25, 1);
    const typical = share(n, () => phenotype(rollGenome(DEFAULT_GENE_POOL, [], random)), (p) => p.build === "typical");
    expect(typical).toBeCloseTo(0.5, 1);
    const largeWoodland = share(n, () => phenotype(rollGenome(kantarPool, ["mature-woodland"], random)), (p) => p.build === "large");
    expect(Math.abs(largeWoodland - 0.5625)).toBeLessThan(0.02);
  });

  it("expresses a marking in about frequency squared of individuals, never without a variant", () => {
    const random = seededRandom(5);
    const marked = share(100000, () => phenotype(rollGenome(kantarPool, [], random)), (p) => p.marked);
    expect(Math.abs(marked - 0.0025)).toBeLessThan(0.001);
    expect(share(2000, () => rollGenome(DEFAULT_GENE_POOL, [], random), (g) => g.marking.includes("m"))).toBe(0);
  });

  it("is reproducible with a seed", () => {
    const a = seededRandom(3);
    const b = seededRandom(3);
    expect(rollGenome(kantarPool, ["forest-floor"], a)).toEqual(rollGenome(kantarPool, ["forest-floor"], b));
  });
});

describe("rollVigor", () => {
  it("rolls four integers from 0 to 5", () => {
    const random = seededRandom(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rollVigor(random);
      for (const x of Object.values(v)) {
        expect(Number.isInteger(x)).toBe(true);
        seen.add(x);
      }
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(rollVigor(() => 0.9999999)).toEqual({ hp: 5, atk: 5, def: 5, spd: 5 });
  });
});

describe("phenotype and modifiers", () => {
  const g = (build: string, temperament: string, marking = "++"): Genome =>
    ({ build: [...build], temperament: [...temperament], marking: [...marking] }) as unknown as Genome;

  it("derives phenotypes from genotypes", () => {
    expect(phenotype(g("SS", "BB"))).toEqual({ build: "small", temperament: "bold", marked: false });
    expect(phenotype(g("SL", "BW"))).toEqual({ build: "typical", temperament: "steady", marked: false });
    expect(phenotype(g("LS", "WB", "+m"))).toEqual({ build: "typical", temperament: "steady", marked: false });
    expect(phenotype(g("LL", "WW", "mm"))).toEqual({ build: "large", temperament: "wary", marked: true });
  });

  it("multiplies trait modifiers across genes", () => {
    const mods = traitModifiers({ build: "large", temperament: "wary", marked: false });
    expect(mods.spd).toBeCloseTo(0.99);
    expect(mods.hp).toBeCloseTo(1.1);
    expect(mods.def).toBeCloseTo(1.05);
    expect(mods.atk).toBeCloseTo(0.9);
    expect(traitModifiers({ build: "typical", temperament: "steady", marked: true })).toEqual({});
    expect(traitModifiers({ build: "small", temperament: "bold", marked: false })).toEqual({ hp: 0.9, spd: 1.1, atk: 1.1, def: 0.9 });
  });

  it("formats genotypes", () => {
    expect(genotypeText(g("SL", "WW", "+m"))).toEqual({ build: "S/L", temperament: "W/W", marking: "+/m" });
  });
});

describe("inheritGenome", () => {
  it("takes one allele per locus from each parent", () => {
    const a: Genome = { build: ["S", "S"], temperament: ["B", "B"], marking: ["m", "m"] };
    const b: Genome = { build: ["L", "L"], temperament: ["W", "W"], marking: ["+", "+"] };
    expect(inheritGenome(a, b, seededRandom(1))).toEqual({ build: ["S", "L"], temperament: ["B", "W"], marking: ["m", "+"] });
  });

  it("gives a quarter homozygous offspring from two carriers", () => {
    const carrier: Genome = { build: ["S", "L"], temperament: ["B", "W"], marking: ["+", "m"] };
    const random = seededRandom(8);
    expect(share(20000, () => inheritGenome(carrier, carrier, random), (c) => c.marking[0] === "m" && c.marking[1] === "m")).toBeCloseTo(0.25, 1);
  });
});
