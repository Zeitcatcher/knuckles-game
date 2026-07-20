import { describe, it, expect } from "vitest";
import {
  FACES,
  TOTAL,
  isCustomId,
  makeCustomId,
  parseFace,
  parseFaces,
  resolveFaces,
  faceCeiling,
  clampFace,
  validateDie,
  toDefinition,
  toDraft,
  sanitizeList,
} from "../src/core/custom-dice.mjs";

/** Deterministic rng over a fixed sequence, cycling. */
const seq = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const draft = (over = {}) => ({
  name: "Волчья кость",
  desc: "",
  img: "worlds/shards/wolf.webp",
  price: 1200,
  faces: [40, null, null, null, 25, 5],
  ...over,
});

describe("custom ids", () => {
  it("never collides with a catalog id", () => {
    for (const id of ["01", "22", "37", "7", ""]) expect(isCustomId(id)).toBe(false);
  });

  it("mints ids that read as custom", () => {
    const id = makeCustomId([], seq([0.42]));
    expect(isCustomId(id)).toBe(true);
    expect(id.startsWith("c")).toBe(true);
  });

  it("skips an id already taken", () => {
    const first = makeCustomId([], seq([0.42]));
    const second = makeCustomId([first], seq([0.42, 0.77]));
    expect(second).not.toBe(first);
    expect(isCustomId(second)).toBe(true);
  });

  it("still returns a fresh id when the rng keeps repeating itself", () => {
    const taken = [makeCustomId([], () => 0.5)];
    const next = makeCustomId(taken, () => 0.5); // 50 attempts all collide
    expect(taken).not.toContain(next);
    expect(isCustomId(next)).toBe(true);
  });
});

describe("face input parsing", () => {
  it("reads blank fields as empty, not as zero", () => {
    expect(parseFace("")).toBe(null);
    expect(parseFace("   ")).toBe(null);
    expect(parseFace(null)).toBe(null);
    expect(parseFace(undefined)).toBe(null);
    expect(parseFace(0)).toBe(0); // an explicit zero is a real answer: this face never rolls
  });

  it("accepts a decimal comma and rounds to one place", () => {
    expect(parseFace("12,5")).toBe(12.5);
    expect(parseFace("12.34")).toBe(12.3);
  });

  it("rejects junk and negatives, and caps at the whole pool", () => {
    expect(parseFace("abc")).toBe(null);
    expect(parseFace(-5)).toBe(null);
    expect(parseFace(150)).toBe(TOTAL);
  });

  it("always yields six faces", () => {
    expect(parseFaces([10, 20]).length).toBe(FACES);
    expect(parseFaces(undefined)).toEqual(Array(FACES).fill(null));
  });
});

describe("resolveFaces", () => {
  it("splits the remainder equally across the blank faces", () => {
    const r = resolveFaces([40, null, null, null, 25, 5]);
    expect(r.assigned).toBe(70);
    expect(r.remaining).toBe(30);
    expect(r.emptyCount).toBe(3);
    expect(r.share).toBe(10);
    expect(r.weights).toEqual([40, 10, 10, 10, 25, 5]);
    expect(r.complete).toBe(true);
  });

  it("makes an all-blank die uniform", () => {
    const r = resolveFaces([null, null, null, null, null, null]);
    expect(r.weights.every((w) => w === r.weights[0])).toBe(true);
    expect(r.complete).toBe(true);
  });

  it("accepts an all-typed set that lands exactly on the whole", () => {
    const r = resolveFaces([50, 10, 10, 10, 10, 10]);
    expect(r.complete).toBe(true);
    expect(r.error).toBe(null);
    expect(r.share).toBe(null);
  });

  it("flags an all-typed set that comes up short", () => {
    const r = resolveFaces([10, 10, 10, 10, 10, 10]);
    expect(r.complete).toBe(false);
    expect(r.error).toBe("short");
  });

  it("flags a set that claims more than the whole", () => {
    const r = resolveFaces([60, 60, null, null, null, null]);
    expect(r.error).toBe("over");
    expect(r.complete).toBe(false);
  });

  it("gives the blank faces nothing when the typed ones take everything", () => {
    const r = resolveFaces([100, null, null, null, null, null]);
    expect(r.remaining).toBe(0);
    expect(r.share).toBe(0);
    expect(r.weights).toEqual([100, 0, 0, 0, 0, 0]);
    expect(r.complete).toBe(true);
  });

  it("resolves every weight to a non-negative number", () => {
    for (const inputs of [[40, null, null, null, 25, 5], [0, 0, 0, 0, 0, 100], []]) {
      const { weights } = resolveFaces(inputs);
      expect(weights.length).toBe(FACES);
      expect(weights.every((w) => Number.isFinite(w) && w >= 0)).toBe(true);
    }
  });
});

describe("the pool can never be overspent", () => {
  it("reports what a face may still claim", () => {
    expect(faceCeiling([40, null, null, null, 25, 5], 1)).toBe(30);
    expect(faceCeiling([40, null, null, null, 25, 5], 0)).toBe(70); // its own value doesn't count
    expect(faceCeiling([50, 50, null, null, null, null], 2)).toBe(0);
  });

  it("clamps a typed face to the ceiling", () => {
    expect(clampFace([40, null, null, null, 25, 5], 1, 99)).toBe(30);
    expect(clampFace([40, null, null, null, 25, 5], 1, 12)).toBe(12);
    expect(clampFace([40, null, null, null, 25, 5], 1, "")).toBe(null);
  });

  it("holds under a run of greedy entries", () => {
    const inputs = [null, null, null, null, null, null];
    for (let i = 0; i < FACES; i += 1) inputs[i] = clampFace(inputs, i, 80);
    const sum = inputs.reduce((a, b) => a + (b ?? 0), 0);
    expect(sum).toBeLessThanOrEqual(TOTAL);
    expect(resolveFaces(inputs).error).toBe(null);
  });
});

describe("validateDie", () => {
  it("passes a complete draft", () => {
    expect(validateDie(draft()).ok).toBe(true);
  });

  it("requires a name and an icon", () => {
    expect(validateDie(draft({ name: "  " })).errors).toContain("name");
    expect(validateDie(draft({ img: "" })).errors).toContain("icon");
  });

  it("rejects a short all-typed set", () => {
    expect(validateDie(draft({ faces: [10, 10, 10, 10, 10, 10] })).errors).toContain("short");
  });

  it("rejects a negative price", () => {
    expect(validateDie(draft({ price: -1 })).errors).toContain("price");
  });
});

describe("definition round trip", () => {
  it("stores resolved weights and a copper price", () => {
    const def = toDefinition(draft(), "cab12");
    expect(def.id).toBe("cab12");
    expect(def.weights).toEqual([40, 10, 10, 10, 25, 5]);
    expect(def.price).toBe(1200);
    expect(def.name).toBe("Волчья кость");
  });

  it("survives a round trip back into the form", () => {
    const def = toDefinition(draft(), "cab12");
    const back = toDraft(def);
    expect(back.faces).toEqual([40, 10, 10, 10, 25, 5]);
    expect(resolveFaces(back.faces).weights).toEqual(def.weights);
    expect(back.price).toBe(1200);
  });
});

describe("sanitizeList", () => {
  const good = { id: "cab12", name: "n", desc: "", img: "i.webp", price: 10, weights: [1, 1, 1, 1, 1, 1] };

  it("keeps a good entry untouched", () => {
    expect(sanitizeList([good])).toEqual([good]);
  });

  it("drops entries the picker could not roll", () => {
    const bad = [
      { ...good, id: "01" },                              // would shadow a catalog die
      { ...good, id: "cbad1", weights: [1, 1, 1] },        // wrong face count
      { ...good, id: "cbad2", weights: [0, 0, 0, 0, 0, 0] }, // no face can ever come up
      { ...good, id: "cbad3", weights: [1, -1, 1, 1, 1, 1] },
      null,
      "nonsense",
    ];
    expect(sanitizeList(bad)).toEqual([]);
  });

  it("drops a duplicate id and tolerates a non-array", () => {
    expect(sanitizeList([good, { ...good, name: "other" }]).length).toBe(1);
    expect(sanitizeList(null)).toEqual([]);
    expect(sanitizeList({})).toEqual([]);
  });
});
