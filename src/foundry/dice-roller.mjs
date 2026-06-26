import { isWeighted, weightedFace } from "../core/weighting.mjs";

/** Foundry's uniform RNG (shared with every other roll), with a safe fallback. */
const uniform = () => (CONFIG.Dice?.randomUniform ?? Math.random)();

/**
 * Roll `count` d6 through the Foundry Roll API. Returns the plain values (for the
 * pure reducer) and the Roll instance (for Dice So Nice).
 *
 * `specs` is an optional array of per-die weight vectors, aligned with the dice
 * being rolled. **Fair dice keep Foundry's native uniform result** — only a die
 * given a loaded (non-uniform) spec has its result overridden with a weighted pick.
 * Nothing here is global: this affects rolls made by this module's game only, never
 * combat rolls, checks, or any other dice in the world.
 */
export async function rollValues(count, specs) {
  if (!count || count <= 0) return { values: [], roll: null };

  const roll = await new Roll(`${count}d6`).evaluate();
  const term = roll.dice.find((d) => d.faces === 6) ?? roll.dice[0];

  term.results.forEach((res, i) => {
    if (isWeighted(specs?.[i])) res.result = weightedFace(uniform, specs[i]);
  });

  const values = term.results.map((r) => r.result);
  return { values, roll };
}
