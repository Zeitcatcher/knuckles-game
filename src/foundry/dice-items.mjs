/**
 * pf2e adapter for the optional physical-dice economy. All inventory/item coupling
 * lives here, behind a thin capability surface so the picker and command handler
 * never touch pf2e item types directly.
 *
 * Ownership is COPY-BASED: each of a character's six slots consumes one physical
 * die, so the unit is `Map(dieId -> quantity owned)`. Identity is the catalog die
 * id, read from flags["knuckles-game"].dieId first and the `knuckles-die-NN` slug
 * as a fallback (both verified durable through a pf2e buy/sell round-trip).
 */
import { MODULE_ID, SETTINGS } from "../constants.mjs";
import { dieName, dieDesc, activeTheme, activeLanguage } from "./themes.mjs";
import { getCustomDie, diePrice } from "./dice-data.mjs";

// Two-digit ids are the shipped catalog; a "c"-prefixed one is a die made at this table.
const SLUG_RE = /^knuckles-die-(\d{2}|c[0-9a-z]{4,10})$/;
const PACK_ID = `${MODULE_ID}.dice`;

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

/** The actor whose inventory matters: the token's actor if bound to one (falling back
 *  to the world actor if the token can't be resolved), else the world actor. */
export function inventoryActor(player) {
  if (player?.tokenUuid) {
    const tokenActor = fromUuidSync(player.tokenUuid)?.actor;
    if (tokenActor) return tokenActor;
  }
  if (player?.actorUuid) return fromUuidSync(player.actorUuid) ?? null;
  return null;
}

/** Map(dieId -> total quantity) an actor owns. Synchronous, in-memory. */
export function ownedDieCounts(actor) {
  const counts = new Map();
  if (!actor) return counts;
  const equipment = actor.itemTypes?.equipment ?? actor.items?.filter?.((i) => i.type === "equipment") ?? [];
  for (const item of equipment) {
    const id = dieIdOf(item);
    if (!id) continue;
    const q = Math.max(0, Math.trunc(item.system?.quantity ?? 1));
    if (q > 0) counts.set(id, (counts.get(id) ?? 0) + q);
  }
  return counts;
}

/** Total dice (copies) an actor owns. */
export function ownedTotal(counts) {
  let n = 0;
  for (const q of counts.values()) n += q;
  return n;
}

/**
 * Pure: given the six chosen slot ids and the owned counts, how many extra COPIES
 * of each die must be granted so the assignment is legal. Map(dieId -> copies>0).
 */
export function missingDieCopies(slotDieIds, ownedCounts) {
  const used = new Map();
  for (const id of slotDieIds ?? []) used.set(id, (used.get(id) ?? 0) + 1);
  const missing = new Map();
  for (const [id, need] of used) {
    const have = ownedCounts.get?.(id) ?? 0;
    if (need > have) missing.set(id, need - have);
  }
  return missing;
}

/** Pre-fill six slots greedily from owned copies (catalog-id order); pad unfilled with "01". Pure. */
export function prefillLoadout(ownedCounts) {
  const flat = [];
  for (const id of [...ownedCounts.keys()].sort()) {
    const n = ownedCounts.get(id);
    for (let k = 0; k < n && flat.length < 6; k++) flat.push(id);
  }
  while (flat.length < 6) flat.push("01");
  return flat.slice(0, 6);
}

/** Re-seat a six-slot loadout into a legal assignment over owned copies (new array). Pure. */
export function clampLoadout(dieIds, ownedCounts) {
  const remaining = new Map(ownedCounts);
  const kept = (dieIds ?? []).map((id) => {
    if ((remaining.get(id) ?? 0) > 0) {
      remaining.set(id, remaining.get(id) - 1);
      return id;
    }
    return null;
  });
  const pool = [];
  for (const [id, n] of remaining) for (let k = 0; k < n; k++) pool.push(id);
  let pi = 0;
  return kept.map((id) => id ?? pool[pi++] ?? "01");
}

/**
 * Per-slot option structure for a PC's owned dice (no labels — pure & testable).
 * `usedExcl` is the count of each die used by the OTHER five slots. A die is disabled
 * when it has no free copy left and isn't this slot's current pick; `placeholder` is
 * true when the slot currently holds a die the actor doesn't own.
 */
export function ownedSlotChoices(allIds, ownedCounts, usedExcl, dieId) {
  const ids = allIds
    .filter((id) => (ownedCounts.get(id) ?? 0) > 0)
    .map((id) => {
      const free = (ownedCounts.get(id) ?? 0) - (usedExcl.get(id) ?? 0);
      const isCur = id === dieId;
      return { id, selected: isCur, disabled: free < 1 && !isCur };
    });
  return { ids, placeholder: (ownedCounts.get(dieId) ?? 0) === 0 };
}

/** Re-order catalog ids so OWNED dice (count>0) come first; each group keeps catalog
 *  order. Used for the GM's full-catalog picker so a token's few owned dice float to
 *  the top. Pure. */
export function orderIdsOwnedFirst(allIds, ownedCounts) {
  const ownedIds = [];
  const rest = [];
  for (const id of allIds) ((ownedCounts.get(id) ?? 0) > 0 ? ownedIds : rest).push(id);
  return [...ownedIds, ...rest];
}

/** Free copies of a die for the picker's "free/total" label: owned minus the copies
 *  used across ALL six slots (this slot included), floored at 0. Pure. */
export function freeCopies(ownedCounts, usedAll, id) {
  return Math.max(0, (ownedCounts.get(id) ?? 0) - (usedAll.get(id) ?? 0));
}

/**
 * Per-slot ownership coverage: greedy first-come allocation of owned copies over the six
 * chosen slots. `true` = backed by an owned copy, `false` = will be granted on start.
 * Pure — drives the picker's check-vs-plus marker with the same greedy order the launch
 * grant math (missingDieCopies) resolves in, so marker and outcome can never disagree.
 */
export function slotCoverage(dieIds, ownedCounts) {
  const remaining = new Map(ownedCounts);
  return (dieIds ?? []).map((dieId) => {
    const have = remaining.get(dieId) ?? 0;
    if (have > 0) {
      remaining.set(dieId, have - 1);
      return true;
    }
    return false;
  });
}

const DEFAULT_LOADOUT_FLAG = "defaultLoadout";

/** A player's saved default six-die loadout from an actor flag, or null if absent / malformed. */
export function readDefaultLoadout(actor) {
  const saved = actor?.getFlag?.(MODULE_ID, DEFAULT_LOADOUT_FLAG);
  if (!Array.isArray(saved) || saved.length !== 6 || saved.some((id) => typeof id !== "string")) return null;
  return [...saved];
}

/** Save a six-die default loadout to an actor flag. Foundry enforces OWNER/GM server-side,
 *  so a client-side write here is the real permission boundary (the button is UX only). */
export async function saveDefaultLoadout(actor, dieIds) {
  if (!actor?.setFlag || !Array.isArray(dieIds) || dieIds.length !== 6) return;
  await actor.setFlag(MODULE_ID, DEFAULT_LOADOUT_FLAG, dieIds.map(String));
}

/** Forget the saved default loadout. */
export async function clearDefaultLoadout(actor) {
  await actor?.unsetFlag?.(MODULE_ID, DEFAULT_LOADOUT_FLAG);
}

/**
 * Resolve a starting six-slot loadout from a saved default. Pure — `validIds` (the catalog
 * id set) is passed in so this stays Foundry-free. Returns null when there is no usable
 * default (the caller then falls back to the prefill / "01"). An unknown id becomes "01";
 * in physical mode the hand is clamped onto the owned copies so it is legal.
 */
export function resolveLoadout(saved, ownedCounts, { physical = false, validIds } = {}) {
  if (!Array.isArray(saved) || saved.length !== 6) return null;
  const valid = saved.map((id) => (validIds && !validIds.has(id) ? "01" : id));
  return physical ? clampLoadout(valid, ownedCounts) : valid;
}

let packCache = null; // Map(dieId -> source object)

async function diceSources() {
  if (packCache) return packCache;
  packCache = new Map();
  const pack = game.packs.get(PACK_ID);
  if (!pack) return packCache;
  for (const doc of await pack.getDocuments()) {
    const id = dieIdOf(doc);
    if (id) packCache.set(id, doc.toObject());
  }
  return packCache;
}

/** Drop the cached pack sources. */
export function clearDiceSourceCache() {
  packCache = null;
}

/** The themed name + description (HTML) for a die id, in the active theme + language. */
function themedNameDesc(id) {
  return {
    name: dieName(activeTheme(), activeLanguage(), id),
    desc: `<p>${dieDesc(activeTheme(), activeLanguage(), id)}</p>`,
  };
}

/** A pf2e Coins object back to copper, for comparing a stored price against the catalog. */
function coinsToCp(v) {
  return (Number(v?.pp) || 0) * 1000 + (Number(v?.gp) || 0) * 100 + (Number(v?.sp) || 0) * 10 + (Number(v?.cp) || 0);
}

/**
 * What a die item should carry, limited to the fields that actually differ — so a normal
 * load is a read-only pass. Price is included because the catalog's prices can change
 * between versions, and dice already in inventories would otherwise keep the old ones
 * forever (the quick-hand purse shops by price, so a stale price misprices the hand).
 */
function stampFields(item, id) {
  const { name, desc } = themedNameDesc(id);
  const fields = {};
  if (item.name !== name) fields.name = name;
  if ((item.system?.description?.value ?? "") !== desc) fields["system.description.value"] = desc;
  const cp = diePrice(id);
  if (cp !== null && coinsToCp(item.system?.price?.value) !== cp) fields["system.price.value"] = cpToCoins(cp);
  return fields;
}

/** Re-stamp one die item's name/description/price to the active theme + catalog. GM-side. */
export async function stampDie(item) {
  const id = dieIdOf(item);
  if (!id) return;
  const fields = stampFields(item, id);
  if (Object.keys(fields).length) await item.update(fields);
}

/** Re-stamp every knuckles die on one actor (one batched update). Returns the updated count. */
async function stampActorDice(actor) {
  const equipment = actor?.itemTypes?.equipment ?? actor?.items?.filter?.((i) => i.type === "equipment") ?? [];
  const updates = [];
  for (const it of equipment) {
    const id = dieIdOf(it);
    if (!id) continue;
    const fields = stampFields(it, id);
    if (Object.keys(fields).length) updates.push({ _id: it.id, ...fields });
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates, { render: false });
  return updates.length;
}

/** Re-stamp every die in the world (world actors + unlinked scene tokens) to the active
 *  theme + language. GM-side; runs after a theme/language change. */
export async function restampWorldDice() {
  let n = 0;
  for (const actor of game.actors ?? []) n += await stampActorDice(actor);
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (token.actorLink || !token.actor) continue; // linked tokens are covered via the world actor
      n += await stampActorDice(token.actor);
    }
  }
  return n;
}

/**
 * Re-stamp the bundled dice **compendium** items to the active theme + language (GM-side),
 * so the GM's Compendium browser matches the table — the shipped pack ships as a neutral
 * English snapshot. Only writes when something differs; unlocks the pack for the update and
 * restores its prior lock state. After a module reinstall the pack resets to English and the
 * next call (on `ready` / a theme change) re-localizes it. Returns the updated count.
 */
export async function restampCompendium() {
  const pack = game.packs.get(PACK_ID);
  if (!pack) return 0;
  const updates = [];
  for (const doc of await pack.getDocuments()) {
    const id = dieIdOf(doc);
    if (!id) continue;
    const fields = stampFields(doc, id);
    if (Object.keys(fields).length) updates.push({ _id: doc.id, ...fields });
  }
  if (!updates.length) return 0;
  const wasLocked = pack.locked;
  if (wasLocked) await pack.configure({ locked: false });
  try {
    await pack.documentClass.updateDocuments(updates, { pack: pack.collection });
  } finally {
    if (wasLocked) await pack.configure({ locked: true });
  }
  clearDiceSourceCache(); // the granted-die source cache held the old names
  return updates.length;
}

/** Copper-equivalent -> a pf2e Coins object, minimal denominations. Mirrors the pack build. */
function cpToCoins(cp) {
  const total = Math.max(0, Math.round(Number(cp) || 0));
  const gp = Math.floor(total / 100);
  const sp = Math.floor((total % 100) / 10);
  const c = total % 10;
  const v = {};
  if (gp) v.gp = gp;
  if (sp) v.sp = sp;
  if (c) v.cp = c;
  if (!gp && !sp && !c) v.cp = 0;
  return v;
}

/**
 * A pf2e `equipment` source for a table-made die — the same shape the bundled pack ships,
 * so a custom die is bought, sold, dragged and counted exactly like a catalog one.
 */
export function customDieItemData(def, quantity = 1) {
  return {
    name: def.name,
    type: "equipment",
    img: def.img,
    system: {
      description: { value: `<p>${def.desc ?? ""}</p>` },
      rules: [],
      slug: `knuckles-die-${def.id}`,
      traits: { value: [], rarity: "common", otherTags: [] },
      level: { value: 0 },
      quantity,
      bulk: { value: 0 },
      hp: { value: 0, max: 0 },
      hardness: 0,
      price: { value: cpToCoins(def.price) },
      equipped: { carryType: "worn", handsHeld: 0 },
      containerId: null,
      size: "med",
      material: { type: null, grade: null },
      identification: { status: "identified" },
      usage: { value: "held-in-one-hand" },
    },
    flags: { [MODULE_ID]: { dieId: def.id } },
  };
}

/** Whether this world can hold dice as real items (the physical economy's adapter). */
function itemsSupported() {
  return game.system?.id === "pf2e";
}

/** The world-directory Item for a die id, or null. */
function worldDieItem(dieId) {
  return game.items?.find?.((i) => dieIdOf(i) === dieId) ?? null;
}

/** Create the world Item for a new table-made die (pf2e only). Returns it, or null. */
export async function createCustomDieItem(def) {
  if (!itemsSupported()) return null;
  if (worldDieItem(def.id)) return null; // already there (an edit, or a re-run)
  return Item.create(customDieItemData(def));
}

/** Every actor that can hold dice: world actors plus unlinked scene tokens. */
function dieHoldingActors() {
  const actors = [...(game.actors ?? [])];
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (token.actorLink || !token.actor) continue; // linked tokens are covered above
      actors.push(token.actor);
    }
  }
  return actors;
}

/** Copies of a die across every inventory: `{actors, copies}`. Drives the delete warning. */
export function countCustomDieCopies(dieId) {
  let actorsWith = 0;
  let copies = 0;
  for (const actor of dieHoldingActors()) {
    const n = ownedDieCounts(actor).get(dieId) ?? 0;
    if (n > 0) { actorsWith += 1; copies += n; }
  }
  return { actors: actorsWith, copies };
}

/**
 * Push an edited definition onto every copy that already exists: the world Item and each
 * inventory stack. Name and description alone would leave a renamed die wearing its old
 * icon and price, so this writes all four.
 */
export async function syncCustomDieItems(def) {
  if (!itemsSupported()) return 0;
  const fields = {
    name: def.name,
    img: def.img,
    "system.description.value": `<p>${def.desc ?? ""}</p>`,
    "system.price.value": cpToCoins(def.price),
  };
  let n = 0;
  const world = worldDieItem(def.id);
  if (world) { await world.update(fields); n += 1; }
  for (const actor of dieHoldingActors()) {
    const updates = [];
    const equipment = actor?.itemTypes?.equipment ?? actor?.items?.filter?.((i) => i.type === "equipment") ?? [];
    for (const it of equipment) {
      if (dieIdOf(it) === def.id) updates.push({ _id: it.id, ...fields });
    }
    if (updates.length) {
      await actor.updateEmbeddedDocuments("Item", updates, { render: false });
      n += updates.length;
    }
  }
  return n;
}

/**
 * Remove every trace of a deleted die: the world Item and each inventory stack. Leaving the
 * items behind would strand copies whose mechanics no longer exist, and physical mode counts
 * ownership from exactly those items.
 */
export async function deleteCustomDieItems(dieId) {
  if (!itemsSupported()) return 0;
  let n = 0;
  const world = worldDieItem(dieId);
  if (world) { await world.delete(); n += 1; }
  for (const actor of dieHoldingActors()) {
    const equipment = actor?.itemTypes?.equipment ?? actor?.items?.filter?.((i) => i.type === "equipment") ?? [];
    const ids = equipment.filter((it) => dieIdOf(it) === dieId).map((it) => it.id);
    if (ids.length) {
      await actor.deleteEmbeddedDocuments("Item", ids, { render: false });
      n += ids.length;
    }
  }
  return n;
}

/**
 * Grant missing copies to an actor (GM-side). `missing` is Map(dieId -> copies).
 * Explicitly bumps an existing stack's quantity or creates a fresh item — we do NOT
 * rely on pf2e's auto-stack-on-create merge (its match heuristic and +N vs +1 merge
 * behaviour vary by version), so the granted total is always exactly right.
 */
export async function grantDice(actor, missing) {
  if (!actor || !missing || missing.size === 0) return;
  const sources = await diceSources();
  const equipment = actor.itemTypes?.equipment ?? actor.items?.filter?.((i) => i.type === "equipment") ?? [];
  const updates = [];
  const creates = [];
  for (const [id, copies] of missing) {
    if (copies <= 0) continue;
    const existing = equipment.find((it) => dieIdOf(it) === id);
    if (existing) {
      updates.push({ _id: existing.id, "system.quantity": (existing.system?.quantity ?? 0) + copies });
      continue;
    }
    // A table-made die has no pack source: build it from its stored definition instead, so
    // physical mode stocks a custom die exactly like a shipped one.
    const custom = getCustomDie(id);
    if (custom) {
      creates.push(customDieItemData(custom, copies));
      continue;
    }
    const src = sources.get(id);
    if (!src) continue;
    const data = foundry.utils.deepClone(src);
    delete data._id;
    delete data._key;
    foundry.utils.setProperty(data, "system.quantity", copies);
    // born already named in the active theme + language (avoids a follow-up stamp)
    const { name, desc } = themedNameDesc(id);
    data.name = name;
    foundry.utils.setProperty(data, "system.description.value", desc);
    creates.push(data);
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates, { render: false });
  if (creates.length) await actor.createEmbeddedDocuments("Item", creates, { render: false });
}
