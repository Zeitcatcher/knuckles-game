import { describe, it, expect } from "vitest";
import { createGame, reduce, currentPlayer, computePool } from "../src/core/game-state.mjs";
import { WILD } from "../src/core/dice-model.mjs";

const start = (g) => reduce(g, { type: "startPlay" });
const two = (over = {}) => start(createGame({ players: [{ id: "a" }, { id: "b" }], targetScore: 2000, ...over }));

describe("a basic turn", () => {
  it("rolls, keeps scoring dice, banks, and passes the turn", () => {
    let s = two();
    s = reduce(s, { type: "roll", values: [1, 5, 2, 3, 4, 6] });
    expect(s.phase).toBe("selecting");
    s = reduce(s, { type: "keepAndBank", ids: [1, 2] }); // dice #1=1, #2=5 → 150
    expect(s.players[0].total).toBe(150);
    expect(s.turnIndex).toBe(1);
    expect(s.round.acted).toBe(1);
    expect(s.phase).toBe("await-roll");
  });
});

describe("bust", () => {
  it("loses the unbanked turn score and passes the turn", () => {
    let s = two();
    s = reduce(s, { type: "roll", values: [2, 3, 4, 6, 2, 3] });
    expect(s.phase).toBe("bust");
    s = reduce(s, { type: "takeBust" });
    expect(s.players[0].total).toBe(0);
    expect(s.turnIndex).toBe(1);
  });
});

describe("hot dice", () => {
  it("refills the pool and keeps the turn score when all six are set aside", () => {
    let s = two();
    s = reduce(s, { type: "roll", values: [1, 1, 1, 5, 5, 5] });
    s = reduce(s, { type: "keepAndRoll", ids: [1, 2, 3, 4, 5, 6] }); // 1000 + 500
    expect(s.turnScore).toBe(1500);
    expect(s.phase).toBe("await-roll");
    expect(s.pool.filter((d) => d.state === "in-play").length).toBe(6);
  });
});

describe("hero points", () => {
  it("spends a point to re-roll out of a bust", () => {
    let s = start(createGame({ players: [{ id: "a", heroPoints: 1 }, { id: "b" }] }));
    s = reduce(s, { type: "roll", values: [2, 3, 4, 6, 2, 3] });
    expect(s.phase).toBe("bust");
    s = reduce(s, { type: "useHeroPoint", rerollIds: [1, 2, 3, 4, 5, 6], values: [1, 5, 5, 2, 3, 4] });
    expect(s.phase).toBe("selecting");
    expect(s.players[0].heroPoints).toBe(0);
    s = reduce(s, { type: "keepAndBank", ids: [1, 2, 3] }); // 1,5,5 → 200
    expect(s.players[0].total).toBe(200);
  });

  it("refuses when the player has none", () => {
    let s = two();
    s = reduce(s, { type: "roll", values: [2, 3, 4, 6, 2, 3] });
    expect(() => reduce(s, { type: "useHeroPoint", rerollIds: [1], values: [1] })).toThrow();
  });
});

describe("complete-the-round win logic", () => {
  it("finishes the round after the trigger; earlier players do not get another turn", () => {
    let s = start(createGame({ players: [{ id: "p1" }, { id: "p2" }, { id: "p3" }], targetScore: 1000 }));

    s = reduce(s, { type: "roll", values: [5, 2, 3, 4, 6, 2] });
    s = reduce(s, { type: "keepAndBank", ids: [1] }); // p1 → 50
    expect(s.turnIndex).toBe(1);

    s = reduce(s, { type: "roll", values: [1, 1, 1, 2, 3, 4] });
    s = reduce(s, { type: "keepAndBank", ids: [1, 2, 3] }); // p2 → 1000, reaches target
    expect(s.players[1].total).toBe(1000);
    expect(s.finalRound.active).toBe(true);
    expect(s.status).toBe("playing");
    expect(s.turnIndex).toBe(2);

    s = reduce(s, { type: "roll", values: [5, 5, 2, 3, 4, 6] });
    s = reduce(s, { type: "keepAndBank", ids: [1, 2] }); // p3 → 100, round completes
    expect(s.status).toBe("finished");
    expect(s.winnerId).toBe("p2");
    expect(s.players[0].total).toBe(50); // p1 only ever acted once
  });
});

describe("tie → sudden death", () => {
  it("does not finish on a tie, then resolves the sudden-death round", () => {
    let s = start(createGame({ players: [{ id: "a" }, { id: "b" }], targetScore: 100 }));

    s = reduce(s, { type: "roll", values: [1, 2, 3, 4, 6, 2] });
    s = reduce(s, { type: "keepAndBank", ids: [1] }); // a → 100, final round
    expect(s.finalRound.active).toBe(true);

    s = reduce(s, { type: "roll", values: [1, 2, 3, 4, 6, 2] });
    s = reduce(s, { type: "keepAndBank", ids: [1] }); // b → 100, tie
    expect(s.status).toBe("playing");
    expect(s.winnerId).toBeNull();
    expect(s.suddenDeath).not.toBeNull();

    s = reduce(s, { type: "roll", values: [5, 2, 3, 4, 6, 2] });
    s = reduce(s, { type: "keepAndBank", ids: [1] }); // a → 150
    s = reduce(s, { type: "roll", values: [1, 2, 3, 4, 6, 2] });
    s = reduce(s, { type: "keepAndBank", ids: [1] }); // b → 200
    expect(s.status).toBe("finished");
    expect(s.winnerId).toBe("b");
  });
});

describe("purity", () => {
  it("never mutates the input state", () => {
    const s0 = two();
    const snapshot = JSON.stringify(s0);
    reduce(s0, { type: "roll", values: [1, 5, 2, 3, 4, 6] });
    expect(JSON.stringify(s0)).toBe(snapshot);
  });
});

describe("dice selection (choosing phase)", () => {
  it("starts in choosing with six fair dice each", () => {
    const s = createGame({ players: [{ id: "a" }, { id: "b" }] });
    expect(s.status).toBe("choosing");
    expect(s.players[0].dieIds).toEqual(["01", "01", "01", "01", "01", "01"]);
    expect(s.players[0].ready).toBe(false);
  });

  it("sets a single slot's die", () => {
    let s = createGame({ players: [{ id: "a" }, { id: "b" }] });
    s = reduce(s, { type: "setDieSlot", playerId: "a", slot: 2, dieId: "02" });
    expect(s.players[0].dieIds[2]).toBe("02");
    expect(s.players[0].dieIds[0]).toBe("01");
  });

  it("setReady marks a player ready; startPlay begins play", () => {
    let s = createGame({ players: [{ id: "a" }, { id: "b" }] });
    s = reduce(s, { type: "setReady", playerId: "a", ready: true });
    expect(s.players[0].ready).toBe(true);
    s = reduce(s, { type: "startPlay" });
    expect(s.status).toBe("playing");
  });

  it("rolling before startPlay is rejected", () => {
    const s = createGame({ players: [{ id: "a" }, { id: "b" }] });
    expect(() => reduce(s, { type: "roll", values: [1, 2, 3, 4, 5, 6] })).toThrow();
  });
});

describe("setDieValue (GM override)", () => {
  it("changes an in-play die and re-scores a bust into a score", () => {
    let s = two();
    s = reduce(s, { type: "roll", values: [2, 3, 4, 6, 2, 3] }); // bust
    expect(s.phase).toBe("bust");
    s = reduce(s, { type: "setDieValue", dieId: 1, value: 5 });
    expect(s.pool.find((d) => d.id === 1).value).toBe(5);
    expect(s.phase).toBe("selecting");
  });

  it("can turn a scoring roll into a bust", () => {
    let s = two();
    s = reduce(s, { type: "roll", values: [1, 3, 4, 6, 2, 3] }); // the 1 scores
    expect(s.phase).toBe("selecting");
    s = reduce(s, { type: "setDieValue", dieId: 1, value: 4 });
    expect(s.phase).toBe("bust");
  });

  it("can set a die to a wild", () => {
    let s = two();
    s = reduce(s, { type: "roll", values: [2, 3, 4, 6, 2, 3] }); // bust
    s = reduce(s, { type: "setDieValue", dieId: 1, value: WILD });
    expect(s.pool.find((d) => d.id === 1).value).toBe(WILD);
    expect(s.phase).toBe("selecting"); // wild + two 3s → triple
  });

  it("rejects an override outside the selecting/bust phase", () => {
    const s = two(); // phase await-roll
    expect(() => reduce(s, { type: "setDieValue", dieId: 1, value: 5 })).toThrow();
  });
});

describe("computePool", () => {
  it("sums each currency across all players' bets", () => {
    const players = [
      { bet: { sun: 10, gold: 5, silver: 0, copper: 100 } },
      { bet: { sun: 0, gold: 15, silver: 15, copper: 127 } },
      { bet: {} },
    ];
    expect(computePool(players)).toEqual({ sun: 10, gold: 20, silver: 15, copper: 227 });
  });
});

describe("setSelection (shared keep-selection)", () => {
  const scoring = (g) => reduce(g, { type: "roll", values: [1, 5, 2, 3, 4, 6] }); // selecting; all in play

  it("createGame seeds an empty selection", () => {
    expect(createGame({ players: [{ id: "a" }, { id: "b" }] }).selection).toEqual([]);
  });

  it("sets the in-play ids during the selecting phase", () => {
    const s = reduce(scoring(two()), { type: "setSelection", ids: [1, 2] });
    expect(s.selection).toEqual([1, 2]);
  });

  it("filters out ids that are not in play", () => {
    let s = scoring(two());
    s = reduce(s, { type: "keepAndRoll", ids: [1] }); // die #1 kept, back to await-roll
    s = reduce(s, { type: "roll", values: [5, 2, 3, 4, 6] }); // 5 in-play dice (#2..#6), selecting
    s = reduce(s, { type: "setSelection", ids: [1, 2] }); // #1 is kept, not in play
    expect(s.selection).toEqual([2]);
  });

  it("de-dupes repeated ids", () => {
    const s = reduce(scoring(two()), { type: "setSelection", ids: [3, 3, 4, 4, 4] });
    expect(s.selection).toEqual([3, 4]);
  });

  it("yields an empty selection when set outside the selecting phase", () => {
    const s = reduce(two(), { type: "setSelection", ids: [1, 2] }); // await-roll
    expect(s.selection).toEqual([]);
  });

  it("is cleared on keepAndRoll", () => {
    let s = reduce(scoring(two()), { type: "setSelection", ids: [1, 2] });
    s = reduce(s, { type: "keepAndRoll", ids: [1, 2] });
    expect(s.selection).toEqual([]);
  });

  it("is cleared on keepAndBank (turn change)", () => {
    let s = reduce(scoring(two()), { type: "setSelection", ids: [1, 2] });
    s = reduce(s, { type: "keepAndBank", ids: [1, 2] });
    expect(s.selection).toEqual([]);
  });

  it("is cleared on useHeroPoint", () => {
    let s = scoring(start(createGame({ players: [{ id: "a", heroPoints: 1 }, { id: "b" }] })));
    s = reduce(s, { type: "setSelection", ids: [1, 2] });
    s = reduce(s, { type: "useHeroPoint", rerollIds: [3], values: [5] });
    expect(s.selection).toEqual([]);
  });

  it("is cleared on a GM setDieValue override", () => {
    let s = reduce(scoring(two()), { type: "setSelection", ids: [1, 2] });
    s = reduce(s, { type: "setDieValue", dieId: 3, value: 1 });
    expect(s.selection).toEqual([]);
  });

  it("is cleared on a fresh roll (defensive)", () => {
    const s = two();
    s.selection = [1, 2, 3]; // simulate a leftover
    expect(reduce(s, { type: "roll", values: [1, 5, 2, 3, 4, 6] }).selection).toEqual([]);
  });

  it("does not mutate the input state", () => {
    const s = scoring(two());
    const snapshot = structuredClone(s);
    reduce(s, { type: "setSelection", ids: [1, 2] });
    expect(s).toEqual(snapshot);
  });
});

describe("gmReroll (GM free re-roll, no Hero Point)", () => {
  const scoring = (g) => reduce(g, { type: "roll", values: [1, 5, 2, 3, 4, 6] }); // selecting
  const bust = (g) => reduce(g, { type: "roll", values: [2, 3, 4, 6, 2, 3] }); // bust

  it("re-rolls without spending a Hero Point", () => {
    let s = scoring(start(createGame({ players: [{ id: "a", heroPoints: 1 }, { id: "b" }] })));
    s = reduce(s, { type: "gmReroll", rerollIds: [3], values: [5] });
    expect(s.players[0].heroPoints).toBe(1); // unchanged
    expect(s.pool.find((d) => d.id === 3).value).toBe(5);
    expect(s.phase).toBe("selecting");
  });

  it("turns a bust into a score", () => {
    let s = bust(two());
    expect(s.phase).toBe("bust");
    s = reduce(s, { type: "gmReroll", rerollIds: [1, 2, 3, 4, 5, 6], values: [1, 5, 2, 3, 4, 6] });
    expect(s.phase).toBe("selecting");
  });

  it("turns a scoring throw into a bust", () => {
    let s = scoring(two()); // #1=1, #2=5 score
    s = reduce(s, { type: "gmReroll", rerollIds: [1, 2], values: [2, 3] }); // pool → 2,3,2,3,4,6
    expect(s.phase).toBe("bust");
  });

  it("rejects an id that is not in play", () => {
    let s = scoring(two());
    s = reduce(s, { type: "keepAndRoll", ids: [1] }); // #1 kept, await-roll
    s = reduce(s, { type: "roll", values: [5, 2, 3, 4, 6] }); // selecting; #1 kept
    expect(() => reduce(s, { type: "gmReroll", rerollIds: [1], values: [3] })).toThrow();
  });

  it("rejects an empty selection", () => {
    expect(() => reduce(scoring(two()), { type: "gmReroll", rerollIds: [], values: [] })).toThrow();
  });

  it("rejects a values/ids length mismatch", () => {
    expect(() => reduce(scoring(two()), { type: "gmReroll", rerollIds: [1], values: [1, 2] })).toThrow();
  });

  it("rejects a re-roll outside the selecting / bust phase", () => {
    expect(() => reduce(two(), { type: "gmReroll", rerollIds: [1], values: [1] })).toThrow();
  });

  it("clears the shared selection", () => {
    let s = reduce(scoring(two()), { type: "setSelection", ids: [1, 2] });
    s = reduce(s, { type: "gmReroll", rerollIds: [3], values: [5] });
    expect(s.selection).toEqual([]);
  });

  it("does not mutate the input state", () => {
    const s = scoring(two());
    const snapshot = structuredClone(s);
    reduce(s, { type: "gmReroll", rerollIds: [3], values: [5] });
    expect(s).toEqual(snapshot);
  });
});

describe("setDieSlot gift tracking", () => {
  const fresh = () => createGame({ players: [{ id: "a" }, { id: "b" }] });

  it("createGame seeds gifts to all-false", () => {
    expect(fresh().players[0].gifts).toEqual([false, false, false, false, false, false]);
  });

  it("records the die id and the gift flag for a GM gift", () => {
    const s = reduce(fresh(), { type: "setDieSlot", playerId: "a", slot: 0, dieId: "07", gifted: true });
    expect(s.players[0].dieIds[0]).toBe("07");
    expect(s.players[0].gifts[0]).toBe(true);
  });

  it("clears the gift flag when the slot is re-picked without a gift", () => {
    let s = reduce(fresh(), { type: "setDieSlot", playerId: "a", slot: 0, dieId: "07", gifted: true });
    s = reduce(s, { type: "setDieSlot", playerId: "a", slot: 0, dieId: "03", gifted: false });
    expect(s.players[0].dieIds[0]).toBe("03");
    expect(s.players[0].gifts[0]).toBe(false);
  });
});

describe("setLoadout (batched, e.g. reset to default)", () => {
  const fresh = () => createGame({ players: [{ id: "a" }, { id: "b" }] });

  it("sets all six slots at once and clears the gift flags", () => {
    let s = reduce(fresh(), { type: "setDieSlot", playerId: "a", slot: 0, dieId: "07", gifted: true });
    s = reduce(s, { type: "setLoadout", playerId: "a", dieIds: ["02", "02", "02", "02", "02", "02"] });
    expect(s.players[0].dieIds).toEqual(["02", "02", "02", "02", "02", "02"]);
    expect(s.players[0].gifts).toEqual([false, false, false, false, false, false]);
  });

  it("does not mutate the input state", () => {
    const s = fresh();
    const snapshot = structuredClone(s);
    reduce(s, { type: "setLoadout", playerId: "a", dieIds: ["01", "02", "03", "04", "05", "06"] });
    expect(s).toEqual(snapshot);
  });
});
