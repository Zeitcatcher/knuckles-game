/**
 * pf2e adapter for the optional physical-dice economy. All inventory/item coupling
 * lives here, behind a thin capability surface so the picker and command handler
 * never touch pf2e item types directly. Synchronous + in-memory: no compendium load.
 *
 * Identity is the catalog die id, read from flags["knuckles-game"].dieId first and
 * the `knuckles-die-NN` system slug as a fallback (both verified durable through a
 * pf2e buy/sell round-trip in the Phase 0 probe).
 */
import { MODULE_ID, SETTINGS } from "../constants.mjs";

const SLUG_RE = /^knuckles-die-(\d{2})$/;

/** The catalog die id parsed from a slug string, or null. Pure. */
export function dieIdFromSlug(slug) {
  const m = SLUG_RE.exec(slug ?? "");
  return m ? m[1] : null;
}

/** The catalog die id an item represents: flag first, slug fallback, else null. */
export function dieIdOf(item) {
  const flag = item?.getFlag?.(MODULE_ID, "dieId");
  if (flag) return flag;
  return dieIdFromSlug(item?.system?.slug);
}

/** Whether an item is one of our dice (cheap, for hooks). */
export function isDieItem(item) {
  return Boolean(dieIdOf(item));
}

/**
 * Physical mode is the world setting AND a system we have an adapter for. On any
 * other system it stays false, so the picker never calls a pf2e-only getter and
 * the feature degrades to the virtual game rather than erroring.
 */
export function isPhysicalMode() {
  try {
    if (!game.settings.get(MODULE_ID, SETTINGS.PHYSICAL_DICE)) return false;
  } catch {
    return false;
  }
  return game.system?.id === "pf2e";
}

/** The set of catalog die ids an actor owns (a die at quantity >= 1). In-memory. */
export function ownedDieIds(actor) {
  const owned = new Set();
  if (!actor) return owned;
  const equipment = actor.itemTypes?.equipment ?? actor.items?.filter?.((i) => i.type === "equipment") ?? [];
  for (const item of equipment) {
    if ((item.system?.quantity ?? 1) < 1) continue;
    const id = dieIdOf(item);
    if (id) owned.add(id);
  }
  return owned;
}
