/**
 * Maps the synced game state (+ the local user and transient UI selection) into a
 * flat context for the board template. Presentation only — no game rules, no writes.
 */

import { scoreSelection } from "../core/scoring.mjs";
import { computePool } from "../core/game-state.mjs";
import { getDie } from "../core/dice-catalog.mjs";
import { WILD } from "../core/dice-model.mjs";
import { DEFAULTS } from "../constants.mjs";

const pips = (n, max) => Array.from({ length: max }, (_, i) => ({ on: i < n }));

function canControl(user, player) {
  if (!user || !player) return false;
  if (user.isGM) return true;
  if (player.actorUuid) {
    const actor = fromUuidSync(player.actorUuid);
    return actor?.testUserPermission?.(user, "OWNER") ?? false;
  }
  return false; // generic / NPC players are driven by the GM
}

export function buildBoardContext(state, user, ui) {
  if (!state) return { active: false };

  const finished = state.status === "finished";
  const cur = state.players[state.turnIndex];
  const control = canControl(user, cur);

  // The current player's controller (or the GM) sees die names + loaded styling;
  // everyone else sees plain #n. The rolled face — including a wild — shows to all.
  const reveal = control;
  // GM only, while a roll is on the table: a per-die value-override picker.
  const canEditValues = Boolean(user.isGM) && (state.phase === "selecting" || state.phase === "bust");
  const dice = state.pool.map((d) => {
    const dieId = cur?.dieIds?.[d.id - 1] ?? "fair";
    const named = reveal && dieId !== "fair";
    const showEdit = Boolean(user.isGM) && d.state === "in-play";
    const canEdit = canEditValues && d.state === "in-play";
    return {
      id: d.id,
      value: d.value,
      inPlay: d.state === "in-play",
      kept: d.state === "kept",
      selected: !ui.heroMode && ui.selection.has(d.id),
      reroll: ui.heroMode && ui.rerollSelection.has(d.id),
      blank: d.value === null,
      isWild: d.value === WILD,
      label: named ? getDie(dieId).label : `#${d.id}`,
      named,
      flavor: named ? getDie(dieId).flavor : "",
      showEdit,
      canEdit,
      editing: canEdit && ui.editDieId === d.id,
    };
  });

  const selValues = state.pool
    .filter((d) => d.state === "in-play" && d.value !== null && ui.selection.has(d.id))
    .map((d) => d.value);
  const sel = selValues.length ? scoreSelection(selValues) : { valid: false, points: 0 };

  const players = state.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    total: p.total,
    isCurrent: i === state.turnIndex,
    isWinner: finished && p.id === state.winnerId,
    showHero: p.type === "pc" || (p.heroPoints ?? 0) > 0,
    heroPips: pips(p.heroPoints ?? 0, DEFAULTS.MAX_HERO_POINTS),
  }));

  const pool = computePool(state.players);

  return {
    active: true,
    finished,
    targetScore: state.targetScore,
    pool,
    hasPot: pool.sun + pool.gold + pool.silver + pool.copper > 0,
    players,
    canOpenDice: Boolean(user.isGM) && !finished,
    faces: [1, 2, 3, 4, 5, 6],
    log: [...(state.log ?? [])].reverse().map((e) => game.i18n.format(e.key, e.data ?? {})),
    canControl: control,
    isGM: Boolean(user.isGM),
    phase: state.phase,
    turnScore: state.turnScore,
    dice,
    heroMode: ui.heroMode,
    selectionValid: sel.valid,
    selectionPoints: sel.points,
    rerollCount: ui.rerollSelection.size,
    heroPoints: cur?.heroPoints ?? 0,
    finalRound: state.finalRound,
    winner: finished ? state.players.find((p) => p.id === state.winnerId) : null,
    tie: finished && !state.winnerId,
    isBustPhase: state.phase === "bust",
    canRoll: !finished && state.phase === "await-roll" && control,
    inTurn: control && !ui.heroMode && (state.phase === "await-roll" || state.phase === "selecting"),
    heroAvail: control && !ui.heroMode && state.status === "playing" && (cur?.heroPoints ?? 0) > 0 && (state.phase === "await-roll" || state.phase === "selecting" || state.phase === "bust"),
    canKeepRoll: state.phase === "selecting" && control && sel.valid && !ui.heroMode,
    canKeepBank: state.phase === "selecting" && control && sel.valid && !ui.heroMode,
    canTakeBust: state.phase === "bust" && control,
    canHeroOpen: control && !ui.heroMode && (state.phase === "selecting" || state.phase === "bust") && (cur?.heroPoints ?? 0) > 0,
    canHeroConfirm: ui.heroMode && control && ui.rerollSelection.size > 0,
  };
}
