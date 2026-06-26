/**
 * GM-authoritative command handler. Player clients send intents; this runs on the
 * GM, generates dice values, applies the pure reducer, spends Hero Points on the
 * linked actor, and persists the new state. The state write broadcasts to every
 * client (see settings onChange), which re-renders the board.
 */

import { reduce, createGame, currentPlayer } from "../core/game-state.mjs";
import { inPlay } from "../core/dice-model.mjs";
import { loadState, saveState } from "../foundry/state-store.mjs";
import { rollValues } from "../foundry/dice-roller.mjs";
import { animateRoll } from "../foundry/dice-so-nice.mjs";
import { spendHeroPoint, getHeroPoints } from "../foundry/hero-points.mjs";
import { DEFAULTS } from "../constants.mjs";

/** @param {object} intent  @param {string} userId - the requesting user's id */
export async function dispatchAsGM(intent, userId) {
  if (intent.type === "startGame") {
    if (!game.users.get(userId)?.isGM) throw new Error("only the GM can start a game");
    const state = await buildNewGame(intent.config);
    await saveState(state);
    return state;
  }

  let state = loadState();
  if (!state || state.status !== "playing") throw new Error("no active game");

  const requester = game.users.get(userId);
  if (!canAct(requester, currentPlayer(state))) throw new Error("it is not your turn");

  switch (intent.type) {
    case "roll": {
      const { values, roll } = await rollValues(inPlay(state.pool).length);
      await animateRoll(roll);
      state = reduce(state, { type: "roll", values });
      break;
    }
    case "keepAndBank":
      state = reduce(state, { type: "keepAndBank", ids: intent.ids });
      break;
    case "keepAndRoll": {
      state = reduce(state, { type: "keepAndRoll", ids: intent.ids });
      // Auto-roll the dice now in play — no separate Roll click after keeping.
      if (state.status === "playing" && state.phase === "await-roll") {
        const { values, roll } = await rollValues(inPlay(state.pool).length);
        await animateRoll(roll);
        state = reduce(state, { type: "roll", values });
      }
      break;
    }
    case "takeBust":
      state = reduce(state, { type: "takeBust" });
      break;
    case "useHeroPoint": {
      const player = currentPlayer(state);
      if (player.actorUuid) {
        if (!(await spendHeroPoint(player.actorUuid))) throw new Error("no Hero Points to spend");
      } else if ((player.heroPoints ?? 0) < 1) {
        throw new Error("no Hero Points to spend");
      }
      const { values, roll } = await rollValues(intent.rerollIds.length);
      await animateRoll(roll);
      state = reduce(state, { type: "useHeroPoint", rerollIds: intent.rerollIds, values });
      break;
    }
    default:
      throw new Error(`unknown intent: ${intent.type}`);
  }

  await saveState(state);
  return state;
}

function canAct(user, player) {
  if (!user) return false;
  if (user.isGM) return true;
  if (player.actorUuid) {
    const actor = fromUuidSync(player.actorUuid);
    return actor?.testUserPermission?.(user, "OWNER") ?? false;
  }
  return false; // generic / NPC players are driven by the GM
}

async function buildNewGame(config) {
  const players = [];
  for (const p of config.players ?? []) {
    let type = "generic";
    let heroPoints = config.npcHeroPool ?? 0;
    if (p.actorUuid) {
      const actor = await fromUuid(p.actorUuid);
      type = actor?.type === "character" ? "pc" : actor?.type === "npc" ? "npc" : "generic";
      heroPoints = await getHeroPoints(p.actorUuid);
    }
    players.push({ id: p.id, name: p.name, type, actorUuid: p.actorUuid ?? null, heroPoints });
  }
  return createGame({ players, targetScore: config.targetScore ?? DEFAULTS.TARGET });
}
