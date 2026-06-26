import { describe, it, expect } from "vitest";
import { DICE_CATALOG, DEFAULT_DIE_ID, getDie, getDieSpec } from "../src/core/dice-catalog.mjs";

describe("dice catalog", () => {
  it("every die has 6 non-negative weights and a boolean joker", () => {
    for (const d of DICE_CATALOG) {
      expect(typeof d.id).toBe("string");
      expect(typeof d.label).toBe("string");
      expect(d.weights).toHaveLength(6);
      expect(d.weights.every((w) => typeof w === "number" && w >= 0)).toBe(true);
      expect(typeof d.joker).toBe("boolean");
    }
  });

  it("has unique ids and a fair default", () => {
    const ids = DICE_CATALOG.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DEFAULT_DIE_ID).toBe("fair");
    expect(getDie("fair").id).toBe("fair");
  });

  it("getDieSpec returns weights + joker; unknown ids fall back to fair", () => {
    expect(getDieSpec("weighted")).toMatchObject({ joker: false });
    expect(getDieSpec("devils-head").joker).toBe(true);
    expect(getDie("nonexistent").id).toBe("fair");
  });

  it("only the Nameless die is a joker", () => {
    expect(DICE_CATALOG.filter((d) => d.joker).map((d) => d.id)).toEqual(["devils-head"]);
  });
});
