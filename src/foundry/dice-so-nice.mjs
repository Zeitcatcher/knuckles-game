import { hasDiceSoNice } from "./platform.mjs";

/**
 * Play the 3D dice-throw animation on every client (Dice So Nice), if installed.
 * `user` is whom the throw is attributed to — DSN shows THAT user's dice appearance —
 * defaulting to the local user (the GM, who runs the roll). Resolves when the animation
 * finishes, or immediately when DSN is absent, so the flow is identical either way.
 */
export async function animateRoll(roll, user) {
  if (!roll || !hasDiceSoNice()) return;
  try {
    await game.dice3d.showForRoll(roll, user ?? game.user, true);
  } catch (err) {
    console.warn("knuckles-game | Dice So Nice animation failed", err);
  }
}
