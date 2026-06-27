import { TEMPLATES, MODULE_ID } from "../constants.mjs";
import { loadState } from "../foundry/state-store.mjs";
import { dispatch, broadcastOpen } from "../net/socket.mjs";
import { applyAppearance } from "../presentation/theme.mjs";
import { diceIds } from "../foundry/dice-data.mjs";
import { dieName, dieDesc, activeTheme, activeLanguage } from "../foundry/themes.mjs";
import { isPhysicalMode, ownedDieIds, isDieItem } from "../foundry/dice-items.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let instance = null;

function canControl(user, player) {
  if (!user || !player) return false;
  if (user.isGM) return true;
  if (player.actorUuid) return fromUuidSync(player.actorUuid)?.testUserPermission?.(user, "OWNER") ?? false;
  return false;
}

/**
 * The <option> list for one slot. Virtual mode (or a generic/no-actor player): the
 * full catalog. Physical GM: the full catalog, owned dice flagged for a check.
 * Physical player: only owned dice (plus the currently-stored die shown disabled if
 * they no longer own it, so the control never disagrees with saved state).
 */
function slotOptions({ phys, isGM, allIds, owned, dieId, theme, lang }) {
  const opt = (id, extra = {}) => ({
    id,
    label: dieName(theme, lang, id),
    flavor: dieDesc(theme, lang, id),
    selected: id === dieId,
    ...extra,
  });
  if (!phys) return allIds.map((id) => opt(id));
  if (isGM) return allIds.map((id) => opt(id, { check: owned.has(id) }));
  if (owned.size === 0) {
    return [{ id: dieId, label: game.i18n.localize("KNUCKLES.dice.noneOwned"), flavor: "", selected: true, disabled: true }];
  }
  const list = allIds.filter((id) => owned.has(id)).map((id) => opt(id));
  if (!owned.has(dieId)) {
    list.unshift({
      id: dieId,
      label: `${dieName(theme, lang, dieId)} — ${game.i18n.localize("KNUCKLES.dice.notOwnedSuffix")}`,
      flavor: "",
      selected: true,
      disabled: true,
    });
  }
  return list;
}

/** Pre-game (and GM mid-game) window: choose a die for each of a character's six slots. */
export class DicePicker extends HandlebarsApplicationMixin(ApplicationV2) {
  /** active createItem/deleteItem/updateItem hook ids while open in physical mode */
  _itemHooks = null;

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-dice`,
    classes: ["knuckles-game"],
    window: { title: "KNUCKLES.dice.title", icon: "fa-solid fa-dice-d6" },
    position: { width: 580, height: "auto" },
    actions: {
      ready: DicePicker._onReady,
      startPlay: DicePicker._onStartPlay,
      endGame: DicePicker._onEndGame,
      close: DicePicker._onCloseClick,
    },
  };

  static PARTS = { picker: { template: TEMPLATES.DICE } };

  async _prepareContext() {
    const state = loadState();
    if (!state) return { active: false };
    const editable = state.players.filter((p) => canControl(game.user, p));
    const theme = activeTheme();
    const lang = activeLanguage();
    const physical = isPhysicalMode();
    const isGM = Boolean(game.user.isGM);
    const allIds = diceIds();

    const players = editable.map((p) => {
      // Generic / token-less players have no inventory and are economy-exempt:
      // they keep the plain full-catalog picker even in physical mode.
      const phys = physical && Boolean(p.actorUuid);
      const owned = phys ? ownedDieIds(fromUuidSync(p.actorUuid)) : new Set();
      const slots = (p.dieIds ?? []).map((dieId, i) => ({
        slot: i,
        n: i + 1,
        dieId,
        owned: phys && owned.has(dieId),
        options: slotOptions({ phys, isGM, allIds, owned, dieId, theme, lang }),
      }));
      return {
        id: p.id,
        name: p.name,
        ready: Boolean(p.ready),
        phys,
        ownsNone: phys && owned.size === 0,
        slots,
      };
    });

    return { active: editable.length > 0, choosing: state.status === "choosing", isGM, players };
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
    // Physical mode: refresh the ownership markers if a die enters/leaves a shown
    // actor's inventory while the picker is open. Off in virtual mode and on close.
    if (isPhysicalMode()) this._ensureItemHooks();
    else this._dropItemHooks();
  }

  _ensureItemHooks() {
    if (this._itemHooks) return;
    const refresh = foundry.utils.debounce(() => { if (this.rendered) this.render(); }, 150);
    const onChange = (item) => {
      if (!isDieItem(item)) return;
      const state = loadState();
      if (!state) return;
      const aid = item.parent?.id;
      const mine = state.players.some(
        (p) => p.actorUuid && canControl(game.user, p) && fromUuidSync(p.actorUuid)?.id === aid,
      );
      if (mine) refresh();
    };
    this._itemHooks = {
      createItem: Hooks.on("createItem", onChange),
      deleteItem: Hooks.on("deleteItem", onChange),
      updateItem: Hooks.on("updateItem", onChange),
    };
  }

  _dropItemHooks() {
    if (!this._itemHooks) return;
    Hooks.off("createItem", this._itemHooks.createItem);
    Hooks.off("deleteItem", this._itemHooks.deleteItem);
    Hooks.off("updateItem", this._itemHooks.updateItem);
    this._itemHooks = null;
  }

  _onClose(options) {
    this._dropItemHooks();
    return super._onClose?.(options);
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

  static async _onEndGame() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("KNUCKLES.board.endGame") },
      content: `<p>${game.i18n.localize("KNUCKLES.board.endConfirm")}</p>`,
      modal: true,
    });
    if (ok) dispatch({ type: "endGame" }).catch(reportError);
  }

  static _onCloseClick() {
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
