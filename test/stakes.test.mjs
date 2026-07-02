import { describe, it, expect } from "vitest";
import {
  emptyCoins,
  coinValue,
  coinsFromValue,
  sumCoins,
  planStakes,
  defaultResolution,
  evenSplit,
  borrowValid,
} from "../src/core/stakes.mjs";

describe("coin value <-> coins", () => {
  it("values a coin bag in copper", () => {
    expect(coinValue({ sun: 1, gold: 1, silver: 1, copper: 1 })).toBe(1111);
    expect(coinValue({ gold: 5 })).toBe(500);
    expect(coinValue(null)).toBe(0);
  });

  it("ignores negatives and non-numbers", () => {
    expect(coinValue({ gold: -5, silver: "x", copper: 3 })).toBe(3);
  });

  it("breaks a value back into canonical coins (largest first)", () => {
    expect(coinsFromValue(1111)).toEqual({ sun: 1, gold: 1, silver: 1, copper: 1 });
    expect(coinsFromValue(1234)).toEqual({ sun: 1, gold: 2, silver: 3, copper: 4 });
    expect(coinsFromValue(0)).toEqual(emptyCoins());
  });

  it("round-trips value → coins → value", () => {
    for (const v of [0, 1, 9, 10, 99, 100, 555, 9999]) expect(coinValue(coinsFromValue(v))).toBe(v);
  });

  it("sums coin bags", () => {
    expect(sumCoins([{ gold: 1 }, { gold: 2, silver: 5 }])).toEqual({ sun: 0, gold: 3, silver: 5, copper: 0 });
  });
});

describe("planStakes", () => {
  it("deducts nothing and needs no dialog when everyone can pay", () => {
    const plan = planStakes([
      { id: "a", name: "A", kind: "pc", bet: { gold: 5 }, walletValue: 1000 },
      { id: "b", name: "B", kind: "pc", bet: { gold: 5 }, walletValue: 500 },
    ]);
    expect(plan.needsDialog).toBe(false);
    expect(plan.shortfalls).toEqual([]);
    expect(plan.payments).toEqual([{ id: "a", value: 500 }, { id: "b", value: 500 }]);
  });

  it("skips zero-bet participants entirely", () => {
    const plan = planStakes([{ id: "a", name: "A", kind: "pc", bet: {}, walletValue: 0 }]);
    expect(plan.payments).toEqual([]);
    expect(plan.shortfalls).toEqual([]);
    expect(plan.needsDialog).toBe(false);
  });

  it("deducts the affordable part and reports the remainder as a shortfall", () => {
    const plan = planStakes([{ id: "a", name: "Seelah", kind: "pc", bet: { gold: 4 }, walletValue: 100 }]);
    expect(plan.payments).toEqual([{ id: "a", value: 100 }]); // pays their 1 gp
    expect(plan.shortfalls).toEqual([{ id: "a", name: "Seelah", kind: "pc", value: 300 }]); // short 3 gp
    expect(plan.needsDialog).toBe(true);
  });

  it("treats an actorless bettor as a full shortfall (no wallet)", () => {
    const plan = planStakes([{ id: "g", name: "Ghost", kind: "actorless", bet: { gold: 2 }, walletValue: 9999 }]);
    expect(plan.payments).toEqual([]);
    expect(plan.shortfalls[0].value).toBe(200);
  });

  it("an NPC with some coin pays what it has, shortfall is the rest", () => {
    const plan = planStakes([{ id: "n", name: "Orc", kind: "npc", bet: { gold: 5 }, walletValue: 200 }]);
    expect(plan.payments).toEqual([{ id: "n", value: 200 }]);
    expect(plan.shortfalls[0].value).toBe(300);
  });
});

describe("evenSplit", () => {
  it("splits evenly when caps allow", () => {
    const s = evenSplit(100, [{ id: "a", cap: 1000 }, { id: "b", cap: 1000 }]);
    expect(s.get("a")).toBe(50);
    expect(s.get("b")).toBe(50);
  });

  it("caps a poor lender and shifts the rest to others", () => {
    const s = evenSplit(100, [{ id: "a", cap: 20 }, { id: "b", cap: 1000 }]);
    expect(s.get("a")).toBe(20);
    expect(s.get("b")).toBe(80);
  });

  it("never exceeds the total even with deep pockets", () => {
    const s = evenSplit(101, [{ id: "a", cap: 1000 }, { id: "b", cap: 1000 }, { id: "c", cap: 1000 }]);
    expect(s.get("a") + s.get("b") + s.get("c")).toBe(101);
  });

  it("stops at Σcaps when lenders can't cover the total", () => {
    const s = evenSplit(500, [{ id: "a", cap: 30 }, { id: "b", cap: 40 }]);
    expect(s.get("a") + s.get("b")).toBe(70);
  });

  it("distributes an odd remainder deterministically by input order", () => {
    const s = evenSplit(5, [{ id: "a", cap: 1000 }, { id: "b", cap: 1000 }]);
    expect(s.get("a")).toBe(3);
    expect(s.get("b")).toBe(2);
  });
});

describe("defaultResolution", () => {
  const lenders = [{ id: "x", cap: 1000 }, { id: "y", cap: 1000 }];

  it("mints for npc / actorless shortfalls", () => {
    expect(defaultResolution({ value: 500 }, lenders, "npc").mode).toBe("mint");
    expect(defaultResolution({ value: 500 }, lenders, "actorless").mode).toBe("mint");
  });

  it("borrows for a pc shortfall the party can cover, split evenly", () => {
    const r = defaultResolution({ value: 400 }, lenders, "pc");
    expect(r.mode).toBe("borrow");
    expect(r.split.get("x")).toBe(200);
    expect(r.split.get("y")).toBe(200);
  });

  it("falls back to mint when the party can't cover the pc shortfall", () => {
    const r = defaultResolution({ value: 5000 }, [{ id: "x", cap: 100 }], "pc");
    expect(r.mode).toBe("mint");
  });
});

describe("borrowValid", () => {
  it("accepts allocations that sum to exactly the shortfall within caps", () => {
    expect(borrowValid(300, [{ value: 100, cap: 1000 }, { value: 200, cap: 1000 }])).toBe(true);
  });

  it("rejects an over/under allocation", () => {
    expect(borrowValid(300, [{ value: 100, cap: 1000 }])).toBe(false);
    expect(borrowValid(300, [{ value: 400, cap: 1000 }])).toBe(false);
  });

  it("rejects a lender allocation beyond its cap", () => {
    expect(borrowValid(300, [{ value: 300, cap: 200 }])).toBe(false);
  });

  it("rejects a negative allocation", () => {
    expect(borrowValid(300, [{ value: -100, cap: 1000 }, { value: 400, cap: 1000 }])).toBe(false);
  });
});
