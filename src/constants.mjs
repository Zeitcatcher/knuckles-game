/** Shared constants — no magic strings elsewhere in the module. */

export const MODULE_ID = "knuckles-game";

export const SETTINGS = Object.freeze({
  GAME_STATE: "gameState",
  SCHEMA_VERSION: "schemaVersion",
  DEFAULT_TARGET: "defaultTarget",
  NPC_HERO_POOL: "npcHeroPool",
  THEME: "theme",
  DIE_SKIN: "dieSkin",
  COLOR_ACCENT: "colorAccent",
  COLOR_BOARD: "colorBoard",
  COLOR_DIE: "colorDie",
});

export const SOCKET = Object.freeze({ DISPATCH: "dispatch", OPEN_BOARD: "openBoard" });

export const DEFAULTS = Object.freeze({
  TARGET: 2000,
  THEME: "default",
  DIE_SKIN: "pips",
  MAX_HERO_POINTS: 3,
});

export const TEMPLATES = Object.freeze({
  BOARD: `modules/${MODULE_ID}/templates/board.hbs`,
  SETUP: `modules/${MODULE_ID}/templates/setup.hbs`,
});

/** pf2e actor data path for Hero Points. */
export const PF2E_HERO_POINTS = "system.resources.heroPoints.value";
