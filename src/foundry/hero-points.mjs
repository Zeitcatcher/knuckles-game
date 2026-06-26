import { PF2E_HERO_POINTS } from "../constants.mjs";

/** Read a linked actor's current Hero Points (0 if unlinked / unavailable). */
export async function getHeroPoints(actorUuid) {
  if (!actorUuid) return 0;
  const actor = await fromUuid(actorUuid);
  return foundry.utils.getProperty(actor ?? {}, PF2E_HERO_POINTS) ?? 0;
}

/**
 * Spend one Hero Point on the linked actor. Runs GM-side. Returns false if the
 * actor is missing or has none left.
 */
export async function spendHeroPoint(actorUuid) {
  if (!actorUuid) return false;
  const actor = await fromUuid(actorUuid);
  if (!actor) return false;
  const current = foundry.utils.getProperty(actor, PF2E_HERO_POINTS) ?? 0;
  if (current < 1) return false;
  await actor.update({ [PF2E_HERO_POINTS]: current - 1 });
  return true;
}
