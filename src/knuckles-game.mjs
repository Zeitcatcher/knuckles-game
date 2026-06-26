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
import { loadState, clearState } from "./foundry/state-store.mjs";

/** Launch handler for the icon / macro / public API — state-aware. */
function open() {
  const state = loadState();
  if (state?.status === "playing") return openBoard();
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

Hooks.once("init", () => {
  Handlebars.registerHelper("kgEq", (a, b) => a === b);
  Handlebars.registerHelper("kgRange", (n) => Array.from({ length: Number(n) || 0 }, (_, i) => i));

  registerSettings({
    onStateChanged: () => refreshBoard(),
    onAppearanceChanged: () => refreshBoard(),
  });

  registerControls(open);

  const mod = game.modules.get(MODULE_ID);
  mod.api = { open, openSetup, openBoard, dispatch, getState: loadState, testWeightedRoll };
  globalThis.KnucklesGame = mod.api;

  console.log("knuckles-game | initialised");
});

Hooks.once("setup", async () => {
  await foundry.applications.handlebars.loadTemplates([TEMPLATES.BOARD, TEMPLATES.SETUP]);
});

Hooks.once("socketlib.ready", () => setupSocket());

Hooks.once("ready", async () => {
  if (game.user.isGM) {
    await ensureLauncherMacro();
    // Start each session fresh: a previous game is not resumed or saved.
    if (loadState()) await clearState();
  }
  // The board stays hidden on load — it opens only via the launch icon / macro.
});
