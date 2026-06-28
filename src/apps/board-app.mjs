import { TEMPLATES, MODULE_ID, SETTINGS } from "../constants.mjs";
import { WILD } from "../core/dice-model.mjs";
import { loadState } from "../foundry/state-store.mjs";
import { dispatch } from "../net/socket.mjs";
import { buildBoardContext } from "../presentation/view-model.mjs";
import { applyAppearance } from "../presentation/theme.mjs";
import { scheduleRender, snapshotRender, restoreRender } from "../presentation/render-gate.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let instance = null;

/** Width the window grows/shrinks by when toggling the combos panel: the difference
 *  between the open panel (248 + 10 gap = 258) and the collapsed tab (28 + 10 = 38), so
 *  the board column (.kg-main) keeps the same width in both states. */
const COMBOS_W = 220;
/** Board window width with the combos panel open (580 board column + 258 panel). */
const BOARD_W_OPEN = 838;

/** The shared game board. A singleton, re-rendered whenever the synced state changes. */
export class BoardApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** dice ids selected to keep (transient, client-local) */
  selection = new Set();
  /** whether the Hero-Point re-roll picker is open */
  heroMode = false;
  /** whether the GM free-reroll picker is open (GM only; reuses rerollSelection) */
  gmRerollMode = false;
  /** dice ids selected to re-roll (Hero-Point or GM free re-roll) */
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
      if (!this._selectionDirty) return; // a committed action cancelled the pending sync
      this._selectionDirty = false;
      dispatch({ type: "setSelection", ids: [...this.selection] }).catch(reportError);
    }, 150);
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-board`,
    classes: ["knuckles-game"],
    window: { title: "KNUCKLES.title", icon: "fa-solid fa-dice-d6", resizable: true },
    position: { width: BOARD_W_OPEN, height: 600 }, // 580 board column + 258 open combos panel (default open)
    actions: {
      roll: BoardApp._onRoll,
      toggleDie: BoardApp._onToggleDie,
      keepRoll: BoardApp._onKeepRoll,
      keepBank: BoardApp._onKeepBank,
      heroOpen: BoardApp._onHeroOpen,
      heroCancel: BoardApp._onHeroCancel,
      heroConfirm: BoardApp._onHeroConfirm,
      gmRerollOpen: BoardApp._onGmRerollOpen,
      gmRerollCancel: BoardApp._onGmRerollCancel,
      gmRerollConfirm: BoardApp._onGmRerollConfirm,
      toggleCombos: BoardApp._onToggleCombos,
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

  /** Widen the window once if the combos panel starts open (its default), so the board
   *  isn't squeezed. Done on first render only, so manual resizing afterward is kept. */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    if (!game.settings.get(MODULE_ID, SETTINGS.COMBOS_OPEN)) {
      this.setPosition({ width: (this.position?.width ?? BOARD_W_OPEN) - COMBOS_W });
    }
  }

  async _prepareContext() {
    return buildBoardContext(loadState(), game.user, {
      selection: this.selection,
      heroMode: this.heroMode,
      gmRerollMode: this.gmRerollMode,
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
    // Clamp within the dice column (.kg-main), not the whole board, so the combos
    // panel's width doesn't let the popover drift over the reference panel.
    const board = this.element.querySelector(".kg-main");
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
    this._selectionDirty = false; // cancel any pending keep-selection sync before the phase changes
    dispatch({ type: "roll" }).catch(reportError);
  }

  static _onToggleDie(event, target) {
    const id = Number(target.dataset.dieId);
    if (this.heroMode || this.gmRerollMode) {
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
    const ids = [...this.selection];
    this._selectionDirty = false; // committed; cancel the pending sync so it can't reappear next roll
    dispatch({ type: "keepAndRoll", ids }).catch(reportError);
  }

  static _onKeepBank() {
    const ids = [...this.selection];
    this._selectionDirty = false;
    dispatch({ type: "keepAndBank", ids }).catch(reportError);
  }

  static _onHeroOpen() {
    this._selectionDirty = false; // leaving keep-selection for the reroll picker
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

  static _onGmRerollOpen() {
    this._selectionDirty = false; // leaving keep-selection for the GM reroll picker
    this.gmRerollMode = true;
    this.rerollSelection.clear();
    this.render();
  }

  static _onGmRerollCancel() {
    this.gmRerollMode = false;
    this.rerollSelection.clear();
    this.render();
  }

  static _onGmRerollConfirm() {
    const rerollIds = [...this.rerollSelection];
    if (!rerollIds.length) return;
    dispatch({ type: "gmReroll", rerollIds }).catch(reportError);
  }

  /** Toggle the combos reference panel: persist the client setting, resize the window
   *  by the panel's width (so it doesn't squeeze the board), and re-render. */
  static async _onToggleCombos() {
    const open = game.settings.get(MODULE_ID, SETTINGS.COMBOS_OPEN);
    await game.settings.set(MODULE_ID, SETTINGS.COMBOS_OPEN, !open);
    const w = this.position?.width ?? BOARD_W_OPEN;
    this.setPosition({ width: open ? w - COMBOS_W : w + COMBOS_W });
    this.render();
  }

  static _onTakeBust() {
    this._selectionDirty = false;
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
  // Hero-Point / GM re-roll modes and the GM value-override are private/transient: reset.
  instance.heroMode = false;
  instance.gmRerollMode = false;
  instance.rerollSelection.clear();
  instance.editDieId = null;
  scheduleRender(instance, { force });
}
