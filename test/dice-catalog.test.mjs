import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCatalog, DEFAULT_DIE_ID } from "../src/foundry/dice-data.mjs";

const catalog = JSON.parse(readFileSync(new URL("../data/dice-catalog.json", import.meta.url), "utf8"));

describe("dice catalog (data/dice-catalog.json)", () => {
  it("parses every die into { weights, joker }", () => {
    const map = parseCatalog(catalog);
    expect(map.size).toBe(catalog.dice.length);
    for (const d of catalog.dice) {
      const spec = map.get(d.id);
      expect(spec.weights).toHaveLength(6);
      expect(spec.weights.every((w) => typeof w === "number" && w >= 0)).toBe(true);
      expect(typeof spec.joker).toBe("boolean");
    }
  });

  it("has the default die (uniform, no joker) and a single joker", () => {
    const map = parseCatalog(catalog);
    expect(map.has(DEFAULT_DIE_ID)).toBe(true);
    expect(map.get(DEFAULT_DIE_ID).joker).toBe(false);
    expect(catalog.dice.filter((d) => d.joker).map((d) => d.id)).toEqual(["22"]);
  });
});
