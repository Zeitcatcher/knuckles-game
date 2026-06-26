/**
 * GM-authoritative command handler. Player clients send intents; this runs on the
 * GM, generates dice values, applies the pure reducer, spends Hero Points on the
 * linked actor, keeps the active player's Hero Points in sync with their sheet, and
 * records a short turn log. The state write broadcasts to every client.
 */

import { reduce, createGame, currentPlayer, computePool } from "../core/game-state.mjs";
import { inPlay } from "../core/dice-model.mjs";
import { loadState, saveState } from "../foundry/state-store.mjs";
import { rollValues } from "../foundry/dice-roller.mjs";
import { animateRoll } from "../foundry/dice-so-nice.mjs";
import { spendHeroPoint, getHeroPoints } from "../foundry/hero-points.mjs";
import { awardCoins } from "../foundry/currency.mjs";
import { getDieSpec } from "../core/dice-catalog.mjs";
import { DEFAULTS } from "../constants.mjs";

const LOG_MAX = 500; // effectively the whole game (state is cleared on a new game / reload)

/** Log entries are stored as {key, data} and localized per client in the view-model. */
function pushLog(state, key, data) {
  state.log = [...(state.log ?? []), { key, data }].slice(-LOG_MAX);
}

/** Re-read the active player's Hero Points from their linked actor (may have changed). */
async function syncCurrentHeroPoints(state) {
  const p = currentPlayer(state);
  if (p?.actorUuid) p.heroPoints = await getHeroPoints(p.actorUuid);
}

/** @param {object} intent  @param {string} userId - the requesting user's id */
export async function dispatchAsGM(intent, userId) {
  if (intent.type === "startGame") {
    if (!game.users.get(userId)?.isGM) throw new Error("only the GM can start a game");
    const state = await buildNewGame(intent.config);
    await syncCurrentHeroPoints(state);
    await saveState(state);
    return state;
  }

  let state = loadState();
  if (!state) throw new Error("no active game");

  const requester = game.users.get(userId);

  // End the game with no winner and no payout: clear the state so the launch
  // icon reverts to New Game setup. Allowed in any phase, GM only.
  if (intent.type === "endGame") {
    if (!requester?.isGM) throw new Error("only the GM can end the game");
    await saveState(null);
    return null;
  }

  // Dice selection / GM dice management (allowed outside the play turn).
  if (intent.type === "setDieSlot") {
    const target = state.players.find((p) => p.id === intent.playerId);
    if (!target) throw new Error("unknown player");
    const allowed =
      (state.status === "choosing" && canAct(requester, target)) ||
      (state.status === "playing" && Boolean(requester?.isGM));
    if (!allowed) throw new Error("you cannot change that die now");
    state = reduce(state, { type: "setDieSlot", playerId: intent.playerId, slot: intent.slot, dieId: intent.dieId });
    await saveState(state);
    return state;
  }
  if (intent.type === "setReady") {
    if (state.status !== "choosing") throw new Error("the game has already started");
    const target = state.players.find((p) => p.id === intent.playerId);
    if (!target || !canAct(requester, target)) throw new Error("not your player");
    state = reduce(state, { type: "setReady", playerId: intent.playerId, ready: intent.ready });
    await saveState(state);
    return state;
  }
  if (intent.type === "startPlay") {
    if (!requester?.isGM) throw new Error("only the GM can start play");
    if (state.status !== "choosing") throw new Error("the game has already started");
    state = reduce(state, { type: "startPlay" });
    await syncCurrentHeroPoints(state);
    await saveState(state);
    return state;
  }

  // GM value override: replace an in-play die's face (no log, no payout, GM only).
  if (intent.type === "setDieValue") {
    if (!requester?.isGM) throw new Error("only the GM can change a die");
    if (state.status !== "playing") throw new Error("no active game");
    state = reduce(state, { type: "setDieValue", dieId: intent.dieId, value: intent.value });
    await saveState(state);
    return state;
  }

  if (state.status !== "playing") throw new Error("no active game");
  if (!canAct(requester, currentPlayer(state))) throw new Error("it is not your turn");

  switch (intent.type) {
    case "roll": {
      const ids = inPlay(state.pool).map((d) => d.id);
      const { values, roll } = await rollValues(ids.length, specsForIds(state, ids));
      await animateRoll(roll);
      state = reduce(state, { type: "roll", values });
      break;
    }
    case "keepAndRoll": {
      state = reduce(state, { type: "keepAndRoll", ids: intent.ids });
      // Auto-roll the dice now in play — no separate Roll click after keeping.
      if (state.status === "playing" && state.phase === "await-roll") {
        const ids = inPlay(state.pool).map((d) => d.id);
        const { values, roll } = await rollValues(ids.length, specsForIds(state, ids));
        await animateRoll(roll);
        state = reduce(state, { type: "roll", values });
      }
      break;
    }
    case "keepAndBank": {
      const banker = currentPlayer(state);
      const { id: bankerId, name: bankerName } = banker;
      const oldTotal = banker.total;
      state = reduce(state, { type: "keepAndBank", ids: intent.ids });
      const np = state.players.find((p) => p.id === bankerId);
      pushLog(state, "KNUCKLES.log.banked", { name: bankerName, points: np.total - oldTotal, total: np.total });
      break;
    }
    case "takeBust": {
      const { name } = currentPlayer(state);
      const lost = state.turnScore;
      state = reduce(state, { type: "takeBust" });
      pushLog(state, lost > 0 ? "KNUCKLES.log.bustedLost" : "KNUCKLES.log.busted", { name, points: lost });
      break;
    }
    case "useHeroPoint": {
      const player = currentPlayer(state);
      const { name } = player;
      if (player.actorUuid) {
        if (!(await spendHeroPoint(player.actorUuid))) throw new Error("no Hero Points to spend");
      } else if ((player.heroPoints ?? 0) < 1) {
        throw new Error("no Hero Points to spend");
      }
      const { values, roll } = await rollValues(intent.rerollIds.length, specsForIds(state, intent.rerollIds));
      await animateRoll(roll);
      state = reduce(state, { type: "useHeroPoint", rerollIds: intent.rerollIds, values });
      pushLog(state, "KNUCKLES.log.hero", { name });
      break;
    }
    default:
      throw new Error(`unknown intent: ${intent.type}`);
  }

  if (state.status === "finished") {
    const w = state.winnerId ? state.players.find((p) => p.id === state.winnerId) : null;
    if (w && state.log?.[state.log.length - 1]?.key !== "KNUCKLES.log.wins") {
      pushLog(state, "KNUCKLES.log.wins", { name: w.name });
      // Award the pot to the winner only if they are linked to an actor ("a token").
      if (w.actorUuid && (await awardCoins(w.actorUuid, computePool(state.players)))) {
        pushLog(state, "KNUCKLES.log.pot", { name: w.name });
      }
    }
  } else {
    await syncCurrentHeroPoints(state);
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

/** Per-die specs for the current player, aligned with the given slot ids (1..6). */
function specsForIds(state, ids) {
  const p = currentPlayer(state);
  return ids.map((id) => getDieSpec(p.dieIds?.[id - 1] ?? "fair"));
}

async function buildNewGame(config) {
  const players = [];
  let i = 0;
  for (const p of config.players ?? []) {
    i += 1;
    let type = "generic";
    let heroPoints = config.npcHeroPool ?? 0;
    let name = p.name || `Player ${i}`;
    if (p.actorUuid) {
      const actor = await fromUuid(p.actorUuid);
      type = actor?.type === "character" ? "pc" : actor?.type === "npc" ? "npc" : "generic";
      name = actor?.name ?? name; // the participant's name follows the linked character
      heroPoints = await getHeroPoints(p.actorUuid);
    }
    players.push({ id: p.id, name, type, actorUuid: p.actorUuid ?? null, heroPoints, bet: p.bet });
  }
  return createGame({ players, targetScore: config.targetScore ?? DEFAULTS.TARGET });
}
