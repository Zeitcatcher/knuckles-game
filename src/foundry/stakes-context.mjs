/**
 * GM-client stake-collection context: fresh wallet reads + the candidate lender pool per
 * short participant. Feeds the stakes dialog. The authoritative deductions happen later,
 * GM-side, in net/commands.mjs (which re-reads wallets), so a wallet that changes between
 * this read and confirmation is caught there and the dialog is reopened.
 */
import { inventoryActor } from "./dice-items.mjs";
import { walletValue, walletValueOf } from "./currency.mjs";
import { planStakes, coinValue, coinsFromValue } from "../core/stakes.mjs";

function participantUuid(p) {
  return inventoryActor(p)?.uuid ?? p?.actorUuid ?? null;
}

/** The lender pool: pf2e party members if there's an active party, else player-owned
 *  characters. Returns actor documents. */
function lenderActors() {
  const members = game.actors?.party?.members;
  if (members?.length) return [...members];
  return game.actors?.filter?.((a) => a.type === "character" && a.hasPlayerOwner) ?? [];
}

/**
 * @returns {{ hasBets:boolean, needsDialog:boolean, shortfalls:object[], payerNames:string[] }}
 *   Each shortfall: { id, name, kind, value, coins, lenders:[{uuid,name,cap}] }.
 */
export async function buildStakeContext(state) {
  const participants = [];
  for (const p of state.players ?? []) {
    const uuid = participantUuid(p);
    const kind = uuid ? (p.type === "npc" ? "npc" : "pc") : "actorless";
    participants.push({ id: p.id, name: p.name, kind, bet: p.bet, walletValue: uuid ? await walletValue(uuid) : 0, uuid });
  }
  const plan = planStakes(participants);
  const lenders = lenderActors();
  const shortfalls = plan.shortfalls.map((sf) => {
    const borrower = participants.find((x) => x.id === sf.id);
    const cand = lenders
      .filter((a) => a.uuid !== borrower?.uuid)
      .map((a) => ({ uuid: a.uuid, name: a.name, cap: walletValueOf(a) }));
    return { ...sf, coins: coinsFromValue(sf.value), lenders: cand };
  });
  const payerNames = participants
    .filter((p) => coinValue(p.bet) > 0 && !plan.shortfalls.some((s) => s.id === p.id))
    .map((p) => p.name);
  return {
    hasBets: participants.some((p) => coinValue(p.bet) > 0),
    needsDialog: plan.needsDialog,
    shortfalls,
    payerNames,
  };
}
