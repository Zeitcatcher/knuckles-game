import { TEMPLATES, MODULE_ID, SETTINGS, DEFAULTS } from "../constants.mjs";
import { dispatch, broadcastOpen } from "../net/socket.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let instance = null;

const emptyBet = () => ({ sun: 0, gold: 0, silver: 0, copper: 0 });
const freshPlayers = () => [
  { id: "p1", name: "", actorUuid: null, bet: emptyBet() },
  { id: "p2", name: "", actorUuid: null, bet: emptyBet() },
];
const toInt = (v) => Math.max(0, Math.floor(Number(v) || 0));

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
    for (const combo of this.element.querySelectorAll("[data-combo]")) {
      const input = combo.querySelector("input[name='name']");
      const hidden = combo.querySelector("input[name='actorUuid']");
      const list = combo.querySelector(".kg-combo-list");
      const items = [...combo.querySelectorAll(".kg-combo-item")];

      const refresh = () => {
        const q = input.value.trim().toLowerCase();
        let shown = 0;
        for (const it of items) {
          const match = it.dataset.name.toLowerCase().includes(q);
          it.hidden = !match;
          if (match) shown += 1;
        }
        list.hidden = shown === 0;
      };

      input.addEventListener("focus", refresh);
      input.addEventListener("input", () => { hidden.value = ""; refresh(); });
      input.addEventListener("blur", () => setTimeout(() => { list.hidden = true; }, 150));

      for (const it of items) {
        it.addEventListener("mousedown", (ev) => {
          ev.preventDefault(); // select before the input's blur fires
          input.value = it.dataset.name;
          hidden.value = it.dataset.uuid;
          list.hidden = true;
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
    this.players.push({ id: `p${this.players.length + 1}`, name: "", actorUuid: null, bet: emptyBet() });
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
  // Always open a fresh setup — never remember the previous player selection.
  instance.players = freshPlayers();
  instance.render({ force: true });
  return instance;
}
