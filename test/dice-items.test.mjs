import { describe, it, expect } from "vitest";
import {
  dieIdFromSlug,
  dieIdOf,
  isDieItem,
  ownedDieCounts,
  ownedTotal,
  missingDieCopies,
  prefillLoadout,
  clampLoadout,
  ownedSlotChoices,
  orderIdsOwnedFirst,
  freeCopies,
  coverLoadout,
  resolveLoadout,
  readDefaultLoadout,
} from "../src/foundry/dice-items.mjs";

describe("dice-items identity", () => {
  it("parses a die id from a knuckles slug, and rejects anything else", () => {
    expect(dieIdFromSlug("knuckles-die-07")).toBe("07");
    expect(dieIdFromSlug("knuckles-die-37")).toBe("37");
    expect(dieIdFromSlug("longsword")).toBe(null);
    expect(dieIdFromSlug("knuckles-die-7")).toBe(null); // must be two digits
    expect(dieIdFromSlug(undefined)).toBe(null);
  });

  it("prefers the flag over the slug, falls back to the slug, else null", () => {
    expect(dieIdOf({ getFlag: () => "22", system: { slug: "knuckles-die-07" } })).toBe("22");
    expect(dieIdOf({ getFlag: () => undefined, system: { slug: "knuckles-die-07" } })).toBe("07");
    expect(dieIdOf({ system: { slug: "knuckles-die-07" } })).toBe("07");
    expect(dieIdOf({ system: { slug: "torch" } })).toBe(null);
    expect(dieIdOf({})).toBe(null);
  });

  it("isDieItem reflects dieIdOf", () => {
    expect(isDieItem({ system: { slug: "knuckles-die-01" } })).toBe(true);
    expect(isDieItem({ system: { slug: "rope" } })).toBe(false);
  });
});

describe("ownedDieCounts", () => {
  const die = (slug, quantity = 1) => ({ type: "equipment", system: { slug, quantity } });

  it("sums quantities per die id, ignoring zero-qty and non-dice", () => {
    const actor = {
      itemTypes: {
        equipment: [die("knuckles-die-07", 3), die("knuckles-die-07", 1), die("knuckles-die-02", 2), die("knuckles-die-33", 0), die("torch", 5)],
      },
    };
    const counts = ownedDieCounts(actor);
    expect(counts.get("07")).toBe(4); // 3 + 1 across two stacks
    expect(counts.get("02")).toBe(2);
    expect(counts.has("33")).toBe(false);
    expect(counts.has("torch")).toBe(false);
    expect(ownedTotal(counts)).toBe(6);
  });

  it("returns an empty map for no actor / no inventory", () => {
    expect(ownedDieCounts(null).size).toBe(0);
    expect(ownedTotal(ownedDieCounts({}))).toBe(0);
  });

  it("falls back to scanning actor.items when itemTypes is absent", () => {
    const actor = { items: [die("knuckles-die-15", 2), { type: "spell", system: {} }] };
    expect(ownedDieCounts(actor).get("15")).toBe(2);
  });
});

describe("missingDieCopies", () => {
  it("returns the extra copies needed per die for the chosen slots", () => {
    const owned = new Map([["07", 1], ["11", 2]]);
    // six slots: 07 x3, 11 x2, 02 x1
    const missing = missingDieCopies(["07", "07", "07", "11", "11", "02"], owned);
    expect(missing.get("07")).toBe(2); // need 3, own 1
    expect(missing.has("11")).toBe(false); // need 2, own 2
    expect(missing.get("02")).toBe(1); // need 1, own 0
  });

  it("is empty when everything chosen is already owned in enough quantity", () => {
    const owned = new Map([["07", 6]]);
    expect(missingDieCopies(["07", "07", "07", "07", "07", "07"], owned).size).toBe(0);
  });
});

describe("prefillLoadout", () => {
  it("always returns exactly six ids, greedy by catalog-id order, padded with 01", () => {
    expect(prefillLoadout(new Map())).toEqual(["01", "01", "01", "01", "01", "01"]);
    expect(prefillLoadout(new Map([["07", 2], ["02", 1]]))).toEqual(["02", "07", "07", "01", "01", "01"]);
    expect(prefillLoadout(new Map([["11", 6]])).length).toBe(6);
    // more than six total -> only the first six (by id)
    expect(prefillLoadout(new Map([["02", 4], ["07", 4]]))).toEqual(["02", "02", "02", "02", "07", "07"]);
  });
});

describe("clampLoadout", () => {
  it("keeps an already-legal hand unchanged", () => {
    const owned = new Map([["07", 3], ["11", 3]]);
    expect(clampLoadout(["07", "07", "07", "11", "11", "11"], owned)).toEqual(["07", "07", "07", "11", "11", "11"]);
  });

  it("re-seats over-assigned and unowned slots onto owned copies — six ids, no null, never exceeds owned", () => {
    const owned = new Map([["07", 2], ["11", 4]]);
    const out = clampLoadout(["07", "07", "07", "11", "01", "99"], owned); // 07 over by 1; 01/99 unowned
    expect(out.length).toBe(6);
    expect(out.every((id) => typeof id === "string")).toBe(true);
    const used = new Map();
    for (const id of out) used.set(id, (used.get(id) ?? 0) + 1);
    for (const [id, n] of used) expect(n).toBeLessThanOrEqual(owned.get(id) ?? 0);
  });
});

describe("ownedSlotChoices", () => {
  const allIds = ["01", "02", "07", "11"];

  it("offers only owned dice, disables a die with no free copy (unless it's the current pick)", () => {
    const owned = new Map([["07", 1], ["11", 2]]);
    const usedExcl = new Map([["11", 2]]); // both copies of 11 used by the other slots
    const { ids, placeholder } = ownedSlotChoices(allIds, owned, usedExcl, "07");
    const byId = Object.fromEntries(ids.map((o) => [o.id, o]));
    expect(Object.keys(byId).sort()).toEqual(["07", "11"]); // unowned 01/02 not offered
    expect(byId["07"].selected).toBe(true);
    expect(byId["07"].disabled).toBe(false); // current pick is never disabled
    expect(byId["11"].disabled).toBe(true); // no free copy
    expect(placeholder).toBe(false); // current die is owned
  });

  it("flags a placeholder when the slot holds an unowned die", () => {
    const { placeholder } = ownedSlotChoices(allIds, new Map([["07", 2]]), new Map(), "01");
    expect(placeholder).toBe(true);
  });
});

describe("orderIdsOwnedFirst", () => {
  const allIds = ["01", "02", "03", "04", "05"];

  it("floats owned dice to the top, each group keeping catalog order", () => {
    const owned = new Map([["03", 2], ["05", 1]]);
    expect(orderIdsOwnedFirst(allIds, owned)).toEqual(["03", "05", "01", "02", "04"]);
  });

  it("is a no-op when nothing is owned", () => {
    expect(orderIdsOwnedFirst(allIds, new Map())).toEqual(allIds);
  });

  it("returns all owned in order when everything is owned", () => {
    const owned = new Map(allIds.map((id) => [id, 1]));
    expect(orderIdsOwnedFirst(allIds, owned)).toEqual(allIds);
  });
});

describe("freeCopies (free/total label)", () => {
  it("subtracts copies used across ALL slots from the owned count", () => {
    const owned = new Map([["07", 6]]);
    expect(freeCopies(owned, new Map([["07", 6]]), "07")).toBe(0); // 6 owned, all 6 placed → 0
    expect(freeCopies(owned, new Map([["07", 4]]), "07")).toBe(2);
  });

  it("never goes negative (over-placed)", () => {
    expect(freeCopies(new Map([["07", 1]]), new Map([["07", 3]]), "07")).toBe(0);
  });

  it("is 0 for an unowned die", () => {
    expect(freeCopies(new Map(), new Map([["07", 1]]), "07")).toBe(0);
  });
});

describe("coverLoadout (block unless GM gifted six)", () => {
  const six = (a) => a; // a 6-length dieIds array

  it("covers fully-owned loadouts with nothing to grant and no shortfall", () => {
    const owned = new Map([["01", 6]]);
    const { toGrant, shortBy } = coverLoadout(six(["01", "01", "01", "01", "01", "01"]), [], owned);
    expect(shortBy).toBe(0);
    expect(toGrant.size).toBe(0);
  });

  it("grants the GM-gifted slots and reports no shortfall", () => {
    const owned = new Map([["01", 4]]);
    const gifts = [false, false, false, false, true, true]; // GM gifted slots 5 and 6
    const dieIds = ["01", "01", "01", "01", "02", "22"];
    const { toGrant, shortBy } = coverLoadout(dieIds, gifts, owned);
    expect(shortBy).toBe(0);
    expect(toGrant.get("02")).toBe(1);
    expect(toGrant.get("22")).toBe(1);
  });

  it("reports a shortfall for unowned, un-gifted slots (the prefill pad case)", () => {
    const owned = new Map([["07", 4]]);
    const dieIds = ["07", "07", "07", "07", "01", "01"]; // two unowned "01" pads, not gifted
    const { toGrant, shortBy } = coverLoadout(dieIds, [false, false, false, false, false, false], owned);
    expect(shortBy).toBe(2);
    expect(toGrant.size).toBe(0);
  });

  it("counts duplicate copies correctly (owned 1, placed twice)", () => {
    const owned = new Map([["07", 1]]);
    const dieIds = ["07", "07", "07", "07", "07", "07"]; // own 1, placed 6, none gifted
    const { shortBy } = coverLoadout(dieIds, [], owned);
    expect(shortBy).toBe(5); // first slot covered, other five short
  });

  it("reports greedy per-slot coverage that matches the launch outcome", () => {
    const owned = new Map([["07", 2]]);
    const gifts = [false, false, false, false, true, false];
    const dieIds = ["07", "07", "07", "02", "02", "07"]; // slot4 "02" is a gift
    const { slotCovered, shortBy, toGrant } = coverLoadout(dieIds, gifts, owned);
    expect(slotCovered).toEqual([true, true, false, false, false, false]); // first two 07 covered
    expect(shortBy).toBe(3); // slot2(07), slot3(02 not gifted), slot5(07)
    expect(toGrant.get("02")).toBe(1); // slot4 gifted
  });
});

describe("resolveLoadout (saved default → starting hand)", () => {
  const validIds = new Set(["01", "02", "03", "07", "22"]);
  const saved = ["07", "07", "22", "01", "02", "03"];

  it("returns null with no / short saved default", () => {
    expect(resolveLoadout(null, new Map(), { validIds })).toBe(null);
    expect(resolveLoadout(["01", "02"], new Map(), { validIds })).toBe(null);
  });

  it("virtual mode: returns the validated default verbatim (duplicates kept)", () => {
    expect(resolveLoadout(saved, new Map(), { physical: false, validIds })).toEqual(saved);
  });

  it("virtual mode: replaces an unknown id with 01", () => {
    const r = resolveLoadout(["99", "02", "03", "01", "07", "22"], new Map(), { physical: false, validIds });
    expect(r).toEqual(["01", "02", "03", "01", "07", "22"]);
  });

  it("physical mode: clamps onto the owned copies, keeping owned picks in place", () => {
    const owned = new Map([["07", 2], ["22", 1]]);
    const r = resolveLoadout(saved, owned, { physical: true, validIds });
    expect(r).toHaveLength(6);
    expect(r.slice(0, 3)).toEqual(["07", "07", "22"]); // the three owned copies are kept
  });
});

describe("readDefaultLoadout", () => {
  const actorWith = (flag) => ({ getFlag: () => flag });

  it("reads a valid six-string array", () => {
    const ids = ["01", "02", "03", "04", "05", "06"];
    expect(readDefaultLoadout(actorWith(ids))).toEqual(ids);
  });

  it("rejects wrong length, non-array, or non-string entries, and a null actor", () => {
    expect(readDefaultLoadout(actorWith(["01", "02"]))).toBe(null);
    expect(readDefaultLoadout(actorWith("nope"))).toBe(null);
    expect(readDefaultLoadout(actorWith([1, 2, 3, 4, 5, 6]))).toBe(null);
    expect(readDefaultLoadout(actorWith(undefined))).toBe(null);
    expect(readDefaultLoadout(null)).toBe(null);
  });
});
