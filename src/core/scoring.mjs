/**
 * Pure scoring engine for Knuckles Game — a Farkle-style dice game.
 *
 * No Foundry imports: this module is framework-free and unit-tested in isolation.
 * Scoring is evaluated within a single throw (combinations never carry across throws).
 *
 * Scoring table:
 *   single 1 = 100, single 5 = 50
 *   three of a kind: 1s = 1000, otherwise face * 100
 *   each die beyond the third of the same face DOUBLES the three-of-a-kind value
 *   straights: 1-2-3-4-5 = 500, 2-3-4-5-6 = 750, 1-2-3-4-5-6 = 1500
 *   (no points for three pairs, two triplets, or singles other than 1 and 5)
 */

/** Base value of a three-of-a-kind for a face. */
export function baseTriple(face) {
  return face === 1 ? 1000 : face * 100;
}

/** Value of N matching dice (N >= 3): each die past the third doubles the triple. */
export function nOfAKindValue(face, count) {
  if (count < 3) return 0;
  return baseTriple(face) * 2 ** (count - 3);
}

const STRAIGHTS = [
  { faces: [1, 2, 3, 4, 5, 6], points: 1500 },
  { faces: [2, 3, 4, 5, 6], points: 750 },
  { faces: [1, 2, 3, 4, 5], points: 500 },
];

function toCounts(values) {
  const c = [0, 0, 0, 0, 0, 0, 0]; // index 1..6 (index 0 unused)
  for (const v of values) {
    if (!Number.isInteger(v) || v < 1 || v > 6) {
      throw new RangeError(`die value out of range (expected 1..6): ${v}`);
    }
    c[v]++;
  }
  return c;
}

const key = (c) => c.slice(1).join(",");
const total = (c) => c[1] + c[2] + c[3] + c[4] + c[5] + c[6];
const blank = () => [0, 0, 0, 0, 0, 0, 0];

/** Yield every scoring combination that can be removed from the current counts. */
function* combos(c, allowDiscard) {
  for (const s of STRAIGHTS) {
    if (s.faces.every((f) => c[f] >= 1)) {
      const take = blank();
      for (const f of s.faces) take[f] = 1;
      yield { value: s.points, take };
    }
  }
  for (let f = 1; f <= 6; f++) {
    for (let k = 3; k <= c[f]; k++) {
      const take = blank();
      take[f] = k;
      yield { value: nOfAKindValue(f, k), take };
    }
  }
  if (c[1] >= 1) { const take = blank(); take[1] = 1; yield { value: 100, take }; }
  if (c[5] >= 1) { const take = blank(); take[5] = 1; yield { value: 50, take }; }
  if (allowDiscard) {
    for (let f = 1; f <= 6; f++) {
      if (c[f] >= 1) { const take = blank(); take[f] = 1; yield { value: 0, take }; }
    }
  }
}

/**
 * Best full-cover decomposition of `c`. Every die must land in a combination,
 * unless `allowDiscard` lets leftover dice be dropped for 0. Returns -Infinity
 * when no full cover exists (i.e. the multiset cannot be entirely scored).
 */
function solve(c, allowDiscard, memo) {
  if (total(c) === 0) return 0;
  const k = key(c);
  const cached = memo.get(k);
  if (cached !== undefined) return cached;
  let best = -Infinity;
  for (const combo of combos(c, allowDiscard)) {
    const after = c.slice();
    for (let f = 1; f <= 6; f++) after[f] -= combo.take[f];
    const rest = solve(after, allowDiscard, memo);
    if (rest > -Infinity) best = Math.max(best, combo.value + rest);
  }
  memo.set(k, best);
  return best;
}

/**
 * Score an exact selection of dice (the dice a player wants to keep).
 * Valid only when EVERY selected die contributes to a scoring combination.
 * @param {number[]} values
 * @returns {{ valid: boolean, points: number }}
 */
export function scoreSelection(values) {
  if (!values || values.length === 0) return { valid: false, points: 0 };
  const best = solve(toCounts(values), false, new Map());
  return best === -Infinity ? { valid: false, points: 0 } : { valid: true, points: best };
}

/** True if a throw contains at least one scoring die. */
export function hasAnyScore(values) {
  const c = toCounts(values);
  if (c[1] > 0 || c[5] > 0) return true;
  for (let f = 1; f <= 6; f++) if (c[f] >= 3) return true;
  return false;
}

/** A throw is a bust when none of its dice can score. */
export function isBust(values) {
  return !hasAnyScore(values);
}

/** Highest score obtainable from a throw (non-scoring dice may be left out). */
export function bestScore(values) {
  if (!values || values.length === 0) return 0;
  const best = solve(toCounts(values), true, new Map());
  return best === -Infinity ? 0 : best;
}
