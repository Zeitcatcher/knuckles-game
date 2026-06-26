import { MODULE_ID, SETTINGS } from "../constants.mjs";

/** The single source of truth lives in a world setting (GM-authoritative). */
export const loadState = () => game.settings.get(MODULE_ID, SETTINGS.GAME_STATE) ?? null;

export const saveState = (state) => game.settings.set(MODULE_ID, SETTINGS.GAME_STATE, state);

export const clearState = () => game.settings.set(MODULE_ID, SETTINGS.GAME_STATE, null);
