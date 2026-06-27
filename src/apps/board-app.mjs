import { TEMPLATES, MODULE_ID } from "../constants.mjs";
import { WILD } from "../core/dice-model.mjs";
import { loadState } from "../foundry/state-store.mjs";
import { dispatch } from "../net/socket.mjs";
import { buildBoardContext } from "../presentation/view-model.mjs";
import { applyAppearance } from "../presentation/theme.mjs";
import { scheduleRender, snapshotRender, restoreRender } from "../presentation/render-gate.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let instance = null;

/** The shared game board. A singleton, re-rendered whenever the synced state changes. */
export class BoardApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** dice ids selected to keep (transient, client-local) */
  selection = new Set();
  /** whether the Hero-Point re-roll picker is open */
  heroMode = false;
  /** dice ids selected to re-roll with a Hero Point */
  rerollSelection = new Set();
  /** die id whose GM value-override picker is open (transient, client-local) */
  editDieId = null;
  /** true while a local keep-toggle has an unflushed setSelection write in flight */
  _selectionDirty = false;

  constructor(options) {
    super(options);
    // One stable debounce per instance: a drag across several dice collapses into a
    // single setSelection write (and one cross-client re-render), not one per toggle.
    this._syncSelection = foundry.utils.debounce(() => {
      this._selectionDirty = false;
      dispatch({ type: "setSelection", ids: [...this.selection] }).catch(reportError);
    }, 150);
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-board`,
    classes: ["knuckles-game"],
    window: { title: "KNUCKLES.title", icon: "fa-solid fa-dice-d6", resizable: true },
    position: { width: 580, height: 600 },
    actions: {
      roll: BoardApp._onRoll,
      toggleDie: BoardApp._onToggleDie,
      keepRoll: BoardApp._onKeepRoll,
      keepBank: BoardApp._onKeepBank,
      heroOpen: BoardApp._onHeroOpen,
      heroCancel: BoardApp._onHeroCancel,
      heroConfirm: BoardApp._onHeroConfirm,
      takeBust: BoardApp._onTakeBust,
      editDie: BoardApp._onEditDie,
      setDieValue: BoardApp._onSetDieValue,
      openDice: BoardApp._onOpenDice,
      endGame: BoardApp._onEndGame,
      newGame: BoardApp._onNewGame,
    },
  };

  static PARTS = { board: { template: TEMPLATES.BOARD } };

  /** Snapshot scroll + focus before the DOM swap (the gate restores them in _onRender). */
  async _preRender(context, options) {
    await super._preRender?.(context, options);
    snapshotRender(this, [".kg-log-lines"]);
  }

  async _prepareContext() {
    return buildBoardContext(loadState(), game.user, {
      selection: this.selection,
      heroMode: this.heroMode,
      rerollSelection: this.rerollSelection,
      editDieId: this.editDieId,
    });
  }

  _onRender() {
    applyAppearance(this.element);
    restoreRender(this); // re-apply scroll/focus captured before this re-render

    // Auto-scroll the scoreboard so the active player's card is always in view
    // (only when the row actually overflows).
    const cur = this.element.querySelector(".kg-pcard.is-current");
    const pcards = cur?.closest(".kg-pcards");
    if (cur && pcards && pcards.scrollWidth > pcards.clientWidth + 1) {
      const card = cur.getBoundingClientRect();
      const bar = pcards.getBoundingClientRect();
      if (card.left < bar.left + 4) pcards.scrollLeft -= bar.left - card.left + 8;
      else if (card.right > bar.right - 4) pcards.scrollLeft += card.right - bar.right + 8;
    }

    // Keep the GM value-override popover inside the board; an edge die (e.g. #1)
    // would otherwise centre the popover past the window edge and clip it.
    const pop = this.element.querySelector(".kg-valpop");
    const board = this.element.querySelector(".kg-board");
    if (!pop || !board) return;
    const pad = 8;
    const b = board.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    let shift = 0;
    if (p.left < b.left + pad) shift = b.left + pad - p.left;
    else if (p.right > b.right - pad) shift = b.right - pad - p.right;
    if (!shift) return;
    shift = Math.round(shift);
    pop.style.transform = `translateX(calc(-50% + ${shift}px))`;
    const arrow = pop.querySelector(".kg-valpop-arr");
    if (arrow) arrow.style.transform = `translateX(calc(-50% - ${shift}px)) rotate(45deg)`;
  }

  static _onRoll() {
    dispatch({ type: "roll" }).catch(reportError);
  }

  static _onToggleDie(event, target) {
    const id = Number(target.dataset.dieId);
    if (this.heroMode) {
      if (this.rerollSelection.has(id)) this.rerollSelection.delete(id);
      else this.rerollSelection.add(id);
      this.render();
      return;
    }
    // Keep-selection is shared: echo locally for instant feedback, then sync it
    // (debounced) so every viewer sees the same highlight + running sum.
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
    this._selectionDirty = true;
    this.render();
    this._syncSelection();
  }

  static _onKeepRoll() {
    dispatch({ type: "keepAndRoll", ids: [...this.selection] }).catch(reportError);
  }

  static _onKeepBank() {
    dispatch({ type: "keepAndBank", ids: [...this.selection] }).catch(reportError);
  }

  static _onHeroOpen() {
    this.heroMode = true;
    this.rerollSelection.clear();
    this.render();
  }

  static _onHeroCancel() {
    this.heroMode = false;
    this.rerollSelection.clear();
    this.render();
  }

  static _onHeroConfirm() {
    const rerollIds = [...this.rerollSelection];
    if (!rerollIds.length) return;
    dispatch({ type: "useHeroPoint", rerollIds }).catch(reportError);
  }

  static _onTakeBust() {
    dispatch({ type: "takeBust" }).catch(reportError);
  }

  static _onEditDie(event, target) {
    const id = Number(target.dataset.dieId);
    this.editDieId = this.editDieId === id ? null : id;
    this.render();
  }

  static _onSetDieValue(event, target) {
    const id = Number(target.dataset.dieId);
    const raw = target.dataset.value;
    const value = raw === "wild" ? WILD : Number(raw);
    this.editDieId = null;
    dispatch({ type: "setDieValue", dieId: id, value }).catch(reportError);
  }

  static _onNewGame() {
    import("./setup-app.mjs").then((m) => m.openSetup());
  }

  static _onOpenDice() {
    import("./dice-picker.mjs").then((m) => m.openDicePicker());
  }

  static async _onEndGame() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("KNUCKLES.board.endGame") },
      content: `<p>${game.i18n.localize("KNUCKLES.board.endConfirm")}</p>`,
      modal: true,
    });
    if (ok) dispatch({ type: "endGame" }).catch(reportError);
  }
}

function reportError(err) {
  console.error("knuckles-game |", err);
  ui.notifications?.warn(err?.message ?? String(err));
}

export function openBoard() {
  instance ??= new BoardApp();
  instance.render({ force: true });
  return instance;
}

export function refreshBoard(force = false) {
  // Never auto-open a hidden board; only re-render if it is already open.
  if (!instance || !instance.rendered) return;
  // The game was ended/cleared: close the board everywhere (the launch icon
  // then reverts to New Game setup for the GM).
  const state = loadState();
  if (!state) {
    instance.close();
    return;
  }
  // Hydrate the shared keep-selection from synced state so every viewer (players and
  // spectators) shows the same highlight — UNLESS this client has a local toggle still
  // in flight, in which case the controller's optimistic Set wins until it flushes
  // (so the round-trip echo can't yank their in-progress selection).
  if (!instance._selectionDirty) instance.selection = new Set(state.selection ?? []);
  // Hero-Point re-roll mode and the GM value-override are private/transient: reset them.
  instance.heroMode = false;
  instance.rerollSelection.clear();
  instance.editDieId = null;
  scheduleRender(instance, { force });
}
