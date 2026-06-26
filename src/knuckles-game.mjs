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
import { loadState } from "./foundry/state-store.mjs";

/** Launch handler for the icon / macro / public API — state-aware. */
function open() {
  const state = loadState();
  if (state?.status === "playing") return openBoard();
  if (game.user.isGM) return openSetup();
  return openBoard(); // no active game → the board shows its "no game" message
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
  mod.api = { open, openSetup, openBoard, dispatch, getState: loadState };
  globalThis.KnucklesGame = mod.api;

  console.log("knuckles-game | initialised");
});

Hooks.once("setup", async () => {
  await foundry.applications.handlebars.loadTemplates([TEMPLATES.BOARD, TEMPLATES.SETUP]);
});

Hooks.once("socketlib.ready", () => setupSocket());

Hooks.once("ready", async () => {
  if (game.user.isGM) await ensureLauncherMacro();
  // The board stays hidden on load — it opens only via the launch icon / macro.
});
