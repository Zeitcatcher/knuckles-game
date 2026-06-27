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
import { getDieSpec } from "../foundry/dice-data.mjs";
import { isPhysicalMode, inventoryActor, ownedDieCounts, ownedTotal, missingDieCopies, grantDice, prefillLoadout, clampLoadout } from "../foundry/dice-items.mjs";
import { DEFAULTS } from "../constants.mjs";

const LOG_MAX = 500; // effectively the whole game (state is cleared on a new game / reload)
let launching = false; // GM-side guard: one startPlay at a time, so auto-grant can't double-fire

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
    // Physical mode: a PC may only equip a die it owns. Defense-in-depth — the picker
    // already greys out the rest, and an illegal hand is re-seated at launch — but the
    // authoritative handler shouldn't trust a hand-crafted intent. NPCs may over-assign
    // (auto-granted on start); generic / token-less players are exempt.
    if (state.physical && target.type !== "npc" && (target.actorUuid || target.tokenUuid)) {
      const owned = ownedDieCounts(inventoryActor(target));
      if ((owned.get(intent.dieId) ?? 0) < 1) throw new Error("you do not own that die");
    }
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
    if (state.physical) {
      if (launching) throw new Error("a game is already starting");
      launching = true;
      try {
        const blockers = await enforcePhysicalLaunch(state);
        if (blockers.length) {
          ui.notifications?.warn(game.i18n.format("KNUCKLES.warn.needSix", { names: blockers.join(", ") }));
          throw new Error("some players do not have six dice");
        }
      } finally {
        launching = false;
      }
    }
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

  // GM free re-roll: re-roll the active player's chosen in-play dice with NO Hero Point
  // spent. GM-only, and handled here (before the turn gate) so it works on any turn.
  // specsForIds uses the current player's loaded-dice weights — the in-play pool is theirs.
  if (intent.type === "gmReroll") {
    if (!requester?.isGM) throw new Error("only the GM can re-roll for free");
    if (state.status !== "playing") throw new Error("no active game");
    if (state.phase !== "selecting" && state.phase !== "bust") throw new Error("nothing to re-roll");
    const ids = (intent.rerollIds ?? []).filter((id) => Number.isInteger(id));
    if (!ids.length) throw new Error("select at least one die to re-roll");
    const { values, roll } = await rollValues(ids.length, specsForIds(state, ids));
    await animateRoll(roll);
    state = reduce(state, { type: "gmReroll", rerollIds: ids, values });
    pushLog(state, "KNUCKLES.log.gmReroll", { name: currentPlayer(state).name });
    await saveState(state);
    return state;
  }

  // Shared keep-selection: the current controller (or GM) highlights dice for everyone.
  // Handled here — before the play-turn switch — so a high-frequency toggle doesn't
  // trigger the post-switch Hero-Point actor re-read. Gated to the current controller.
  if (intent.type === "setSelection") {
    if (state.status !== "playing") return state;
    if (!canAct(requester, currentPlayer(state))) throw new Error("it is not your turn");
    state = reduce(state, { type: "setSelection", ids: intent.ids });
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
  // Resolve the actor the player would own — the token's actor if bound to one,
  // else the world actor. Generic / NPC players resolve to none → GM-driven.
  return inventoryActor(player)?.testUserPermission?.(user, "OWNER") ?? false;
}

/** Per-die specs for the current player, aligned with the given slot ids (1..6). */
function specsForIds(state, ids) {
  const p = currentPlayer(state);
  return ids.map((id) => getDieSpec(p.dieIds?.[id - 1] ?? "01"));
}

async function buildNewGame(config) {
  const physical = isPhysicalMode();
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
      if (!p.tokenUuid) name = actor?.name ?? name; // actor-bound follows the actor; token-bound keeps the token name
      heroPoints = await getHeroPoints(p.actorUuid);
    }
    // Physical mode: start each player's six slots from the dice they own, so they
    // begin with a valid hand and just customise. Virtual mode keeps the "01" default.
    let dieIds;
    if (physical) {
      const owned = ownedDieCounts(inventoryActor({ tokenUuid: p.tokenUuid, actorUuid: p.actorUuid }));
      dieIds = prefillLoadout(owned);
    }
    players.push({ id: p.id, name, type, actorUuid: p.actorUuid ?? null, tokenUuid: p.tokenUuid ?? null, heroPoints, bet: p.bet, dieIds });
  }
  return createGame({ players, targetScore: config.targetScore ?? DEFAULTS.TARGET, physical });
}

/**
 * Physical-mode launch enforcement (GM-side). Token-NPCs are auto-granted the copies
 * they're short; PCs must own six dice and a legal assignment (clamped if a die was
 * sold mid-choosing). Returns the names of players who can't field a hand.
 */
async function enforcePhysicalLaunch(state) {
  const blockers = [];
  for (const p of state.players) {
    if (!p.actorUuid && !p.tokenUuid) continue; // generic: economy-exempt
    const actor = inventoryActor(p);
    if (!actor) { blockers.push(p.name); continue; }
    const owned = ownedDieCounts(actor);
    if (p.type === "npc") {
      const missing = missingDieCopies(p.dieIds, owned);
      if (missing.size) await grantDice(actor, missing);
    } else {
      if (ownedTotal(owned) < 6) { blockers.push(p.name); continue; }
      p.dieIds = clampLoadout(p.dieIds, owned);
    }
  }
  return blockers;
}
