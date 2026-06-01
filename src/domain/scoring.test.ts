import { describe, expect, it } from "vitest";
import { buildSeatingLayout } from "./seating";
import { createEmptyAssignments, scorePlan } from "./scoring";
import { DEFAULT_VENUE_CONFIG } from "./venueConfig";
import type { ConstraintPair, Guest, Plan, SeatingLayout } from "./types";

const layout: SeatingLayout = buildSeatingLayout(DEFAULT_VENUE_CONFIG);

// Seat IDs in the default layout (table 1: top 1-9, bottom 10-18, right-end 19)
// top pos 0=1, pos 1=2; bottom pos 0=10, pos 1=11; far top pos 7=8, pos 8=9; right-end=19
const t1 = {
  top: (pos: number) => layout.seats.find((s) => s.tableId === 1 && s.side === "top" && s.position === pos)!.id,
  bot: (pos: number) => layout.seats.find((s) => s.tableId === 1 && s.side === "bottom" && s.position === pos)!.id,
  rightEnd: layout.seats.find((s) => s.tableId === 1 && s.side === "right-end")!.id,
  leftEnd: layout.seats.find((s) => s.tableId === 2 && s.side === "left-end")!.id,
};

const guests: Guest[] = [
  { id: "a", name: "Alice", gender: "F" },
  { id: "b", name: "Ben", gender: "M" },
  { id: "c", name: "Casey", gender: "Unknown" },
  { id: "d", name: "Drew", gender: "Other" }
];

describe("scorePlan", () => {
  it("rewards preferred left-right pairs most strongly (medium strength)", () => {
    const plan = planWith({ [t1.top(0)]: "a", [t1.top(1)]: "b" });
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "prefer_adjacent", guestAId: "a", guestBId: "b" }
    ];

    const score = scorePlan(plan, guests, constraints, layout);

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
    const oppositeScore = scorePlan(planWith({ [t1.top(0)]: "a", [t1.bot(0)]: "b" }), guests, constraints, layout);
    const diagonalScore = scorePlan(planWith({ [t1.top(0)]: "a", [t1.bot(1)]: "b" }), guests, constraints, layout);

    expect(oppositeScore.preferred[0]).toMatchObject({ proximity: "opposite", points: 32 });
    expect(diagonalScore.preferred[0]).toMatchObject({ proximity: "diagonal", points: 8 });
    expect(oppositeScore.preferencePoints).toBeGreaterThan(diagonalScore.preferencePoints);
  });

  it("penalizes medium preferred pairs that are not adjacent at all", () => {
    const plan = planWith({ [t1.top(0)]: "a", [t1.top(7)]: "b" });
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "prefer_adjacent", guestAId: "a", guestBId: "b" }
    ];

    const score = scorePlan(plan, guests, constraints, layout);

    expect(score.preferred[0]).toMatchObject({ adjacent: false, proximity: "none", points: -16 });
  });

  it("penalizes high preferred pairs for non-adjacent placement", () => {
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "prefer_adjacent", guestAId: "a", guestBId: "b", strength: "high" }
    ];

    expect(scorePlan(planWith({ [t1.top(0)]: "a", [t1.top(1)]: "b" }), guests, constraints, layout).preferred[0]).toMatchObject({
      adjacent: true, proximity: "left_right", points: 80
    });
    expect(scorePlan(planWith({ [t1.top(0)]: "a", [t1.bot(0)]: "b" }), guests, constraints, layout).preferred[0]).toMatchObject({
      adjacent: false, proximity: "opposite", points: -20
    });
    expect(scorePlan(planWith({ [t1.top(0)]: "a", [t1.bot(1)]: "b" }), guests, constraints, layout).preferred[0]).toMatchObject({
      adjacent: false, proximity: "diagonal", points: -40
    });
    expect(scorePlan(planWith({ [t1.top(0)]: "a", [t1.top(7)]: "b" }), guests, constraints, layout).preferred[0]).toMatchObject({
      adjacent: false, proximity: "none", points: -80
    });
  });

  it("penalizes low preferred pairs only when fully separated (none)", () => {
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "prefer_adjacent", guestAId: "a", guestBId: "b", strength: "low" }
    ];

    expect(scorePlan(planWith({ [t1.top(0)]: "a", [t1.bot(1)]: "b" }), guests, constraints, layout).preferred[0]).toMatchObject({
      adjacent: true, proximity: "diagonal", points: 12
    });
    expect(scorePlan(planWith({ [t1.top(0)]: "a", [t1.top(7)]: "b" }), guests, constraints, layout).preferred[0]).toMatchObject({
      adjacent: false, proximity: "none", points: -12
    });
  });

  it("penalizes avoid pairs that are diagonal across the table", () => {
    const plan = planWith({ [t1.top(0)]: "a", [t1.bot(1)]: "b" });
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "avoid_adjacent", guestAId: "a", guestBId: "b" }
    ];

    const score = scorePlan(plan, guests, constraints, layout);

    expect(score.avoided[0]).toMatchObject({ adjacent: true, proximity: "diagonal", points: -50 });
  });

  it("rewards guests who prefer a head seat when they are at one", () => {
    const plan = planWith({ [t1.rightEnd]: "a" });
    const score = scorePlan(plan, guests, [
      { id: "head-1", type: "prefer_head", guestId: "a" }
    ], layout);

    expect(score.headSeat[0]).toMatchObject({ atHead: true, satisfied: true, points: 36 });
    expect(score.headSeatPoints).toBe(36);
  });

  it("penalizes guests who should avoid head seats when they are at one", () => {
    const plan = planWith({ [t1.leftEnd]: "b" });
    const score = scorePlan(plan, guests, [
      { id: "head-1", type: "avoid_head", guestId: "b" }
    ], layout);

    expect(score.headSeat[0]).toMatchObject({ atHead: true, satisfied: false, points: -36 });
    expect(score.headSeatPoints).toBe(-36);
  });

  it("ignores unknown and other gender values for gender balance scoring", () => {
    const plan = planWith({ [t1.top(0)]: "c", [t1.top(1)]: "d" });
    const score = scorePlan(plan, guests, [], layout);

    expect(score.tableGender[0]).toMatchObject({ male: 0, female: 0, points: 0 });
    expect(score.genderPoints).toBe(0);
  });
});

function planWith(assignments: Record<number, string>): Plan {
  return {
    id: "test-plan",
    assignments: { ...createEmptyAssignments(layout), ...assignments },
    holdingGuestIds: []
  };
}
