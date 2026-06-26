import { hasDiceSoNice } from "./platform.mjs";

/**
 * Play the 3D dice-throw animation on every client (Dice So Nice), if installed.
 * Resolves when the animation finishes; resolves immediately when DSN is absent,
 * so the rest of the flow is identical with or without it.
 */
export async function animateRoll(roll) {
  if (!roll || !hasDiceSoNice()) return;
  try {
    await game.dice3d.showForRoll(roll, game.user, true);
  } catch (err) {
    console.warn("knuckles-game | Dice So Nice animation failed", err);
  }
}
