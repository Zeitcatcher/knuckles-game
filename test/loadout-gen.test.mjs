import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  generateLoadout,
  poolFor,
  synergy,
  CLASS_CAPS,
  CLASS_IDS,
  HONEST_DIE,
} from "../src/core/loadout-gen.mjs";

// The real catalog: these tests are only meaningful against the shipped prices.
const catalog = JSON.parse(readFileSync(new URL("../data/dice-catalog.json", import.meta.url), "utf8"));
const entries = catalog.dice.map((d) => ({ id: d.id, weights: d.weights, joker: Boolean(d.joker), price: d.price }));
const priceOf = (id) => entries.find((e) => e.id === id)?.price ?? 0;

/** Deterministic rng over a fixed sequence, cycling. */
const seq = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("price classes", () => {
  it("orders the caps from cheap to elite", () => {
    expect(CLASS_CAPS.cheap).toBeLessThan(CLASS_CAPS.solid);
    expect(CLASS_CAPS.solid).toBeLessThan(CLASS_CAPS.expensive);
    expect(CLASS_CAPS.expensive).toBeLessThan(CLASS_CAPS.elite);
    expect(CLASS_IDS).toEqual(["cheap", "solid", "expensive", "elite"]);
  });

  it("never puts the honest die in a pool", () => {
    for (const c of CLASS_IDS) expect(poolFor(entries, c).some((e) => e.id === HONEST_DIE)).toBe(false);
  });

  it("keeps the premium dice out of every class below elite", () => {
    const joker = "22";
    const queen = "02"; // 850 gp, the strongest die in the catalog
    for (const c of ["cheap", "solid", "expensive"]) {
      const ids = poolFor(entries, c).map((e) => e.id);
      expect(ids).not.toContain(joker);
      expect(ids).not.toContain(queen);
    }
    const elite = poolFor(entries, "elite").map((e) => e.id);
    expect(elite).toContain(joker);
    expect(elite).toContain(queen);
  });

  it("grows monotonically: every cheaper pool is contained in the next", () => {
    for (let i = 1; i < CLASS_IDS.length; i++) {
      const lower = new Set(poolFor(entries, CLASS_IDS[i - 1]).map((e) => e.id));
      const upper = new Set(poolFor(entries, CLASS_IDS[i]).map((e) => e.id));
      for (const id of lower) expect(upper.has(id)).toBe(true);
      expect(upper.size).toBeGreaterThan(lower.size);
    }
  });

  it("falls back to the cheapest cap for an unknown class", () => {
    expect(poolFor(entries, "nonsense").length).toBe(poolFor(entries, "cheap").length);
  });
});

describe("generateLoadout", () => {
  const gen = (over = {}) => generateLoadout({ entries, rng: seq([0.1, 0.4, 0.7, 0.2, 0.9, 0.5]), ...over });

  it("always returns exactly six ids", () => {
    for (const count of [0, 1, 3, 6]) expect(gen({ count }).length).toBe(6);
  });

  it("deals the asked-for number of loaded dice and leaves the rest honest", () => {
    for (const count of [0, 1, 2, 5, 6]) {
      const hand = gen({ count, priceClass: "solid" });
      expect(hand.filter((id) => id !== HONEST_DIE).length).toBe(count);
      expect(hand.filter((id) => id === HONEST_DIE).length).toBe(6 - count);
    }
  });

  it("clamps a count above six and below zero", () => {
    expect(gen({ count: 99 }).filter((id) => id !== HONEST_DIE).length).toBe(6);
    expect(gen({ count: -3 })).toEqual(Array(6).fill(HONEST_DIE));
  });

  it("never exceeds the class ceiling, in either mode", () => {
    for (const priceClass of CLASS_IDS) {
      for (const mode of ["random", "matched"]) {
        for (const r of [0.05, 0.33, 0.61, 0.88]) {
          const hand = generateLoadout({ entries, count: 6, priceClass, mode, rng: () => r });
          for (const id of hand) {
            if (id === HONEST_DIE) continue;
            expect(priceOf(id)).toBeLessThanOrEqual(CLASS_CAPS[priceClass]);
          }
        }
      }
    }
  });

  it("never repeats a generated die", () => {
    for (const mode of ["random", "matched"]) {
      const loaded = generateLoadout({ entries, count: 6, priceClass: "elite", mode, rng: seq([0.2, 0.8, 0.5]) })
        .filter((id) => id !== HONEST_DIE);
      expect(new Set(loaded).size).toBe(loaded.length);
    }
  });

  it("is deterministic for the same inputs and rng", () => {
    const a = generateLoadout({ entries, count: 4, priceClass: "solid", mode: "random", rng: seq([0.3, 0.6, 0.1, 0.9]) });
    const b = generateLoadout({ entries, count: 4, priceClass: "solid", mode: "random", rng: seq([0.3, 0.6, 0.1, 0.9]) });
    expect(a).toEqual(b);
  });

  it("gives an honest hand when nothing is asked for", () => {
    expect(gen({ count: 0, priceClass: "elite" })).toEqual(Array(6).fill(HONEST_DIE));
  });

  it("degrades to the pool size instead of reaching above the ceiling", () => {
    // A pool of two cheap dice cannot fill six slots; the rest stay honest.
    const tiny = [
      { id: "90", weights: [1, 1, 1, 1, 1, 1], joker: false, price: 10 },
      { id: "91", weights: [1, 1, 1, 1, 1, 1], joker: false, price: 20 },
      { id: "92", weights: [1, 1, 1, 1, 1, 1], joker: false, price: 999999 },
    ];
    const hand = generateLoadout({ entries: tiny, count: 6, priceClass: "cheap", mode: "random", rng: () => 0.5 });
    expect(hand.filter((id) => id !== HONEST_DIE).sort()).toEqual(["90", "91"]);
    expect(hand.filter((id) => id === HONEST_DIE).length).toBe(4);
  });
});

describe("matched sets", () => {
  const shareOnFace = (id, face) => synergy(entries.find((e) => e.id === id), face);

  it("scores a joker above its raw face weight", () => {
    const joker = entries.find((e) => e.joker);
    expect(synergy(joker, 1)).toBeGreaterThan(1 / 6);
  });

  it("always includes the joker in a full elite matched set", () => {
    for (const r of [0.1, 0.9]) {
      const hand = generateLoadout({ entries, count: 6, priceClass: "elite", mode: "matched", rng: () => r });
      expect(hand).toContain("22");
    }
  });

  it("leans harder on the target face than a random hand of the same size", () => {
    const face = 1;
    const matched = generateLoadout({ entries, count: 4, priceClass: "solid", mode: "matched", rng: () => 0.1 })
      .filter((id) => id !== HONEST_DIE);
    const random = generateLoadout({ entries, count: 4, priceClass: "solid", mode: "random", rng: seq([0.9, 0.2, 0.55, 0.35]) })
      .filter((id) => id !== HONEST_DIE);
    const avg = (ids) => ids.reduce((s, id) => s + shareOnFace(id, face), 0) / ids.length;
    expect(avg(matched)).toBeGreaterThan(avg(random));
  });

  it("builds around a scoring face, not a trap face", () => {
    const hand = generateLoadout({ entries, count: 3, priceClass: "solid", mode: "matched", rng: () => 0.1 })
      .filter((id) => id !== HONEST_DIE);
    // Every die in the set beats a fair die's share on one of the two scoring faces.
    for (const id of hand) {
      expect(Math.max(shareOnFace(id, 1), shareOnFace(id, 5))).toBeGreaterThan(1 / 6);
    }
  });
});
