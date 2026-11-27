import { expect, it } from "vitest";
import { getPairPreference, getPairPriority } from "./pairPreferences";
import type { ConstraintPair } from "./types";
const pair: ConstraintPair = { id: "pair", type: "prefer_adjacent", guestAId: "a", guestBId: "b" };
it("maps legacy distances to the nearest intent and priority", () => {
  expect(getPairPreference({ ...pair, strength: "high" })).toBe("next_to");
  expect(getPairPriority({ ...pair, strength: "high" })).toBe("high");
  for (const strength of ["medium", "low", undefined] as const) {
    expect(getPairPreference({ ...pair, strength })).toBe("chat");
    expect(getPairPriority({ ...pair, strength })).toBe("normal");
  }
});
it("keeps explicit intent and priority independent, even with legacy fields present", () => {
  const explicit: ConstraintPair = { ...pair, preference: "same_table", priority: "normal", strength: "high" };
  expect(getPairPreference(explicit)).toBe("same_table");
  expect(getPairPriority(explicit)).toBe("normal");
});
