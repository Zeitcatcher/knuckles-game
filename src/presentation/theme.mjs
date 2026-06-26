import { MODULE_ID, SETTINGS, DEFAULTS } from "../constants.mjs";

/**
 * Apply the chosen theme, dice skin, and any colour overrides to the board root.
 * Theme + skin are set as data-attributes (CSS keys off them); colour overrides
 * are written as inline custom properties so they win over the theme defaults.
 */
export function applyAppearance(rootEl) {
  if (!rootEl) return;
  rootEl.dataset.theme = game.settings.get(MODULE_ID, SETTINGS.THEME) || DEFAULTS.THEME;
  rootEl.dataset.dieSkin = game.settings.get(MODULE_ID, SETTINGS.DIE_SKIN) || DEFAULTS.DIE_SKIN;
  applyVar(rootEl, "--kg-accent", SETTINGS.COLOR_ACCENT);
  applyVar(rootEl, "--kg-board-bg", SETTINGS.COLOR_BOARD);
  applyVar(rootEl, "--kg-die-bg", SETTINGS.COLOR_DIE);
}

function applyVar(el, cssProp, settingKey) {
  const value = game.settings.get(MODULE_ID, settingKey);
  if (value) el.style.setProperty(cssProp, value);
  else el.style.removeProperty(cssProp);
}
