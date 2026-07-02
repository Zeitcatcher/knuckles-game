/**
 * Pure stake-collection maths for Knuckles Game. No Foundry imports.
 *
 * Coins use the module's four bet keys (sun/gold/silver/copper → pf2e pp/gp/sp/cp).
 * Everything reduces to a copper VALUE for arithmetic; `coinsFromValue` converts back to
 * a canonical coin breakdown for display and for minting.
 *
 * Escrow model (see net/commands.mjs): a participant's OWN affordable part is deducted
 * from their wallet first; only the remaining SHORTFALL is minted (created from nothing —
 * never deducted, never refunded) or borrowed (deducted from chosen party members). Real
 * deductions are recorded so an unfinished game can refund them exactly; the winner's pot
 * award is minted as before, so a normal game conserves coin and only mints cover inflate.
 */

export const COIN_KEYS = ["sun", "gold", "silver", "copper"];
const COIN_COPPER = { sun: 1000, gold: 100, silver: 10, copper: 1 };

const int = (n) => Math.max(0, Math.trunc(Number(n) || 0));

/** Empty coin bag. */
export function emptyCoins() {
  return { sun: 0, gold: 0, silver: 0, copper: 0 };
}

/** Total value of a coin bag, in copper. */
export function coinValue(coins) {
  let v = 0;
  for (const k of COIN_KEYS) v += int(coins?.[k]) * COIN_COPPER[k];
  return v;
}

/** Canonical greedy breakdown of a copper value into coins (largest denomination first). */
export function coinsFromValue(value) {
  let rem = int(value);
  const out = emptyCoins();
  for (const k of COIN_KEYS) {
    out[k] = Math.floor(rem / COIN_COPPER[k]);
    rem -= out[k] * COIN_COPPER[k];
  }
  return out;
}

/** Sum a list of coin bags into one. */
export function sumCoins(bags) {
  const out = emptyCoins();
  for (const b of bags ?? []) for (const k of COIN_KEYS) out[k] += int(b?.[k]);
  return out;
}

/**
 * Plan a round's stake collection.
 * @param {{id:string, name:string, kind:"pc"|"npc"|"actorless", bet:object, walletValue:number}[]} participants
 *   `walletValue` is the actor's spendable value in copper (ignored for "actorless").
 * @returns {{ payments: {id,value}[], shortfalls: {id,name,kind,value}[], needsDialog: boolean }}
 *   `payments` = the affordable part to deduct from each participant; `shortfalls` = what
 *   is left to mint or borrow. `needsDialog` is true iff any shortfall remains.
 */
export function planStakes(participants) {
  const payments = [];
  const shortfalls = [];
  for (const p of participants ?? []) {
    const bet = coinValue(p.bet);
    if (bet <= 0) continue;
    const wallet = p.kind === "actorless" ? 0 : int(p.walletValue);
    const pay = Math.min(wallet, bet);
    if (pay > 0) payments.push({ id: p.id, value: pay });
    const short = bet - pay;
    if (short > 0) shortfalls.push({ id: p.id, name: p.name, kind: p.kind, value: short });
  }
  return { payments, shortfalls, needsDialog: shortfalls.length > 0 };
}

/** The default lender resolution for a shortfall: which lenders start selected, and the
 *  even (wallet-capped) split among them. `pc` shortfalls borrow by default; `npc` /
 *  `actorless` mint. */
export function defaultResolution(shortfall, lenders, kind) {
  if (kind !== "pc") return { mode: "mint", split: new Map() };
  const usable = (lenders ?? []).filter((l) => int(l.cap) > 0);
  const split = evenSplit(shortfall.value, usable);
  const covered = [...split.values()].reduce((a, b) => a + b, 0) >= shortfall.value;
  return { mode: covered ? "borrow" : "mint", split };
}

/**
 * Split `total` copper across `lenders` ([{id, cap}]) as evenly as possible, never
 * exceeding a lender's cap; the sum is min(total, Σcaps). Water-fills in equal passes,
 * then hands out the final sub-lender remainder one coin at a time (input order), so the
 * distribution is deterministic and stable. Returns Map(id -> value).
 */
export function evenSplit(total, lenders) {
  const pool = (lenders ?? []).map((l) => ({ id: l.id, cap: int(l.cap), got: 0 }));
  let remaining = Math.min(int(total), pool.reduce((s, l) => s + l.cap, 0));
  while (remaining > 0) {
    const room = pool.filter((l) => l.got < l.cap);
    if (!room.length) break;
    const share = Math.floor(remaining / room.length);
    if (share <= 0) {
      for (const l of room) { if (remaining <= 0) break; l.got += 1; remaining -= 1; }
    } else {
      for (const l of room) {
        const give = Math.min(share, l.cap - l.got);
        l.got += give;
        remaining -= give;
      }
    }
  }
  return new Map(pool.map((l) => [l.id, l.got]));
}

/**
 * Validate a borrow resolution: the chosen lenders' allocations must sum to EXACTLY the
 * shortfall value, and none may exceed that lender's spendable cap.
 * @param {number} shortfallValue
 * @param {{value:number, cap:number}[]} allocations
 */
export function borrowValid(shortfallValue, allocations) {
  let sum = 0;
  for (const a of allocations ?? []) {
    const v = Math.trunc(Number(a.value) || 0);
    if (v < 0 || v > int(a.cap)) return false;
    sum += v;
  }
  return sum === int(shortfallValue);
}
