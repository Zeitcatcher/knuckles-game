/**
 * Pure scoring engine for Knuckles Game — a Farkle-style dice game.
 *
 * No Foundry imports. Scoring is evaluated within a single throw. Die values are
 * 1..6, plus WILD (joker) which substitutes for any face to complete a combination
 * but never scores on its own (every scoring combo must contain >= 1 real die).
 */

import { WILD } from "./dice-model.mjs";

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

const blank = () => [0, 0, 0, 0, 0, 0, 0];
const total = (c) => c[1] + c[2] + c[3] + c[4] + c[5] + c[6];
const key = (c) => c.slice(1).join(",");

/** Split a value list into real-face counts (index 1..6) and a wild count. */
function split(values) {
  const counts = blank();
  let wilds = 0;
  for (const v of values) {
    if (v === WILD) {
      wilds += 1;
      continue;
    }
    if (!Number.isInteger(v) || v < 1 || v > 6) {
      throw new RangeError(`die value out of range (expected 1..6 or wild): ${v}`);
    }
    counts[v] += 1;
  }
  return { counts, wilds };
}

// ---- no-wild solver (unchanged, fast path) -------------------------------------
function* combos(c, allowDiscard) {
  for (const s of STRAIGHTS) {
    if (s.faces.every((f) => c[f] >= 1)) {
      const t = blank();
      for (const f of s.faces) t[f] = 1;
      yield { value: s.points, take: t };
    }
  }
  for (let f = 1; f <= 6; f++) {
    for (let k = 3; k <= c[f]; k++) {
      const t = blank();
      t[f] = k;
      yield { value: nOfAKindValue(f, k), take: t };
    }
  }
  if (c[1] >= 1) { const t = blank(); t[1] = 1; yield { value: 100, take: t }; }
  if (c[5] >= 1) { const t = blank(); t[5] = 1; yield { value: 50, take: t }; }
  if (allowDiscard) {
    for (let f = 1; f <= 6; f++) if (c[f] >= 1) { const t = blank(); t[f] = 1; yield { value: 0, take: t }; }
  }
}

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

// ---- wild-aware solver (each combo must include >= 1 real die) ------------------
function* wildCombos(c, wilds, allowDiscard) {
  if (c[1] >= 1) { const t = blank(); t[1] = 1; yield { value: 100, real: t, wild: 0 }; }
  if (c[5] >= 1) { const t = blank(); t[5] = 1; yield { value: 50, real: t, wild: 0 }; }
  for (let f = 1; f <= 6; f++) {
    for (let k = 3; k <= 6; k++) {
      const minReal = Math.max(1, k - wilds);
      const maxReal = Math.min(c[f], k);
      for (let r = minReal; r <= maxReal; r++) {
        const t = blank();
        t[f] = r;
        yield { value: nOfAKindValue(f, k), real: t, wild: k - r };
      }
    }
  }
  for (const s of STRAIGHTS) {
    const present = s.faces.filter((f) => c[f] >= 1);
    const missing = s.faces.length - present.length;
    if (present.length >= 1 && missing <= wilds) {
      const t = blank();
      for (const f of present) t[f] = 1;
      yield { value: s.points, real: t, wild: missing };
    }
  }
  if (allowDiscard) {
    for (let f = 1; f <= 6; f++) if (c[f] >= 1) { const t = blank(); t[f] = 1; yield { value: 0, real: t, wild: 0 }; }
    if (wilds >= 1) yield { value: 0, real: blank(), wild: 1 };
  }
}

function solveWild(c, wilds, allowDiscard, memo) {
  if (total(c) === 0 && wilds === 0) return 0;
  const k = `${key(c)}|${wilds}`;
  const cached = memo.get(k);
  if (cached !== undefined) return cached;
  let best = -Infinity;
  for (const combo of wildCombos(c, wilds, allowDiscard)) {
    const after = c.slice();
    for (let f = 1; f <= 6; f++) after[f] -= combo.real[f];
    const rest = solveWild(after, wilds - combo.wild, allowDiscard, memo);
    if (rest > -Infinity) best = Math.max(best, combo.value + rest);
  }
  memo.set(k, best);
  return best;
}

/**
 * Score an exact selection of dice (the dice a player wants to keep).
 * Valid only when EVERY selected die contributes to a scoring combination.
 * @returns {{ valid: boolean, points: number }}
 */
export function scoreSelection(values) {
  if (!values || values.length === 0) return { valid: false, points: 0 };
  const { counts, wilds } = split(values);
  const best = wilds === 0 ? solve(counts, false, new Map()) : solveWild(counts, wilds, false, new Map());
  return best === -Infinity ? { valid: false, points: 0 } : { valid: true, points: best };
}

/** True if a throw contains at least one scoring die. */
export function hasAnyScore(values) {
  const { counts, wilds } = split(values);
  if (wilds === 0) {
    if (counts[1] > 0 || counts[5] > 0) return true;
    for (let f = 1; f <= 6; f++) if (counts[f] >= 3) return true;
    return false;
  }
  return bestScore(values) > 0;
}

/** A throw is a bust when none of its dice can score. */
export function isBust(values) {
  return !hasAnyScore(values);
}

/** Highest score obtainable from a throw (non-scoring dice may be left out). */
export function bestScore(values) {
  if (!values || values.length === 0) return 0;
  const { counts, wilds } = split(values);
  const best = wilds === 0 ? solve(counts, true, new Map()) : solveWild(counts, wilds, true, new Map());
  return best === -Infinity ? 0 : best;
}
