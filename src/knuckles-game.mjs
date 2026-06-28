/**
 * Knuckles Game — entry point.
 * Wires Foundry hooks to the module's layers; holds no game logic itself.
 */

import { MODULE_ID, TEMPLATES } from "./constants.mjs";
import { registerSettings } from "./foundry/settings.mjs";
import { registerControls, ensureLauncherMacro } from "./foundry/controls.mjs";
import { setupSocket, dispatch } from "./net/socket.mjs";
import { openBoard, refreshBoard } from "./apps/board-app.mjs";
import { openSetup } from "./apps/setup-app.mjs";
import { openDicePicker, refreshDicePicker } from "./apps/dice-picker.mjs";
import { loadState, clearState } from "./foundry/state-store.mjs";
import { loadDiceCatalog } from "./foundry/dice-data.mjs";
import { loadThemes, preloadTheme, registerTheme, activeTheme, activeLanguage } from "./foundry/themes.mjs";
import { stampDie, restampWorldDice, restampCompendium } from "./foundry/dice-items.mjs";

/** Launch handler for the icon / macro / public API — state-aware. */
function open() {
  const state = loadState();
  if (state?.status === "choosing") return openDicePicker();
  if (state?.status === "playing" || state?.status === "finished") return openBoard();
  if (game.user.isGM) return openSetup();
  return openBoard(); // no active game → the board shows its "no game" message
}

/**
 * Dev/verification helper (console): roll six dice weighted by `weights`, log the
 * resulting distribution, and optionally animate the last throw via Dice So Nice.
 * Example: KnucklesGame.testWeightedRoll([10,1,1,1,1,1], 2000, false)
 * This only rolls within this module — it does not affect any other dice.
 */
async function testWeightedRoll(weights = [10, 1, 1, 1, 1, 1], n = 1, animate = true) {
  const { rollValues } = await import("./foundry/dice-roller.mjs");
  const { animateRoll } = await import("./foundry/dice-so-nice.mjs");
  const counts = [0, 0, 0, 0, 0, 0];
  let lastRoll = null;
  for (let k = 0; k < n; k += 1) {
    const specs = Array.from({ length: 6 }, () => weights);
    const { values, roll } = await rollValues(6, specs);
    for (const v of values) counts[v - 1] += 1;
    lastRoll = roll;
  }
  if (animate && lastRoll) await animateRoll(lastRoll);
  const totalDice = n * 6;
  const dist = counts.map((c, i) => `${i + 1}=${c} (${((100 * c) / totalDice).toFixed(1)}%)`).join("  ");
  console.log(`knuckles-game | weighted test | weights [${weights}] over ${totalDice} dice → ${dist}`);
  return { counts, weights, totalDice };
}

/** Load the bundled dice mechanics + themes, then preload the active language. */
async function loadContent() {
  await loadDiceCatalog();
  await loadThemes();
  await preloadTheme(activeTheme(), activeLanguage());
}

/** Theme/language changed: load the new language file, refresh open windows, and (GM)
 *  re-stamp the world's dice items so their shop-sheet text follows the new theme. */
function onThemeChanged() {
  preloadTheme(activeTheme(), activeLanguage()).then(() => {
    refreshDicePicker(true); // a theme/language change invalidates every rendered label
    refreshBoard(true);
    if (game.user.isGM) {
      restampWorldDice().catch((err) => console.error("knuckles-game | restampWorldDice", err));
      restampCompendium().catch((err) => console.error("knuckles-game | restampCompendium", err));
    }
  });
}

Hooks.once("init", () => {
  Handlebars.registerHelper("kgEq", (a, b) => a === b);
  Handlebars.registerHelper("kgRange", (n) => Array.from({ length: Number(n) || 0 }, (_, i) => i));

  registerSettings({
    onStateChanged: () => { refreshDicePicker(); refreshBoard(); },
    onAppearanceChanged: () => { refreshDicePicker(true); refreshBoard(true); },
    onThemeChanged,
  });

  registerControls(open);

  const mod = game.modules.get(MODULE_ID);
  mod.api = { open, openSetup, openBoard, dispatch, getState: loadState, testWeightedRoll, registerTheme };
  globalThis.KnucklesGame = mod.api;

  console.log("knuckles-game | initialised");
});

Hooks.once("setup", async () => {
  await foundry.applications.handlebars.loadTemplates([TEMPLATES.BOARD, TEMPLATES.SETUP, TEMPLATES.DICE, TEMPLATES.THEME_LANG]);
  await loadContent();
});

Hooks.once("socketlib.ready", () => setupSocket());

Hooks.once("ready", async () => {
  if (game.user.isGM) {
    await ensureLauncherMacro();
    // Start each session fresh: a previous game is not resumed or saved.
    if (loadState()) await clearState();
    // A new die (granted, bought, dragged) is named in the table's theme + language.
    Hooks.on("createItem", (item) => stampDie(item).catch((err) => console.error("knuckles-game | stampDie", err)));
    // Localize the bundled dice compendium to the table's theme + language (it ships English).
    restampCompendium().catch((err) => console.error("knuckles-game | restampCompendium", err));
  }
  // The board stays hidden on load — it opens only via the launch icon / macro.
});
