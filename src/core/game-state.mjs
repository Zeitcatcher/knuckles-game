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
export function createGame({ players, targetScore = 2000 } = {}) {
  if (!players || players.length < 2) throw new Error("a match needs at least two players");
  return {
    status: "choosing", // choosing → playing → finished
    targetScore,
    players: players.map((p, i) => ({
      id: p.id ?? `p${i + 1}`,
      name: p.name ?? `Player ${i + 1}`,
      type: p.type ?? "generic",
      actorUuid: p.actorUuid ?? null,
      total: 0,
      heroPoints: p.heroPoints ?? 0,
      dieIds: Array.from({ length: 6 }, (_, s) => p.dieIds?.[s] ?? "fair"),
      ready: false,
      bet: {
        sun: Number(p.bet?.sun) || 0,
        gold: Number(p.bet?.gold) || 0,
        silver: Number(p.bet?.silver) || 0,
        copper: Number(p.bet?.copper) || 0,
      },
    })),
    turnIndex: 0,
    turnScore: 0,
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

/** Apply a command, returning a NEW state (input is never mutated). */
export function reduce(state, command) {
  const s = structuredClone(state);
  switch (command.type) {
    case "roll": return applyRoll(s, command);
    case "keepAndRoll": return applyKeep(s, command, false);
    case "keepAndBank": return applyKeep(s, command, true);
    case "useHeroPoint": return applyHeroPoint(s, command);
    case "takeBust": return applyTakeBust(s);
    case "setDieValue": return applySetDieValue(s, command);
    case "setDieSlot": return applySetDieSlot(s, command);
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
  s.phase = isBust(inPlay(s.pool).map((die) => die.value)) ? "bust" : "selecting";
  return s;
}

/** Choose the catalog die for one of a player's six slots. */
function applySetDieSlot(s, { playerId, slot, dieId }) {
  const p = s.players.find((pl) => pl.id === playerId);
  if (p && Number.isInteger(slot) && slot >= 0 && slot < 6) p.dieIds[slot] = dieId ?? "fair";
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
