import { TEMPLATES, MODULE_ID } from "../constants.mjs";
import { applyAppearance } from "../presentation/theme.mjs";
import { evenSplit, coinValue, coinsFromValue, COIN_KEYS } from "../core/stakes.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Open the stakes dialog for a shortfall context. Resolves to a resolutions map
 *  ({ participantId: {mode, borrow:[{uuid,coins}]} }) or null if the GM cancels. */
export function openStakesDialog(context) {
  return new Promise((resolve) => { new StakesDialog(context, resolve).render({ force: true }); });
}

/**
 * GM-only window (opened from Start when at least one participant can't cover their bet):
 * resolve each shortfall by minting the coins or borrowing them from party members. The
 * affordable part of every bet is always deducted separately — this only covers the gap.
 */
export class StakesDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(context, resolve) {
    super();
    this._resolve = resolve;
    this._settled = false;
    this.payerNames = context.payerNames ?? [];
    // Build mutable per-shortfall rows with sensible defaults (pc → borrow even-split, else mint).
    this.rows = (context.shortfalls ?? []).map((sf) => {
      const lenders = (sf.lenders ?? []).map((l) => ({ ...l, checked: false, coins: emptyBag() }));
      const row = { id: sf.id, name: sf.name, kind: sf.kind, value: sf.value, coins: sf.coins, mode: "mint", editing: false, lenders };
      if (sf.kind === "pc" && lenders.some((l) => l.cap > 0)) {
        row.mode = "borrow";
        for (const l of lenders) l.checked = l.cap > 0;
        splitEvenly(row);
        if (!fullyAllocated(row)) row.mode = "mint"; // party can't cover → mint by default
      }
      return row;
    });
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-stakes`,
    classes: ["knuckles-game"],
    window: { title: "KNUCKLES.stakes.title", icon: "fa-solid fa-coins" },
    position: { width: 560, height: "auto" },
    actions: {
      setMode: StakesDialog._onSetMode,
      toggleLender: StakesDialog._onToggleLender,
      editAmounts: StakesDialog._onEditAmounts,
      mintAll: StakesDialog._onMintAll,
      confirm: StakesDialog._onConfirm,
      cancel: StakesDialog._onCancel,
    },
  };

  static PARTS = { stakes: { template: TEMPLATES.STAKES } };

  async _prepareContext() {
    const rows = this.rows.map((row) => ({
      id: row.id,
      name: row.name,
      shortCoins: row.coins,
      isMint: row.mode === "mint",
      isBorrow: row.mode === "borrow",
      editing: row.editing,
      coverable: sumCaps(row) >= row.value,
      allocated: fullyAllocated(row),
      remainingCoins: coinsFromValue(Math.max(0, row.value - allocatedValue(row))),
      lenders: row.lenders.map((l) => ({
        uuid: l.uuid,
        name: l.name,
        canLend: l.cap > 0,
        checked: l.checked,
        giveCoins: l.coins,
        capCoins: coinsFromValue(l.cap),
        coinFields: COIN_KEYS.map((k) => ({ key: k, value: l.coins[k] ?? 0 })),
      })),
    }));
    return {
      payerNames: this.payerNames.length ? this.payerNames.join(", ") : null,
      rows,
      canConfirm: this.rows.every((r) => r.mode === "mint" || fullyAllocated(r)),
    };
  }

  _onRender() {
    applyAppearance(this.element);
    // Per-lender coin inputs (edit mode): commit on change, then re-render to refresh totals.
    for (const inp of this.element.querySelectorAll("input[data-lender][data-coin]")) {
      inp.addEventListener("change", (ev) => {
        const { rowId, lender, coin } = ev.target.dataset;
        const row = this.rows.find((r) => r.id === rowId);
        const l = row?.lenders.find((x) => x.uuid === lender);
        if (!l) return;
        const v = Math.max(0, Math.trunc(Number(ev.target.value) || 0));
        l.coins[coin] = v;
        if (coinValue(l.coins) > l.cap) l.coins = clampBagToValue(l.coins, l.cap); // never exceed the wallet
        l.checked = coinValue(l.coins) > 0;
        this.render();
      });
    }
  }

  static _onSetMode(event, target) {
    const row = this.rows.find((r) => r.id === target.dataset.rowId);
    if (!row) return;
    row.mode = target.dataset.mode;
    row.editing = false;
    if (row.mode === "borrow") { for (const l of row.lenders) l.checked = l.cap > 0; splitEvenly(row); }
    this.render();
  }

  static _onToggleLender(event, target) {
    const row = this.rows.find((r) => r.id === target.dataset.rowId);
    const l = row?.lenders.find((x) => x.uuid === target.dataset.lender);
    if (!l || l.cap <= 0) return;
    l.checked = !l.checked;
    splitEvenly(row); // re-balance the even split across the new checked set
    this.render();
  }

  static _onEditAmounts(event, target) {
    const row = this.rows.find((r) => r.id === target.dataset.rowId);
    if (row) { row.editing = !row.editing; this.render(); }
  }

  static _onMintAll() {
    for (const row of this.rows) { row.mode = "mint"; row.editing = false; }
    this.render();
  }

  static _onConfirm() {
    if (!this.rows.every((r) => r.mode === "mint" || fullyAllocated(r))) return;
    const resolutions = {};
    for (const row of this.rows) {
      resolutions[row.id] = row.mode === "borrow"
        ? { mode: "borrow", borrow: row.lenders.filter((l) => l.checked && coinValue(l.coins) > 0).map((l) => ({ uuid: l.uuid, coins: { ...l.coins } })) }
        : { mode: "mint" };
    }
    this._settle(resolutions);
  }

  static _onCancel() { this._settle(null); }

  _settle(value) {
    if (this._settled) return;
    this._settled = true;
    this._resolve?.(value);
    this.close();
  }

  _onClose(options) {
    this._settle(null); // closing the window = cancel (no game started)
    return super._onClose?.(options);
  }
}

// --- pure row helpers ---------------------------------------------------------
const emptyBag = () => ({ sun: 0, gold: 0, silver: 0, copper: 0 });
const sumCaps = (row) => row.lenders.reduce((s, l) => s + l.cap, 0);
const allocatedValue = (row) => row.lenders.filter((l) => l.checked).reduce((s, l) => s + coinValue(l.coins), 0);
const fullyAllocated = (row) => allocatedValue(row) === row.value;

/** Distribute the shortfall evenly (wallet-capped) across the row's checked lenders. */
function splitEvenly(row) {
  const checked = row.lenders.filter((l) => l.checked && l.cap > 0);
  const split = evenSplit(row.value, checked.map((l) => ({ id: l.uuid, cap: l.cap })));
  for (const l of row.lenders) l.coins = coinsFromValue(split.get(l.uuid) ?? 0);
}

/** Trim a coin bag down to at most `cap` copper, largest denominations first. */
function clampBagToValue(bag, cap) {
  return coinsFromValue(Math.min(coinValue(bag), cap));
}
