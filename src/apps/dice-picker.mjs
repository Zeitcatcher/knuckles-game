import { TEMPLATES, MODULE_ID } from "../constants.mjs";
import { loadState } from "../foundry/state-store.mjs";
import { dispatch, broadcastOpen } from "../net/socket.mjs";
import { applyAppearance } from "../presentation/theme.mjs";
import { DICE_CATALOG } from "../core/dice-catalog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let instance = null;

function canControl(user, player) {
  if (!user || !player) return false;
  if (user.isGM) return true;
  if (player.actorUuid) return fromUuidSync(player.actorUuid)?.testUserPermission?.(user, "OWNER") ?? false;
  return false;
}

/** Pre-game (and GM mid-game) window: choose a die for each of a character's six slots. */
export class DicePicker extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-dice`,
    classes: ["knuckles-game"],
    window: { title: "KNUCKLES.dice.title", icon: "fa-solid fa-dice-d6" },
    position: { width: 580, height: "auto" },
    actions: {
      ready: DicePicker._onReady,
      startPlay: DicePicker._onStartPlay,
      close: DicePicker._onClose,
    },
  };

  static PARTS = { picker: { template: TEMPLATES.DICE } };

  async _prepareContext() {
    const state = loadState();
    if (!state) return { active: false };
    const editable = state.players.filter((p) => canControl(game.user, p));
    return {
      active: editable.length > 0,
      choosing: state.status === "choosing",
      isGM: Boolean(game.user.isGM),
      catalog: DICE_CATALOG.map((d) => ({ id: d.id, label: d.label, flavor: d.flavor })),
      players: editable.map((p) => ({
        id: p.id,
        name: p.name,
        ready: Boolean(p.ready),
        slots: (p.dieIds ?? []).map((dieId, i) => ({ slot: i, n: i + 1, dieId })),
      })),
    };
  }

  _onRender() {
    applyAppearance(this.element);
    for (const sel of this.element.querySelectorAll("select[data-die-slot]")) {
      sel.addEventListener("change", (ev) => {
        dispatch({
          type: "setDieSlot",
          playerId: ev.target.dataset.playerId,
          slot: Number(ev.target.dataset.slot),
          dieId: ev.target.value,
        }).catch(reportError);
      });
    }
  }

  static async _onReady() {
    const state = loadState();
    for (const p of state.players.filter((pl) => canControl(game.user, pl))) {
      await dispatch({ type: "setReady", playerId: p.id, ready: true }).catch(reportError);
    }
    this.close();
  }

  static async _onStartPlay() {
    await dispatch({ type: "startPlay" }).catch(reportError);
    broadcastOpen();
    this.close();
  }

  static _onClose() {
    this.close();
  }
}

function reportError(err) {
  console.error("knuckles-game |", err);
  ui.notifications?.warn(err?.message ?? String(err));
}

export function openDicePicker() {
  instance ??= new DicePicker();
  instance.render({ force: true });
  return instance;
}

export function refreshDicePicker() {
  if (!instance || !instance.rendered) return;
  const state = loadState();
  // Once play begins the picker closes for players (the board takes over);
  // the GM may keep it open to change dice mid-game.
  if (!state || (state.status !== "choosing" && !game.user.isGM)) {
    instance.close();
    return;
  }
  instance.render();
}
