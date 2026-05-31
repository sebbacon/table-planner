import { describe, expect, it } from "vitest";
import { createEmptyAssignments, scorePlan } from "./scoring";
import type { ConstraintPair, Guest, Plan } from "./types";

const guests: Guest[] = [
  { id: "a", name: "Alice", gender: "F" },
  { id: "b", name: "Ben", gender: "M" },
  { id: "c", name: "Casey", gender: "Unknown" },
  { id: "d", name: "Drew", gender: "Other" }
];

describe("scorePlan", () => {
  it("rewards preferred left-right pairs most strongly", () => {
    const plan = planWith({ 11: "a", 12: "b" });
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "prefer_adjacent", guestAId: "a", guestBId: "b" }
    ];

    const score = scorePlan(plan, guests, constraints);

    expect(score.preferred[0]).toMatchObject({
      adjacent: true,
      proximity: "left_right",
      points: 48
    });
  });

  it("scores preferred opposite pairs above diagonal pairs", () => {
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "prefer_adjacent", guestAId: "a", guestBId: "b" }
    ];
    const oppositeScore = scorePlan(planWith({ 11: "a", 10: "b" }), guests, constraints);
    const diagonalScore = scorePlan(planWith({ 11: "a", 9: "b" }), guests, constraints);

    expect(oppositeScore.preferred[0]).toMatchObject({
      proximity: "opposite",
      points: 32
    });
    expect(diagonalScore.preferred[0]).toMatchObject({
      proximity: "diagonal",
      points: 12
    });
    expect(oppositeScore.preferencePoints).toBeGreaterThan(diagonalScore.preferencePoints);
  });

  it("does not reward preferred pairs that are not adjacent", () => {
    const plan = planWith({ 11: "a", 8: "b" });
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "prefer_adjacent", guestAId: "a", guestBId: "b" }
    ];

    const score = scorePlan(plan, guests, constraints);

    expect(score.preferred[0]).toMatchObject({ adjacent: false, proximity: "none", points: 0 });
  });

  it("penalizes avoid pairs that are diagonal across the table", () => {
    const plan = planWith({ 11: "a", 9: "b" });
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "avoid_adjacent", guestAId: "a", guestBId: "b" }
    ];

    const score = scorePlan(plan, guests, constraints);

    expect(score.avoided[0]).toMatchObject({ adjacent: true, proximity: "diagonal", points: -50 });
  });

  it("ignores unknown and other gender values for gender balance scoring", () => {
    const plan = planWith({ 11: "c", 12: "d" });
    const score = scorePlan(plan, guests, []);

    expect(score.tableGender[0]).toMatchObject({ male: 0, female: 0, points: 0 });
    expect(score.genderPoints).toBe(0);
  });
});

function planWith(assignments: Record<number, string>): Plan {
  return {
    id: "test-plan",
    assignments: { ...createEmptyAssignments(), ...assignments },
    holdingGuestIds: []
  };
}
