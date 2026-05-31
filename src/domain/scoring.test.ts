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
  it("rewards preferred left-right pairs most strongly (medium strength)", () => {
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

  it("scores preferred opposite pairs above diagonal pairs (medium strength)", () => {
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
      points: 8
    });
    expect(oppositeScore.preferencePoints).toBeGreaterThan(diagonalScore.preferencePoints);
  });

  it("penalizes medium preferred pairs that are not adjacent at all", () => {
    const plan = planWith({ 11: "a", 8: "b" });
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "prefer_adjacent", guestAId: "a", guestBId: "b" }
    ];

    const score = scorePlan(plan, guests, constraints);

    expect(score.preferred[0]).toMatchObject({ adjacent: false, proximity: "none", points: -16 });
  });

  it("penalizes high preferred pairs for non-adjacent placement", () => {
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "prefer_adjacent", guestAId: "a", guestBId: "b", strength: "high" }
    ];

    expect(scorePlan(planWith({ 11: "a", 12: "b" }), guests, constraints).preferred[0]).toMatchObject({
      adjacent: true, proximity: "left_right", points: 80
    });
    expect(scorePlan(planWith({ 11: "a", 10: "b" }), guests, constraints).preferred[0]).toMatchObject({
      adjacent: false, proximity: "opposite", points: -20
    });
    expect(scorePlan(planWith({ 11: "a", 9: "b" }), guests, constraints).preferred[0]).toMatchObject({
      adjacent: false, proximity: "diagonal", points: -40
    });
    expect(scorePlan(planWith({ 11: "a", 8: "b" }), guests, constraints).preferred[0]).toMatchObject({
      adjacent: false, proximity: "none", points: -80
    });
  });

  it("penalizes low preferred pairs only when fully separated (none)", () => {
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "prefer_adjacent", guestAId: "a", guestBId: "b", strength: "low" }
    ];

    expect(scorePlan(planWith({ 11: "a", 9: "b" }), guests, constraints).preferred[0]).toMatchObject({
      adjacent: true, proximity: "diagonal", points: 12
    });
    expect(scorePlan(planWith({ 11: "a", 8: "b" }), guests, constraints).preferred[0]).toMatchObject({
      adjacent: false, proximity: "none", points: -12
    });
  });

  it("penalizes avoid pairs that are diagonal across the table", () => {
    const plan = planWith({ 11: "a", 9: "b" });
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "avoid_adjacent", guestAId: "a", guestBId: "b" }
    ];

    const score = scorePlan(plan, guests, constraints);

    expect(score.avoided[0]).toMatchObject({ adjacent: true, proximity: "diagonal", points: -50 });
  });

  it("rewards guests who prefer a head seat when they are at one", () => {
    const plan = planWith({ 1: "a" });
    const score = scorePlan(plan, guests, [
      { id: "head-1", type: "prefer_head", guestId: "a" }
    ]);

    expect(score.headSeat[0]).toMatchObject({
      atHead: true,
      satisfied: true,
      points: 36
    });
    expect(score.headSeatPoints).toBe(36);
  });

  it("penalizes guests who should avoid head seats when they are at one", () => {
    const plan = planWith({ 39: "b" });
    const score = scorePlan(plan, guests, [
      { id: "head-1", type: "avoid_head", guestId: "b" }
    ]);

    expect(score.headSeat[0]).toMatchObject({
      atHead: true,
      satisfied: false,
      points: -36
    });
    expect(score.headSeatPoints).toBe(-36);
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
