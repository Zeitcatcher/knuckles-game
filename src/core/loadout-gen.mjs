/**
 * Quick-hand generator for GM-driven opponents. Pure: no Foundry imports, and the RNG is
 * injected, so a hand is reproducible in tests.
 *
 * A price CLASS is a PURSE, not a per-die ceiling: it sets how much coin the whole hand may
 * spend (per-die budget x how many dice were asked for). The generator then goes shopping.
 * Each pick is drawn from everything the REMAINING purse can still afford, so a hand that
 * opens with two monsters genuinely runs out of money and finishes on cheap tricks. That
 * descending tail is the point: an elite sharper's hand should look like a real purchase,
 * not like six identical top-shelf dice.
 *
 * Nothing is ever guaranteed a slot. Every pick is a weighted draw, so the strongest dice
 * are likely rather than certain, and the cheapest junk is always reachable.
 */

/** The honest, fair die every unfilled slot falls back to (catalog id). */
export const HONEST_DIE = "01";

const SLOTS = 6;

/** The faces a matched set can be built around (the two that score on their own). */
const TARGET_FACES = [1, 5];

/** How sharply a matched hand prefers high-synergy dice: weight = score^SHARPNESS. */
const SHARPNESS = 2;

/** A die must beat a fair die's share on the target face to belong in a matched hand. */
const FAIR_SHARE = 1 / 6;

/** Per-die budget in copper. Multiplied by the count knob to get the hand's purse. */
export const CLASS_PURSE = Object.freeze({
  cheap: 400,      // 4 gp each: tricks and junk, with room for one small splurge
  solid: 1500,     // 15 gp each
  expensive: 6000, // 60 gp each: the whole top shelf, but no monsters
  elite: 40000,    // 400 gp each: at six dice, both monsters and a tail
});

/** Class ids in ascending order of power, for menus. */
export const CLASS_IDS = Object.freeze(["cheap", "solid", "expensive", "elite"]);

const purseFor = (priceClass) => CLASS_PURSE[priceClass] ?? CLASS_PURSE.cheap;
const clampCount = (n) => Math.min(SLOTS, Math.max(0, Math.trunc(Number(n) || 0)));
const priceOf = (entry) => Math.max(0, Number(entry?.price) || 0);

/** The cheapest class whose full six-die purse could afford this die. Drives the price-class
 *  chip in the die builder, so a GM pricing a die can see where it will be dealt. */
export function classForPrice(cp) {
  const price = Math.max(0, Number(cp) || 0);
  return CLASS_IDS.find((c) => price <= CLASS_PURSE[c] * SLOTS) ?? CLASS_IDS[CLASS_IDS.length - 1];
}

/**
 * How strongly a die pulls toward `face`, as a share of its rolls.
 *
 * A joker's wild face counts as whatever the hand needs, so it adds its own share on top —
 * except when the wild IS the target face, where it simply becomes that face and earns no
 * bonus. That falls out of the mechanics rather than a hand-tuned constant, which is why a
 * joker is a strong candidate for a 5-hand and an ordinary one for a 1-hand.
 */
export function synergy(entry, face) {
  const w = Array.isArray(entry?.weights) ? entry.weights : [];
  const total = w.reduce((a, b) => a + (Number(b) || 0), 0);
  if (total <= 0) return 0;
  const share = (f) => (Number(w[f - 1]) || 0) / total;
  if (!entry?.joker) return share(face);
  const wildFace = Number(entry.jokerFace) >= 1 && Number(entry.jokerFace) <= 6 ? Number(entry.jokerFace) : 1;
  return wildFace === face ? share(face) : share(face) + share(wildFace);
}

/**
 * Everything a hand may shop from: the whole catalog minus the honest die (which is what an
 * unfilled slot already holds). A matched hand additionally keeps only dice that beat a fair
 * die on the target face, so "matched" never pads itself with dice pulling the other way.
 */
function candidatesFor(entries, mode, face) {
  const pool = (entries ?? []).filter((e) => e?.id && e.id !== HONEST_DIE);
  if (mode !== "matched") return pool.map((e) => ({ id: e.id, price: priceOf(e), weight: Math.sqrt(priceOf(e)) + 1 }));
  return pool
    .map((e) => ({ id: e.id, price: priceOf(e), score: synergy(e, face) }))
    .filter((c) => c.score > FAIR_SHARE)
    .map((c) => ({ id: c.id, price: c.price, weight: c.score ** SHARPNESS }));
}

/** Draw one candidate by weight, using the injected rng. Returns its index. */
function drawIndex(candidates, rng) {
  const total = candidates.reduce((a, c) => a + c.weight, 0);
  if (total <= 0) return Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  let r = rng() * total;
  let i = 0;
  while (i < candidates.length - 1 && (r -= candidates[i].weight) >= 0) i += 1;
  return i;
}

/**
 * Spend the purse over `count` slots. Before each pick the cheapest remaining dice are held
 * back for the slots still to come, so an early splurge cannot leave later slots unfillable:
 * the hand keeps its full size and simply gets cheaper as the money runs out.
 */
function shop(candidates, purse, count, rng) {
  const picked = [];
  let left = purse;
  while (picked.length < count && candidates.length) {
    const slotsAfter = count - picked.length - 1;
    const byPrice = [...candidates].sort((a, b) => a.price - b.price);
    const reserve = byPrice.slice(0, slotsAfter).reduce((a, c) => a + c.price, 0);
    const cap = left - reserve;
    const affordable = candidates.filter((c) => c.price <= cap);
    if (!affordable.length) break;
    const chosen = affordable[drawIndex(affordable, rng)];
    picked.push(chosen.id);
    left -= chosen.price;
    candidates.splice(candidates.indexOf(chosen), 1);
  }
  return picked;
}

/**
 * Build a six-slot loadout.
 * @param {object} o
 * @param {{id:string, weights:number[], joker:boolean, jokerFace?:number, price:number}[]} o.entries
 * @param {number} o.count how many loaded dice to deal (0..6); the rest stay honest
 * @param {string} o.priceClass one of CLASS_IDS
 * @param {"random"|"matched"} o.mode
 * @param {() => number} o.rng
 * @returns {string[]} exactly six catalog ids
 */
export function generateLoadout({ entries, count = 0, priceClass = "cheap", mode = "random", rng = Math.random } = {}) {
  const slots = Array.from({ length: SLOTS }, () => HONEST_DIE);
  const n = clampCount(count);
  if (n === 0) return slots;
  // The face is drawn first so the same rng stream still varies the hand's direction.
  const face = TARGET_FACES[Math.floor(rng() * TARGET_FACES.length)] ?? 1;
  const picked = shop(candidatesFor(entries, mode, face), purseFor(priceClass) * n, n, rng);
  picked.forEach((id, i) => { slots[i] = id; });
  return slots;
}
