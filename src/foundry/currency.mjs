/**
 * Award coins to an actor's Pathfinder 2e inventory.
 * Currency mapping: sun coins → platinum, gold → gold, silver → silver, copper → copper.
 * Returns false (no-op) when there is no actor, nothing to award, or no pf2e inventory.
 */
export async function awardCoins(actorUuid, { sun = 0, gold = 0, silver = 0, copper = 0 } = {}) {
  if (!actorUuid) return false;
  if (sun + gold + silver + copper <= 0) return false;

  const actor = await fromUuid(actorUuid);
  if (!actor) return false;

  const coins = { pp: sun, gp: gold, sp: silver, cp: copper };
  try {
    if (actor.inventory?.addCoins) await actor.inventory.addCoins(coins);
    else if (typeof actor.addCoins === "function") await actor.addCoins(coins);
    else {
      console.warn("knuckles-game | winner's actor has no pf2e inventory to receive coins", actorUuid);
      return false;
    }
    return true;
  } catch (err) {
    console.error("knuckles-game | failed to award coins", err);
    return false;
  }
}
