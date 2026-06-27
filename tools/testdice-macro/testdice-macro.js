/*
 * Knuckles Game — Test Dice (GM dev tool).
 *
 * Grants a die from the "Knuckles Dice" compendium onto the selected token, and
 * always reports the knuckles dice already in that token's inventory. Handy for
 * testing the physical-dice (item) mode without setting up a full game.
 *
 * It ships in the module's "Knuckles Tools" compendium (Compendiums → Knuckles
 * Tools → drag "Knuckles — Test Dice" to your hotbar). You can also paste this
 * whole file into a new Script macro.
 *
 * Usage: set CREATE to a die id "01".."37" to grant that die to the selected
 * token, or leave it "" to only scan. Select a token, then run. Console = F12.
 */
const CREATE = ""; // e.g. "07" to grant Calistria's Three Stings; "" = scan only

const KG = "knuckles-game";
const PACK = `${KG}.dice`;

const slugId = (it) => (/^knuckles-die-(\d{2})$/.exec(it.system?.slug ?? "") || [])[1] ?? null;
const dieIdOf = (it) => it.getFlag(KG, "dieId") ?? slugId(it);
const isDie = (it) => Boolean(dieIdOf(it));

const actor = canvas.tokens.controlled[0]?.actor ?? game.user?.character ?? null;
if (!actor) {
  ui.notifications.warn("Knuckles Test Dice: select a token first.");
} else {
  if (CREATE) {
    const id = String(CREATE).padStart(2, "0");
    const pack = game.packs.get(PACK);
    if (!pack) {
      ui.notifications.error(`Knuckles Test Dice: compendium "${PACK}" not found.`);
    } else {
      const docs = await pack.getDocuments();
      const src = docs.find((d) => d.getFlag(KG, "dieId") === id || slugId(d) === id)?.toObject() ?? null;
      if (!src) {
        ui.notifications.error(`Knuckles Test Dice: die "${id}" not found in ${PACK}.`);
      } else {
        try {
          await actor.createEmbeddedDocuments("Item", [src]);
          ui.notifications.info(`Knuckles Test Dice: granted die ${id} (${src.name}) to ${actor.name}.`);
        } catch (err) {
          console.error("Knuckles Test Dice | grant failed", err);
          ui.notifications.error("Knuckles Test Dice: grant failed — see console (F12).");
        }
      }
    }
  }
  const equipment = actor.itemTypes?.equipment ?? actor.items.filter((i) => i.type === "equipment");
  const dice = equipment.filter(isDie);
  console.log(`%cKnuckles Test Dice | ${actor.name}: ${dice.length} die(s)`, "font-weight:bold;color:#caa24a");
  console.table(
    dice.map((it) => ({
      name: it.name,
      dieId: dieIdOf(it),
      qty: it.system?.quantity,
      price: JSON.stringify(it.system?.price?.value ?? {}),
    })),
  );
  ui.notifications.info(`Knuckles Test Dice: ${actor.name} has ${dice.length} knuckles die(s) — see console (F12).`);
}
