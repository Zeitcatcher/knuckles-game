import { isWeighted, rollDieValue } from "../core/weighting.mjs";
import { WILD } from "../core/dice-model.mjs";

/** Foundry's uniform RNG (shared with every other roll), with a safe fallback. */
const uniform = () => (CONFIG.Dice?.randomUniform ?? Math.random)();

/**
 * Roll `count` d6 through the Foundry Roll API. Returns the plain values (for the
 * pure reducer) and the Roll instance (for Dice So Nice).
 *
 * `specs` is an optional array of per-die specs (a weight vector or `{weights, joker}`),
 * aligned with the dice being rolled. **Fair dice keep Foundry's native uniform result.**
 * A loaded or joker die is overridden with a weighted pick; a joker face becomes WILD in
 * the game value while the 3D die shows its physical 1-position. Nothing here is global —
 * only this module's game rolls are affected.
 */
export async function rollValues(count, specs) {
  if (!count || count <= 0) return { values: [], roll: null };

  const roll = await new Roll(`${count}d6`).evaluate();
  const term = roll.dice.find((d) => d.faces === 6) ?? roll.dice[0];
  const values = term.results.map((r) => r.result);

  term.results.forEach((res, i) => {
    const spec = specs?.[i];
    const weights = Array.isArray(spec) ? spec : spec?.weights;
    const joker = !Array.isArray(spec) && Boolean(spec?.joker);
    if (spec && (isWeighted(weights) || joker)) {
      const value = rollDieValue(uniform, spec);
      values[i] = value;
      res.result = value === WILD ? 1 : value; // 3D shows the physical 1-position for a wild
    }
  });

  return { values, roll };
}
