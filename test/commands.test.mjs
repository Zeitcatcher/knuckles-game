import { describe, it, expect, beforeEach, vi } from "vitest";
import { createGame, reduce } from "../src/core/game-state.mjs";

// Mutable mock state, hoisted so the vi.mock factories below can read it.
const h = vi.hoisted(() => ({ state: null, physical: false, owned: new Map(), granted: [] }));

// Who owns which actor (for canAct's testUserPermission), and the source actors.
const OWNED_BY = { actorAlice: "alice", actorBob: "bob" };
const USERS = { gm: { id: "gm", isGM: true }, alice: { id: "alice", isGM: false }, bob: { id: "bob", isGM: false } };
const ACTORS = { actorAlice: { type: "character", name: "Alice" }, actorBob: { type: "character", name: "Bob" } };

vi.mock("../src/foundry/state-store.mjs", () => ({
  loadState: () => h.state,
  saveState: (s) => { h.state = s; },
  clearState: () => { h.state = null; },
}));
vi.mock("../src/foundry/dice-roller.mjs", () => ({
  rollValues: async (n) => ({ values: Array.from({ length: n }, () => 5), roll: null }),
}));
vi.mock("../src/foundry/dice-so-nice.mjs", () => ({ animateRoll: async () => {} }));
vi.mock("../src/foundry/hero-points.mjs", () => ({ getHeroPoints: async () => 0, spendHeroPoint: async () => true }));
vi.mock("../src/foundry/currency.mjs", () => ({ awardCoins: async () => true }));
vi.mock("../src/foundry/dice-data.mjs", () => ({ getDieSpec: () => [1, 1, 1, 1, 1, 1], diceIds: () => ["01", "02", "07", "22"] }));
vi.mock("../src/foundry/dice-items.mjs", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual, // keep the pure helpers (coverLoadout, clampLoadout, prefillLoadout, resolveLoadout, ...)
    isPhysicalMode: () => h.physical,
    inventoryActor: (p) => {
      const key = p?.tokenUuid ?? p?.actorUuid;
      if (!key) return null;
      return { uuid: key, testUserPermission: (user) => OWNED_BY[key] === user?.id };
    },
    ownedDieCounts: () => new Map(h.owned),
    grantDice: async (_actor, missing) => { h.granted.push([...missing.entries()]); },
    readDefaultLoadout: () => null,
  };
});

const { dispatchAsGM } = await import("../src/net/commands.mjs");

const playingGame = (over = {}) => {
  let s = createGame({ players: [{ id: "a", type: "pc", actorUuid: "actorAlice" }, { id: "b", type: "pc", actorUuid: "actorBob" }], ...over });
  s = reduce(s, { type: "startPlay" }); // status playing, alice's turn (turnIndex 0), phase await-roll
  return s;
};

beforeEach(() => {
  h.state = null; h.physical = false; h.owned = new Map(); h.granted = [];
  globalThis.game = {
    users: { get: (id) => USERS[id] ?? null },
    i18n: { format: (k) => k, localize: (k) => k },
    settings: { get: () => undefined, set: async () => {} },
  };
  globalThis.ui = { notifications: { warn: () => {}, info: () => {} } };
  globalThis.fromUuid = async (uuid) => ACTORS[uuid] ?? null;
});

describe("GM authority requires a LOCAL dispatch (forgeable userId is neutralised)", () => {
  it("startGame: a local GM succeeds; a forged GM id over the socket is rejected", async () => {
    const config = { players: [{ id: "a", actorUuid: "actorAlice" }, { id: "b", actorUuid: "actorBob" }] };
    const s = await dispatchAsGM({ type: "startGame", config }, "gm", true);
    expect(s.status).toBe("choosing");
    await expect(dispatchAsGM({ type: "startGame", config }, "gm", false)).rejects.toThrow(); // socket call claiming the GM id
    await expect(dispatchAsGM({ type: "startGame", config }, "alice", false)).rejects.toThrow(); // a player
  });

  it.each(["endGame", "startPlay", "setDieValue", "gmReroll"])(
    "%s is rejected for a forged GM id over the socket (local=false)",
    async (type) => {
      h.state = playingGame();
      const intent = { type, dieId: 1, value: 5, rerollIds: [1] };
      await expect(dispatchAsGM(intent, "gm", false)).rejects.toThrow();
      await expect(dispatchAsGM(intent, "alice", false)).rejects.toThrow();
    },
  );

  it("endGame succeeds for the local GM", async () => {
    h.state = playingGame();
    const result = await dispatchAsGM({ type: "endGame" }, "gm", true);
    expect(result).toBe(null);
  });
});

describe("player-turn authority", () => {
  it("the current player's owner may roll on their turn; others may not", async () => {
    h.state = playingGame(); // alice's turn
    h.state = await dispatchAsGM({ type: "roll" }, "alice", false);
    expect(["selecting", "bust"]).toContain(h.state.phase);

    h.state = playingGame();
    await expect(dispatchAsGM({ type: "roll" }, "bob", false)).rejects.toThrow(); // not bob's turn
  });

  it("the local GM may act for the current player", async () => {
    h.state = playingGame();
    h.state = await dispatchAsGM({ type: "roll" }, "gm", true);
    expect(["selecting", "bust"]).toContain(h.state.phase);
  });

  it("setSelection is gated to the controller and ignored for a non-controller", async () => {
    h.state = playingGame();
    h.state = await dispatchAsGM({ type: "roll" }, "alice", false); // → selecting (all 5s)
    h.state = await dispatchAsGM({ type: "setSelection", ids: [2] }, "alice", false);
    expect(h.state.selection).toEqual([2]);
    await expect(dispatchAsGM({ type: "setSelection", ids: [3] }, "bob", false)).rejects.toThrow();
  });
});

describe("physical-mode gifting + launch (block unless GM gifted six)", () => {
  it("the GM may gift an unowned die (sets the gift flag); a non-GM cannot", async () => {
    h.physical = true;
    h.state = createGame({ players: [{ id: "a", type: "pc", actorUuid: "actorAlice" }, { id: "b", type: "pc", actorUuid: "actorBob" }], physical: true });
    h.owned = new Map(); // alice owns nothing

    h.state = await dispatchAsGM({ type: "setDieSlot", playerId: "a", slot: 0, dieId: "07" }, "gm", true);
    expect(h.state.players[0].dieIds[0]).toBe("07");
    expect(h.state.players[0].gifts[0]).toBe(true);

    await expect(dispatchAsGM({ type: "setDieSlot", playerId: "a", slot: 1, dieId: "22" }, "alice", false)).rejects.toThrow();
  });

  it("the GM may gift an EXTRA copy of an already-owned die", async () => {
    h.physical = true;
    h.state = createGame({ players: [{ id: "a", type: "pc", actorUuid: "actorAlice" }, { id: "b", type: "pc", actorUuid: "actorBob" }], physical: true });
    h.owned = new Map([["07", 1]]); // owns ONE 07
    // GM puts 07 in two slots — the second is a gift (over-allocation)
    h.state = await dispatchAsGM({ type: "setDieSlot", playerId: "a", slot: 0, dieId: "07" }, "gm", true);
    h.state = await dispatchAsGM({ type: "setDieSlot", playerId: "a", slot: 1, dieId: "07" }, "gm", true);
    expect(h.state.players[0].gifts[0]).toBe(true);
    expect(h.state.players[0].gifts[1]).toBe(true);
  });

  it("launch grants the gifted shortfall and blocks an un-gifted shortfall", async () => {
    h.physical = true;
    // Alice: all six slots gifted (owns nothing) → granted, launches.
    h.state = createGame({ players: [{ id: "a", type: "pc", actorUuid: "actorAlice" }, { id: "b", type: "pc", actorUuid: "actorBob" }], physical: true });
    h.owned = new Map();
    h.state.players[0].dieIds = ["07", "07", "07", "07", "07", "07"];
    h.state.players[0].gifts = [true, true, true, true, true, true];
    h.state.players[1].dieIds = ["07", "07", "07", "07", "07", "07"];
    h.state.players[1].gifts = [true, true, true, true, true, true];
    const launched = await dispatchAsGM({ type: "startPlay" }, "gm", true);
    expect(launched.status).toBe("playing");
    expect(h.granted.length).toBeGreaterThan(0); // dice were granted

    // Now an un-gifted shortfall blocks.
    h.granted = [];
    h.state = createGame({ players: [{ id: "a", type: "pc", actorUuid: "actorAlice" }, { id: "b", type: "pc", actorUuid: "actorBob" }], physical: true });
    h.owned = new Map();
    h.state.players[0].dieIds = ["07", "07", "07", "07", "07", "07"];
    h.state.players[0].gifts = [false, false, false, false, false, false]; // not gifted
    await expect(dispatchAsGM({ type: "startPlay" }, "gm", true)).rejects.toThrow();
  });
});
