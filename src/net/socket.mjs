import { MODULE_ID, SOCKET } from "../constants.mjs";
import { loadState } from "../foundry/state-store.mjs";
import { dispatchAsGM } from "./commands.mjs";

let socket = null;

/** Open the dice picker during setup, otherwise the board (state-aware). */
async function openForState() {
  const state = loadState();
  if (state?.status === "choosing") (await import("../apps/dice-picker.mjs")).openDicePicker();
  else (await import("../apps/board-app.mjs")).openBoard();
}

/** Register the socketlib bus (call on the socketlib.ready hook). */
export function setupSocket() {
  if (!globalThis.socketlib) {
    console.error("knuckles-game | socketlib is required but was not found");
    return;
  }
  socket = socketlib.registerModule(MODULE_ID);
  // socketlib forwards the caller's args verbatim and does NOT inject the authenticated
  // sender, so the passed userId is forgeable. We therefore mark every SOCKET-originated
  // dispatch as NOT local: GM authority requires a LOCAL (direct) call, which only a GM's
  // own client makes — a player can never reach the local path. (See dispatch() below.)
  socket.register(SOCKET.DISPATCH, (intent, userId) => dispatchAsGM(intent, userId, false));
  socket.register(SOCKET.OPEN, openForState);
}

/**
 * Send a player intent to the authoritative GM. If we are the GM, apply directly.
 * The resulting state write propagates to all clients via the setting onChange.
 */
export async function dispatch(intent) {
  if (game.user.isGM) return dispatchAsGM(intent, game.user.id, true); // local GM call → GM-authoritative
  if (!socket) throw new Error("socketlib not ready");
  return socket.executeAsGM(SOCKET.DISPATCH, intent, game.user.id);
}

/** Open the right window on every connected client (dice picker or board). */
export function broadcastOpen() {
  if (socket) socket.executeForEveryone(SOCKET.OPEN);
  else openForState();
}
