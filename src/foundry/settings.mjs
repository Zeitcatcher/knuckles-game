import { MODULE_ID, SETTINGS, DEFAULTS } from "../constants.mjs";

/**
 * Register all module settings.
 * @param {object} cb
 * @param {(state:object|null)=>void} cb.onStateChanged  - fired when the synced game state changes
 * @param {()=>void} cb.onAppearanceChanged              - fired when theme / skin / colour changes
 */
export function registerSettings({ onStateChanged, onAppearanceChanged }) {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, data);

  reg(SETTINGS.GAME_STATE, {
    scope: "world", config: false, type: Object, default: null,
    onChange: (value) => onStateChanged?.(value),
  });
  reg(SETTINGS.SCHEMA_VERSION, { scope: "world", config: false, type: String, default: "0.0.0" });

  reg(SETTINGS.DEFAULT_TARGET, {
    name: "KNUCKLES.settings.defaultTarget.name",
    hint: "KNUCKLES.settings.defaultTarget.hint",
    scope: "world", config: true, type: Number, default: DEFAULTS.TARGET,
  });

  reg(SETTINGS.NPC_HERO_POOL, {
    name: "KNUCKLES.settings.npcHeroPool.name",
    hint: "KNUCKLES.settings.npcHeroPool.hint",
    scope: "world", config: true, type: Number, default: 0,
    range: { min: 0, max: 3, step: 1 },
  });

  reg(SETTINGS.THEME, {
    name: "KNUCKLES.settings.theme.name", hint: "KNUCKLES.settings.theme.hint",
    scope: "client", config: true, type: String, default: DEFAULTS.THEME,
    choices: {
      default: "KNUCKLES.themes.default",
      parchment: "KNUCKLES.themes.parchment",
      "dark-tavern": "KNUCKLES.themes.darkTavern",
    },
    onChange: () => onAppearanceChanged?.(),
  });

  reg(SETTINGS.DIE_SKIN, {
    name: "KNUCKLES.settings.dieSkin.name", hint: "KNUCKLES.settings.dieSkin.hint",
    scope: "client", config: true, type: String, default: DEFAULTS.DIE_SKIN,
    choices: { pips: "KNUCKLES.skins.pips", numerals: "KNUCKLES.skins.numerals" },
    onChange: () => onAppearanceChanged?.(),
  });

  for (const key of [SETTINGS.COLOR_ACCENT, SETTINGS.COLOR_BOARD, SETTINGS.COLOR_DIE]) {
    reg(key, {
      name: `KNUCKLES.settings.${key}.name`, hint: "KNUCKLES.settings.color.hint",
      scope: "client", config: true, type: String, default: "",
      onChange: () => onAppearanceChanged?.(),
    });
  }
}
