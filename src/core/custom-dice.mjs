/**
 * Table-made dice: the GM types a name, an icon and the chance of each face, and the die
 * joins the catalog. PURE — no Foundry imports, so the percent rules are testable on their
 * own.
 *
 * The catalog stores `weights` as relative numbers that happen to be percentages (the honest
 * die is 16.7 six times) and the roller normalises by their sum, so a form value drops
 * straight in as a weight with no conversion.
 *
 * Face entry follows one rule: a typed face is locked at what you typed, and the faces you
 * left empty share whatever is left of the 100. Type 40 on the 1-face and leave the rest
 * blank and the other five read 12 each. That way a die is always complete without making
 * anyone do the arithmetic.
 */

export const FACES = 6;

/** The percentage pool one die is carved out of. */
export const TOTAL = 100;

/** Decimals kept in a face chance. One is enough to split 100 six ways and read cleanly. */
const DECIMALS = 1;

/** Custom ids start with a letter, so they can never collide with the catalog's "01".."37". */
const CUSTOM_RE = /^c[0-9a-z]{4,10}$/;

const round = (n, d = DECIMALS) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/** True for an id minted by makeCustomId. */
export function isCustomId(id) {
  return CUSTOM_RE.test(String(id ?? ""));
}

/**
 * A fresh id not already in `taken`. `rng` is injected so tests are deterministic; the
 * retry loop is bounded, and the fallback appends a counter rather than risking a collision.
 */
export function makeCustomId(taken = [], rng = Math.random) {
  const used = new Set(taken);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const id = `c${Math.floor(rng() * 36 ** 5).toString(36).padStart(5, "0").slice(0, 5)}`;
    if (isCustomId(id) && !used.has(id)) return id;
  }
  let n = 0;
  while (used.has(`c0000${n.toString(36)}`)) n += 1;
  return `c0000${n.toString(36)}`;
}

/** One face input as a number, or null when the field is empty (so it takes a share). */
export function parseFace(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return round(Math.min(n, TOTAL));
}

/** Six face inputs, each a number or null. Short arrays pad with empties. */
export function parseFaces(raws) {
  return Array.from({ length: FACES }, (_, i) => parseFace(raws?.[i]));
}

/**
 * What a set of face inputs resolves to.
 *
 * @returns {{
 *   assigned: number,   sum of the typed faces
 *   remaining: number,  what is left of the 100 (never negative)
 *   emptyCount: number, faces left blank
 *   share: number|null, the ghost value each blank face shows, null when none are blank
 *   weights: number[],  the six resolved chances
 *   complete: boolean,  the six add up to the whole 100
 *   error: string|null  "over" | "short" | null
 * }}
 */
export function resolveFaces(inputs) {
  const faces = parseFaces(inputs);
  const typed = faces.filter((v) => v !== null);
  const assigned = round(typed.reduce((a, b) => a + b, 0), 4);
  const emptyCount = FACES - typed.length;
  const remaining = round(Math.max(0, TOTAL - assigned), 4);
  const share = emptyCount > 0 ? round(remaining / emptyCount, 4) : null;
  const weights = faces.map((v) => (v === null ? share ?? 0 : v));

  // A blank face always soaks up the remainder, so only an all-typed set can come up short.
  // Over 100 is guarded at the input, but a hand-edited setting could still carry it.
  let error = null;
  if (assigned > TOTAL + 1e-9) error = "over";
  else if (emptyCount === 0 && assigned < TOTAL - 1e-9) error = "short";

  return { assigned, remaining, emptyCount, share, weights, complete: error === null, error };
}

/** The largest value a face may take, given what the OTHER five already claim. */
export function faceCeiling(inputs, index) {
  const faces = parseFaces(inputs);
  const others = faces.reduce((sum, v, i) => (i === index || v === null ? sum : sum + v), 0);
  return round(Math.max(0, TOTAL - others), 4);
}

/** Clamp one face against its ceiling, so the six can never claim more than the whole. */
export function clampFace(inputs, index, raw) {
  const value = parseFace(raw);
  if (value === null) return null;
  return Math.min(value, faceCeiling(inputs, index));
}

/**
 * Validate a draft die. Returns the errors as short keys the app maps to messages, so this
 * stays free of i18n. `name` and `img` are required: a table-made die with the stock icon
 * would be indistinguishable from a shipped one at a glance.
 */
export function validateDie(draft) {
  const errors = [];
  if (!String(draft?.name ?? "").trim()) errors.push("name");
  if (!String(draft?.img ?? "").trim()) errors.push("icon");
  const faces = resolveFaces(draft?.faces);
  if (faces.error) errors.push(faces.error);
  if (!(Number(draft?.price) >= 0)) errors.push("price");
  return { ok: errors.length === 0, errors, faces };
}

/**
 * A validated draft as the object stored in the world setting. `price` is copper, matching
 * the shipped catalog, so the quick-hand generator's class ceilings apply unchanged.
 */
export function toDefinition(draft, id) {
  const { weights } = resolveFaces(draft?.faces);
  return {
    id,
    name: String(draft?.name ?? "").trim(),
    desc: String(draft?.desc ?? "").trim(),
    img: String(draft?.img ?? "").trim(),
    price: Math.max(0, Math.round(Number(draft?.price) || 0)),
    weights: weights.map((w) => round(w, 4)),
  };
}

/** A stored definition back into a draft the form can edit. */
export function toDraft(def) {
  return {
    id: def?.id ?? null,
    name: def?.name ?? "",
    desc: def?.desc ?? "",
    img: def?.img ?? "",
    price: Number(def?.price) || 0,
    faces: Array.from({ length: FACES }, (_, i) => {
      const w = Number(def?.weights?.[i]);
      return Number.isFinite(w) ? round(w) : null;
    }),
  };
}

/** Drop anything malformed from the stored list — one bad entry must not break the picker. */
export function sanitizeList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const d of raw) {
    if (!isCustomId(d?.id) || seen.has(d.id)) continue;
    if (!Array.isArray(d.weights) || d.weights.length !== FACES) continue;
    if (d.weights.some((w) => !Number.isFinite(Number(w)) || Number(w) < 0)) continue;
    if (d.weights.reduce((a, b) => a + Number(b), 0) <= 0) continue;
    seen.add(d.id);
    out.push({
      id: d.id,
      name: String(d.name ?? d.id),
      desc: String(d.desc ?? ""),
      img: String(d.img ?? ""),
      price: Math.max(0, Math.round(Number(d.price) || 0)),
      weights: d.weights.map((w) => Number(w)),
    });
  }
  return out;
}
