import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Guards the agnostic price data baked into the catalog. Prices track each die's scoring
 *  power, so the quick-hand purse can shop by price and get a sensible hand. */
const catalog = JSON.parse(readFileSync(resolve(__dirname, "../data/dice-catalog.json"), "utf8"));
const byId = Object.fromEntries(catalog.dice.map((d) => [d.id, d.price]));

describe("dice catalog prices", () => {
  it("declares the agnostic copper price unit and bumped schema", () => {
    expect(catalog.priceUnit).toBe("cp");
    expect(catalog.schemaVersion).toBe(2);
  });

  it("gives every die a positive integer price within the 5cp..1500gp band", () => {
    for (const die of catalog.dice) {
      expect(Number.isInteger(die.price), `die ${die.id} price must be an integer`).toBe(true);
      expect(die.price).toBeGreaterThanOrEqual(5); // floor: 5 cp
      expect(die.price).toBeLessThanOrEqual(150000); // ceiling: 1500 gp
    }
  });

  it("tops out at the strongest die (02), with the joker (22) second", () => {
    const max = Math.max(...catalog.dice.map((d) => d.price));
    expect(byId["02"]).toBe(max);
    expect(byId["02"]).toBe(150000); // 1500 gp
    expect(byId["22"]).toBe(80000); // 800 gp
    expect(byId["22"]).toBeLessThan(byId["02"]);
    // and both monsters sit far above the rest of the catalog
    const rest = catalog.dice.filter((d) => !["02", "22"].includes(d.id)).map((d) => d.price);
    expect(byId["22"]).toBeGreaterThan(Math.max(...rest) * 3);
  });

  it("ranks the loaded dice by how strongly they favour a scoring face", () => {
    // 03 (45% ones) beats 06 (33% ones + 33% fives) beats 04 (40% ones, weak elsewhere).
    expect(byId["03"]).toBeGreaterThan(byId["06"]);
    expect(byId["06"]).toBeGreaterThan(byId["04"]);
    expect(byId["04"]).toBeGreaterThan(byId["05"]);
    expect(byId["05"]).toBeGreaterThan(byId["07"]);
  });

  it("prices at-or-below-fair dice under the honest die, cheaper the worse they are", () => {
    // The honest die is the reference; junk is bric-a-brac beneath it.
    for (const id of ["24", "23", "27", "29", "37", "34", "33", "36"]) {
      expect(byId[id], `die ${id} should undercut the honest die`).toBeLessThan(byId["01"]);
    }
    // 36 (starves both scoring faces) is the worst die in the catalog and the cheapest.
    expect(byId["36"]).toBe(Math.min(...catalog.dice.map((d) => d.price)));
    expect(byId["36"]).toBeLessThan(byId["33"]);
    expect(byId["33"]).toBeLessThan(byId["27"]);
  });

  it("keeps identical dice identically priced", () => {
    expect(byId["24"]).toBe(byId["25"]);
    expect(byId["25"]).toBe(byId["26"]); // the miner / mason / founder trio
    for (const id of ["30", "31", "32"]) expect(byId[id]).toBe(byId["29"]); // the four caps
  });

  it("keeps the honest default die (01) cheap", () => {
    expect(byId["01"]).toBeLessThan(byId["02"]);
    expect(byId["01"]).toBeLessThanOrEqual(100); // <= 1 gp
  });
});
