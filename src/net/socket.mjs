import { MODULE_ID, SOCKET } from "../constants.mjs";
import { dispatchAsGM } from "./commands.mjs";

let socket = null;

/** Register the socketlib bus (call on the socketlib.ready hook). */
export function setupSocket() {
  if (!globalThis.socketlib) {
    console.error("knuckles-game | socketlib is required but was not found");
    return;
  }
  socket = socketlib.registerModule(MODULE_ID);
  socket.register(SOCKET.DISPATCH, dispatchAsGM);
}

/**
 * Send a player intent to the authoritative GM. If we are the GM, apply directly.
 * The resulting state write propagates to all clients via the setting onChange.
 */
export async function dispatch(intent) {
  if (game.user.isGM) return dispatchAsGM(intent, game.user.id);
  if (!socket) throw new Error("socketlib not ready");
  return socket.executeAsGM(SOCKET.DISPATCH, intent, game.user.id);
}
