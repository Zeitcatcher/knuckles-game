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
