import { MODULE_ID, SETTINGS, DEFAULTS } from "../constants.mjs";
import { ThemeLanguageConfig } from "../apps/theme-language-config.mjs";

/**
 * Register all module settings.
 * @param {object} cb
 * @param {(state:object|null)=>void} cb.onStateChanged  - fired when the synced game state changes
 * @param {()=>void} cb.onAppearanceChanged              - fired when theme / skin / colour changes
 * @param {()=>void} cb.onThemeChanged                   - fired when the dice theme / language changes
 */
export function registerSettings({ onStateChanged, onAppearanceChanged, onThemeChanged }) {
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

  // Dice content theme (GM-set, world-shared) + per-user language. Managed by the
  // submenu below, so these stay out of the inline settings list (config: false).
  reg(SETTINGS.CONTENT_THEME, {
    scope: "world", config: false, type: String, default: "",
    onChange: () => onThemeChanged?.(),
  });
  reg(SETTINGS.LANGUAGE, {
    scope: "client", config: false, type: String, default: "",
    onChange: () => onThemeChanged?.(),
  });

  game.settings.registerMenu(MODULE_ID, "themeLanguage", {
    name: "KNUCKLES.themeLang.menuName",
    label: "KNUCKLES.themeLang.menuLabel",
    hint: "KNUCKLES.themeLang.menuHint",
    icon: "fa-solid fa-language",
    type: ThemeLanguageConfig,
    restricted: false,
  });
}
