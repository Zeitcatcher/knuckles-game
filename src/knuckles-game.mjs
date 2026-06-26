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

Hooks.once("init", () => {
  Handlebars.registerHelper("kgEq", (a, b) => a === b);
  Handlebars.registerHelper("kgRange", (n) => Array.from({ length: Number(n) || 0 }, (_, i) => i));

  registerSettings({
    onStateChanged: (state) => refreshBoard(state),
    onAppearanceChanged: () => refreshBoard(),
  });

  registerControls(() => (game.user.isGM ? openSetup() : openBoard()));

  const mod = game.modules.get(MODULE_ID);
  mod.api = { openSetup, openBoard, dispatch, getState: loadState };
  globalThis.KnucklesGame = mod.api;

  console.log("knuckles-game | initialised");
});

Hooks.once("setup", async () => {
  await foundry.applications.handlebars.loadTemplates([TEMPLATES.BOARD, TEMPLATES.SETUP]);
});

Hooks.once("socketlib.ready", () => setupSocket());

Hooks.once("ready", async () => {
  if (game.user.isGM) await ensureLauncherMacro();
  const state = loadState();
  if (state?.status === "playing") openBoard();
});
