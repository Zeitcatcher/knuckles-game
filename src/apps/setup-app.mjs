import { TEMPLATES, MODULE_ID, SETTINGS, DEFAULTS } from "../constants.mjs";
import { dispatch, broadcastOpen } from "../net/socket.mjs";
import { applyAppearance } from "../presentation/theme.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let instance = null;

const emptyBet = () => ({ sun: 0, gold: 0, silver: 0, copper: 0 });
const freshPlayers = () => [
  { id: "p1", name: "", actorUuid: null, tokenUuid: null, bet: emptyBet() },
  { id: "p2", name: "", actorUuid: null, tokenUuid: null, bet: emptyBet() },
];
const toInt = (v) => Math.max(0, Math.floor(Number(v) || 0));

/** A participant row bound to a canvas token: dice read from / write to THAT token's
 *  inventory. An unlinked token resolves to its world actor for the uuid; a deleted source
 *  actor leaves actorUuid null (still bound to the token). `index` sets the row id. */
function rowFromToken(t, index) {
  const worldActor = t.actor?.isToken ? game.actors.get(t.document.actorId) : t.actor;
  return {
    id: `p${index + 1}`,
    name: t.name,
    actorUuid: worldActor?.uuid ?? t.actor?.uuid ?? null,
    tokenUuid: t.document.uuid,
    bet: emptyBet(),
  };
}

/** GM-only new-game window: add players, link a character, set bets and the target. */
export class SetupApp extends HandlebarsApplicationMixin(ApplicationV2) {
  players = freshPlayers();

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-setup`,
    tag: "form",
    classes: ["knuckles-game"],
    window: { title: "KNUCKLES.setup.title", icon: "fa-solid fa-dice-d6" },
    position: { width: 600, height: "auto" },
    form: { handler: SetupApp._onSubmit, closeOnSubmit: true },
    actions: {
      addPlayer: SetupApp._onAddPlayer,
      addTokens: SetupApp._onAddTokens,
      removePlayer: SetupApp._onRemovePlayer,
    },
  };

  static PARTS = { setup: { template: TEMPLATES.SETUP } };

  async _prepareContext() {
    const actors = game.actors
      .map((a) => ({ uuid: a.uuid, name: a.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      players: this.players,
      actors,
      defaultTarget: game.settings.get(MODULE_ID, SETTINGS.DEFAULT_TARGET) ?? DEFAULTS.TARGET,
    };
  }

  /** Auto-fill a row's name from the character chosen in its dropdown. */
  /** Wire each row's character combobox: type to filter, click to pick. */
  _onRender() {
    applyAppearance(this.element); // match the table's theme/skin like the board + picker
    for (const combo of this.element.querySelectorAll("[data-combo]")) {
      const input = combo.querySelector("input[name='name']");
      const hidden = combo.querySelector("input[name='actorUuid']");
      const tokenHidden = combo.querySelector("input[name='tokenUuid']");
      const list = combo.querySelector(".kg-combo-list");
      const items = [...combo.querySelectorAll(".kg-combo-item")];

      const visibleItems = () => items.filter((it) => !it.hidden);
      const pick = (it) => {
        if (!it) return;
        input.value = it.dataset.name;
        hidden.value = it.dataset.uuid;
        if (tokenHidden) tokenHidden.value = ""; // a world-actor pick clears any token binding
        list.hidden = true;
        input.setAttribute("aria-expanded", "false");
      };

      const refresh = () => {
        const q = input.value.trim().toLowerCase();
        let shown = 0;
        for (const it of items) {
          const match = it.dataset.name.toLowerCase().includes(q);
          it.hidden = !match;
          if (match) shown += 1;
        }
        list.hidden = shown === 0;
        input.setAttribute("aria-expanded", String(shown > 0));
      };

      input.addEventListener("focus", refresh);
      input.addEventListener("input", () => { hidden.value = ""; refresh(); });
      input.addEventListener("blur", () => setTimeout(() => { list.hidden = true; input.setAttribute("aria-expanded", "false"); }, 150));
      // Keyboard: Enter picks the single/first visible match so the combobox is usable
      // without a mouse; Escape closes the list.
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { const vis = visibleItems(); if (vis.length) { ev.preventDefault(); pick(vis[0]); } }
        else if (ev.key === "Escape") { list.hidden = true; input.setAttribute("aria-expanded", "false"); }
      });

      for (const it of items) {
        it.addEventListener("mousedown", (ev) => {
          ev.preventDefault(); // select before the input's blur fires
          pick(it);
        });
      }
    }
  }

  _syncFromForm() {
    const blocks = this.element.querySelectorAll("[data-player-block]");
    this.players = [...blocks].map((b, i) => ({
      id: `p${i + 1}`,
      name: b.querySelector("[name='name']")?.value?.trim() || "",
      actorUuid: b.querySelector("[name='actorUuid']")?.value || null,
      tokenUuid: b.querySelector("[name='tokenUuid']")?.value || null,
      bet: {
        sun: toInt(b.querySelector("[name='sun']")?.value),
        gold: toInt(b.querySelector("[name='gold']")?.value),
        silver: toInt(b.querySelector("[name='silver']")?.value),
        copper: toInt(b.querySelector("[name='copper']")?.value),
      },
    }));
  }

  static _onAddPlayer() {
    this._syncFromForm();
    this.players.push({ id: `p${this.players.length + 1}`, name: "", actorUuid: null, tokenUuid: null, bet: emptyBet() });
    this.render();
  }

  /** Add a participant row per selected canvas token, bound to that token (so its
   *  inventory is the one physical dice are read from and added to). */
  static _onAddTokens() {
    this._syncFromForm();
    const tokens = canvas.tokens?.controlled ?? [];
    if (!tokens.length) {
      ui.notifications.warn(game.i18n.localize("KNUCKLES.warn.noTokens"));
      return;
    }
    for (const t of tokens) this.players.push(rowFromToken(t, this.players.length));
    this.render();
  }

  static _onRemovePlayer(event, target) {
    this._syncFromForm();
    this.players.splice(Number(target.dataset.index), 1);
    this.render();
  }

  static async _onSubmit(event, form, formData) {
    this._syncFromForm();
    if (this.players.length < 2) {
      ui.notifications.warn(game.i18n.localize("KNUCKLES.warn.needTwo"));
      throw new Error("need at least two players");
    }
    const targetScore = Number(formData.object.targetScore) || DEFAULTS.TARGET;
    const npcHeroPool = game.settings.get(MODULE_ID, SETTINGS.NPC_HERO_POOL) ?? 0;
    await dispatch({ type: "startGame", config: { players: this.players, targetScore, npcHeroPool } });
    // Open the dice-choosing window for everyone at the table.
    broadcastOpen();
  }
}

export function openSetup() {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("KNUCKLES.warn.gmOnly"));
    return null;
  }
  instance ??= new SetupApp();
  // Always open a fresh setup. If tokens are selected on the canvas, seed the roster from
  // them (each bound to its token); otherwise two empty rows, exactly as before. Seeding
  // happens on a fresh open only — to add more mid-setup, use "Add selected tokens".
  const tokens = canvas.tokens?.controlled ?? [];
  instance.players = tokens.length ? tokens.map((t, i) => rowFromToken(t, i)) : freshPlayers();
  instance.render({ force: true });
  return instance;
}
