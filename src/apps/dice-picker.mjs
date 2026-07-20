import { TEMPLATES, MODULE_ID } from "../constants.mjs";
import { loadState } from "../foundry/state-store.mjs";
import { dispatch, broadcastOpen } from "../net/socket.mjs";
import { applyAppearance } from "../presentation/theme.mjs";
import { diceIds, getCustomDie } from "../foundry/dice-data.mjs";
import { dieName, dieDesc, activeTheme, activeLanguage } from "../foundry/themes.mjs";
import { ownedDieCounts, inventoryActor, isDieItem, ownedSlotChoices, orderIdsOwnedFirst, freeCopies, slotCoverage, readDefaultLoadout, saveDefaultLoadout, resolveLoadout } from "../foundry/dice-items.mjs";
import { scheduleRender, snapshotRender, restoreRender } from "../presentation/render-gate.mjs";
import { pickerSignature } from "../core/transient-ui.mjs";
import { generateLoadout, CLASS_IDS } from "../core/loadout-gen.mjs";
import { catalogEntries } from "../foundry/dice-data.mjs";

/** Opening knobs for the quick-hand generator: a couple of cheap tricks, the tavern case. */
const GEN_DEFAULTS = Object.freeze({ count: 2, priceClass: "cheap", mode: "random" });

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
  // A star marks a die made at this table, so it reads apart from the 37 shipped ones. It
  // lives in the option label only — the item on the sheet keeps the plain name.
  const nm = (id) => (getCustomDie(id) ? `★ ${dieName(theme, lang, id)}` : dieName(theme, lang, id));
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
  /** GM quick-hand knobs: the shared toolbar plus one entry per player id. Kept on the
   *  instance so the render gate's re-renders never reset what the GM dialled in. */
  _gen = { all: { ...GEN_DEFAULTS }, rows: {} };

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
      genMode: DicePicker._onGenMode,
      genDeal: DicePicker._onGenDeal,
      genDealAll: DicePicker._onGenDealAll,
      openBuilder: DicePicker._onOpenBuilder,
      close: DicePicker._onCloseClick,
    },
  };

  /** The knobs for one row (or the toolbar, id `all`), seeded from the defaults. */
  _knobs(id) {
    if (id === "all") return this._gen.all;
    return (this._gen.rows[id] ??= { ...GEN_DEFAULTS });
  }

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
      const slotCovered = slotCoverage(p.dieIds, owned);

      const slots = (p.dieIds ?? []).map((dieId, i) => {
        const usedExcl = new Map(used);
        usedExcl.set(dieId, (usedExcl.get(dieId) ?? 0) - 1);
        const covered = mode !== "virtual" && Boolean(slotCovered[i]);
        return {
          slot: i,
          n: i + 1,
          dieId,
          staked: Boolean(p.betDice?.[i]),
          mark: slotMark({ mode, covered }),
          options: slotOptions({ mode, allIds, owned, usedAll: used, usedExcl, dieId, theme, lang }),
        };
      });
      // The stake column shows for anyone who opted in at setup. It is only editable while
      // choosing: once play starts the pot is fixed, but the marks stay visible.
      const staking = Boolean(p.stakeDice);
      const stakedCount = staking ? (p.betDice ?? []).filter(Boolean).length : 0;

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
        // The GM's quick-hand strip, on every row the GM can edit. Players never see it.
        gen: isGM ? this._genContext(p.id) : null,
        staking,
        canStake: state.status === "choosing",
        stakeNote: stakedCount ? game.i18n.format("KNUCKLES.dice.stakeNote", { n: stakedCount }) : null,
        slots,
      };
    });

    // The signature of what we're about to render — refreshDicePicker compares the
    // next state's signature against this to skip renders that wouldn't change our slice.
    this._kgSig = pickerSignature(state, editable.map((p) => p.id));
    const allReady = editable.length > 0 && editable.every((p) => p.ready);
    return {
      active: editable.length > 0,
      choosing: state.status === "choosing",
      isGM,
      allReady,
      // "Deal to all" only makes sense with a GM-driven opponent on the table.
      genAll: isGM && editable.some((p) => p.type !== "pc") ? this._genContext("all") : null,
      players,
    };
  }

  /** Template shape for one quick-hand strip: the dialled-in knobs plus their menus. */
  _genContext(id) {
    const k = this._knobs(id);
    return {
      id,
      counts: Array.from({ length: 7 }, (_, n) => ({ n, selected: n === k.count })),
      classes: CLASS_IDS.map((c) => ({
        id: c,
        label: game.i18n.localize(`KNUCKLES.gen.class.${c}`),
        selected: c === k.priceClass,
      })),
      random: k.mode === "random",
    };
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
        }).then(() => { if (game.user.isGM) scheduleRender(this); })
          // A rejected pick (e.g. the die was sold in a race) leaves the native <select>
          // showing a value that was never saved — snap back to the authoritative state.
          .catch((err) => { reportError(err); scheduleRender(this); });
      });
      // Flush a render that was DEFERRED while this dropdown was open (e.g. another player's
      // change) once it closes — but don't force a fresh render here (that's the change path).
      sel.addEventListener("blur", () => { this._kgSelectBusy = false; if (this._kgPending) scheduleRender(this); });
    }
    // Putting a die up, or taking it back. A real intent, so every client sees the pot grow.
    for (const box of this.element.querySelectorAll("input[data-die-stake]")) {
      box.addEventListener("change", (ev) => {
        dispatch({
          type: "setDieStake",
          playerId: ev.target.dataset.playerId,
          slot: Number(ev.target.dataset.slot),
          staked: ev.target.checked,
        }).then(() => { if (game.user.isGM) scheduleRender(this); })
          .catch((err) => { reportError(err); scheduleRender(this); });
      });
    }
    // The quick-hand knobs are local state, not an intent: remember the pick and take the
    // same open-dropdown lock, so a sync can't yank a menu the GM has open.
    for (const sel of this.element.querySelectorAll("select[data-gen-knob]")) {
      sel.addEventListener("focus", () => { this._kgSelectBusy = true; });
      sel.addEventListener("blur", () => { this._kgSelectBusy = false; if (this._kgPending) scheduleRender(this); });
      sel.addEventListener("change", (ev) => {
        this._kgSelectBusy = false;
        const { genId, genKnobKind } = ev.target.dataset;
        const k = this._knobs(genId);
        if (genKnobKind === "count") k.count = Number(ev.target.value) || 0;
        else k.priceClass = ev.target.value;
      });
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

  /** Toggle ready for the player(s) this client controls. Stays open so the state is
   *  visible and can be taken back; the window's close button dismisses it. */
  static async _onReady() {
    const mine = loadState().players.filter((pl) => canControl(game.user, pl));
    const next = !mine.every((p) => p.ready); // all ready → un-ready; otherwise ready
    for (const p of mine) {
      await dispatch({ type: "setReady", playerId: p.id, ready: next }).catch(reportError);
    }
  }

  static async _onStartPlay() {
    // Stake collection runs on the GM client: compute the plan; a shortfall opens the
    // stakes dialog (mint / borrow), otherwise start straight away. The command re-reads
    // wallets and performs the authoritative deductions. Cancelling the dialog aborts Start.
    let stakes = null;
    const state = loadState();
    if (state && game.user.isGM) {
      try {
        const { buildStakeContext } = await import("../foundry/stakes-context.mjs");
        const ctx = await buildStakeContext(state);
        if (ctx.needsDialog) {
          const { openStakesDialog } = await import("./stakes-dialog.mjs");
          stakes = await openStakesDialog(ctx);
          if (stakes === null) return; // GM cancelled — do not start
        }
      } catch (err) {
        reportError(err); // fall through: start with no explicit resolutions (shortfalls minted)
      }
    }
    try {
      await dispatch({ type: "startPlay", stakes });
      broadcastOpen();
      this.close();
    } catch (err) {
      reportError(err); // a failed stake collection (wallet race) keeps the picker open to retry
    }
  }

  static async _onEndGame() {
    const { confirmEndGame } = await import("./board-app.mjs"); // shared, state-aware dialog
    if (await confirmEndGame()) dispatch({ type: "endGame" }).catch(reportError);
  }

  /** Flip a strip between random picks and a matched set. */
  static _onGenMode(event, target) {
    this._knobs(target.dataset.genId).mode = target.dataset.mode;
    this.render();
  }

  /** Deal a fresh hand to one participant, using that row's own knobs. */
  static async _onGenDeal(event, target) {
    await this._deal(target.dataset.genId, this._knobs(target.dataset.genId));
  }

  /** Deal to every GM-driven row at once, using the toolbar knobs. A player character is
   *  never included: their hand is theirs unless the GM deals it from that player's row. */
  static async _onGenDealAll() {
    const knobs = this._knobs("all");
    const targets = (loadState()?.players ?? []).filter((p) => p.type !== "pc" && canControl(game.user, p));
    for (const p of targets) await this._deal(p.id, knobs);
  }

  /** Generate and apply one loadout. Uses the batched setLoadout intent, so it lands as a
   *  single atomic write per participant (and the GM-side handler still validates it). */
  async _deal(playerId, { count, priceClass, mode }) {
    const dieIds = generateLoadout({ entries: catalogEntries(), count, priceClass, mode, rng: () => Math.random() });
    await dispatch({ type: "setLoadout", playerId, dieIds }).catch(reportError);
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

  /** Make a die on the spot — a player who just carved one doesn't have to wait for the
   *  game to end. Imported lazily so the builder only loads when the GM asks for it. */
  static async _onOpenBuilder() {
    const { openDieBuilder } = await import("./die-builder.mjs");
    openDieBuilder();
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
