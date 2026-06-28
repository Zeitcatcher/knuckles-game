import { TEMPLATES, MODULE_ID } from "../constants.mjs";
import { loadState } from "../foundry/state-store.mjs";
import { dispatch, broadcastOpen } from "../net/socket.mjs";
import { applyAppearance } from "../presentation/theme.mjs";
import { diceIds } from "../foundry/dice-data.mjs";
import { dieName, dieDesc, activeTheme, activeLanguage } from "../foundry/themes.mjs";
import { ownedDieCounts, inventoryActor, isDieItem, ownedSlotChoices, orderIdsOwnedFirst, freeCopies, coverLoadout, readDefaultLoadout, saveDefaultLoadout, resolveLoadout } from "../foundry/dice-items.mjs";
import { scheduleRender, snapshotRender, restoreRender } from "../presentation/render-gate.mjs";
import { pickerSignature } from "../core/transient-ui.mjs";

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
 * - "full":    the GM picking for an NPC or a PC — full catalog, OWNED dice first, each
 *              labelled "free/total"; picking an unowned die over-assigns (an NPC is
 *              stocked, a PC is GIFTED) on start.
 * - "owned":   a PC's own view — only their owned dice (free/total), greyed when no free
 *              copy is left; a slot holding a GM-gifted die shows the gift, an otherwise
 *              unowned slot reads "no die left".
 * `usedAll` counts each die across ALL six slots (for the free/total label); `usedExcl`
 * excludes the current slot (for the disable test, so the current pick stays selectable).
 */
function slotOptions({ mode, allIds, owned, usedAll, usedExcl, dieId, theme, lang }) {
  const nm = (id) => dieName(theme, lang, id);
  const fl = (id) => dieDesc(theme, lang, id);
  const ft = (id) => `${nm(id)} ${freeCopies(owned, usedAll, id)}/${owned.get(id) ?? 0}`;

  if (mode === "virtual") {
    return allIds.map((id) => ({ id, label: nm(id), flavor: fl(id), selected: id === dieId }));
  }

  if (mode === "full") {
    // owned dice float to the top; owned show free/total, the rest are catalog (gift/stock).
    return orderIdsOwnedFirst(allIds, owned).map((id) => {
      const c = owned.get(id) ?? 0;
      return { id, label: c > 0 ? ft(id) : nm(id), flavor: fl(id), selected: id === dieId };
    });
  }

  // "owned" — a PC's own dice
  const { ids, placeholder } = ownedSlotChoices(allIds, owned, usedExcl, dieId);
  const opts = ids.map(({ id, selected, disabled }) => ({ id, label: ft(id), flavor: fl(id), selected, disabled }));
  if (placeholder) {
    // The slot holds a die the actor doesn't own yet — show its name (it's added on start),
    // selected but disabled (a non-GM can only swap it for one they own).
    opts.unshift({ id: dieId, label: nm(dieId), flavor: fl(dieId), selected: true, disabled: true });
  }
  return opts;
}

/** The per-slot ownership marker: { icon, cls, title } or null (virtual). `covered` comes
 *  from the GREEDY per-slot allocation. check = covered by an owned copy; plus = the
 *  character doesn't own this one, so it is **added on start** (NPC stock, or gifted to a
 *  PC by the GM's Start). Nothing blocks — the red short-tally is informational. */
function slotMark({ mode, covered }) {
  if (mode === "virtual") return null;
  return covered
    ? { icon: "fa-check", cls: "is-ok", title: game.i18n.localize("KNUCKLES.dice.inInv") }
    : { icon: "fa-plus", cls: "is-add", title: game.i18n.localize("KNUCKLES.dice.willAdd") };
}

/** Pre-game (and GM mid-game) window: choose a die for each of a character's six slots. */
export class DicePicker extends HandlebarsApplicationMixin(ApplicationV2) {
  /** active createItem/deleteItem/updateItem hook ids while open in physical mode */
  _itemHooks = null;

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-dice`,
    classes: ["knuckles-game"],
    window: { title: "KNUCKLES.dice.title", icon: "fa-solid fa-dice-d6" },
    position: { width: 620, height: "auto" },
    actions: {
      ready: DicePicker._onReady,
      startPlay: DicePicker._onStartPlay,
      endGame: DicePicker._onEndGame,
      saveDefault: DicePicker._onSaveDefault,
      resetDefault: DicePicker._onResetDefault,
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

    const isGM = Boolean(game.user.isGM);
    const players = editable.map((p) => {
      const generic = !p.actorUuid && !p.tokenUuid;
      const npc = p.type === "npc";
      // The GM gets the full catalog for any inventory player (to stock NPCs / gift PCs);
      // a player sees only their own owned dice. Generic / no-actor is the plain catalog.
      const mode = !physical || generic ? "virtual" : (isGM || npc) ? "full" : "owned";
      const actor = inventoryActor(p);
      const owned = mode === "virtual" ? new Map() : ownedDieCounts(actor);
      const total = [...owned.values()].reduce((a, b) => a + b, 0);

      const used = new Map();
      for (const id of p.dieIds ?? []) used.set(id, (used.get(id) ?? 0) + 1);

      // Greedy per-slot coverage drives only the check-vs-will-add marker; an unowned slot
      // is GRANTED on start (the GM's Start gifts it), never blocked.
      const { slotCovered } = coverLoadout(p.dieIds, [], owned);

      const slots = (p.dieIds ?? []).map((dieId, i) => {
        const usedExcl = new Map(used);
        usedExcl.set(dieId, (usedExcl.get(dieId) ?? 0) - 1);
        const covered = mode !== "virtual" && Boolean(slotCovered[i]);
        return {
          slot: i,
          n: i + 1,
          dieId,
          mark: slotMark({ mode, covered }),
          options: slotOptions({ mode, allIds, owned, usedAll: used, usedExcl, dieId, theme, lang }),
        };
      });

      // The owned tally + buy-hint are INFORMATIONAL (the character OWNS fewer than six) —
      // they stay red even though the GM can start right away and the missing dice are
      // gifted on launch. Visible to the GM too (the economy readout); NPCs show the stock note.
      const enough = total >= 6;
      const showTally = physical && !generic && !npc;
      return {
        id: p.id,
        name: p.name,
        ready: Boolean(p.ready),
        physical: mode !== "virtual",
        tally: showTally ? { have: Math.min(total, 6), ok: enough } : null,
        buyHint: showTally && !enough ? game.i18n.format("KNUCKLES.dice.buyMore", { n: 6 - total }) : null,
        stockNote: physical && npc ? game.i18n.localize("KNUCKLES.dice.stockNote") : null,
        // Saved default loadout (any actor-backed player, virtual or physical).
        canSaveDefault: Boolean(actor),
        hasDefault: Boolean(actor) && readDefaultLoadout(actor) !== null,
        slots,
      };
    });

    // The signature of what we're about to render — refreshDicePicker compares the
    // next state's signature against this to skip renders that wouldn't change our slice.
    this._kgSig = pickerSignature(state, editable.map((p) => p.id));
    return { active: editable.length > 0, choosing: state.status === "choosing", isGM: Boolean(game.user.isGM), players };
  }

  /** Snapshot the list scroll + the focused slot-select before the DOM swap. */
  async _preRender(context, options) {
    await super._preRender?.(context, options);
    snapshotRender(this, [".kg-dchars"]);
  }

  _onRender() {
    applyAppearance(this.element);
    for (const sel of this.element.querySelectorAll("select[data-die-slot]")) {
      // While a dropdown is open the gate defers a foreign sync (no yanked pick / scroll
      // jump); committing (change) or leaving (blur) clears the lock and flushes it.
      sel.addEventListener("focus", () => { this._kgSelectBusy = true; });
      sel.addEventListener("change", (ev) => {
        this._kgSelectBusy = false;
        // The native <select> already shows the new value. Persist it; then, ONLY on the GM's
        // own client (where loadState() is fresh the instant the dispatch resolves), re-render
        // from the saved state via the lock-aware gate. A remote player's loadState() lags the
        // socket return, so they're driven by the authoritative onChange → refreshDicePicker
        // (their native <select> keeps showing the pick until that lands — no "eaten" change).
        dispatch({
          type: "setDieSlot",
          playerId: ev.target.dataset.playerId,
          slot: Number(ev.target.dataset.slot),
          dieId: ev.target.value,
        }).then(() => { if (game.user.isGM) scheduleRender(this); }).catch(reportError);
      });
      // Flush a render that was DEFERRED while this dropdown was open (e.g. another player's
      // change) once it closes — but don't force a fresh render here (that's the change path).
      sel.addEventListener("blur", () => { this._kgSelectBusy = false; if (this._kgPending) scheduleRender(this); });
    }
    if (loadState()?.physical) this._ensureItemHooks();
    else this._dropItemHooks();
    restoreRender(this); // re-apply the scroll/focus captured in _preRender
  }

  _ensureItemHooks() {
    if (this._itemHooks) return;
    // Owned-count changes aren't in the picker signature, so refresh through the gate
    // directly (lock-aware: it won't close a dropdown the user has open).
    const refresh = foundry.utils.debounce(() => scheduleRender(this), 150);
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

  /** Pin the player's current six dice as their default (an actor flag; survives restarts).
   *  Foundry enforces OWNER/GM on the flag write — the button is shown only to controllers. */
  static async _onSaveDefault(event, target) {
    const p = loadState()?.players.find((x) => x.id === target.dataset.playerId);
    if (!p || !canControl(game.user, p)) return;
    const actor = inventoryActor(p);
    if (!actor) return;
    await saveDefaultLoadout(actor, p.dieIds);
    ui.notifications?.info(game.i18n.localize("KNUCKLES.dice.defaultSaved"));
    this.render(); // flag writes don't sync game state, so refresh locally to enable Reset
  }

  /** Apply the saved default to this player's six slots in one atomic write. */
  static async _onResetDefault(event, target) {
    const state = loadState();
    const p = state?.players.find((x) => x.id === target.dataset.playerId);
    if (!p || !canControl(game.user, p)) return;
    const actor = inventoryActor(p);
    const saved = readDefaultLoadout(actor);
    if (!saved) return;
    const dieIds = resolveLoadout(saved, ownedDieCounts(actor), { physical: Boolean(state.physical), validIds: new Set(diceIds()) });
    if (dieIds) await dispatch({ type: "setLoadout", playerId: p.id, dieIds }).catch(reportError);
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

export function refreshDicePicker(force = false) {
  if (!instance || !instance.rendered) return;
  const state = loadState();
  if (!state || (state.status !== "choosing" && !game.user.isGM)) {
    instance.close();
    return;
  }
  // Theme / appearance changes invalidate every label but don't touch the signature —
  // they force-render. A plain state sync is gated: skip it if THIS client's editable
  // slice is unchanged (so another player's pick can't thrash my window).
  if (force) { scheduleRender(instance, { force: true }); return; }
  const editableIds = state.players.filter((p) => canControl(game.user, p)).map((p) => p.id);
  if (pickerSignature(state, editableIds) === instance._kgSig) return;
  scheduleRender(instance);
}
