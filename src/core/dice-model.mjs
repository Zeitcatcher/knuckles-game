/**
 * Dice-pool model for Knuckles Game. Pure, no Foundry imports.
 * Each die has a STABLE id (1..6) that persists across re-rolls and hot-dice
 * refills — this is the anchor the future loaded-dice / cheating system targets.
 */

export const POOL_SIZE = 6;

/** A fresh pool of `size` dice, all in play with no value yet. */
export function freshPool(size = POOL_SIZE) {
  return Array.from({ length: size }, (_, i) => ({ id: i + 1, value: null, state: "in-play" }));
}

export const inPlay = (pool) => pool.filter((d) => d.state === "in-play");
export const kept = (pool) => pool.filter((d) => d.state === "kept");
export const valuesOf = (dice) => dice.map((d) => d.value);
