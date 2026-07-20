import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  generateLoadout,
  synergy,
  classForPrice,
  CLASS_PURSE,
  CLASS_IDS,
  HONEST_DIE,
} from "../src/core/loadout-gen.mjs";

// The real catalog: these tests are only meaningful against the shipped prices.
const catalog = JSON.parse(readFileSync(new URL("../data/dice-catalog.json", import.meta.url), "utf8"));
const entries = catalog.dice.map((d) => ({
  id: d.id, weights: d.weights, joker: Boolean(d.joker), jokerFace: d.jokerFace || 1, price: d.price,
}));
const priceOf = (id) => entries.find((e) => e.id === id)?.price ?? 0;
const spend = (hand) => hand.filter((id) => id !== HONEST_DIE).reduce((a, id) => a + priceOf(id), 0);

const QUEEN = "02"; // 1500 gp, the strongest die
const JOKER = "22"; // 800 gp, the wild

/** Deterministic rng over a fixed sequence, cycling. */
const seq = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("price classes as purses", () => {
  it("orders the purses from cheap to elite", () => {
    expect(CLASS_IDS).toEqual(["cheap", "solid", "expensive", "elite"]);
    for (let i = 1; i < CLASS_IDS.length; i++) {
      expect(CLASS_PURSE[CLASS_IDS[i - 1]]).toBeLessThan(CLASS_PURSE[CLASS_IDS[i]]);
    }
  });

  it("files a die under the cheapest class whose full purse could afford it", () => {
    expect(classForPrice(priceOf(QUEEN))).toBe("elite");
    expect(classForPrice(priceOf(JOKER))).toBe("elite");
    expect(classForPrice(priceOf("03"))).toBe("elite"); // 450 gp: above the expensive purse
    expect(classForPrice(priceOf("06"))).toBe("expensive"); // 350 gp
    expect(classForPrice(priceOf("09"))).toBe("solid"); // 60 gp
    expect(classForPrice(priceOf("13"))).toBe("cheap"); // 18 gp
    expect(classForPrice(0)).toBe("cheap"); // a free custom die
  });

  it("files anything above the top purse under elite rather than dropping it", () => {
    expect(classForPrice(999_999_999)).toBe("elite");
  });
});

describe("generateLoadout", () => {
  const gen = (over = {}) => generateLoadout({ entries, rng: seq([0.1, 0.4, 0.7, 0.2, 0.9, 0.5]), ...over });

  it("always returns exactly six ids", () => {
    for (const count of [0, 1, 3, 6]) expect(gen({ count }).length).toBe(6);
  });

  it("deals the asked-for number of loaded dice and leaves the rest honest", () => {
    // The purse holds back the cheapest remaining dice for the slots still to come, so an
    // early splurge never costs the hand its size.
    for (const priceClass of CLASS_IDS) {
      for (const count of [0, 1, 2, 5, 6]) {
        const hand = generateLoadout({ entries, count, priceClass, mode: "random", rng: Math.random });
        expect(hand.filter((id) => id !== HONEST_DIE).length, `${priceClass} x${count}`).toBe(count);
      }
    }
  });

  it("clamps a count above six and below zero", () => {
    expect(gen({ count: 99 }).filter((id) => id !== HONEST_DIE).length).toBe(6);
    expect(gen({ count: -3 })).toEqual(Array(6).fill(HONEST_DIE));
  });

  it("never spends more than the purse, in either mode, at any count", () => {
    for (const priceClass of CLASS_IDS) {
      for (const mode of ["random", "matched"]) {
        for (let count = 1; count <= 6; count++) {
          for (let k = 0; k < 40; k++) {
            const hand = generateLoadout({ entries, count, priceClass, mode, rng: Math.random });
            expect(spend(hand), `${priceClass}/${mode}/${count}`).toBeLessThanOrEqual(CLASS_PURSE[priceClass] * count);
          }
        }
      }
    }
  });

  it("never repeats a generated die", () => {
    for (const mode of ["random", "matched"]) {
      for (let k = 0; k < 40; k++) {
        const loaded = generateLoadout({ entries, count: 6, priceClass: "elite", mode, rng: Math.random })
          .filter((id) => id !== HONEST_DIE);
        expect(new Set(loaded).size).toBe(loaded.length);
      }
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

  it("leaves slots honest when the pool runs out of dice", () => {
    const tiny = [
      { id: "90", weights: [1, 1, 1, 1, 1, 1], joker: false, price: 10 },
      { id: "91", weights: [1, 1, 1, 1, 1, 1], joker: false, price: 20 },
    ];
    const hand = generateLoadout({ entries: tiny, count: 6, priceClass: "elite", mode: "random", rng: () => 0.5 });
    expect(hand.filter((id) => id !== HONEST_DIE).sort()).toEqual(["90", "91"]);
    expect(hand.filter((id) => id === HONEST_DIE).length).toBe(4);
  });

  it("can still draw a free die (a custom one priced at nothing)", () => {
    const free = [{ id: "cfree1", weights: [50, 10, 10, 10, 10, 10], joker: false, price: 0 }];
    const hand = generateLoadout({ entries: free, count: 1, priceClass: "cheap", mode: "random", rng: () => 0.5 });
    expect(hand).toContain("cfree1");
  });
});

describe("the purse gates the monsters", () => {
  it("keeps both monsters out of every class below elite", () => {
    for (const priceClass of ["cheap", "solid", "expensive"]) {
      for (const mode of ["random", "matched"]) {
        for (let count = 1; count <= 6; count++) {
          for (let k = 0; k < 25; k++) {
            const hand = generateLoadout({ entries, count, priceClass, mode, rng: Math.random });
            expect(hand, `${priceClass}/${mode}/${count}`).not.toContain(QUEEN);
            expect(hand).not.toContain(JOKER);
          }
        }
      }
    }
  });

  it("cannot reach the 1500 gp die until an elite purse is big enough to buy it", () => {
    // 450 gp per die: three dice still fall short of 1500.
    for (const count of [1, 2, 3]) {
      for (let k = 0; k < 100; k++) {
        expect(generateLoadout({ entries, count, priceClass: "elite", mode: "random", rng: Math.random }))
          .not.toContain(QUEEN);
      }
    }
    let seen = 0;
    for (let k = 0; k < 200; k++) {
      if (generateLoadout({ entries, count: 6, priceClass: "elite", mode: "random", rng: Math.random }).includes(QUEEN)) seen += 1;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("spends down: an elite hand mixes cheap dice in behind its monsters", () => {
    // The whole point of a purse. Two monsters cost 2300 of 2700 gp, so the tail has to be
    // filler; a hand of six top-shelf dice is not purchasable.
    let sawCheapAlongsideMonster = 0;
    for (let k = 0; k < 300; k++) {
      const hand = generateLoadout({ entries, count: 6, priceClass: "elite", mode: "random", rng: Math.random });
      const hasMonster = hand.includes(QUEEN) || hand.includes(JOKER);
      const hasCheap = hand.some((id) => id !== HONEST_DIE && priceOf(id) <= 100); // <= 1 gp
      if (hasMonster && hasCheap) sawCheapAlongsideMonster += 1;
    }
    expect(sawCheapAlongsideMonster).toBeGreaterThan(0);
  });

  it("never guarantees any die a slot, the joker included", () => {
    let withJoker = 0;
    let without = 0;
    for (let k = 0; k < 300; k++) {
      const hand = generateLoadout({ entries, count: 6, priceClass: "elite", mode: "random", rng: Math.random });
      if (hand.includes(JOKER)) withJoker += 1;
      else without += 1;
    }
    expect(withJoker).toBeGreaterThan(0);
    expect(without).toBeGreaterThan(0);
  });
});

describe("matched sets", () => {
  const shareOnFace = (id, face) => synergy(entries.find((e) => e.id === id), face);

  it("reads a fair die as exactly a fair share of any face", () => {
    expect(shareOnFace(HONEST_DIE, 1)).toBeCloseTo(1 / 6, 5);
  });

  it("values the joker's wild face organically, not by a fixed constant", () => {
    // The wild IS its 1-face, so it earns nothing extra toward a hand of ones; toward a hand
    // of fives it counts twice over, because the wild stands in for the five.
    expect(shareOnFace(JOKER, 1)).toBeCloseTo(1 / 6, 5);
    expect(shareOnFace(JOKER, 5)).toBeCloseTo(1 / 3, 5);
  });

  it("builds around a scoring face, never with dice that pull away from it", () => {
    for (let k = 0; k < 50; k++) {
      const hand = generateLoadout({ entries, count: 6, priceClass: "elite", mode: "matched", rng: Math.random })
        .filter((id) => id !== HONEST_DIE);
      for (const id of hand) {
        expect(Math.max(shareOnFace(id, 1), shareOnFace(id, 5)), `die ${id}`).toBeGreaterThan(1 / 6);
      }
    }
  });

  it("leans harder on a scoring face than a random hand of the same size", () => {
    const lean = (mode) => {
      let sum = 0;
      const runs = 60;
      for (let k = 0; k < runs; k++) {
        const hand = generateLoadout({ entries, count: 4, priceClass: "solid", mode, rng: Math.random })
          .filter((id) => id !== HONEST_DIE);
        sum += hand.reduce((a, id) => a + Math.max(shareOnFace(id, 1), shareOnFace(id, 5)), 0) / (hand.length || 1);
      }
      return sum / runs;
    };
    expect(lean("matched")).toBeGreaterThan(lean("random"));
  });

  it("varies from deal to deal instead of cycling a couple of fixed hands", () => {
    const hands = new Set();
    for (let k = 0; k < 100; k++) {
      const hand = generateLoadout({ entries, count: 6, priceClass: "elite", mode: "matched", rng: Math.random });
      hands.add([...hand].sort().join(","));
    }
    expect(hands.size).toBeGreaterThan(10);
  });

  it("leaves slots honest when too few dice fit the face, instead of padding with traps", () => {
    const tiny = [
      { id: "90", weights: [50, 10, 10, 10, 10, 10], joker: false, price: 10 }, // pulls to 1
      { id: "91", weights: [40, 12, 12, 12, 12, 12], joker: false, price: 10 }, // pulls to 1
      { id: "92", weights: [5, 30, 30, 30, 2.5, 2.5], joker: false, price: 10 }, // trap
    ];
    const hand = generateLoadout({ entries: tiny, count: 4, priceClass: "cheap", mode: "matched", rng: () => 0.1 });
    expect(hand.filter((id) => id !== HONEST_DIE).sort()).toEqual(["90", "91"]);
    expect(hand).not.toContain("92");
  });
});
