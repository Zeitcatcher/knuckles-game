/**
 * Quick-hand generator for GM-driven opponents. Pure: no Foundry imports, and the RNG is
 * injected, so a hand is reproducible in tests.
 *
 * A price CLASS is a hard ceiling in copper on every generated die. That is the whole
 * point: a tavern regular can never roll up the 850 gp die, and a tournament rival can be
 * given six of the best on purpose. Slots the GM did not ask to load keep the honest die.
 */

/** The honest, fair die every unfilled slot falls back to (catalog id). */
export const HONEST_DIE = "01";

const SLOTS = 6;

/** A joker completes any combination, so it outranks raw face weight in a matched set. */
const JOKER_SCORE = 0.9;

/** The faces a matched set can be built around (the two that score on their own). */
const TARGET_FACES = [1, 5];

/** Price ceiling per class, in copper. `elite` has none. */
export const CLASS_CAPS = Object.freeze({
  cheap: 500,
  solid: 3000,
  expensive: 10000,
  elite: Number.POSITIVE_INFINITY,
});

/** Class ids in ascending order of power, for menus. */
export const CLASS_IDS = Object.freeze(["cheap", "solid", "expensive", "elite"]);

const capOf = (priceClass) => CLASS_CAPS[priceClass] ?? CLASS_CAPS.cheap;
const clampCount = (n) => Math.min(SLOTS, Math.max(0, Math.trunc(Number(n) || 0)));

/** Loaded dice at or under the class ceiling. The honest die is never generated. */
export function poolFor(entries, priceClass) {
  const cap = capOf(priceClass);
  return (entries ?? []).filter((e) => e?.id && e.id !== HONEST_DIE && (Number(e.price) || 0) <= cap);
}

/** How strongly a die pulls toward `face`; a joker scores high whatever its weights say. */
export function synergy(entry, face) {
  if (entry?.joker) return JOKER_SCORE;
  const w = Array.isArray(entry?.weights) ? entry.weights : [];
  const total = w.reduce((a, b) => a + (Number(b) || 0), 0);
  return total > 0 ? (Number(w[face - 1]) || 0) / total : 0;
}

/** Fisher-Yates over a copy, using the injected rng. */
function shuffled(ids, rng) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** `count` distinct ids drawn uniformly from the class pool. */
function randomPick(pool, count, rng) {
  return shuffled(pool.map((e) => e.id), rng).slice(0, count);
}

/**
 * `count` distinct ids that pull toward one scoring face, so the hand plays together.
 * The face is drawn per call (1 or 5), then dice rank by their share of weight on it;
 * ties break by id, so the same inputs always give the same set.
 */
function matchedPick(pool, count, rng) {
  const face = TARGET_FACES[Math.floor(rng() * TARGET_FACES.length)] ?? 1;
  return pool
    .map((e) => ({ id: e.id, score: synergy(e, face) }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, count)
    .map((x) => x.id);
}

/**
 * Build a six-slot loadout.
 * @param {object} o
 * @param {{id:string, weights:number[], joker:boolean, price:number}[]} o.entries catalog
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
  const pool = poolFor(entries, priceClass);
  // A thin class simply yields fewer loaded dice; the rest stay honest rather than
  // reaching above the ceiling or repeating a die.
  const picked = mode === "matched" ? matchedPick(pool, n, rng) : randomPick(pool, n, rng);
  picked.forEach((id, i) => { slots[i] = id; });
  return slots;
}
