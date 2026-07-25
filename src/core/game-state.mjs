/**
 * Game-state reducer for Knuckles Game. Pure and serializable — no Foundry imports.
 *
 * All randomness is INJECTED: the `roll` and `useHeroPoint` commands carry the
 * already-rolled values, so the reducer stays deterministic and unit-testable.
 * The Foundry adapter is responsible for producing those values (Roll API + DSN).
 *
 * Win logic: "complete the round" — when a player reaches the target a final-round
 * flag is set, the current round plays out (only players who have not yet acted this
 * round), then the highest total wins. A tie triggers a sudden-death round among the
 * tied leaders.
 */

import { freshPool, inPlay, WILD } from "./dice-model.mjs";
import { validateKeep, isBust, hasReachedTarget, determineWinner } from "./rules.mjs";

export const currentPlayer = (s) => s.players[s.turnIndex];

/** Build a new match. */
export function createGame({ players, targetScore = 2000, physical = false } = {}) {
  if (!players || players.length < 2) throw new Error("a match needs at least two players");
  return {
    status: "choosing", // choosing → playing → finished
    physical: Boolean(physical), // item-economy mode, snapshot at creation (so a mid-game setting flip can't change a running game)
    targetScore,
    players: players.map((p, i) => ({
      id: p.id ?? `p${i + 1}`,
      name: p.name ?? `Player ${i + 1}`,
      type: p.type ?? "generic",
      actorUuid: p.actorUuid ?? null,
      tokenUuid: p.tokenUuid ?? null,
      total: 0,
      heroPoints: p.heroPoints ?? 0,
      dieIds: Array.from({ length: 6 }, (_, s) => p.dieIds?.[s] ?? "01"),
      ready: false,
      bet: {
        sun: Number(p.bet?.sun) || 0,
        gold: Number(p.bet?.gold) || 0,
        silver: Number(p.bet?.silver) || 0,
        copper: Number(p.bet?.copper) || 0,
      },
      // Wagering dice instead of (or alongside) coin. `stakeDice` is the setup opt-in;
      // `betDice` marks WHICH of the six slots are on the line. The stake lives on the
      // SLOT, not the die: swap the die in a staked slot and the new one is what's at risk.
      stakeDice: Boolean(p.stakeDice),
      betDice: Array.from({ length: 6 }, (_, s) => Boolean(p.stakeDice) && Boolean(p.betDice?.[s])),
    })),
    turnIndex: 0,
    turnScore: 0,
    escrow: [], // real coin deductions made to collect stakes: [{uuid, coins}] — refunded if the game ends unfinished
    diceEscrow: [], // dice taken from inventories as stakes: [{uuid, dieId}] — refunded the same way
    selection: [], // the current controller's shared keep-selection (in-play die ids), visible to all
    pool: freshPool(),
    phase: "await-roll", // await-roll | selecting | bust | finished
    round: { index: 0, acted: 0 },
    finalRound: { active: false, triggeredBy: null },
    suddenDeath: null, // null | { contenders: string[] }
    winnerId: null,
    tiedIds: [],
    log: [],
  };
}

/** Sum every player's bet into a single pot, per currency. */
export function computePool(players) {
  const pool = { sun: 0, gold: 0, silver: 0, copper: 0 };
  for (const p of players ?? []) {
    pool.sun += p.bet?.sun ?? 0;
    pool.gold += p.bet?.gold ?? 0;
    pool.silver += p.bet?.silver ?? 0;
    pool.copper += p.bet?.copper ?? 0;
  }
  return pool;
}

/**
 * Every die slot staked into the pot, as `{playerId, slot, dieId}`. Drives the board's pot
 * line and the launch-time collection. A slot only counts while its owner opted in.
 */
export function computeDicePool(players) {
  const staked = [];
  for (const p of players ?? []) {
    if (!p.stakeDice) continue;
    (p.betDice ?? []).forEach((on, slot) => {
      if (on) staked.push({ playerId: p.id, slot, dieId: p.dieIds?.[slot] ?? "01" });
    });
  }
  return staked;
}

/**
 * The dice the pot should DISPLAY. While choosing, that is the live picks (the pot is
 * still forming). Once play starts the stakes are physically collected, so the display
 * reads from the escrow — a mid-game GM die swap changes what a slot rolls, never what
 * the winner takes, and the pot line must not pretend otherwise. A finished game's
 * escrow is already settled and empty, so it falls back to the recorded picks, the same
 * way the coin pot keeps displaying from the bets after payout.
 *
 * Each entry is `{dieId, shownAs}`: `dieId` is what the pot actually holds, `shownAs` is
 * what the table BELIEVES it holds. They differ only after the GM palms a die out of the
 * pot and drops in a lookalike (swapPotDie) — the display keeps the original name, and
 * the truth comes out when the winner collects.
 */
export function displayedDiceStakes(state) {
  if (!state) return [];
  if (state.status === "playing") {
    return (state.diceEscrow ?? []).map((e) => ({ dieId: e.dieId, shownAs: e.shownAs ?? e.dieId }));
  }
  return computeDicePool(state.players).map((d) => ({ dieId: d.dieId, shownAs: d.dieId }));
}

/** Apply a command, returning a NEW state (input is never mutated). */
export function reduce(state, command) {
  const s = structuredClone(state);
  switch (command.type) {
    case "roll": return applyRoll(s, command);
    case "keepAndRoll": return applyKeep(s, command, false);
    case "keepAndBank": return applyKeep(s, command, true);
    case "useHeroPoint": return applyHeroPoint(s, command);
    case "gmReroll": return applyGmReroll(s, command);
    case "takeBust": return applyTakeBust(s);
    case "setDieValue": return applySetDieValue(s, command);
    case "setSelection": return applySetSelection(s, command);
    case "setDieSlot": return applySetDieSlot(s, command);
    case "setLoadout": return applySetLoadout(s, command);
    case "setDieStake": return applySetDieStake(s, command);
    case "setReady": return applySetReady(s, command);
    case "startPlay": return applyStartPlay(s);
    default: throw new Error(`unknown command: ${command.type}`);
  }
}

function applyRoll(s, { values }) {
  if (s.status !== "playing") throw new Error("the match is over");
  if (s.phase !== "await-roll") throw new Error("not ready to roll");
  const dice = inPlay(s.pool);
  if (!Array.isArray(values) || values.length !== dice.length) {
    throw new Error("roll values must match the in-play dice count");
  }
  dice.forEach((d, i) => { d.value = values[i]; });
  s.selection = []; // a fresh roll invalidates any prior selection
  s.phase = isBust(dice.map((d) => d.value)) ? "bust" : "selecting";
  return s;
}

function applyKeep(s, { ids }, bank) {
  if (s.phase !== "selecting") throw new Error("you can only keep dice after a scoring roll");
  const keepSet = new Set(ids);
  const keepDice = s.pool.filter((d) => keepSet.has(d.id));
  if (keepDice.length !== keepSet.size) throw new Error("unknown die id in selection");
  if (keepDice.some((d) => d.state !== "in-play")) throw new Error("a selected die is not in play");
  const { ok, points } = validateKeep(keepDice.map((d) => d.value));
  if (!ok) throw new Error("invalid keep selection");
  for (const d of keepDice) d.state = "kept";
  s.turnScore += points;
  s.selection = []; // dice were committed; clear the shared selection
  if (bank) return bankAndEndTurn(s);
  if (inPlay(s.pool).length === 0) s.pool = freshPool(); // hot dice — refill, keep the turn score
  s.phase = "await-roll";
  return s;
}

function applyHeroPoint(s, { rerollIds, values }) {
  if (s.phase !== "selecting" && s.phase !== "bust") {
    throw new Error("hero points can only be spent right after a roll");
  }
  const p = currentPlayer(s);
  if ((p.heroPoints ?? 0) < 1) throw new Error("no hero points to spend");
  if (!rerollIds || rerollIds.length === 0) throw new Error("select at least one die to re-roll");
  const inPlayIds = new Set(inPlay(s.pool).map((d) => d.id));
  if (!rerollIds.every((id) => inPlayIds.has(id))) {
    throw new Error("you can only re-roll dice from the last roll");
  }
  if (!Array.isArray(values) || values.length !== rerollIds.length) {
    throw new Error("re-roll values must match the selection");
  }
  const next = new Map(rerollIds.map((id, i) => [id, values[i]]));
  for (const d of s.pool) if (next.has(d.id)) d.value = next.get(d.id);
  p.heroPoints -= 1;
  s.selection = []; // re-rolled values invalidate the selection
  s.phase = isBust(inPlay(s.pool).map((d) => d.value)) ? "bust" : "selecting";
  return s;
}

/**
 * GM free re-roll: like a Hero-Point re-roll but spends NO Hero Point. Re-rolls the
 * given in-play dice (of the active player's pool), re-evaluates bust, and clears the
 * shared selection. GM-only — the command handler enforces that.
 */
function applyGmReroll(s, { rerollIds, values }) {
  if (s.phase !== "selecting" && s.phase !== "bust") {
    throw new Error("dice can only be re-rolled right after a roll");
  }
  if (!rerollIds || rerollIds.length === 0) throw new Error("select at least one die to re-roll");
  const inPlayIds = new Set(inPlay(s.pool).map((d) => d.id));
  if (!rerollIds.every((id) => inPlayIds.has(id))) {
    throw new Error("you can only re-roll dice that are in play");
  }
  if (!Array.isArray(values) || values.length !== rerollIds.length) {
    throw new Error("re-roll values must match the selection");
  }
  const next = new Map(rerollIds.map((id, i) => [id, values[i]]));
  for (const d of s.pool) if (next.has(d.id)) d.value = next.get(d.id);
  s.selection = [];
  s.phase = isBust(inPlay(s.pool).map((d) => d.value)) ? "bust" : "selecting";
  return s;
}

function applyTakeBust(s) {
  if (s.phase !== "bust") throw new Error("there is no bust to take");
  s.turnScore = 0;
  return endTurn(s);
}

/** GM override: set an in-play die's face to a chosen value, then re-evaluate the throw. */
function applySetDieValue(s, { dieId, value }) {
  if (s.phase !== "selecting" && s.phase !== "bust") {
    throw new Error("dice values can only be changed right after a roll");
  }
  const d = s.pool.find((die) => die.id === dieId && die.state === "in-play");
  if (!d) throw new Error("that die is not in play");
  if (value !== WILD && (!Number.isInteger(value) || value < 1 || value > 6)) {
    throw new Error("value must be 1..6 or wild");
  }
  d.value = value;
  s.selection = []; // a GM face override changes the running sum; clear the selection
  s.phase = isBust(inPlay(s.pool).map((die) => die.value)) ? "bust" : "selecting";
  return s;
}

/**
 * Set the current controller's shared keep-selection (the in-play die ids they have
 * marked to keep). Visible to every viewer; filtered to in-play ids and de-duped, so
 * a stale or doubled toggle can never corrupt it. Only meaningful while selecting.
 */
function applySetSelection(s, { ids }) {
  if (s.phase !== "selecting") { s.selection = []; return s; }
  const inPlayIds = new Set(inPlay(s.pool).map((d) => d.id));
  s.selection = [...new Set(ids ?? [])].filter((id) => inPlayIds.has(id));
  return s;
}

/** Choose the catalog die for one of a player's six slots. Ownership is enforced by the
 *  command handler; anything still unowned at launch is auto-granted there. */
function applySetDieSlot(s, { playerId, slot, dieId }) {
  const p = s.players.find((pl) => pl.id === playerId);
  if (p && Number.isInteger(slot) && slot >= 0 && slot < 6) {
    p.dieIds[slot] = dieId ?? "01";
  }
  return s;
}

/** Set all six of a player's slots at once (e.g. applying a saved default). */
function applySetLoadout(s, { playerId, dieIds }) {
  const p = s.players.find((pl) => pl.id === playerId);
  if (p && Array.isArray(dieIds)) {
    for (let i = 0; i < 6; i++) p.dieIds[i] = dieIds[i] ?? "01";
  }
  return s;
}

/**
 * Put one slot's die on the line, or take it back. Only for a participant who opted in at
 * setup, and only before the game starts — once play begins the pot is fixed.
 */
function applySetDieStake(s, { playerId, slot, staked }) {
  if (s.status !== "choosing") throw new Error("the stakes are already set");
  const p = s.players.find((pl) => pl.id === playerId);
  if (!p?.stakeDice) return s;
  if (Number.isInteger(slot) && slot >= 0 && slot < 6) {
    p.betDice[slot] = Boolean(staked);
  }
  return s;
}

/** Mark a player ready during the dice-choosing phase. */
function applySetReady(s, { playerId, ready }) {
  const p = s.players.find((pl) => pl.id === playerId);
  if (p) p.ready = Boolean(ready);
  return s;
}

/** Leave the dice-choosing phase and begin play. */
function applyStartPlay(s) {
  if (s.status === "choosing") s.status = "playing";
  return s;
}

function bankAndEndTurn(s) {
  const p = currentPlayer(s);
  p.total += s.turnScore;
  if (!s.suddenDeath && !s.finalRound.active && hasReachedTarget(p.total, s.targetScore)) {
    s.finalRound = { active: true, triggeredBy: p.id };
  }
  return endTurn(s);
}

// --- round / turn advancement -------------------------------------------------

const activeIds = (s) => (s.suddenDeath ? s.suddenDeath.contenders : s.players.map((p) => p.id));

function firstActiveIndex(s) {
  const ids = activeIds(s);
  return Math.max(0, s.players.findIndex((p) => ids.includes(p.id)));
}

function nextActiveTurnIndex(s) {
  const ids = activeIds(s);
  const n = s.players.length;
  for (let step = 1; step <= n; step++) {
    const idx = (s.turnIndex + step) % n;
    if (ids.includes(s.players[idx].id)) return idx;
  }
  return s.turnIndex;
}

function startTurn(s, idx) {
  s.turnIndex = idx;
  s.turnScore = 0;
  s.selection = []; // single chokepoint for every turn change (bank, bust, sudden-death, advance)
  s.pool = freshPool();
  s.phase = "await-roll";
  return s;
}

function finish(s, winnerId, tiedIds) {
  s.status = "finished";
  s.phase = "finished";
  s.winnerId = winnerId;
  s.tiedIds = tiedIds ?? (winnerId ? [winnerId] : []);
  return s;
}

function endTurn(s) {
  s.round.acted += 1;
  if (s.round.acted < activeIds(s).length) return startTurn(s, nextActiveTurnIndex(s));

  // The round is complete.
  if (s.suddenDeath) {
    const contenders = s.players.filter((p) => s.suddenDeath.contenders.includes(p.id));
    const { winnerId, tiedIds } = determineWinner(contenders);
    if (winnerId) return finish(s, winnerId);
    s.suddenDeath = { contenders: tiedIds };
    s.round = { index: s.round.index + 1, acted: 0 };
    return startTurn(s, firstActiveIndex(s));
  }
  if (s.finalRound.active) {
    const { winnerId, tiedIds } = determineWinner(s.players);
    if (winnerId) return finish(s, winnerId);
    s.suddenDeath = { contenders: tiedIds }; // tie → sudden-death round among the leaders
    s.round = { index: s.round.index + 1, acted: 0 };
    return startTurn(s, firstActiveIndex(s));
  }
  s.round = { index: s.round.index + 1, acted: 0 };
  return startTurn(s, firstActiveIndex(s));
}
