/**
 * Pure helpers for the "does this client actually need to re-render?" decision.
 * No Foundry imports — unit-testable in isolation.
 */

/**
 * A stable signature of everything the dice picker renders FROM THE SYNCED STATE
 * for one client's editable slice. Deliberately excludes:
 *  - owned-die counts (they come from item hooks, not game state → handled separately),
 *  - the active theme / language (a theme change force-renders).
 * So two states with the same signature produce a pixel-identical picker for this
 * client and a re-render can be skipped. Order-independent: the editable ids are
 * sorted, so the signature does not depend on player-array order.
 *
 * @param {object|null} state
 * @param {string[]} editableIds - ids of the players this client may edit
 * @returns {string}
 */
export function pickerSignature(state, editableIds) {
  if (!state) return "∅";
  const want = new Set(editableIds ?? []);
  const rows = (state.players ?? [])
    .filter((p) => want.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name ?? "",
      ready: Boolean(p.ready),
      type: p.type ?? "generic",
      dieIds: [...(p.dieIds ?? [])],
      gifts: [...(p.gifts ?? [])], // GM gifts change a slot's marker even if the die id is unchanged
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify({ status: state.status ?? "", rows });
}
