/**
 * Render a coin amount as number + coin-icon, in one line. Used by the board pot, the
 * setup bet row, and the stakes dialog so money looks the same everywhere. The icon is a
 * metal-colored disc (works in any system); on pf2e the system's coin art layers on top
 * (see styles/coins.css). No letter abbreviations.
 */

const KEYS = ["sun", "gold", "silver", "copper"];

/** HTML for a coin bag. `all` shows every denomination (incl. zeros) — used for the pot. */
export function coinsMarkup(coins, { all = false } = {}) {
  const parts = [];
  for (const k of KEYS) {
    const n = Math.max(0, Math.trunc(Number(coins?.[k]) || 0));
    if (n === 0 && !all) continue;
    const label = game.i18n?.localize?.(`KNUCKLES.coin.${k}`) ?? k;
    parts.push(
      `<span class="kg-c"><span class="kg-cn">${n}</span>` +
      `<span class="kg-coin kg-coin-${k}" role="img" aria-label="${label}" title="${label}"></span></span>`,
    );
  }
  if (!parts.length) parts.push(`<span class="kg-c"><span class="kg-cn">0</span></span>`);
  return `<span class="kg-amt">${parts.join("")}</span>`;
}
