/**
 * The die builder: a GM window for making dice at the table. A player carves their own
 * knucklebone, you enter its name, its icon and the chance of each face, and it joins the
 * catalog for everyone.
 *
 * The percent rules live in core/custom-dice.mjs; this file is the window around them.
 * Typing never re-renders — a re-render would swallow the caret mid-number — so the live
 * parts (ghost shares, the pool bar, the price class, the save button) are written straight
 * into the DOM by _refreshLive.
 */
import { TEMPLATES, MODULE_ID, SETTINGS, DEFAULT_DIE_IMG } from "../constants.mjs";
import { applyAppearance } from "../presentation/theme.mjs";
import { loadState } from "../foundry/state-store.mjs";
import { customDice, loadCustomDice } from "../foundry/dice-data.mjs";
import { refreshDicePicker } from "./dice-picker.mjs";
import {
  FACES,
  TOTAL,
  resolveFaces,
  parseFace,
  clampFace,
  validateDie,
  toDefinition,
  toDraft,
  makeCustomId,
} from "../core/custom-dice.mjs";
import { CLASS_CAPS, CLASS_IDS } from "../core/loadout-gen.mjs";
import {
  createCustomDieItem,
  syncCustomDieItems,
  deleteCustomDieItems,
  countCustomDieCopies,
} from "../foundry/dice-items.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let instance = null;

const blankDraft = () => ({ id: null, name: "", desc: "", img: "", price: 0, faces: Array(FACES).fill(null) });

/** Copper -> a short gp string ("12", "0.5"), for the form and the list. */
const toGp = (cp) => String(Math.round((Number(cp) || 0)) / 100);

/** The quick-hand class a price falls into — the same ceilings the generator deals by. */
function classOf(cp) {
  return CLASS_IDS.find((c) => (Number(cp) || 0) <= CLASS_CAPS[c]) ?? CLASS_IDS[CLASS_IDS.length - 1];
}

/** Six bar heights (px) for a die's shape at a glance; the tallest face sets the scale. */
function sparkBars(weights) {
  const max = Math.max(...weights.map((w) => Number(w) || 0), 1);
  const even = TOTAL / FACES;
  return weights.map((w) => ({
    h: Math.max(2, Math.round((Number(w) || 0) / max * 14)),
    strong: (Number(w) || 0) > even,
  }));
}

export class DieBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  _draft = blankDraft();

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-builder`,
    classes: ["knuckles-game"],
    window: { title: "KNUCKLES.builder.title", icon: "fa-solid fa-dice-d6" },
    position: { width: 620, height: "auto" },
    actions: {
      pickIcon: DieBuilder._onPickIcon,
      resetIcon: DieBuilder._onResetIcon,
      clearFaces: DieBuilder._onClearFaces,
      save: DieBuilder._onSave,
      cancelEdit: DieBuilder._onCancelEdit,
      edit: DieBuilder._onEdit,
      delete: DieBuilder._onDelete,
    },
  };

  static PARTS = { builder: { template: TEMPLATES.DIE_BUILDER } };

  async _prepareContext() {
    const d = this._draft;
    const faces = resolveFaces(d.faces);
    const inPlay = new Set((loadState()?.players ?? []).flatMap((p) => p.dieIds ?? []));
    return {
      editing: Boolean(d.id),
      itemsSupported: game.system?.id === "pf2e",
      draft: { ...d, priceGp: toGp(d.price) },
      // The thumb always shows what the die will actually wear, so an untouched icon field
      // previews the stock art rather than an empty box.
      iconPreview: d.img || DEFAULT_DIE_IMG,
      hasOwnIcon: Boolean(d.img) && d.img !== DEFAULT_DIE_IMG,
      classLabel: game.i18n.localize(`KNUCKLES.gen.class.${classOf(d.price)}`),
      canSave: validateDie(d).ok,
      faces: d.faces.map((v, i) => ({
        index: i,
        n: i + 1,
        value: v === null ? "" : String(v),
        ghost: faces.share === null ? "" : String(faces.share),
      })),
      pool: this._poolContext(faces),
      list: customDice().map((def) => ({
        id: def.id,
        name: def.name,
        img: def.img,
        priceText: `${toGp(def.price)} ${game.i18n.localize("KNUCKLES.builder.gp")}`,
        bars: sparkBars(def.weights),
        editing: def.id === d.id,
        inUse: inPlay.has(def.id),
      })),
    };
  }

  /** The pool bar's width plus the two lines under it, shared by render and live update. */
  _poolContext(faces) {
    const assigned = Math.round(faces.assigned * 10) / 10;
    const over = faces.error === "over";
    const short = faces.error === "short";
    let leftText;
    if (over) leftText = game.i18n.localize("KNUCKLES.builder.poolOver");
    else if (short) leftText = game.i18n.format("KNUCKLES.builder.poolShort", { n: Math.round(faces.remaining * 10) / 10 });
    else if (faces.emptyCount > 0) leftText = game.i18n.format("KNUCKLES.builder.poolSplit", { n: Math.round(faces.remaining * 10) / 10, faces: faces.emptyCount });
    else leftText = game.i18n.localize("KNUCKLES.builder.poolFull");
    return {
      percent: Math.min(100, Math.round(assigned)),
      assignedText: game.i18n.format("KNUCKLES.builder.poolAssigned", { n: assigned }),
      leftText,
      error: Boolean(faces.error),
    };
  }

  _onRender() {
    applyAppearance(this.element);
    const el = this.element;

    for (const input of el.querySelectorAll("[data-field]")) {
      input.addEventListener("input", () => {
        const key = input.dataset.field;
        this._draft[key] = key === "price" ? Math.max(0, Math.round((Number(input.value) || 0) * 100)) : input.value;
        this._refreshLive();
      });
    }

    for (const input of el.querySelectorAll("[data-face]")) {
      const index = Number(input.dataset.face);
      input.addEventListener("input", () => {
        // Clamp against the other five as the value is typed, so the six can never claim
        // more than the whole 100: the pool shrinks instead of going negative.
        const parsed = parseFace(input.value);
        const clamped = clampFace(this._draft.faces, index, input.value);
        this._draft.faces[index] = clamped;
        // Only rewrite the field when the entry was actually cut down to the ceiling.
        // Rewriting on every keystroke would eat the second decimal as it is typed.
        if (parsed !== null && clamped !== null && clamped < parsed) input.value = String(clamped);
        this._refreshLive();
      });
      // Leaving the field commits the parsed value, so "12," or "007" tidy themselves up.
      input.addEventListener("blur", () => {
        const v = this._draft.faces[index];
        input.value = v === null ? "" : String(v);
      });
    }
  }

  /** Rewrite the parts that change while typing, without touching the inputs themselves. */
  _refreshLive() {
    const el = this.element;
    if (!el) return;
    const faces = resolveFaces(this._draft.faces);
    const pool = this._poolContext(faces);

    const fill = el.querySelector("[data-pool-fill]");
    if (fill) fill.style.width = `${pool.percent}%`;
    const assigned = el.querySelector("[data-pool-assigned]");
    if (assigned) assigned.textContent = pool.assignedText;
    const left = el.querySelector("[data-pool-left]");
    if (left) {
      left.textContent = pool.leftText;
      left.classList.toggle("is-bad", pool.error);
    }
    // Empty faces advertise the share they would take; a typed one shows nothing.
    for (const input of el.querySelectorAll("[data-face]")) {
      input.placeholder = faces.share === null ? "" : String(faces.share);
    }
    const chip = el.querySelector("[data-class-chip]");
    if (chip) {
      chip.textContent = `${game.i18n.localize("KNUCKLES.builder.classChip")} ${game.i18n.localize(`KNUCKLES.gen.class.${classOf(this._draft.price)}`)}`;
    }
    const thumb = el.querySelector("[data-icon-preview]");
    if (thumb) thumb.src = this._draft.img || DEFAULT_DIE_IMG;
    const save = el.querySelector("[data-save-btn]");
    if (save) save.disabled = !validateDie(this._draft).ok;
  }

  /** Persist the table's dice, then refresh the registry and any open picker. */
  async _commit(list) {
    await game.settings.set(MODULE_ID, SETTINGS.CUSTOM_DICE, list);
    loadCustomDice(); // the onChange hook does this too; do it here so items build correctly
  }

  static async _onPickIcon() {
    const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
    if (!FP) return;
    new FP({
      type: "image",
      current: this._draft.img || "",
      callback: (path) => {
        this._draft.img = path;
        this.render();
      },
    }).browse();
  }

  /** Drop a chosen icon and go back to the stock die art. */
  static _onResetIcon() {
    this._draft.img = "";
    this.render();
  }

  static _onClearFaces() {
    this._draft.faces = Array(FACES).fill(null);
    this.render();
  }

  static _onCancelEdit() {
    this._draft = blankDraft();
    this.render();
  }

  static async _onSave() {
    const check = validateDie(this._draft);
    if (!check.ok) {
      ui.notifications?.warn(game.i18n.localize(`KNUCKLES.builder.err.${check.errors[0]}`));
      return;
    }
    const list = customDice();
    const editing = Boolean(this._draft.id);
    const id = this._draft.id ?? makeCustomId(list.map((d) => d.id));
    const def = toDefinition(this._draft, id);

    await this._commit(editing ? list.map((d) => (d.id === id ? def : d)) : [...list, def]);
    // The item side is best-effort: a die that failed to become an Item is still playable.
    try {
      if (editing) await syncCustomDieItems(def);
      else await createCustomDieItem(def);
    } catch (err) {
      console.error("knuckles-game | custom die item", err);
    }

    ui.notifications?.info(game.i18n.format(editing ? "KNUCKLES.builder.saved" : "KNUCKLES.builder.created", { name: def.name }));
    this._draft = blankDraft();
    this.render();
    refreshDicePicker(true);
  }

  static _onEdit(event, target) {
    const def = customDice().find((d) => d.id === target.dataset.dieId);
    if (!def) return;
    this._draft = toDraft(def);
    this.render();
  }

  static async _onDelete(event, target) {
    const id = target.dataset.dieId;
    const def = customDice().find((d) => d.id === id);
    if (!def) return;

    // A die someone is holding in an active game cannot be pulled out from under them.
    if ((loadState()?.players ?? []).some((p) => (p.dieIds ?? []).includes(id))) {
      ui.notifications?.warn(game.i18n.format("KNUCKLES.builder.err.inUse", { name: def.name }));
      return;
    }

    const { actors, copies } = countCustomDieCopies(id);
    const body = copies
      ? game.i18n.format("KNUCKLES.builder.deleteCopies", { name: def.name, copies, actors })
      : game.i18n.format("KNUCKLES.builder.deleteConfirm", { name: def.name });
    const yes = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("KNUCKLES.builder.delete") },
      content: `<p>${body}</p>`,
      modal: true,
    });
    if (!yes) return;

    await this._commit(customDice().filter((d) => d.id !== id));
    try {
      await deleteCustomDieItems(id);
    } catch (err) {
      console.error("knuckles-game | custom die item delete", err);
    }
    if (this._draft.id === id) this._draft = blankDraft();
    this.render();
    refreshDicePicker(true);
  }
}

export function openDieBuilder() {
  if (!game.user.isGM) {
    ui.notifications?.warn(game.i18n.localize("KNUCKLES.warn.gmOnly"));
    return null;
  }
  instance ??= new DieBuilder();
  instance.render({ force: true });
  return instance;
}

/** Re-render the builder if it is open (the table's dice changed under it). */
export function refreshDieBuilder() {
  if (instance?.rendered) instance.render();
}
