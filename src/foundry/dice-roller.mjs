/**
 * Rolls fair d6 through the Foundry Roll API. Returns both the plain values
 * (fed to the pure reducer) and the Roll instance (handed to Dice So Nice).
 *
 * The per-die "spec" abstraction is intentionally absent for now: every die is a
 * fair d6. Loaded/weighted dice (the future cheating system) will slot in here by
 * building the Roll from per-die weight vectors — no change required elsewhere.
 */
export async function rollValues(count) {
  if (!count || count <= 0) return { values: [], roll: null };
  const roll = await new Roll(`${count}d6`).evaluate();
  const term = roll.dice.find((d) => d.faces === 6) ?? roll.dice[0];
  const values = term.results.map((r) => r.result);
  return { values, roll };
}
