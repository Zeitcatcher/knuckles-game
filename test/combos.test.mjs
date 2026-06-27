import { describe, it, expect } from "vitest";
import { buildCombos } from "../src/core/combos.mjs";
import { WILD } from "../src/core/dice-model.mjs";
import { baseTriple, nOfAKindValue } from "../src/core/scoring.mjs";

describe("buildCombos", () => {
  const c = buildCombos();

  it("lists the single 1 (100) and single 5 (50)", () => {
    expect(c.singles).toEqual([
      { dice: [{ value: 1, isWild: false }], points: 100 },
      { dice: [{ value: 5, isWild: false }], points: 50 },
    ]);
  });

  it("lists all six triples with the rule values (1=1000, 2..6 = face*100)", () => {
    expect(c.triples.map((t) => t.points)).toEqual([1000, 200, 300, 400, 500, 600]);
    for (const t of c.triples) {
      expect(t.dice).toHaveLength(3);
      expect(t.points).toBe(baseTriple(t.dice[0].value));
    }
  });

  it("derives the n-of-a-kind multipliers from the scoring engine (4=x2, 5=x4, 6=x8)", () => {
    expect(c.nKind.mults).toEqual([
      { n: 4, x: 2 },
      { n: 5, x: 4 },
      { n: 6, x: 8 },
    ]);
    // cross-check against the engine for an arbitrary face
    for (const { n, x } of c.nKind.mults) {
      expect(nOfAKindValue(3, n)).toBe(baseTriple(3) * x);
    }
  });

  it("lists the three straights with dice and points", () => {
    expect(c.straights.map((s) => s.points)).toEqual([1500, 750, 500]);
    expect(c.straights[0].dice.map((d) => d.value)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(c.straights[1].dice.map((d) => d.value)).toEqual([2, 3, 4, 5, 6]);
    expect(c.straights[2].dice.map((d) => d.value)).toEqual([1, 2, 3, 4, 5]);
  });

  it("marks the wild die with isWild and value WILD", () => {
    expect(c.wild.die).toEqual({ value: WILD, isWild: true });
    // no regular face is ever flagged wild
    expect(c.triples.every((t) => t.dice.every((d) => !d.isWild))).toBe(true);
  });
});
