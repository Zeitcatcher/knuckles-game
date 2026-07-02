/**
 * Pathfinder 2e currency adapter for the stake economy. The module's coin keys map to
 * pf2e coins: sun → platinum, gold → gold, silver → silver, copper → copper. Everything
 * is feature-detected, so a pf2e API change degrades to a no-op (logged) rather than a
 * crash, and non-pf2e systems simply never reach here.
 */

const COPPER = { sun: 1000, gold: 100, silver: 10, copper: 1 };

/** Module coin bag → pf2e coin object. */
function toPf2eCoins({ sun = 0, gold = 0, silver = 0, copper = 0 } = {}) {
  return { pp: sun, gp: gold, sp: silver, cp: copper };
}

function hasValue(coins) {
  return (coins?.sun ?? 0) + (coins?.gold ?? 0) + (coins?.silver ?? 0) + (coins?.copper ?? 0) > 0;
}

async function resolveActor(actorUuid) {
  if (!actorUuid) return null;
  return (await fromUuid(actorUuid)) ?? null;
}

/** Spendable coin value of an already-resolved actor, in copper (sync). */
export function walletValueOf(actor) {
  const coins = actor?.inventory?.coins;
  if (!coins) return 0;
  if (typeof coins.copperValue === "number") return coins.copperValue;
  return (coins.cp ?? 0) + (coins.sp ?? 0) * 10 + (coins.gp ?? 0) * 100 + (coins.pp ?? 0) * 1000;
}

/** An actor's spendable coin value, in copper. 0 when there is no pf2e inventory. */
export async function walletValue(actorUuid) {
  return walletValueOf(await resolveActor(actorUuid));
}

/**
 * Remove coins from an actor by VALUE (pf2e makes change across denominations). Returns
 * true on success, false if the actor has no inventory, too little, or the API is absent.
 */
export async function deductCoins(actorUuid, coins) {
  if (!hasValue(coins)) return true; // nothing to remove
  const actor = await resolveActor(actorUuid);
  const remove = actor?.inventory?.removeCoins;
  if (typeof remove !== "function") {
    console.warn("knuckles-game | actor has no removeCoins; cannot deduct", actorUuid);
    return false;
  }
  try {
    // byValue makes change (e.g. remove 3 gp from a 1 pp coin); returns false if too little.
    const ok = await actor.inventory.removeCoins(toPf2eCoins(coins), { byValue: true });
    return ok !== false;
  } catch (err) {
    console.error("knuckles-game | failed to deduct coins", err);
    return false;
  }
}

/** Add coins to an actor's pf2e inventory. Returns false when there is no inventory. */
export async function addCoins(actorUuid, coins) {
  if (!hasValue(coins)) return false;
  const actor = await resolveActor(actorUuid);
  if (!actor) return false;
  const pf2e = toPf2eCoins(coins);
  try {
    if (actor.inventory?.addCoins) await actor.inventory.addCoins(pf2e);
    else if (typeof actor.addCoins === "function") await actor.addCoins(pf2e);
    else {
      console.warn("knuckles-game | actor has no pf2e inventory to receive coins", actorUuid);
      return false;
    }
    return true;
  } catch (err) {
    console.error("knuckles-game | failed to add coins", err);
    return false;
  }
}

/** Refund a previously deducted bag (an alias of addCoins, for intent-revealing calls). */
export const refundCoins = addCoins;

/** Award the pot to the winner (minted, as before). `pool` is a module coin bag. */
export async function awardCoins(actorUuid, pool) {
  return addCoins(actorUuid, pool);
}
