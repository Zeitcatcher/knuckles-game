import { TEMPLATES, MODULE_ID, SETTINGS, DEFAULTS } from "../constants.mjs";
import { dispatch, broadcastOpenBoard } from "../net/socket.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let instance = null;

/** GM-only new-game window: add players, link a character, set the target. */
export class SetupApp extends HandlebarsApplicationMixin(ApplicationV2) {
  // Two empty rows by default — names come from the chosen character, not hard-coded.
  players = [
    { id: "p1", name: "", actorUuid: null },
    { id: "p2", name: "", actorUuid: null },
  ];

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-setup`,
    tag: "form",
    classes: ["knuckles-game"],
    window: { title: "KNUCKLES.setup.title", icon: "fa-solid fa-dice-d6" },
    position: { width: 560, height: "auto" },
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
  _onRender() {
    for (const select of this.element.querySelectorAll("select[name='actorUuid']")) {
      select.addEventListener("change", (ev) => {
        if (!ev.target.value) return;
        const row = ev.target.closest("[data-player-row]");
        const nameInput = row?.querySelector("input[name='name']");
        if (nameInput) nameInput.value = ev.target.selectedOptions[0]?.textContent.trim() ?? "";
      });
    }
  }

  _syncFromForm() {
    const rows = this.element.querySelectorAll("[data-player-row]");
    this.players = [...rows].map((row, i) => ({
      id: `p${i + 1}`,
      name: row.querySelector("[name='name']")?.value?.trim() || "",
      actorUuid: row.querySelector("[name='actorUuid']")?.value || null,
    }));
  }

  static _onAddPlayer() {
    this._syncFromForm();
    this.players.push({ id: `p${this.players.length + 1}`, name: "", actorUuid: null });
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
    // Show the board to everyone at the table once the game starts.
    broadcastOpenBoard();
  }
}

export function openSetup() {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("KNUCKLES.warn.gmOnly"));
    return null;
  }
  instance ??= new SetupApp();
  instance.render({ force: true });
  return instance;
}
