import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Guards the agnostic price data baked into the catalog (Phase 1). */
const catalog = JSON.parse(readFileSync(resolve(__dirname, "../data/dice-catalog.json"), "utf8"));

describe("dice catalog prices", () => {
  it("declares the agnostic copper price unit and bumped schema", () => {
    expect(catalog.priceUnit).toBe("cp");
    expect(catalog.schemaVersion).toBe(2);
  });

  it("gives every die a positive integer price within the agreed 5cp..850gp band", () => {
    for (const die of catalog.dice) {
      expect(Number.isInteger(die.price), `die ${die.id} price must be an integer`).toBe(true);
      expect(die.price).toBeGreaterThanOrEqual(5); // floor: 5 cp
      expect(die.price).toBeLessThanOrEqual(85000); // ceiling: 850 gp
    }
  });

  it("prices the strongest die (02) highest and the trap dice (33/34) at the floor", () => {
    const byId = Object.fromEntries(catalog.dice.map((d) => [d.id, d.price]));
    const max = Math.max(...catalog.dice.map((d) => d.price));
    expect(byId["02"]).toBe(max);
    expect(byId["02"]).toBe(85000);
    expect(byId["33"]).toBe(5);
    expect(byId["34"]).toBe(5);
    // the joker (22) is a priced premium, well above an ordinary loaded die
    expect(byId["22"]).toBeGreaterThan(byId["06"]);
  });

  it("keeps the honest default die (01) cheap", () => {
    const byId = Object.fromEntries(catalog.dice.map((d) => [d.id, d.price]));
    expect(byId["01"]).toBeLessThan(byId["02"]);
    expect(byId["01"]).toBeLessThanOrEqual(100); // <= 1 gp
  });
});
