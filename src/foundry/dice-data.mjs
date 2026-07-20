/**
 * Dice mechanics loader. Reads data/dice-catalog.json — the weights + joker for
 * each die id, shared by every theme. Names/descriptions come from the theme +
 * language files (see themes.mjs); this module knows nothing about flavor.
 *
 * Table-made dice (the GM's own, from the world setting) are merged into the SAME
 * registry, so the picker, the roller, the quick-hand generator and the loadout
 * validator pick them up with no separate code path. They carry their own name and
 * description, which is why a custom die is the one place this module holds flavor.
 */
import { MODULE_ID, SETTINGS } from "../constants.mjs";
import { sanitizeList } from "../core/custom-dice.mjs";

export const DEFAULT_DIE_ID = "01";

let byId = new Map(); // id -> { weights, joker, jokerFace, price }
let order = [];
let customById = new Map(); // id -> full definition (mechanics + flavor)

/** Pure: build an id -> spec map from the catalog JSON. `price` (copper) feeds the
 *  quick-hand generator's class ceilings; the roll path ignores it. */
export function parseCatalog(json) {
  const map = new Map();
  for (const d of json?.dice ?? []) {
    if (d?.id) {
      map.set(d.id, {
        weights: d.weights,
        joker: Boolean(d.joker),
        jokerFace: Number(d.jokerFace) || 1,
        price: Number(d.price) || 0,
      });
    }
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

/** Re-read the table's own dice from the world setting. Safe before settings exist. */
export function loadCustomDice() {
  let raw = [];
  try {
    raw = game.settings.get(MODULE_ID, SETTINGS.CUSTOM_DICE) ?? [];
  } catch {
    raw = [];
  }
  customById = new Map(sanitizeList(raw).map((d) => [d.id, d]));
  return customById.size;
}

/** The table's own dice, in the order they were made. */
export function customDice() {
  return [...customById.values()];
}

/** The stored definition for a table-made die, or null for a shipped one. */
export function getCustomDie(id) {
  return customById.get(id) ?? null;
}

/** The roll spec ({weights, joker, jokerFace}) for a die id, falling back to the default.
 *  A table-made die never carries a joker — scoring stays predictable. */
export function getDieSpec(id) {
  const custom = customById.get(id);
  if (custom) return { weights: custom.weights, joker: false, jokerFace: 1, price: custom.price };
  return byId.get(id) ?? byId.get(DEFAULT_DIE_ID) ?? { weights: [1, 1, 1, 1, 1, 1], joker: false, jokerFace: 1 };
}

/** All die ids: the honest die, then the table's own, then the rest of the catalog. Dice
 *  made at this table sit where they are easiest to find rather than at the bottom of 37. */
export function diceIds() {
  const catalog = order.length ? [...order] : [DEFAULT_DIE_ID];
  const custom = [...customById.keys()];
  if (!custom.length) return catalog;
  const head = catalog[0] === DEFAULT_DIE_ID ? [DEFAULT_DIE_ID] : [];
  return [...head, ...custom, ...catalog.slice(head.length)];
}

/** Every die as generator entries: `{id, weights, joker, price}`. */
export function catalogEntries() {
  return diceIds().map((id) => ({ id, ...getDieSpec(id) }));
}
