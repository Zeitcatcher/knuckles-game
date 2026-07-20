import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dieIdFromSlug, dieIdOf } from "../src/foundry/dice-items.mjs";

const catalog = JSON.parse(readFileSync(new URL("../data/dice-catalog.json", import.meta.url), "utf8"));

// The registry reads the shipped catalog over Foundry's fetch helper and the table's own
// dice from a world setting. Both are stubbed here so the merge itself is what gets tested.
const h = vi.hoisted(() => ({ custom: [] }));
globalThis.game = { settings: { get: () => h.custom } };
globalThis.foundry = { utils: { fetchJsonWithTimeout: async () => catalog } };

const {
  loadDiceCatalog,
  loadCustomDice,
  customDice,
  getCustomDie,
  getDieSpec,
  diceIds,
  catalogEntries,
  DEFAULT_DIE_ID,
} = await import("../src/foundry/dice-data.mjs");

await loadDiceCatalog();

const wolf = { id: "cwolf1", name: "Волчья кость", desc: "", img: "wolf.webp", price: 1200, weights: [40, 10, 10, 10, 25, 5] };
const bone = { id: "cbone2", name: "Кость с крапинкой", desc: "", img: "bone.webp", price: 300, weights: [50, 10, 10, 10, 10, 10] };

beforeEach(() => {
  h.custom = [];
  loadCustomDice();
});

describe("custom dice join the shipped registry", () => {
  it("starts with nothing when the setting is empty", () => {
    expect(customDice()).toEqual([]);
    expect(getCustomDie("cwolf1")).toBe(null);
  });

  it("serves a table-made die's weights through the same lookup as a catalog one", () => {
    h.custom = [wolf];
    loadCustomDice();
    expect(getDieSpec("cwolf1").weights).toEqual(wolf.weights);
    expect(getDieSpec(DEFAULT_DIE_ID).weights).toEqual(catalog.dice[0].weights);
  });

  it("never gives a table-made die a joker face", () => {
    h.custom = [{ ...wolf, joker: true }];
    loadCustomDice();
    expect(getDieSpec("cwolf1").joker).toBe(false);
  });

  it("falls back to the honest die for an id that no longer exists", () => {
    h.custom = [wolf];
    loadCustomDice();
    h.custom = [];
    loadCustomDice(); // the GM deleted it
    expect(getDieSpec("cwolf1").weights).toEqual(catalog.dice[0].weights);
  });

  it("drops a malformed entry rather than breaking every lookup", () => {
    h.custom = [wolf, { id: "cbad9", weights: [1, 1] }];
    loadCustomDice();
    expect(customDice().map((d) => d.id)).toEqual(["cwolf1"]);
  });
});

describe("die order", () => {
  it("is the plain catalog when the table has made nothing", () => {
    expect(diceIds()).toEqual(catalog.dice.map((d) => d.id));
  });

  it("puts table-made dice straight after the honest die", () => {
    h.custom = [wolf, bone];
    loadCustomDice();
    const ids = diceIds();
    expect(ids.slice(0, 3)).toEqual([DEFAULT_DIE_ID, "cwolf1", "cbone2"]);
    expect(ids.length).toBe(catalog.dice.length + 2);
    // and the shipped catalog keeps its own order behind them
    expect(ids.slice(3)).toEqual(catalog.dice.slice(1).map((d) => d.id));
  });

  it("offers them to the quick-hand generator with their price", () => {
    h.custom = [wolf, bone];
    loadCustomDice();
    const entries = catalogEntries();
    const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
    expect(byId.cwolf1.price).toBe(1200);
    expect(byId.cbone2.price).toBe(300);
    expect(entries.length).toBe(catalog.dice.length + 2);
  });
});

describe("item identity covers table-made dice", () => {
  it("reads a custom id out of its slug", () => {
    expect(dieIdFromSlug("knuckles-die-cwolf1")).toBe("cwolf1");
    expect(dieIdOf({ system: { slug: "knuckles-die-cwolf1" } })).toBe("cwolf1");
  });

  it("still rejects anything that is not one of ours", () => {
    expect(dieIdFromSlug("knuckles-die-7")).toBe(null);
    expect(dieIdFromSlug("knuckles-die-")).toBe(null);
    expect(dieIdFromSlug("knuckles-die-WOLF")).toBe(null); // ids are lower-case
    expect(dieIdFromSlug("longsword")).toBe(null);
  });
});
