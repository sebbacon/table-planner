import { describe, expect, it } from "vitest";
import { buildSeatingLayout } from "./seating";
import { findPreferredTable, isHeadSwapAllowed } from "./solverPreferences";
import type { ConstraintPair, PairStrength } from "./types";

const layout = buildSeatingLayout({ tables: [
  { kind: "rect", id: 1, seatsPerSide: 2, leftEnd: true, rightEnd: true }
] });
const [headA, headB] = layout.headSeatIds;
const sideA = 1;
const sideB = 2;

describe("head-seat swap protection", () => {
  it.each([
    { name: "unconstrained guests", prefer: [], avoid: [], allowed: true },
    { name: "satisfied head preference", prefer: ["head"], avoid: [], allowed: false },
    { name: "unsatisfied head preference", prefer: ["side"], avoid: [], allowed: true },
    { name: "satisfied head avoidance", prefer: [], avoid: ["side"], allowed: false },
    { name: "unsatisfied head avoidance", prefer: [], avoid: ["head"], allowed: true },
    { name: "two unsatisfied preferences", prefer: ["side"], avoid: ["head"], allowed: true },
    { name: "two satisfied preferences", prefer: ["head"], avoid: ["side"], allowed: false },
    { name: "conflicting preferences at head", prefer: ["head"], avoid: ["head"], allowed: false },
    { name: "conflicting preferences at side", prefer: ["side"], avoid: ["side"], allowed: false }
  ])("handles $name in both swap directions", ({ prefer, avoid, allowed }) => {
    const assignments = { [headA]: "head", [sideA]: "side" };
    for (const [a, b] of [[headA, sideA], [sideA, headA]]) {
      expect(isHeadSwapAllowed(a, b, assignments, new Set(prefer), new Set(avoid), layout)).toBe(allowed);
    }
  });

  it.each([[headA, headB], [sideA, sideB], [headA, headA]])(
    "allows swaps that preserve seat kind (%i, %i)", (a, b) => {
      expect(isHeadSwapAllowed(a, b, { [a]: "a", [b]: "b" },
        new Set(["a", "b"]), new Set(["a", "b"]), layout)).toBe(true);
    }
  );

  it.each([null, ""])("ignores empty seats (%s) even if listed in preferences", (empty) => {
    expect(isHeadSwapAllowed(headA, sideA, { [headA]: empty, [sideA]: empty },
      new Set([""]), new Set([""]), layout)).toBe(true);
  });

  it("protects a guest when swapping with an empty seat", () => {
    expect(isHeadSwapAllowed(headA, sideA, { [headA]: "head", [sideA]: null },
      new Set(["head"]), new Set(), layout)).toBe(false);
    expect(isHeadSwapAllowed(headA, sideA, { [headA]: null, [sideA]: "side" },
      new Set(), new Set(["side"]), layout)).toBe(false);
  });
});

function pair(a: string, b: string, strength?: PairStrength): ConstraintPair {
  return { id: `${a}-${b}`, type: "prefer_adjacent", guestAId: a, guestBId: b, strength };
}

describe("weighted table selection", () => {
  const tableOf = new Map([["a", 10], ["b", 20], ["c", 20]]);

  it("adds partner weights across both guests and both constraint directions", () => {
    const pairs = [pair("x", "a", "high"), pair("b", "x"), pair("y", "c"), pair("y", "b")];
    expect(findPreferredTable(["x", "y"], pairs, tableOf, [10, 20])).toBe(20);
  });

  it("prefers a high-strength connection over a low-strength connection", () => {
    expect(findPreferredTable(["x"], [pair("x", "a", "low"), pair("x", "b", "high")],
      tableOf, [10, 20])).toBe(20);
  });

  it("treats legacy low and missing strength as normal priority", () => {
    expect(findPreferredTable(["x"], [pair("x", "a", "low"), pair("x", "b")],
      tableOf, [10, 20])).toBe(10);
  });

  it("breaks ties in table order rather than constraint order", () => {
    const pairs = [pair("x", "b"), pair("x", "a")];
    expect(findPreferredTable(["x"], pairs, tableOf, [10, 20])).toBe(10);
    expect(findPreferredTable(["x"], pairs, tableOf, [20, 10])).toBe(20);
  });

  it("excludes full tables even when they have the strongest pull", () => {
    const pairs = [pair("x", "a", "high"), pair("x", "b", "low")];
    expect(findPreferredTable(["x"], pairs, tableOf, [20])).toBe(20);
    expect(findPreferredTable(["x"], pairs, tableOf, [])).toBeNull();
  });

  it("returns no preference when partners are absent or unrelated", () => {
    const pairs = [pair("x", "missing"), pair("a", "b"), pair("x", "")];
    expect(findPreferredTable(["x"], pairs, tableOf, [10, 20])).toBeNull();
    expect(findPreferredTable(["x"], [], tableOf, [10, 20])).toBeNull();
    expect(findPreferredTable([], pairs, tableOf, [10, 20])).toBeNull();
  });

  it("recognizes table zero as an assigned table", () => {
    expect(findPreferredTable(["x"], [pair("x", "a")], new Map([["a", 0]]), [0])).toBe(0);
  });
});
