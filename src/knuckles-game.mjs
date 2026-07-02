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
import { isPrimaryGM } from "./foundry/platform.mjs";
import { coinsMarkup } from "./presentation/coins.mjs";

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

/**
 * A game left over from the previous session (e.g. the GM's browser refreshed mid-game):
 * let the primary GM resume or discard it. The old behaviour wiped it silently. Discard
 * routes through endGame, which also refunds any collected stakes. A finished game is
 * cleared without asking — its pot was already paid out.
 */
async function promptLeftoverGame() {
  const state = loadState();
  if (!state) return;
  if (state.status === "finished") return clearState();
  const resume = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("KNUCKLES.title") },
    content: `<p>${game.i18n.format("KNUCKLES.resume.text", {
      round: (state.round?.index ?? 0) + 1,
      players: state.players?.length ?? 0,
    })}</p><p>${game.i18n.localize("KNUCKLES.resume.hint")}</p>`,
    yes: { label: game.i18n.localize("KNUCKLES.resume.resume"), icon: "fa-solid fa-play", default: true },
    no: { label: game.i18n.localize("KNUCKLES.resume.discard"), icon: "fa-solid fa-trash" },
    modal: true,
    rejectClose: false, // closing the dialog = resume (the safe default)
  });
  if (resume === false) {
    await dispatch({ type: "endGame" }).catch((err) => console.error("knuckles-game | discard leftover game", err));
  }
}

/** Theme/language changed: load the new language file, refresh open windows, and (GM)
 *  re-stamp the world's dice items so their shop-sheet text follows the new theme. */
function onThemeChanged() {
  preloadTheme(activeTheme(), activeLanguage()).then(() => {
    refreshDicePicker(true); // a theme/language change invalidates every rendered label
    refreshBoard(true);
    // Only the PRIMARY GM writes — a co-GM restamping too would race the pack lock.
    if (isPrimaryGM()) {
      restampWorldDice().catch((err) => console.error("knuckles-game | restampWorldDice", err));
      restampCompendium().catch((err) => console.error("knuckles-game | restampCompendium", err));
    }
  });
}

Hooks.once("init", () => {
  Handlebars.registerHelper("kgEq", (a, b) => a === b);
  Handlebars.registerHelper("kgRange", (n) => Array.from({ length: Number(n) || 0 }, (_, i) => i));
  // Render a coin bag as number + coin-icon (all=true shows every denomination, for the pot).
  Handlebars.registerHelper("kgCoins", (coins, options) => new Handlebars.SafeString(coinsMarkup(coins, { all: options?.hash?.all })));

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
  await foundry.applications.handlebars.loadTemplates([TEMPLATES.BOARD, TEMPLATES.SETUP, TEMPLATES.DICE, TEMPLATES.THEME_LANG, TEMPLATES.STAKES]);
  await loadContent();
});

Hooks.once("socketlib.ready", () => setupSocket());

Hooks.once("ready", async () => {
  // PRIMARY GM only: a second GM logging in must not clear a running game, double-register
  // the item stamper, or race the compendium restamp against the primary's pack unlock.
  if (isPrimaryGM()) {
    await ensureLauncherMacro();
    // A new die (granted, bought, dragged) is named in the table's theme + language.
    Hooks.on("createItem", (item) => stampDie(item).catch((err) => console.error("knuckles-game | stampDie", err)));
    // Localize the bundled dice compendium to the table's theme + language (it ships English).
    restampCompendium().catch((err) => console.error("knuckles-game | restampCompendium", err));
    // A game left over from last session: offer resume/discard. Not awaited — the modal
    // must not hold up the stamper above (it fires as soon as the world is ready).
    promptLeftoverGame().catch((err) => console.error("knuckles-game | promptLeftoverGame", err));
  }
  // The board stays hidden on load — it opens only via the launch icon / macro.
});
