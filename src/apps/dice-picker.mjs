import { TEMPLATES, MODULE_ID } from "../constants.mjs";
import { loadState } from "../foundry/state-store.mjs";
import { dispatch, broadcastOpen } from "../net/socket.mjs";
import { applyAppearance } from "../presentation/theme.mjs";
import { diceIds } from "../foundry/dice-data.mjs";
import { dieName, dieDesc, activeTheme, activeLanguage } from "../foundry/themes.mjs";
import { ownedDieCounts, inventoryActor, isDieItem, ownedSlotChoices } from "../foundry/dice-items.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let instance = null;

function canControl(user, player) {
  if (!user || !player) return false;
  if (user.isGM) return true;
  return inventoryActor(player)?.testUserPermission?.(user, "OWNER") ?? false;
}

/**
 * Options for one slot, copy-aware.
 * - "virtual": full catalog, no marks (virtual mode, or a generic/no-actor player).
 * - "full":    GM picking for an NPC — full catalog, counts + check on owned, may
 *              over-assign (missing copies are auto-granted on start).
 * - "owned":   a PC — only their owned dice; a die with no free copy for this slot
 *              is shown but disabled (greyed); a slot holding an unowned die reads
 *              "no die left".
 */
function slotOptions({ mode, allIds, owned, usedExcl, dieId, theme, lang }) {
  const nm = (id) => dieName(theme, lang, id);
  const fl = (id) => dieDesc(theme, lang, id);
  if (mode === "virtual") {
    return allIds.map((id) => ({ id, label: nm(id), flavor: fl(id), selected: id === dieId }));
  }
  if (mode === "full") {
    return allIds.map((id) => {
      const c = owned.get(id) ?? 0;
      return { id, label: c > 0 ? `${nm(id)} ×${c}` : nm(id), flavor: fl(id), selected: id === dieId, check: c > 0 };
    });
  }
  // "owned"
  const { ids, placeholder } = ownedSlotChoices(allIds, owned, usedExcl, dieId);
  const opts = ids.map(({ id, selected, disabled }) => ({
    id,
    label: `${nm(id)} ×${owned.get(id)}`,
    flavor: fl(id),
    selected,
    disabled,
  }));
  if (placeholder) {
    opts.unshift({ id: dieId, label: game.i18n.localize("KNUCKLES.dice.noDieLeft"), flavor: "", selected: true, disabled: true });
  }
  return opts;
}

/** The per-slot ownership marker: { icon, cls, title } or null (virtual). */
function slotMark(mode, owned, usedExcl, dieId) {
  if (mode === "owned") {
    const free = (owned.get(dieId) ?? 0) - (usedExcl.get(dieId) ?? 0);
    return free >= 1
      ? { icon: "fa-check", cls: "is-ok", title: game.i18n.localize("KNUCKLES.dice.inInv") }
      : { icon: "fa-triangle-exclamation", cls: "is-warn", title: game.i18n.localize("KNUCKLES.dice.noDieLeft") };
  }
  if (mode === "full") {
    return (owned.get(dieId) ?? 0) > 0
      ? { icon: "fa-check", cls: "is-ok", title: game.i18n.localize("KNUCKLES.dice.inInv") }
      : { icon: "fa-plus", cls: "is-add", title: game.i18n.localize("KNUCKLES.dice.willAdd") };
  }
  return null;
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
    const physical = Boolean(state.physical);
    const allIds = diceIds();

    const players = editable.map((p) => {
      const generic = !p.actorUuid && !p.tokenUuid;
      const mode = !physical || generic ? "virtual" : p.type === "npc" ? "full" : "owned";
      const owned = mode === "virtual" ? new Map() : ownedDieCounts(inventoryActor(p));
      const total = [...owned.values()].reduce((a, b) => a + b, 0);

      const used = new Map();
      for (const id of p.dieIds ?? []) used.set(id, (used.get(id) ?? 0) + 1);

      const slots = (p.dieIds ?? []).map((dieId, i) => {
        const usedExcl = new Map(used);
        usedExcl.set(dieId, (usedExcl.get(dieId) ?? 0) - 1);
        return {
          slot: i,
          n: i + 1,
          dieId,
          mark: slotMark(mode, owned, usedExcl, dieId),
          options: slotOptions({ mode, allIds, owned, usedExcl, dieId, theme, lang }),
        };
      });

      const enough = total >= 6;
      return {
        id: p.id,
        name: p.name,
        ready: Boolean(p.ready),
        physical: mode !== "virtual",
        tally: mode === "owned" ? { have: Math.min(total, 6), ok: enough } : null,
        buyHint: mode === "owned" && !enough ? game.i18n.format("KNUCKLES.dice.buyMore", { n: 6 - total }) : null,
        stockNote: mode === "full" ? game.i18n.localize("KNUCKLES.dice.stockNote") : null,
        slots,
      };
    });

    return { active: editable.length > 0, choosing: state.status === "choosing", isGM: Boolean(game.user.isGM), players };
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
    if (loadState()?.physical) this._ensureItemHooks();
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
        (p) => canControl(game.user, p) && inventoryActor(p)?.id === aid,
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
  if (!state || (state.status !== "choosing" && !game.user.isGM)) {
    instance.close();
    return;
  }
  instance.render();
}
