import { describe, it, expect } from "vitest";
import { pickerSignature } from "../src/core/transient-ui.mjs";

const mk = (over = {}) => ({
  status: "choosing",
  players: [
    { id: "a", name: "Borin", ready: false, type: "pc", dieIds: ["01", "01", "01", "01", "01", "01"] },
    { id: "b", name: "Mira", ready: false, type: "pc", dieIds: ["02", "02", "02", "02", "02", "02"] },
    { id: "c", name: "Keep", ready: false, type: "npc", dieIds: ["03", "03", "03", "03", "03", "03"] },
  ],
  ...over,
});

describe("pickerSignature", () => {
  it("is equal for two identical states over the same slice", () => {
    expect(pickerSignature(mk(), ["a", "b"])).toBe(pickerSignature(mk(), ["a", "b"]));
  });

  it("changes when an editable player's dieIds change", () => {
    const a = pickerSignature(mk(), ["a"]);
    const s2 = mk();
    s2.players[0].dieIds[0] = "07";
    expect(pickerSignature(s2, ["a"])).not.toBe(a);
  });

  it("changes when an editable player's name / ready / type change", () => {
    const base = pickerSignature(mk(), ["a"]);
    const nm = mk(); nm.players[0].name = "Borin the Bold";
    const rd = mk(); rd.players[0].ready = true;
    const tp = mk(); tp.players[0].type = "npc";
    expect(pickerSignature(nm, ["a"])).not.toBe(base);
    expect(pickerSignature(rd, ["a"])).not.toBe(base);
    expect(pickerSignature(tp, ["a"])).not.toBe(base);
  });

  it("is order-independent over the editable id list and player array", () => {
    const s = mk();
    const swapped = mk();
    swapped.players = [s.players[1], s.players[0], s.players[2]];
    expect(pickerSignature(swapped, ["b", "a"])).toBe(pickerSignature(s, ["a", "b"]));
  });

  it("ignores a change to a player OUTSIDE the editable slice", () => {
    const base = pickerSignature(mk(), ["a"]);
    const other = mk();
    other.players[1].dieIds[0] = "09"; // b changed, but slice is only [a]
    other.players[2].ready = true; // c changed
    expect(pickerSignature(other, ["a"])).toBe(base);
  });

  it("changes when the game status changes", () => {
    expect(pickerSignature(mk({ status: "playing" }), ["a"])).not.toBe(pickerSignature(mk(), ["a"]));
  });

  it("returns a sentinel for a null state", () => {
    expect(pickerSignature(null, ["a"])).toBe("∅");
  });
});
