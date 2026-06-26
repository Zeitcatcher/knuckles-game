import { describe, it, expect } from "vitest";
import {
  baseTriple,
  nOfAKindValue,
  scoreSelection,
  hasAnyScore,
  isBust,
  bestScore,
} from "../src/core/scoring.mjs";

describe("n-of-a-kind values (doubling rule)", () => {
  it("three of a kind base values", () => {
    expect(baseTriple(1)).toBe(1000);
    expect([2, 3, 4, 5, 6].map((f) => nOfAKindValue(f, 3))).toEqual([200, 300, 400, 500, 600]);
    expect(nOfAKindValue(1, 3)).toBe(1000);
  });

  it("each die past the third doubles the triple", () => {
    expect([3, 4, 5, 6].map((k) => nOfAKindValue(1, k))).toEqual([1000, 2000, 4000, 8000]);
    expect([3, 4, 5, 6].map((k) => nOfAKindValue(2, k))).toEqual([200, 400, 800, 1600]);
    expect([3, 4, 5, 6].map((k) => nOfAKindValue(5, k))).toEqual([500, 1000, 2000, 4000]);
    expect(nOfAKindValue(6, 6)).toBe(4800);
  });
});

describe("scoreSelection — singles", () => {
  it("scores 1s and 5s, nothing else as singles", () => {
    expect(scoreSelection([1])).toEqual({ valid: true, points: 100 });
    expect(scoreSelection([5])).toEqual({ valid: true, points: 50 });
    expect(scoreSelection([1, 5])).toEqual({ valid: true, points: 150 });
    expect(scoreSelection([1, 1])).toEqual({ valid: true, points: 200 });
    expect(scoreSelection([5, 5])).toEqual({ valid: true, points: 100 });
  });

  it("rejects selections containing a non-scoring die", () => {
    expect(scoreSelection([2]).valid).toBe(false);
    expect(scoreSelection([1, 2]).valid).toBe(false);
    expect(scoreSelection([3, 4, 6]).valid).toBe(false);
    expect(scoreSelection([]).valid).toBe(false);
  });
});

describe("scoreSelection — sets", () => {
  it("triples", () => {
    expect(scoreSelection([1, 1, 1]).points).toBe(1000);
    expect(scoreSelection([2, 2, 2]).points).toBe(200);
    expect(scoreSelection([6, 6, 6]).points).toBe(600);
  });

  it("four/five/six of a kind use the doubling value", () => {
    expect(scoreSelection([1, 1, 1, 1]).points).toBe(2000);
    expect(scoreSelection([2, 2, 2, 2]).points).toBe(400);
    expect(scoreSelection([5, 5, 5, 5, 5, 5]).points).toBe(4000);
    expect(scoreSelection([1, 1, 1, 1, 1, 1]).points).toBe(8000);
  });

  it("triple plus scoring singles", () => {
    expect(scoreSelection([1, 1, 1, 5]).points).toBe(1050);
    expect(scoreSelection([5, 5, 5, 1]).points).toBe(600);
  });

  it("does NOT award three pairs or two triplets", () => {
    expect(isBust([3, 3, 4, 4, 6, 6])).toBe(true); // three pairs, no 1/5, no triple
    expect(scoreSelection([3, 3, 4, 4, 6, 6]).valid).toBe(false);
  });
});

describe("scoreSelection — straights", () => {
  it("partial and full straights", () => {
    expect(scoreSelection([1, 2, 3, 4, 5]).points).toBe(500);
    expect(scoreSelection([2, 3, 4, 5, 6]).points).toBe(750);
    expect(scoreSelection([1, 2, 3, 4, 5, 6]).points).toBe(1500);
  });

  it("order does not matter", () => {
    expect(scoreSelection([5, 3, 1, 6, 2, 4]).points).toBe(1500);
  });

  it("partial straight plus a leftover scoring die", () => {
    expect(scoreSelection([1, 2, 3, 4, 5, 1]).points).toBe(600); // 1-5 straight + extra 1
    expect(scoreSelection([2, 3, 4, 5, 6, 5]).points).toBe(800); // 2-6 straight + extra 5
  });

  it("a near-straight with a dead leftover is invalid", () => {
    expect(scoreSelection([2, 3, 4, 5, 6, 2]).valid).toBe(false); // extra 2 cannot score
  });
});

describe("bust detection", () => {
  it("no 1/5 and no triple is a bust", () => {
    expect(isBust([2, 3, 4, 6])).toBe(true);
    expect(isBust([2, 2, 3, 3])).toBe(true);
  });

  it("a 1, a 5, or a triple is not a bust", () => {
    expect(isBust([2, 3, 4, 6, 1])).toBe(false);
    expect(isBust([2, 3, 4, 6, 5])).toBe(false);
    expect(isBust([2, 2, 2, 3, 4, 6])).toBe(false);
    expect(hasAnyScore([2, 3, 4, 5, 6])).toBe(true);
  });
});

describe("bestScore", () => {
  it("picks the highest-value decomposition", () => {
    expect(bestScore([1, 1, 1, 5, 5, 2])).toBe(1100); // triple 1s + two 5s, drop the 2
    expect(bestScore([1, 2, 3, 4, 5, 6])).toBe(1500); // full straight beats singles
    expect(bestScore([2, 3, 4, 6])).toBe(0); // all dead
  });
});

describe("input validation", () => {
  it("rejects out-of-range die values", () => {
    expect(() => scoreSelection([7])).toThrow();
    expect(() => scoreSelection([8])).toThrow();
  });
});

describe("wild (joker) faces — value 0 is a wild", () => {
  it("a wild completes a set with real dice", () => {
    expect(scoreSelection([1, 1, 0]).points).toBe(1000); // two 1s + wild = triple 1
    expect(scoreSelection([1, 0, 0]).points).toBe(1000); // one 1 + two wilds = triple 1
    expect(scoreSelection([5, 5, 0]).points).toBe(500);
    expect(scoreSelection([1, 1, 1, 0]).points).toBe(2000); // four of a kind
  });

  it("a wild can fill a straight", () => {
    expect(scoreSelection([1, 2, 3, 4, 0]).points).toBe(500); // wild = 5
    expect(scoreSelection([2, 3, 4, 6, 0]).points).toBe(750); // wild = 5 -> 2-3-4-5-6
  });

  it("a wild never scores alone", () => {
    expect(scoreSelection([0]).valid).toBe(false);
    expect(scoreSelection([0, 0, 0]).valid).toBe(false);
    expect(scoreSelection([5, 0]).valid).toBe(false); // the 5 scores, but the wild can't be kept alone
  });

  it("wilds affect bust detection", () => {
    expect(isBust([2, 3, 4, 6, 0])).toBe(false); // wild makes a 2-6 straight
    expect(isBust([2, 3, 4, 0])).toBe(true); // nothing scoring is possible here
  });
});
