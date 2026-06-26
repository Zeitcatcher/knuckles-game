/**
 * Per-die weighting for Knuckles Game. PURE — no Foundry imports.
 *
 * A "die spec" is a 6-length weight vector over faces 1..6. A uniform vector
 * (all values equal, e.g. [1,1,1,1,1,1]) is a fair die; anything else is loaded.
 * The weighting is applied by THIS module only; it never touches global RNG.
 */

/** True if a weight vector is present and non-uniform (a loaded die). */
export function isWeighted(weights) {
  if (!Array.isArray(weights) || weights.length !== 6) return false;
  return weights.some((w) => w !== weights[0]);
}

/**
 * Pick a face (1..6) from a weight vector using an injected uniform RNG (`() => [0,1)`).
 * Invalid or empty weights fall back to a fair pick, so this can never return a bad face.
 * @param {() => number} rng
 * @param {number[]} weights
 * @returns {number} 1..6
 */
export function weightedFace(rng, weights) {
  const w =
    Array.isArray(weights) && weights.length === 6
      ? weights.map((x) => Math.max(0, Number(x) || 0))
      : null;
  const total = w ? w.reduce((a, b) => a + b, 0) : 0;
  if (!w || total <= 0) return Math.min(6, Math.floor(rng() * 6) + 1);

  let r = rng() * total;
  for (let face = 1; face <= 6; face++) {
    r -= w[face - 1];
    if (r < 0) return face;
  }
  return 6;
}
