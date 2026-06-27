import { describe, it, expect } from "vitest";
import { dieIdFromSlug, dieIdOf, isDieItem, ownedDieIds } from "../src/foundry/dice-items.mjs";

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
    expect(dieIdOf({ system: { slug: "knuckles-die-07" } })).toBe("07"); // no getFlag at all
    expect(dieIdOf({ system: { slug: "torch" } })).toBe(null);
    expect(dieIdOf({})).toBe(null);
  });

  it("isDieItem reflects dieIdOf", () => {
    expect(isDieItem({ system: { slug: "knuckles-die-01" } })).toBe(true);
    expect(isDieItem({ system: { slug: "rope" } })).toBe(false);
  });
});

describe("ownedDieIds", () => {
  const die = (slug, quantity = 1) => ({ type: "equipment", system: { slug, quantity } });

  it("collects ids from equipment with quantity >= 1, ignoring zero-qty and non-dice", () => {
    const actor = {
      itemTypes: {
        equipment: [die("knuckles-die-07"), die("knuckles-die-02", 2), die("knuckles-die-33", 0), die("torch")],
      },
    };
    const owned = ownedDieIds(actor);
    expect([...owned].sort()).toEqual(["02", "07"]);
    expect(owned.has("33")).toBe(false); // quantity 0 -> not owned
    expect(owned.has("torch")).toBe(false);
  });

  it("returns an empty set for no actor or no inventory", () => {
    expect(ownedDieIds(null).size).toBe(0);
    expect(ownedDieIds({}).size).toBe(0);
    expect(ownedDieIds({ itemTypes: { equipment: [] } }).size).toBe(0);
  });

  it("falls back to scanning actor.items when itemTypes is absent", () => {
    const actor = { items: [die("knuckles-die-15"), { type: "spell", system: {} }] };
    expect([...ownedDieIds(actor)]).toEqual(["15"]);
  });
});
