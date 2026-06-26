import { describe, it, expect } from "vitest";
import {
  validateKeep,
  isHotDice,
  hasReachedTarget,
  isRoundComplete,
  determineWinner,
  isBust,
  TARGET_DEFAULT,
} from "../src/core/rules.mjs";

describe("validateKeep", () => {
  it("requires at least one die", () => {
    expect(validateKeep([])).toMatchObject({ ok: false, reason: "keep-at-least-one-scoring-die" });
  });

  it("accepts a valid scoring selection and returns its points", () => {
    expect(validateKeep([1, 5])).toEqual({ ok: true, points: 150 });
    expect(validateKeep([2, 2, 2])).toEqual({ ok: true, points: 200 });
  });

  it("rejects a selection with a non-scoring die", () => {
    expect(validateKeep([1, 2])).toMatchObject({ ok: false, reason: "selection-has-non-scoring-die" });
  });
});

describe("turn helpers", () => {
  it("hot dice when none remain", () => {
    expect(isHotDice(0)).toBe(true);
    expect(isHotDice(3)).toBe(false);
  });

  it("target reached", () => {
    expect(TARGET_DEFAULT).toBe(2000);
    expect(hasReachedTarget(2000, 2000)).toBe(true);
    expect(hasReachedTarget(1999, 2000)).toBe(false);
    expect(hasReachedTarget(8500, 8000)).toBe(true);
  });

  it("re-exports isBust", () => {
    expect(isBust([2, 3, 4, 6])).toBe(true);
  });
});

describe("round completion (complete-the-round rule)", () => {
  it("completes only after every player has acted", () => {
    expect(isRoundComplete(2, 3)).toBe(false);
    expect(isRoundComplete(3, 3)).toBe(true);
    expect(isRoundComplete(0, 0)).toBe(false);
  });
});

describe("determineWinner", () => {
  it("returns the sole highest total", () => {
    expect(determineWinner([
      { id: "a", total: 1800 },
      { id: "b", total: 2050 },
      { id: "c", total: 1200 },
    ])).toEqual({ winnerId: "b", tiedIds: ["b"] });
  });

  it("returns no winner on a tie (sudden-death needed)", () => {
    expect(determineWinner([
      { id: "a", total: 2100 },
      { id: "b", total: 2100 },
      { id: "c", total: 900 },
    ])).toEqual({ winnerId: null, tiedIds: ["a", "b"] });
  });
});
