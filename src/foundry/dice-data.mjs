/**
 * Dice mechanics loader. Reads data/dice-catalog.json — the weights + joker for
 * each die id, shared by every theme. Names/descriptions come from the theme +
 * language files (see themes.mjs); this module knows nothing about flavor.
 */
import { MODULE_ID } from "../constants.mjs";

export const DEFAULT_DIE_ID = "01";

let byId = new Map(); // id -> { weights, joker }
let order = [];

/** Pure: build an id -> spec map from the catalog JSON. */
export function parseCatalog(json) {
  const map = new Map();
  for (const d of json?.dice ?? []) {
    if (d?.id) map.set(d.id, { weights: d.weights, joker: Boolean(d.joker) });
  }
  return map;
}

/** Fetch and cache the catalog. Call once at startup. */
export async function loadDiceCatalog() {
  try {
    const json = await foundry.utils.fetchJsonWithTimeout(`modules/${MODULE_ID}/data/dice-catalog.json`);
    byId = parseCatalog(json);
    order = (json.dice ?? []).map((d) => d.id);
  } catch (err) {
    console.error("knuckles-game | failed to load the dice catalog", err);
  }
}

/** The roll spec ({weights, joker}) for a die id, falling back to the default. */
export function getDieSpec(id) {
  return byId.get(id) ?? byId.get(DEFAULT_DIE_ID) ?? { weights: [1, 1, 1, 1, 1, 1], joker: false };
}

/** All die ids, in catalog order. */
export function diceIds() {
  return order.length ? [...order] : [DEFAULT_DIE_ID];
}
