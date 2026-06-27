/**
 * Pure builder for the scoring-combinations reference panel. No Foundry imports —
 * derives every value from the scoring engine's own constants so the panel can
 * never drift from the rules. The shapes are presentation-ready (dice as
 * `{ value, isWild }`), but carry NO localized strings: the template localizes the
 * section titles and the n-of-a-kind rule.
 */

import { WILD } from "./dice-model.mjs";
import { SINGLE_ONE, SINGLE_FIVE, baseTriple, nOfAKindValue, STRAIGHTS } from "./scoring.mjs";

const die = (v) => ({ value: v, isWild: v === WILD });

/** The full reference, derived from the scoring rules. Deterministic and pure. */
export function buildCombos() {
  return {
    singles: [
      { dice: [die(1)], points: SINGLE_ONE },
      { dice: [die(5)], points: SINGLE_FIVE },
    ],
    triples: [1, 2, 3, 4, 5, 6].map((f) => ({ dice: [die(f), die(f), die(f)], points: baseTriple(f) })),
    // Each die past the third doubles the triple: 4→×2, 5→×4, 6→×8 (relative to the triple).
    nKind: {
      mults: [4, 5, 6].map((n) => ({ n, x: nOfAKindValue(2, n) / baseTriple(2) })),
    },
    straights: STRAIGHTS.map((s) => ({ dice: s.faces.map(die), points: s.points })),
    wild: { die: die(WILD) },
  };
}
