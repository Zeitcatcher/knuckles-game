/**
 * GM-authoritative command handler. Player clients send intents; this runs on the
 * GM, generates dice values, applies the pure reducer, spends Hero Points on the
 * linked actor, keeps the active player's Hero Points in sync with their sheet, and
 * records a short turn log. The state write broadcasts to every client.
 */

import { reduce, createGame, currentPlayer, computePool, computeDicePool } from "../core/game-state.mjs";
import { inPlay } from "../core/dice-model.mjs";
import { loadState, saveState } from "../foundry/state-store.mjs";
import { rollValues } from "../foundry/dice-roller.mjs";
import { animateRoll } from "../foundry/dice-so-nice.mjs";
import { spendHeroPoint, getHeroPoints } from "../foundry/hero-points.mjs";
import { awardCoins, walletValue, deductCoins, refundCoins } from "../foundry/currency.mjs";
import { planStakes, coinValue, coinsFromValue } from "../core/stakes.mjs";
import { getDieSpec, diceIds } from "../foundry/dice-data.mjs";
import { isPhysicalMode, inventoryActor, ownedDieCounts, missingDieCopies, grantDice, removeDiceCopies, prefillLoadout, clampLoadout, readDefaultLoadout, resolveLoadout } from "../foundry/dice-items.mjs";
import { DEFAULTS } from "../constants.mjs";

const LOG_MAX = 500; // effectively the whole game (state is cleared on a new game / reload)

/** Log entries are stored as {key, data} and localized per client in the view-model. */
function pushLog(state, key, data) {
  state.log = [...(state.log ?? []), { key, data }].slice(-LOG_MAX);
}

/** The actor a participant's Hero Points and coin payout act on. Token-first: the token's
 *  actor when token-bound (so Hero Points / coins use the SAME actor as the dice inventory),
 *  else the world actor. Linked tokens resolve to the same actor either way. */
function participantActorUuid(player) {
  return inventoryActor(player)?.uuid ?? player?.actorUuid ?? null;
}

/** Re-read the active player's Hero Points from their (token-first) actor (may have changed).
 *  NPCs never have Hero Points; a name-only generic keeps whatever it was seeded with. */
async function syncCurrentHeroPoints(state) {
  const p = currentPlayer(state);
  if (p.type === "npc") { p.heroPoints = 0; return; }
  const uuid = participantActorUuid(p);
  if (uuid) p.heroPoints = await getHeroPoints(uuid);
}

/** The active User to attribute a 3D roll to (Dice So Nice shows THEIR dice appearance):
 *  the acting player's owning user if one is connected, else the GM's own user. */
function actingUser(player) {
  const actor = inventoryActor(player);
  const owner = actor ? game.users?.find((u) => u.active && !u.isGM && actor.testUserPermission?.(u, "OWNER")) : null;
  return owner ?? game.user;
}

// Every intent runs through ONE promise queue. handleIntent is re-entrant at its awaits
// (dice rolls, actor writes), so two interleaved intents would race loadState/saveState
// (lost update — e.g. a GM override landing during a player's bank). Serialising removes
// the whole class; a failed intent never poisons the queue.
let queue = Promise.resolve();

/** @param {object} intent  @param {string} userId - the requesting user's id */
export function dispatchAsGM(intent, userId, local = false) {
  const run = queue.then(() => handleIntent(intent, userId, local));
  queue = run.then(() => {}, () => {});
  return run;
}

async function handleIntent(intent, userId, local) {
  // GM authority requires a LOCAL (direct) call. A socket-forwarded userId is forgeable,
  // but a socket call is never local — and a GM's own client dispatches directly — so a
  // player cannot impersonate the GM. `requester` is still resolved for ownership checks.
  const requester = game.users.get(userId);
  const trustedGM = local && Boolean(requester?.isGM);

  if (intent.type === "startGame") {
    if (!trustedGM) throw new Error("only the GM can start a game");
    // Don't clobber a running game by accident (e.g. a scripted dispatch). The New Game
    // window passes force:true (a deliberate replace) and we refund the old game's stakes.
    const running = loadState();
    if (running && running.status !== "finished") {
      if (!intent.force) throw new Error("a Knuckles game is already in progress");
      await refundEscrow(running);
    }
    const state = await buildNewGame(intent.config);
    await syncCurrentHeroPoints(state);
    await saveState(state);
    return state;
  }

  let state = loadState();
  if (!state) throw new Error("no active game");

  // End the game with no winner and no payout: refund any collected stakes (only while
  // unfinished — a finished game already paid its pot), then clear the state so the launch
  // icon reverts to New Game setup. Allowed in any phase, GM only.
  if (intent.type === "endGame") {
    if (!trustedGM) throw new Error("only the GM can end the game");
    await refundEscrow(state);
    await saveState(null);
    return null;
  }

  // Dice selection / GM dice management (allowed outside the play turn).
  if (intent.type === "setDieSlot") {
    const target = state.players.find((p) => p.id === intent.playerId);
    if (!target) throw new Error("unknown player");
    const allowed =
      (state.status === "choosing" && canAct(requester, target, trustedGM)) ||
      (state.status === "playing" && trustedGM);
    if (!allowed) throw new Error("you cannot change that die now");
    // Physical mode: a NON-GM may only equip a die the character owns (the picker greys
    // out the rest; this is the authoritative defence against a hand-crafted intent).
    // The GM may place anything — starting the game auto-stocks every unowned slot die
    // (enforcePhysicalLaunch), so a GM placement needs no per-slot bookkeeping. A mid-game
    // GM change grants nothing (dice are frozen at launch). NPCs over-assign freely;
    // generic / token-less players are exempt.
    if (state.physical && target.type !== "npc" && (target.actorUuid || target.tokenUuid) && !trustedGM) {
      const owns = (ownedDieCounts(inventoryActor(target)).get(intent.dieId) ?? 0) >= 1;
      if (!owns) throw new Error("you do not own that die");
    }
    state = reduce(state, { type: "setDieSlot", playerId: intent.playerId, slot: intent.slot, dieId: intent.dieId });
    await saveState(state);
    return state;
  }
  // Apply a whole six-die loadout at once ("reset to my saved default"): one write, one
  // re-render, atomic — unlike six setDieSlot calls.
  if (intent.type === "setLoadout") {
    const target = state.players.find((p) => p.id === intent.playerId);
    if (!target) throw new Error("unknown player");
    const allowed =
      (state.status === "choosing" && canAct(requester, target, trustedGM)) ||
      (state.status === "playing" && trustedGM);
    if (!allowed) throw new Error("you cannot change those dice now");
    let ids = Array.isArray(intent.dieIds) ? intent.dieIds.slice(0, 6).map(String) : [];
    while (ids.length < 6) ids.push("01");
    // A non-GM may only field dice they own: re-seat the incoming hand onto owned copies.
    if (state.physical && target.type !== "npc" && (target.actorUuid || target.tokenUuid) && !trustedGM) {
      ids = clampLoadout(ids, ownedDieCounts(inventoryActor(target)));
    }
    state = reduce(state, { type: "setLoadout", playerId: intent.playerId, dieIds: ids });
    await saveState(state);
    return state;
  }
  // Put one of a participant's six dice on the line (or take it back). Same control gate
  // as picking the die itself, and only before the game starts.
  if (intent.type === "setDieStake") {
    const target = state.players.find((p) => p.id === intent.playerId);
    if (!target) throw new Error("unknown player");
    if (state.status !== "choosing") throw new Error("the stakes are already set");
    if (!canAct(requester, target, trustedGM)) throw new Error("you cannot stake those dice");
    state = reduce(state, { type: "setDieStake", playerId: intent.playerId, slot: intent.slot, staked: intent.staked });
    await saveState(state);
    return state;
  }
  if (intent.type === "setReady") {
    if (state.status !== "choosing") throw new Error("the game has already started");
    const target = state.players.find((p) => p.id === intent.playerId);
    if (!target || !canAct(requester, target, trustedGM)) throw new Error("not your player");
    state = reduce(state, { type: "setReady", playerId: intent.playerId, ready: intent.ready });
    await saveState(state);
    return state;
  }
  if (intent.type === "startPlay") {
    if (!trustedGM) throw new Error("only the GM can start play");
    if (state.status !== "choosing") throw new Error("the game has already started");
    if (state.physical) {
      const blockers = await enforcePhysicalLaunch(state);
      if (blockers.length) {
        ui.notifications?.warn(game.i18n.format("KNUCKLES.warn.noActor", { names: blockers.join(", ") }));
        throw new Error("some participants have no resolvable actor");
      }
    }
    // Collect stakes: deduct each bettor's affordable part + the GM's chosen borrow
    // allocations (from intent.stakes), recording every real deduction in state.escrow for
    // refund. Minted shortfalls move no coin. Skipped entirely when nobody bet.
    if (hasBets(state)) await collectStakes(state, intent.stakes ?? null);
    // Then the staked DICE, after enforcePhysicalLaunch above has granted every unowned
    // slot die — which is what lets an NPC stake a die it was only just dealt.
    await collectDiceStakes(state);
    state = reduce(state, { type: "startPlay" });
    await syncCurrentHeroPoints(state);
    await saveState(state);
    return state;
  }

  // The palming con: the GM swaps a die INSIDE the collected pot for a lookalike. The
  // palmed die returns to its owner's sleeve (inventory); the stand-in comes out of that
  // inventory when they own a copy and out of thin air when they don't. `shownAs` is left
  // alone, so the table keeps seeing the original name — and there is deliberately NO log
  // entry, because a log line would give the trick away. The truth surfaces at payout.
  if (intent.type === "swapPotDie") {
    if (!trustedGM) throw new Error("only the GM's hands are quick enough");
    if (state.status !== "playing") throw new Error("the pot can only be palmed mid-game");
    const entry = state.diceEscrow?.[intent.index];
    if (!entry) throw new Error("no such die in the pot");
    const standIn = String(intent.dieId ?? "");
    if (!diceIds().includes(standIn)) throw new Error("unknown die");
    if (standIn === entry.dieId) return state; // nothing to palm
    // A minted stake (a name-only participant) has no inventory behind it: the swap is
    // pure bookkeeping. Otherwise the real die slips into the owner's sleeve and the
    // stand-in comes out of their pocket, or out of nowhere when they haven't got one.
    if (entry.uuid) {
      const owner = await fromUuid(entry.uuid);
      if (!owner) throw new Error("the die's owner cannot be resolved");
      await grantDice(owner, new Map([[entry.dieId, 1]]));
      await removeDiceCopies(owner, new Map([[standIn, 1]]));
    }
    entry.dieId = standIn;
    await saveState(state);
    return state;
  }

  // GM value override: replace an in-play die's face (no log, no payout, GM only).
  if (intent.type === "setDieValue") {
    if (!trustedGM) throw new Error("only the GM can change a die");
    if (state.status !== "playing") throw new Error("no active game");
    state = reduce(state, { type: "setDieValue", dieId: intent.dieId, value: intent.value });
    await saveState(state);
    return state;
  }

  // GM free re-roll: re-roll the active player's chosen in-play dice with NO Hero Point
  // spent. GM-only, and handled here (before the turn gate) so it works on any turn.
  // specsForIds uses the current player's loaded-dice weights — the in-play pool is theirs.
  if (intent.type === "gmReroll") {
    if (!trustedGM) throw new Error("only the GM can re-roll for free");
    if (state.status !== "playing") throw new Error("no active game");
    if (state.phase !== "selecting" && state.phase !== "bust") throw new Error("nothing to re-roll");
    const ids = (intent.rerollIds ?? []).filter((id) => Number.isInteger(id));
    if (!ids.length) throw new Error("select at least one die to re-roll");
    const { values, roll } = await rollValues(ids.length, specsForIds(state, ids));
    await animateRoll(roll, actingUser(currentPlayer(state)));
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
    if (!canAct(requester, currentPlayer(state), trustedGM)) throw new Error("it is not your turn");
    state = reduce(state, { type: "setSelection", ids: intent.ids });
    await saveState(state);
    return state;
  }

  if (state.status !== "playing") throw new Error("no active game");
  if (!canAct(requester, currentPlayer(state), trustedGM)) throw new Error("it is not your turn");

  switch (intent.type) {
    case "roll": {
      const ids = inPlay(state.pool).map((d) => d.id);
      const { values, roll } = await rollValues(ids.length, specsForIds(state, ids));
      await animateRoll(roll, actingUser(currentPlayer(state)));
      state = reduce(state, { type: "roll", values });
      break;
    }
    case "keepAndRoll": {
      state = reduce(state, { type: "keepAndRoll", ids: intent.ids });
      // Auto-roll the dice now in play — no separate Roll click after keeping.
      if (state.status === "playing" && state.phase === "await-roll") {
        const ids = inPlay(state.pool).map((d) => d.id);
        const { values, roll } = await rollValues(ids.length, specsForIds(state, ids));
        await animateRoll(roll, actingUser(currentPlayer(state)));
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
      const heroUuid = participantActorUuid(player);
      if (heroUuid) {
        if (!(await spendHeroPoint(heroUuid))) throw new Error("no Hero Points to spend");
      } else if ((player.heroPoints ?? 0) < 1) {
        throw new Error("no Hero Points to spend");
      }
      const rerollIds = (intent.rerollIds ?? []).filter((id) => Number.isInteger(id));
      if (!rerollIds.length) throw new Error("select at least one die to re-roll");
      const { values, roll } = await rollValues(rerollIds.length, specsForIds(state, rerollIds));
      await animateRoll(roll, actingUser(currentPlayer(state)));
      state = reduce(state, { type: "useHeroPoint", rerollIds, values });
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
      const winUuid = participantActorUuid(w);
      if (winUuid) {
        if (await awardCoins(winUuid, computePool(state.players))) {
          pushLog(state, "KNUCKLES.log.pot", { name: w.name });
        }
        const dice = await awardStakedDice(state, winUuid);
        if (dice) pushLog(state, "KNUCKLES.log.dicePot", { name: w.name, n: dice });
      } else {
        // Nobody can actually receive the pot (a name-only winner). Hand everything back
        // rather than letting real coin and real dice evaporate.
        await refundEscrow(state, { force: true });
        if (state.escrow?.length || state.diceEscrow?.length) pushLog(state, "KNUCKLES.log.returned", {});
      }
      state.escrow = [];
      state.diceEscrow = [];
    }
  } else {
    await syncCurrentHeroPoints(state);
  }

  await saveState(state);
  return state;
}

function canAct(user, player, trustedGM = false) {
  if (trustedGM) return true; // GM authority comes from a LOCAL call, never user.isGM (forgeable)
  if (!user) return false;
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
    // A name-only generic participant gets the configurable pool; NPCs get none; PCs read
    // their sheet (below). This is the seed only — syncCurrentHeroPoints re-reads each turn.
    let heroPoints = config.npcHeroPool ?? 0;
    let name = p.name || `Player ${i}`;
    // Resolve token-first, and gate type/name/HP on the SAME uuid the resolver uses, so a
    // token-only participant (no world actorUuid) still gets its type + Hero Points seeded.
    const aUuid = participantActorUuid(p);
    if (aUuid) {
      const actor = await fromUuid(aUuid);
      type = actor?.type === "character" ? "pc" : actor?.type === "npc" ? "npc" : "generic";
      if (!p.tokenUuid) name = actor?.name ?? name; // actor-bound follows the actor; token-bound keeps the token name
      heroPoints = type === "npc" ? 0 : type === "pc" ? await getHeroPoints(aUuid) : heroPoints;
    }
    // Seed the six slots: a saved default loadout if the actor has one (applies in BOTH
    // virtual and physical mode), else physical pre-fills from owned dice and virtual
    // leaves it undefined for createGame to "01"-fill.
    const invActor = inventoryActor({ tokenUuid: p.tokenUuid, actorUuid: p.actorUuid });
    const owned = physical ? ownedDieCounts(invActor) : new Map();
    let dieIds = resolveLoadout(readDefaultLoadout(invActor), owned, { physical, validIds: new Set(diceIds()) });
    if (!dieIds && physical) dieIds = prefillLoadout(owned);
    // Staking dice needs real dice: only offered in the item economy, and only to a
    // participant whose inventory we can actually reach.
    // Wagering dice needs real dice, so it needs the item economy. It does NOT need an
    // inventory: a name-only opponent puts dice up the same way they put coin up, by
    // minting them into the pot (see collectDiceStakes).
    const stakeDice = Boolean(p.stakeDice) && physical;
    players.push({ id: p.id, name, type, actorUuid: p.actorUuid ?? null, tokenUuid: p.tokenUuid ?? null, heroPoints, bet: p.bet, dieIds, stakeDice });
  }
  return createGame({ players, targetScore: config.targetScore ?? DEFAULTS.TARGET, physical });
}

/**
 * Physical-mode launch enforcement (GM-side). Any inventory-backed participant — NPC or
 * PC — is auto-stocked the dice in its slots that it doesn't own: starting the game IS the
 * GM's act of gifting, so the dice currently shown in the picker are granted, with no
 * re-pick required and no block. (The picker's red "N of 6" tally + "buy more" hint stay
 * as an informational cue.) Only a participant whose actor/token can't resolve blocks.
 */
async function enforcePhysicalLaunch(state) {
  const blockers = [];
  for (const p of state.players) {
    if (!p.actorUuid && !p.tokenUuid) continue; // generic: economy-exempt
    const actor = inventoryActor(p);
    if (!actor) { blockers.push(p.name); continue; }
    const missing = missingDieCopies(p.dieIds, ownedDieCounts(actor));
    if (missing.size) await grantDice(actor, missing);
  }
  return blockers;
}

/** True when at least one participant staked a non-zero bet. */
function hasBets(state) {
  return (state.players ?? []).some((p) => coinValue(p.bet) > 0);
}

/**
 * Collect stakes GM-side. Deducts each bettor's affordable part from their (token-first)
 * actor, then the GM's chosen borrow allocations from lenders; minted shortfalls move no
 * coin (the end-of-game pot award already includes them). Every real deduction is appended
 * to state.escrow so refundEscrow can undo it. Any failed deduction rolls back everything
 * done in this call and throws, so the GM's Start is atomic — coins never partially move.
 *
 * @param {object} state
 * @param {Record<string, {mode:"mint"|"borrow", borrow?:{uuid:string, coins:object}[]}>|null} resolutions
 *   Per short-participant id, from the GM's stakes dialog (null when nothing was short).
 */
async function collectStakes(state, resolutions) {
  const done = []; // {uuid, coins} removed so far, for rollback
  const escrow = [];
  const rollback = async () => { for (const d of done) await refundCoins(d.uuid, d.coins); };
  const deduct = async (uuid, coins) => {
    if (!uuid || !coinValue(coins)) return;
    if (!(await deductCoins(uuid, coins))) {
      await rollback();
      throw new Error("stake deduction failed (a wallet changed) — reopen the stakes window");
    }
    done.push({ uuid, coins });
    escrow.push({ uuid, coins });
  };

  const parts = [];
  for (const p of state.players) {
    const uuid = participantActorUuid(p);
    const kind = uuid ? (p.type === "npc" ? "npc" : "pc") : "actorless";
    parts.push({ id: p.id, name: p.name, kind, bet: p.bet, walletValue: uuid ? await walletValue(uuid) : 0, uuid });
  }
  const plan = planStakes(parts);

  for (const pay of plan.payments) {
    const part = parts.find((x) => x.id === pay.id);
    await deduct(part?.uuid, coinsFromValue(pay.value));
  }
  for (const sf of plan.shortfalls) {
    const res = resolutions?.[sf.id];
    if (!res || res.mode === "mint") continue; // minted → no deduction
    for (const b of res.borrow ?? []) await deduct(b.uuid, b.coins);
  }

  state.escrow = [...(state.escrow ?? []), ...escrow];
  pushLog(state, "KNUCKLES.log.stakes", {});
}

/**
 * Collect the staked DICE (GM-side). One copy per staked slot leaves its owner's inventory
 * and is recorded in state.diceEscrow, so it can go back if the game ends with no winner.
 * Runs after the launch grant, so a die the participant was handed this game can be staked.
 * A participant who can't produce a staked die rolls the whole collection back and aborts
 * Start, matching how coin stakes behave.
 */
async function collectDiceStakes(state) {
  const staked = computeDicePool(state.players);
  if (!staked.length) return;

  const byPlayer = new Map();
  for (const s of staked) {
    if (!byPlayer.has(s.playerId)) byPlayer.set(s.playerId, new Map());
    const counts = byPlayer.get(s.playerId);
    counts.set(s.dieId, (counts.get(s.dieId) ?? 0) + 1);
  }

  const done = []; // {actor, counts} already taken, for rollback
  const escrow = [];
  for (const [playerId, counts] of byPlayer) {
    const p = state.players.find((x) => x.id === playerId);
    const actor = inventoryActor(p);
    const uuid = participantActorUuid(p);
    // A participant with no inventory (entered as a name only) MINTS what they put up, the
    // same way their coin bet is minted: nothing leaves a bag, and the winner still
    // collects a real die. Only a participant who HAS an inventory must produce the dice.
    if (actor && uuid) {
      if (!(await removeDiceCopies(actor, counts))) {
        for (const d of done) await grantDice(d.actor, d.counts);
        throw new Error(`${p?.name ?? "a participant"} cannot put those dice up`);
      }
      done.push({ actor, counts });
    }
    // shownAs starts equal to the die itself; a later palming swap changes dieId only.
    // A null uuid marks a minted stake: there is nobody to hand it back to.
    for (const [dieId, n] of counts) for (let k = 0; k < n; k += 1) escrow.push({ uuid: uuid ?? null, dieId, shownAs: dieId });
  }

  state.diceEscrow = [...(state.diceEscrow ?? []), ...escrow];
  pushLog(state, "KNUCKLES.log.diceStakes", { n: staked.length });
}

/** Hand every staked die to the winner's actor. Returns how many changed hands. */
async function awardStakedDice(state, winUuid) {
  const escrow = state.diceEscrow ?? [];
  if (!escrow.length) return 0;
  const actor = await fromUuid(winUuid);
  if (!actor) return 0;
  const counts = new Map();
  for (const e of escrow) counts.set(e.dieId, (counts.get(e.dieId) ?? 0) + 1);
  await grantDice(actor, counts);
  return escrow.length;
}

/** Refund every recorded stake deduction, coins and dice alike — but only while the game is
 *  unfinished (a finished game already awarded its pot), unless `force` says otherwise (a
 *  winner who resolves to no actor, where the pot has to go back instead). */
async function refundEscrow(state, { force = false } = {}) {
  if (!state || (state.status === "finished" && !force)) return;
  for (const e of state.escrow ?? []) await refundCoins(e.uuid, e.coins);
  const byActor = new Map();
  for (const e of state.diceEscrow ?? []) {
    if (!e.uuid) continue; // a minted stake: it came from nowhere, so it goes back nowhere
    if (!byActor.has(e.uuid)) byActor.set(e.uuid, new Map());
    const counts = byActor.get(e.uuid);
    counts.set(e.dieId, (counts.get(e.dieId) ?? 0) + 1);
  }
  for (const [uuid, counts] of byActor) {
    const actor = await fromUuid(uuid);
    if (actor) await grantDice(actor, counts);
  }
}
