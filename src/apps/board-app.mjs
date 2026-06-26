import { TEMPLATES, MODULE_ID } from "../constants.mjs";
import { loadState } from "../foundry/state-store.mjs";
import { dispatch } from "../net/socket.mjs";
import { buildBoardContext } from "../presentation/view-model.mjs";
import { applyAppearance } from "../presentation/theme.mjs";

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

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-board`,
    classes: ["knuckles-game"],
    window: { title: "KNUCKLES.title", icon: "fa-solid fa-dice-d6", resizable: true },
    position: { width: 580, height: "auto" },
    actions: {
      roll: BoardApp._onRoll,
      toggleDie: BoardApp._onToggleDie,
      keepRoll: BoardApp._onKeepRoll,
      keepBank: BoardApp._onKeepBank,
      heroOpen: BoardApp._onHeroOpen,
      heroCancel: BoardApp._onHeroCancel,
      heroConfirm: BoardApp._onHeroConfirm,
      takeBust: BoardApp._onTakeBust,
      openDice: BoardApp._onOpenDice,
      newGame: BoardApp._onNewGame,
    },
  };

  static PARTS = { board: { template: TEMPLATES.BOARD } };

  async _prepareContext() {
    return buildBoardContext(loadState(), game.user, {
      selection: this.selection,
      heroMode: this.heroMode,
      rerollSelection: this.rerollSelection,
    });
  }

  _onRender() {
    applyAppearance(this.element);
  }

  static _onRoll() {
    dispatch({ type: "roll" }).catch(reportError);
  }

  static _onToggleDie(event, target) {
    const id = Number(target.dataset.dieId);
    const set = this.heroMode ? this.rerollSelection : this.selection;
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.render();
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

  static _onNewGame() {
    import("./setup-app.mjs").then((m) => m.openSetup());
  }

  static _onOpenDice() {
    import("./dice-picker.mjs").then((m) => m.openDicePicker());
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

export function refreshBoard() {
  // Never auto-open a hidden board; only re-render if it is already open.
  if (!instance || !instance.rendered) return;
  // Any synced state change resets transient UI: the keep-selection and the
  // Hero-Point re-roll mode (so after a re-roll the board returns to normal).
  instance.selection.clear();
  instance.heroMode = false;
  instance.rerollSelection.clear();
  instance.render();
}
