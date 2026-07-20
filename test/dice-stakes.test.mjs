import { describe, it, expect } from "vitest";
import { createGame, reduce, computeDicePool } from "../src/core/game-state.mjs";
import { pickerSignature } from "../src/core/transient-ui.mjs";

/** A choosing-phase game where alice may wager dice and bob may not. */
const game = (over = {}) =>
  createGame({
    players: [
      { id: "a", type: "pc", actorUuid: "actorAlice", stakeDice: true, dieIds: ["02", "07", "01", "01", "01", "01"] },
      { id: "b", type: "pc", actorUuid: "actorBob" },
    ],
    ...over,
  });

const stake = (s, playerId, slot, staked = true) => reduce(s, { type: "setDieStake", playerId, slot, staked });

describe("opting in to wagering dice", () => {
  it("seeds the flag and an empty set of staked slots", () => {
    const s = game();
    expect(s.players[0].stakeDice).toBe(true);
    expect(s.players[0].betDice).toEqual([false, false, false, false, false, false]);
    expect(s.players[1].stakeDice).toBe(false);
    expect(s.diceEscrow).toEqual([]);
  });

  it("refuses staked slots to a participant who never opted in", () => {
    // Even a hand-crafted state can't smuggle them past createGame.
    const s = createGame({
      players: [
        { id: "a", type: "pc", stakeDice: false, betDice: [true, true, false, false, false, false] },
        { id: "b", type: "pc" },
      ],
    });
    expect(s.players[0].betDice.every((x) => x === false)).toBe(true);
  });

  it("ignores a stake toggle aimed at a participant who never opted in", () => {
    const s = stake(game(), "b", 0);
    expect(s.players[1].betDice[0]).toBe(false);
    expect(computeDicePool(s.players)).toEqual([]);
  });
});

describe("putting dice up", () => {
  it("marks and unmarks one slot at a time", () => {
    let s = stake(game(), "a", 0);
    expect(s.players[0].betDice).toEqual([true, false, false, false, false, false]);
    s = stake(s, "a", 1);
    expect(s.players[0].betDice.filter(Boolean).length).toBe(2);
    s = stake(s, "a", 0, false);
    expect(s.players[0].betDice).toEqual([false, true, false, false, false, false]);
  });

  it("ignores a slot outside the six", () => {
    for (const slot of [-1, 6, 99, "2", null]) {
      expect(stake(game(), "a", slot).players[0].betDice.some(Boolean)).toBe(false);
    }
  });

  it("reports the pot as slot, die and owner", () => {
    let s = stake(game(), "a", 0);
    s = stake(s, "a", 1);
    expect(computeDicePool(s.players)).toEqual([
      { playerId: "a", slot: 0, dieId: "02" },
      { playerId: "a", slot: 1, dieId: "07" },
    ]);
  });

  it("keeps the stake on the SLOT when the die in it is swapped", () => {
    // What is at risk is "the die in slot 1", so re-picking raises a different die.
    let s = stake(game(), "a", 0);
    s = reduce(s, { type: "setDieSlot", playerId: "a", slot: 0, dieId: "22" });
    expect(s.players[0].betDice[0]).toBe(true);
    expect(computeDicePool(s.players)).toEqual([{ playerId: "a", slot: 0, dieId: "22" }]);
  });

  it("survives a whole-loadout swap", () => {
    let s = stake(game(), "a", 2);
    s = reduce(s, { type: "setLoadout", playerId: "a", dieIds: ["01", "01", "35", "01", "01", "01"] });
    expect(computeDicePool(s.players)).toEqual([{ playerId: "a", slot: 2, dieId: "35" }]);
  });

  it("refuses to change the pot once play has started", () => {
    const s = reduce(stake(game(), "a", 0), { type: "startPlay" });
    expect(() => stake(s, "a", 1)).toThrow();
    // and what was already staked stays staked
    expect(computeDicePool(s.players).length).toBe(1);
  });
});

describe("the picker refreshes when the pot changes", () => {
  it("changes signature when a die is put up", () => {
    const s = game();
    const before = pickerSignature(s, ["a"]);
    expect(pickerSignature(stake(s, "a", 0), ["a"])).not.toBe(before);
  });

  it("leaves the signature alone for a client that cannot see that row", () => {
    const s = game();
    const before = pickerSignature(s, ["b"]);
    expect(pickerSignature(stake(s, "a", 0), ["b"])).toBe(before);
  });
});
