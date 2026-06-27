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
