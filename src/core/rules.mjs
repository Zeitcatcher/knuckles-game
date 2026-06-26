/**
 * Pure turn / round / win rules for Knuckles Game. No Foundry imports.
 * These helpers are consumed by the game-state reducer and validated by unit tests.
 */

import { scoreSelection, isBust } from "./scoring.mjs";

export { isBust };

/** Default score a match is played to (configurable per match). */
export const TARGET_DEFAULT = 2000;

/**
 * Validate a player's keep-selection.
 * @param {number[]} selectionValues - values of the dice chosen to keep
 * @returns {{ ok: boolean, points: number, reason?: string }}
 */
export function validateKeep(selectionValues) {
  if (!selectionValues || selectionValues.length === 0) {
    return { ok: false, points: 0, reason: "keep-at-least-one-scoring-die" };
  }
  const { valid, points } = scoreSelection(selectionValues);
  if (!valid) return { ok: false, points: 0, reason: "selection-has-non-scoring-die" };
  return { ok: true, points };
}

/** Hot dice: every die in the pool has been set aside, so the pool refills. */
export function isHotDice(diceRemaining) {
  return diceRemaining === 0;
}

/** Whether a banked total has reached the win threshold. */
export function hasReachedTarget(total, target) {
  return total >= target;
}

/** A round is complete once every player has taken a turn in it. */
export function isRoundComplete(actedCount, playerCount) {
  return playerCount > 0 && actedCount >= playerCount;
}

/**
 * Decide the leader once the final round completes.
 * @param {{id:string, total:number}[]} players
 * @returns {{ winnerId: string|null, tiedIds: string[] }}
 *   winnerId is null when two or more players tie for the lead (→ sudden-death round).
 */
export function determineWinner(players) {
  let max = -Infinity;
  for (const p of players) if (p.total > max) max = p.total;
  const tiedIds = players.filter((p) => p.total === max).map((p) => p.id);
  return { winnerId: tiedIds.length === 1 ? tiedIds[0] : null, tiedIds };
}
