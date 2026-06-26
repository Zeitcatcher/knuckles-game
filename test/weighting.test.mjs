import { describe, it, expect } from "vitest";
import { isWeighted, weightedFace } from "../src/core/weighting.mjs";

// Small seeded RNG so the distribution test is deterministic (no flakiness).
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("isWeighted", () => {
  it("detects fair vs loaded vectors", () => {
    expect(isWeighted([1, 1, 1, 1, 1, 1])).toBe(false);
    expect(isWeighted([10, 1, 1, 1, 1, 1])).toBe(true);
    expect(isWeighted(null)).toBe(false);
    expect(isWeighted([1, 1, 1])).toBe(false);
  });
});

describe("weightedFace", () => {
  it("always returns a face 1..6", () => {
    const rng = lcg(42);
    for (let i = 0; i < 2000; i++) {
      const f = weightedFace(rng, [3, 1, 4, 1, 5, 2]);
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(6);
    }
  });

  it("maps the RNG range to faces by cumulative weight (fair die)", () => {
    const fair = [1, 1, 1, 1, 1, 1];
    expect(weightedFace(() => 0, fair)).toBe(1);
    expect(weightedFace(() => 0.999, fair)).toBe(6);
  });

  it("respects a fully one-sided weight", () => {
    expect(weightedFace(() => 0.3, [0, 0, 0, 0, 0, 1])).toBe(6);
    expect(weightedFace(() => 0.99, [1, 0, 0, 0, 0, 0])).toBe(1);
  });

  it("falls back to a fair pick on invalid weights", () => {
    expect(weightedFace(() => 0, null)).toBe(1);
    expect(weightedFace(() => 0.999, [0, 0, 0, 0, 0, 0])).toBe(6);
  });

  it("biases toward the heavy face (seeded, deterministic)", () => {
    const rng = lcg(12345);
    const weights = [10, 1, 1, 1, 1, 1]; // ~66.7% face 1
    const counts = [0, 0, 0, 0, 0, 0];
    const N = 60000;
    for (let i = 0; i < N; i++) counts[weightedFace(rng, weights) - 1] += 1;
    const p1 = counts[0] / N;
    expect(p1).toBeGreaterThan(0.6);
    expect(p1).toBeLessThan(0.73);
  });
});
