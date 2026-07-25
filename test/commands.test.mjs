import { describe, it, expect, beforeEach, vi } from "vitest";
import { createGame, reduce } from "../src/core/game-state.mjs";

// Mutable mock state, hoisted so the vi.mock factories below can read it.
const h = vi.hoisted(() => ({ state: null, physical: false, owned: new Map(), granted: [], removed: [], removeFails: false, heroReads: [], spent: [], coinPays: [], wallets: {}, deducted: [], refunded: [] }));

// Who owns which actor (for canAct's testUserPermission), and the source actors. `tokTok`
// is an unlinked-token actor uuid owned by alice.
const OWNED_BY = { actorAlice: "alice", actorBob: "bob", tokTok: "alice" };
const USERS = { gm: { id: "gm", isGM: true }, alice: { id: "alice", isGM: false }, bob: { id: "bob", isGM: false } };
// Real Foundry actors carry their own uuid; the fixtures do too, so code that resolves an
// actor from a uuid and then reads it back (the dice-escrow settlement) behaves as it will.
const ACTORS = { actorAlice: { uuid: "actorAlice", type: "character", name: "Alice" }, actorBob: { uuid: "actorBob", type: "character", name: "Bob" }, tokTok: { uuid: "tokTok", type: "character", name: "TokenChar" }, actorNpc: { uuid: "actorNpc", type: "npc", name: "Orc" } };

vi.mock("../src/foundry/state-store.mjs", () => ({
  loadState: () => h.state,
  saveState: (s) => { h.state = s; },
  clearState: () => { h.state = null; },
}));
vi.mock("../src/foundry/dice-roller.mjs", () => ({
  rollValues: async (n) => ({ values: Array.from({ length: n }, () => 5), roll: null }),
}));
vi.mock("../src/foundry/dice-so-nice.mjs", () => ({ animateRoll: async () => {} }));
vi.mock("../src/foundry/hero-points.mjs", () => ({
  getHeroPoints: async (uuid) => { h.heroReads.push(uuid); return 1; },
  spendHeroPoint: async (uuid) => { h.spent.push(uuid); return true; },
}));
vi.mock("../src/foundry/currency.mjs", () => {
  const val = (c) => (c?.sun ?? 0) * 1000 + (c?.gold ?? 0) * 100 + (c?.silver ?? 0) * 10 + (c?.copper ?? 0);
  return {
    awardCoins: async (uuid) => { h.coinPays.push(uuid); return true; },
    walletValue: async (uuid) => h.wallets[uuid] ?? 0,
    deductCoins: async (uuid, coins) => {
      const need = val(coins);
      if ((h.wallets[uuid] ?? 0) < need) return false; // insufficient → caller rolls back
      h.wallets[uuid] -= need;
      h.deducted.push({ uuid, value: need });
      return true;
    },
    refundCoins: async (uuid, coins) => { h.wallets[uuid] = (h.wallets[uuid] ?? 0) + val(coins); h.refunded.push({ uuid, value: val(coins) }); return true; },
  };
});
vi.mock("../src/foundry/dice-data.mjs", () => ({ getDieSpec: () => [1, 1, 1, 1, 1, 1], diceIds: () => ["01", "02", "07", "22"] }));
vi.mock("../src/foundry/dice-items.mjs", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual, // keep the pure helpers (slotCoverage, clampLoadout, prefillLoadout, resolveLoadout, ...)
    isPhysicalMode: () => h.physical,
    inventoryActor: (p) => {
      const key = p?.tokenUuid ?? p?.actorUuid;
      if (!key) return null;
      return { uuid: key, testUserPermission: (user) => OWNED_BY[key] === user?.id };
    },
    ownedDieCounts: () => new Map(h.owned),
    grantDice: async (actor, missing) => { h.granted.push({ uuid: actor?.uuid, counts: [...missing.entries()] }); },
    removeDiceCopies: async (actor, counts) => {
      // Mirrors the real adapter: refuses (touching nothing) when the actor is short.
      for (const [id, n] of counts) if ((h.owned.get(id) ?? 0) < n) return false;
      if (h.removeFails) return false;
      h.removed.push({ uuid: actor?.uuid, counts: [...counts.entries()] });
      return true;
    },
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
  h.state = null; h.physical = false; h.owned = new Map(); h.granted = []; h.removed = []; h.removeFails = false; h.heroReads = []; h.spent = []; h.coinPays = [];
  h.wallets = {}; h.deducted = []; h.refunded = [];
  globalThis.game = {
    user: USERS.gm,
    users: { get: (id) => USERS[id] ?? null, find: (fn) => Object.values(USERS).find(fn) ?? null },
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

describe("physical-mode dice placement + launch stocking", () => {
  it("the GM may place an unowned die; a non-GM cannot", async () => {
    h.physical = true;
    h.state = createGame({ players: [{ id: "a", type: "pc", actorUuid: "actorAlice" }, { id: "b", type: "pc", actorUuid: "actorBob" }], physical: true });
    h.owned = new Map(); // alice owns nothing

    h.state = await dispatchAsGM({ type: "setDieSlot", playerId: "a", slot: 0, dieId: "07" }, "gm", true);
    expect(h.state.players[0].dieIds[0]).toBe("07");

    await expect(dispatchAsGM({ type: "setDieSlot", playerId: "a", slot: 1, dieId: "22" }, "alice", false)).rejects.toThrow();
  });

  it("a player may equip a die they own a copy of", async () => {
    h.physical = true;
    h.state = createGame({ players: [{ id: "a", type: "pc", actorUuid: "actorAlice" }, { id: "b", type: "pc", actorUuid: "actorBob" }], physical: true });
    h.owned = new Map([["07", 1]]);
    h.state = await dispatchAsGM({ type: "setDieSlot", playerId: "a", slot: 0, dieId: "07" }, "alice", false);
    expect(h.state.players[0].dieIds[0]).toBe("07");
  });

  it("auto-stocks a PC's missing slot dice on start, with no block", async () => {
    h.physical = true;
    h.state = createGame({ players: [{ id: "a", type: "pc", actorUuid: "actorAlice" }, { id: "b", type: "pc", actorUuid: "actorBob" }], physical: true });
    h.owned = new Map(); // alice owns nothing — just the default slot dice are shown
    h.state.players[0].dieIds = ["07", "07", "07", "07", "07", "07"]; // owns none
    h.state.players[1].dieIds = ["02", "02", "02", "02", "02", "02"];
    const launched = await dispatchAsGM({ type: "startPlay" }, "gm", true);
    expect(launched.status).toBe("playing"); // starts immediately, no block
    expect(h.granted.length).toBeGreaterThan(0); // the missing dice were granted on start
  });
});

describe("Hero Points: NPCs get none, generics get the pool (#11)", () => {
  it("an NPC participant is seeded 0 Hero Points even with a non-zero pool", async () => {
    const config = { npcHeroPool: 3, players: [{ id: "a", actorUuid: "actorNpc" }, { id: "b", actorUuid: "actorBob" }] };
    const s = await dispatchAsGM({ type: "startGame", config }, "gm", true);
    expect(s.players[0].type).toBe("npc");
    expect(s.players[0].heroPoints).toBe(0);
  });

  it("a generic (name-only) participant gets the configured pool", async () => {
    const config = { npcHeroPool: 3, players: [{ id: "a", actorUuid: "actorBob" }, { id: "b", name: "Barkeep" }] };
    const s = await dispatchAsGM({ type: "startGame", config }, "gm", true);
    expect(s.players[1].type).toBe("generic");
    expect(s.players[1].heroPoints).toBe(3);
  });
});

describe("startGame does not clobber a running game (#14)", () => {
  const config = { players: [{ id: "a", actorUuid: "actorAlice" }, { id: "b", actorUuid: "actorBob" }] };

  it("refuses to start over an in-progress game without force", async () => {
    h.state = playingGame();
    await expect(dispatchAsGM({ type: "startGame", config }, "gm", true)).rejects.toThrow();
  });

  it("replaces a running game with force, refunding the old stakes", async () => {
    h.state = playingGame();
    h.state.escrow = [{ uuid: "actorAlice", coins: { gold: 5 } }];
    const s = await dispatchAsGM({ type: "startGame", force: true, config }, "gm", true);
    expect(s.status).toBe("choosing");
    expect(h.refunded.length).toBe(1);
  });

  it("starts over a finished game without force", async () => {
    h.state = playingGame(); h.state.status = "finished";
    const s = await dispatchAsGM({ type: "startGame", config }, "gm", true);
    expect(s.status).toBe("choosing");
  });
});

describe("stake escrow (collection, mint/borrow, refund)", () => {
  const choosingWithBets = (players) => createGame({ players });

  it("skips collection entirely when nobody bet", async () => {
    h.state = choosingWithBets([{ id: "a", type: "pc", actorUuid: "actorAlice" }, { id: "b", type: "pc", actorUuid: "actorBob" }]);
    const s = await dispatchAsGM({ type: "startPlay" }, "gm", true);
    expect(s.status).toBe("playing");
    expect(h.deducted).toEqual([]);
    expect(s.escrow).toEqual([]);
  });

  it("deducts each bettor's affordable part and records escrow when all can pay", async () => {
    h.wallets = { actorAlice: 1000, actorBob: 1000 };
    h.state = choosingWithBets([
      { id: "a", type: "pc", actorUuid: "actorAlice", bet: { gold: 5 } },
      { id: "b", type: "pc", actorUuid: "actorBob", bet: { gold: 5 } },
    ]);
    const s = await dispatchAsGM({ type: "startPlay" }, "gm", true); // no shortfalls → no resolutions
    expect(h.wallets).toEqual({ actorAlice: 500, actorBob: 500 });
    expect(s.escrow.length).toBe(2);
  });

  it("mints a shortfall (no deduction beyond the affordable part)", async () => {
    h.wallets = { actorAlice: 100 }; // has 1 gp, bets 5 gp
    h.state = choosingWithBets([
      { id: "a", type: "pc", actorUuid: "actorAlice", bet: { gold: 5 } },
      { id: "b", type: "npc", actorUuid: "actorBob", bet: {} },
    ]);
    const s = await dispatchAsGM({ type: "startPlay", stakes: { a: { mode: "mint" } } }, "gm", true);
    expect(h.wallets.actorAlice).toBe(0); // paid their 1 gp
    expect(s.escrow.length).toBe(1); // only the affordable part; the mint moved no coin
  });

  it("borrows a shortfall from a lender and escrows the lender's deduction", async () => {
    h.wallets = { actorAlice: 100, actorC: 1000 }; // Alice 1 gp, lender C 10 gp
    h.state = choosingWithBets([
      { id: "a", type: "pc", actorUuid: "actorAlice", bet: { gold: 5 } },
      { id: "b", type: "pc", actorUuid: "actorBob", bet: {} },
    ]);
    const stakes = { a: { mode: "borrow", borrow: [{ uuid: "actorC", coins: { gold: 4 } }] } };
    const s = await dispatchAsGM({ type: "startPlay", stakes }, "gm", true);
    expect(h.wallets.actorAlice).toBe(0); // paid 1 gp
    expect(h.wallets.actorC).toBe(600); // lent 4 gp
    expect(s.escrow.length).toBe(2);
  });

  it("endGame refunds escrow while unfinished", async () => {
    h.wallets = { actorAlice: 1000, actorBob: 1000 };
    h.state = choosingWithBets([
      { id: "a", type: "pc", actorUuid: "actorAlice", bet: { gold: 5 } },
      { id: "b", type: "pc", actorUuid: "actorBob", bet: { gold: 5 } },
    ]);
    h.state = await dispatchAsGM({ type: "startPlay" }, "gm", true);
    await dispatchAsGM({ type: "endGame" }, "gm", true);
    expect(h.wallets).toEqual({ actorAlice: 1000, actorBob: 1000 }); // fully restored
    expect(h.refunded.length).toBe(2);
  });

  it("does NOT refund a finished game on endGame (the pot was already paid)", async () => {
    h.wallets = { actorAlice: 1000, actorBob: 1000 };
    h.state = choosingWithBets([
      { id: "a", type: "pc", actorUuid: "actorAlice", bet: { gold: 5 } },
      { id: "b", type: "pc", actorUuid: "actorBob", bet: { gold: 5 } },
    ]);
    h.state = await dispatchAsGM({ type: "startPlay" }, "gm", true);
    h.state.status = "finished";
    await dispatchAsGM({ type: "endGame" }, "gm", true);
    expect(h.refunded).toEqual([]);
  });

  it("rolls back all deductions and throws if a borrow deduction fails", async () => {
    h.wallets = { actorAlice: 100, actorC: 50 }; // Alice 1 gp (bets 5, short 4), lender C can't cover 4 gp
    h.state = choosingWithBets([
      { id: "a", type: "pc", actorUuid: "actorAlice", bet: { gold: 5 } },
      { id: "b", type: "pc", actorUuid: "actorBob", bet: {} },
    ]);
    const stakes = { a: { mode: "borrow", borrow: [{ uuid: "actorC", coins: { gold: 4 } }] } };
    await expect(dispatchAsGM({ type: "startPlay", stakes }, "gm", true)).rejects.toThrow();
    expect(h.wallets.actorAlice).toBe(100); // Alice's affordable 1 gp payment was rolled back
    expect(h.state.status).toBe("choosing"); // never started (throw before save)
  });
});

describe("token-bound participants resolve HP/coins token-first (Q2)", () => {
  it("buildNewGame seeds type + Hero Points via the token's actor for a token-only participant", async () => {
    const config = { players: [{ id: "a", tokenUuid: "tokTok", actorUuid: null }, { id: "b", actorUuid: "actorBob" }] };
    const s = await dispatchAsGM({ type: "startGame", config }, "gm", true);
    expect(s.players[0].type).toBe("pc"); // type resolved through the token's actor
    expect(h.heroReads).toContain("tokTok"); // Hero Points seeded via the token uuid
  });

  it("useHeroPoint spends on the token's actor, not the underlying world actor", async () => {
    let s = createGame({
      players: [
        { id: "a", type: "pc", tokenUuid: "tokTok", actorUuid: "actorAlice", heroPoints: 1 },
        { id: "b", type: "pc", actorUuid: "actorBob" },
      ],
    });
    s = reduce(s, { type: "startPlay" });
    h.state = s;
    h.state = await dispatchAsGM({ type: "roll" }, "alice", false); // alice's turn → selecting
    await dispatchAsGM({ type: "useHeroPoint", rerollIds: [1] }, "alice", false);
    expect(h.spent).toContain("tokTok"); // spent on the token's actor, never actorAlice
    expect(h.spent).not.toContain("actorAlice");
  });
});

describe("wagering dice", () => {
  /** A choosing-phase physical game where alice puts dice up. */
  const stakingGame = () => {
    h.physical = true;
    h.owned = new Map([["02", 1], ["07", 1], ["01", 6]]);
    let s = createGame({
      players: [
        { id: "a", type: "pc", actorUuid: "actorAlice", stakeDice: true, dieIds: ["02", "07", "01", "01", "01", "01"] },
        { id: "b", type: "pc", actorUuid: "actorBob" },
      ],
      physical: true,
    });
    return s;
  };

  /** A playing game one action away from alice winning, with dice already escrowed. */
  const aboutToFinish = ({ winnerActorless = false } = {}) => {
    let s = createGame({
      players: [
        { id: "a", type: winnerActorless ? "generic" : "pc", actorUuid: winnerActorless ? null : "actorAlice" },
        { id: "b", type: "pc", actorUuid: "actorBob" },
      ],
      targetScore: 100,
    });
    s = reduce(s, { type: "startPlay" });
    s.players[0].total = 100;
    s.finalRound = { active: true, triggeredBy: "a" };
    s.round = { index: 0, acted: 1 };
    s.turnIndex = 1; // bob acts last
    s.phase = "bust";
    s.diceEscrow = [{ uuid: "actorAlice", dieId: "02" }, { uuid: "actorBob", dieId: "07" }];
    s.escrow = [{ uuid: "actorAlice", coins: { gold: 5 } }];
    return s;
  };

  it("lets the owner put a die up, and refuses someone else's dice", async () => {
    h.state = stakingGame();
    const s = await dispatchAsGM({ type: "setDieStake", playerId: "a", slot: 0, staked: true }, "alice", false);
    expect(s.players[0].betDice[0]).toBe(true);
    await expect(dispatchAsGM({ type: "setDieStake", playerId: "a", slot: 1, staked: true }, "bob", false)).rejects.toThrow();
  });

  it("lets the GM stake for a participant they run", async () => {
    h.state = stakingGame();
    const s = await dispatchAsGM({ type: "setDieStake", playerId: "a", slot: 1, staked: true }, "gm", true);
    expect(s.players[0].betDice[1]).toBe(true);
  });

  it("refuses to change the pot once play has started", async () => {
    h.state = reduce(stakingGame(), { type: "startPlay" });
    await expect(dispatchAsGM({ type: "setDieStake", playerId: "a", slot: 0, staked: true }, "gm", true)).rejects.toThrow();
  });

  it("takes the staked dice out of the inventory on start and escrows them", async () => {
    h.state = stakingGame();
    await dispatchAsGM({ type: "setDieStake", playerId: "a", slot: 0, staked: true }, "alice", false);
    await dispatchAsGM({ type: "setDieStake", playerId: "a", slot: 1, staked: true }, "alice", false);
    const s = await dispatchAsGM({ type: "startPlay" }, "gm", true);
    expect(h.removed).toEqual([{ uuid: "actorAlice", counts: [["02", 1], ["07", 1]]}]);
    expect(s.diceEscrow).toEqual([
      { uuid: "actorAlice", dieId: "02", shownAs: "02" },
      { uuid: "actorAlice", dieId: "07", shownAs: "07" },
    ]);
  });

  it("moves nothing and refuses to start when a staked die cannot be produced", async () => {
    h.state = stakingGame();
    await dispatchAsGM({ type: "setDieStake", playerId: "a", slot: 0, staked: true }, "alice", false);
    h.removeFails = true;
    await expect(dispatchAsGM({ type: "startPlay" }, "gm", true)).rejects.toThrow();
    expect(h.removed).toEqual([]);
    expect(h.state.status).toBe("choosing"); // the game never left the picker
  });

  it("collects no dice when nobody staked any", async () => {
    h.state = stakingGame();
    const s = await dispatchAsGM({ type: "startPlay" }, "gm", true);
    expect(h.removed).toEqual([]);
    expect(s.diceEscrow).toEqual([]);
  });

  it("hands every staked die to the winner", async () => {
    h.state = aboutToFinish();
    const s = await dispatchAsGM({ type: "takeBust" }, "bob", false);
    expect(s.status).toBe("finished");
    expect(s.winnerId).toBe("a");
    // one grant to the winner's actor carrying both escrowed dice
    const toWinner = h.granted.filter((g) => g.uuid === "actorAlice");
    expect(toWinner).toEqual([{ uuid: "actorAlice", counts: [["02", 1], ["07", 1]] }]);
    expect(h.coinPays).toContain("actorAlice");
    expect(s.diceEscrow).toEqual([]);
  });

  it("gives the pot back when the winner has no actor to receive it", async () => {
    h.state = aboutToFinish({ winnerActorless: true });
    const s = await dispatchAsGM({ type: "takeBust" }, "bob", false);
    expect(s.status).toBe("finished");
    expect(h.coinPays).toEqual([]); // nothing was paid out
    expect(h.refunded.map((r) => r.uuid)).toContain("actorAlice"); // coins went home
    expect(h.granted.map((g) => g.uuid).sort()).toEqual(["actorAlice", "actorBob"]); // and so did the dice
    expect(s.diceEscrow).toEqual([]);
  });

  it("returns staked dice to their owners when the game ends with no winner", async () => {
    h.state = playingGame();
    h.state.diceEscrow = [{ uuid: "actorAlice", dieId: "02" }, { uuid: "actorAlice", dieId: "02" }, { uuid: "actorBob", dieId: "07" }];
    await dispatchAsGM({ type: "endGame" }, "gm", true);
    expect(h.granted).toEqual([
      { uuid: "actorAlice", counts: [["02", 2]] }, // both copies, in one grant
      { uuid: "actorBob", counts: [["07", 1]] },
    ]);
  });
});

describe("palming a die out of the pot", () => {
  /** A playing game whose pot holds alice's queen (02), collected and shown as itself. */
  const palmedGame = () => {
    const s = playingGame();
    s.diceEscrow = [{ uuid: "actorAlice", dieId: "02", shownAs: "02" }];
    return s;
  };

  it("is the GM's move alone, and only mid-game", async () => {
    h.state = palmedGame();
    await expect(dispatchAsGM({ type: "swapPotDie", index: 0, dieId: "07" }, "alice", false)).rejects.toThrow();
    await expect(dispatchAsGM({ type: "swapPotDie", index: 0, dieId: "07" }, "gm", false)).rejects.toThrow(); // forged over the socket
    h.state.status = "choosing";
    await expect(dispatchAsGM({ type: "swapPotDie", index: 0, dieId: "07" }, "gm", true)).rejects.toThrow();
  });

  it("rejects a die that does not exist and an index that is not in the pot", async () => {
    h.state = palmedGame();
    await expect(dispatchAsGM({ type: "swapPotDie", index: 0, dieId: "99" }, "gm", true)).rejects.toThrow();
    await expect(dispatchAsGM({ type: "swapPotDie", index: 5, dieId: "07" }, "gm", true)).rejects.toThrow();
  });

  it("returns the real die to its owner and swaps in the stand-in, keeping the shown name", async () => {
    h.state = palmedGame();
    h.owned = new Map([["07", 1]]); // the cheat brought the lookalike along
    const s = await dispatchAsGM({ type: "swapPotDie", index: 0, dieId: "07" }, "gm", true);
    expect(h.granted).toEqual([{ uuid: "actorAlice", counts: [["02", 1]] }]); // queen into the sleeve
    expect(h.removed).toEqual([{ uuid: "actorAlice", counts: [["07", 1]] }]); // lookalike out of the pocket
    expect(s.diceEscrow[0]).toEqual({ uuid: "actorAlice", dieId: "07", shownAs: "02" }); // table still sees the queen
  });

  it("mints the stand-in when the owner does not have one", async () => {
    h.state = palmedGame();
    h.owned = new Map(); // pockets empty; the die appears from nowhere
    const s = await dispatchAsGM({ type: "swapPotDie", index: 0, dieId: "07" }, "gm", true);
    expect(h.granted).toEqual([{ uuid: "actorAlice", counts: [["02", 1]] }]);
    expect(h.removed).toEqual([]); // nothing left an inventory
    expect(s.diceEscrow[0].dieId).toBe("07");
  });

  it("hands the winner the stand-in, not the die the table saw", async () => {
    h.state = palmedGame();
    await dispatchAsGM({ type: "swapPotDie", index: 0, dieId: "07" }, "gm", true);
    // drive the game to a finish: alice wins by total
    h.state.players[0].total = 100;
    h.state.targetScore = 100;
    h.state.finalRound = { active: true, triggeredBy: "a" };
    h.state.round = { index: 0, acted: 1 };
    h.state.turnIndex = 1;
    h.state.phase = "bust";
    const s = await dispatchAsGM({ type: "takeBust" }, "bob", false);
    expect(s.status).toBe("finished");
    const toWinner = h.granted.filter((g) => g.uuid === "actorAlice");
    expect(toWinner.at(-1)).toEqual({ uuid: "actorAlice", counts: [["07", 1]] }); // the cheap truth
  });

  it("writes no log line: the con leaves no paper trail", async () => {
    h.state = palmedGame();
    const before = (h.state.log ?? []).length;
    const s = await dispatchAsGM({ type: "swapPotDie", index: 0, dieId: "07" }, "gm", true);
    expect((s.log ?? []).length).toBe(before);
  });
});
