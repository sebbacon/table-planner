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
  { id: "a", name: "Alice", groups: ["Bride"] },
  { id: "b", name: "Ben", groups: ["Groom"] },
  { id: "c", name: "Casey", groups: [] },
  { id: "d", name: "Drew", groups: [] }
];

describe("scorePlan", () => {
  it("rewards preferred left-right pairs most strongly (default chat preference)", () => {
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

  it("scores preferred opposite pairs above diagonal pairs (default chat preference)", () => {
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "prefer_adjacent", guestAId: "a", guestBId: "b" }
    ];
    const oppositeScore = scorePlan(planWith({ [t1.top(0)]: "a", [t1.bot(0)]: "b" }), guests, constraints, layout);
    const diagonalScore = scorePlan(planWith({ [t1.top(0)]: "a", [t1.bot(1)]: "b" }), guests, constraints, layout);

    expect(oppositeScore.preferred[0]).toMatchObject({ proximity: "opposite", points: 32 });
    expect(diagonalScore.preferred[0]).toMatchObject({ proximity: "diagonal", points: 24 });
    expect(oppositeScore.preferencePoints).toBeGreaterThan(diagonalScore.preferencePoints);
  });

  it("penalizes medium preferred pairs that are not adjacent at all", () => {
    const plan = planWith({ [t1.top(0)]: "a", [t1.top(7)]: "b" });
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "prefer_adjacent", guestAId: "a", guestBId: "b" }
    ];

    const score = scorePlan(plan, guests, constraints, layout);

    expect(score.preferred[0]).toMatchObject({ adjacent: false, proximity: "none", points: -48 });
  });

  it("maps legacy high strength to next-to with high priority", () => {
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "prefer_adjacent", guestAId: "a", guestBId: "b", strength: "high" }
    ];

    expect(scorePlan(planWith({ [t1.top(0)]: "a", [t1.top(1)]: "b" }), guests, constraints, layout).preferred[0]).toMatchObject({
      adjacent: true, proximity: "left_right", points: 96
    });
    expect(scorePlan(planWith({ [t1.top(0)]: "a", [t1.bot(0)]: "b" }), guests, constraints, layout).preferred[0]).toMatchObject({
      adjacent: false, proximity: "opposite", points: -96
    });
    expect(scorePlan(planWith({ [t1.top(0)]: "a", [t1.bot(1)]: "b" }), guests, constraints, layout).preferred[0]).toMatchObject({
      adjacent: false, proximity: "diagonal", points: -96
    });
    expect(scorePlan(planWith({ [t1.top(0)]: "a", [t1.top(7)]: "b" }), guests, constraints, layout).preferred[0]).toMatchObject({
      adjacent: false, proximity: "none", points: -96
    });
  });

  it("maps legacy low strength to normal-priority chat", () => {
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "prefer_adjacent", guestAId: "a", guestBId: "b", strength: "low" }
    ];

    expect(scorePlan(planWith({ [t1.top(0)]: "a", [t1.bot(1)]: "b" }), guests, constraints, layout).preferred[0]).toMatchObject({
      adjacent: true, proximity: "diagonal", points: 24
    });
    expect(scorePlan(planWith({ [t1.top(0)]: "a", [t1.top(7)]: "b" }), guests, constraints, layout).preferred[0]).toMatchObject({
      adjacent: false, proximity: "none", points: -48
    });
  });

  it("penalizes avoid pairs that are diagonal across the table", () => {
    const plan = planWith({ [t1.top(0)]: "a", [t1.bot(1)]: "b" });
    const constraints: ConstraintPair[] = [
      { id: "pair-1", type: "avoid_adjacent", guestAId: "a", guestBId: "b" }
    ];

    const score = scorePlan(plan, guests, constraints, layout);

    expect(score.avoided[0]).toMatchObject({ adjacent: true, proximity: "diagonal", points: -19 });
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

  it("penalizes same-group adjacent pairs", () => {
    const sameGroupGuests: Guest[] = [
      { id: "a", name: "Alice", groups: ["Bride"] },
      { id: "b", name: "Ben", groups: ["Bride"] },
    ];
    const plan = planWith({ [t1.top(0)]: "a", [t1.top(1)]: "b" });
    const score = scorePlan(plan, sameGroupGuests, [], layout);

    expect(score.sameGroupAdjacentPairs).toBe(1);
    expect(score.groupPoints).toBe(-1);
  });

  it("applies no group penalty when guests have no groups", () => {
    const plan = planWith({ [t1.top(0)]: "c", [t1.top(1)]: "d" });
    const score = scorePlan(plan, guests, [], layout);

    expect(score.sameGroupAdjacentPairs).toBe(0);
    expect(score.groupPoints).toBe(0);
  });

  it("penalizes once per shared group value for multi-group guests", () => {
    const multiGroupGuests: Guest[] = [
      { id: "a", name: "Alice", groups: ["Bride", "Young"] },
      { id: "b", name: "Ben", groups: ["Bride", "Young"] },
    ];
    const plan = planWith({ [t1.top(0)]: "a", [t1.top(1)]: "b" });
    const score = scorePlan(plan, multiGroupGuests, [], layout);

    expect(score.groupPoints).toBe(-2);
  });
});

function planWith(assignments: Record<number, string>): Plan {
  return {
    id: "test-plan",
    assignments: { ...createEmptyAssignments(layout), ...assignments },
    holdingGuestIds: []
  };
}

it("can turn off group mixing without changing explicit preference scores", () => {
  const grouped = guests.map((guest) => ({ ...guest, groups: ["Family"] }));
  const plan: Plan = { id: "mixing", assignments: { 1: "a", 2: "b", 3: "c", 4: "d" }, holdingGuestIds: [] };
  const constraint: ConstraintPair = { id: "near", type: "prefer_adjacent", guestAId: "a", guestBId: "b" };
  const enabled = scorePlan(plan, grouped, [constraint], layout, true);
  const disabled = scorePlan(plan, grouped, [constraint], layout, false);
  expect(enabled.groupPoints).toBeLessThan(0);
  expect(disabled.groupPoints).toBe(0);
  expect(disabled.constraintPoints).toBe(enabled.constraintPoints);
  expect(disabled.total).toBe(disabled.constraintPoints);
});

// Exercise the same policy used by scoring, guided swaps, and capacity analysis.
describe("intent-based seating preferences", () => {
  const mixed = buildSeatingLayout({ tables: [
    { id: 1, kind: "circular", seats: 10 },
    { id: 2, kind: "rect", seatsPerSide: 6, leftEnd: true, rightEnd: true }
  ] });
  const circular = (pos: number) => mixed.seats.find(seat => seat.tableId === 1 && seat.position === pos)!.id;
  const rect = (side: string, pos: number) => mixed.seats.find(seat => seat.tableId === 2 && seat.side === side && seat.position === pos)!.id;
  function result(preference: ConstraintPair["preference"], a: number, b: number | undefined, priority: ConstraintPair["priority"] = "normal") {
    const plan: Plan = { id: "intent", assignments: { [a]: "a", ...(b === undefined ? {} : { [b]: "b" }) }, holdingGuestIds: b === undefined ? ["b"] : [] };
    return scorePlan(plan, guests, [{ id: "pair", type: "prefer_adjacent", guestAId: "a", guestBId: "b", preference, priority }], mixed).preferred[0];
  }
  it("accepts neighbours and next-but-one on circles, including wraparound, but excludes next-but-two and opposite", () => {
    for (const pos of [1, 2, 8, 9]) expect(result("chat", circular(0), circular(pos)).adjacent).toBe(true);
    for (const pos of [3, 4, 5, 6, 7]) expect(result("chat", circular(0), circular(pos)).adjacent).toBe(false);
    expect(result("chat", circular(0), circular(1)).points).toBeGreaterThan(result("chat", circular(0), circular(2)).points);
  });
  it("accepts rectangular diagonals and opposite, but not distant seats along a side", () => {
    for (const destination of [rect("top", 1), rect("bottom", 0), rect("bottom", 1)]) {
      expect(result("chat", rect("top", 0), destination).adjacent).toBe(true);
    }
    expect(result("chat", rect("top", 0), rect("top", 2)).adjacent).toBe(false);
  });
  it("requires immediate neighbours for next-to, including end seats", () => {
    expect(result("next_to", circular(0), circular(9)).adjacent).toBe(true);
    expect(result("next_to", circular(0), circular(2)).adjacent).toBe(false);
    expect(result("next_to", rect("top", 0), rect("bottom", 0)).adjacent).toBe(false);
    expect(result("next_to", rect("top", 0), rect("left-end", -1)).adjacent).toBe(true);
  });
  it("gives equal credit anywhere at the same table and rejects other tables or unseated guests", () => {
    expect(result("same_table", circular(0), circular(1)).points).toBe(result("same_table", circular(0), circular(5)).points);
    expect(result("same_table", rect("top", 0), rect("top", 5)).adjacent).toBe(true);
    expect(result("same_table", circular(0), rect("top", 0)).adjacent).toBe(false);
    expect(result("same_table", circular(0), undefined).adjacent).toBe(false);
  });
  it("uses priority only as a weight, for both met and unmet preferences", () => {
    for (const preference of ["next_to", "chat", "same_table"] as const) {
      for (const destination of [circular(1), rect("top", 0)]) {
        const normal = result(preference, circular(0), destination);
        const high = result(preference, circular(0), destination, "high");
        expect(high.adjacent).toBe(normal.adjacent);
        expect(high.points).toBe(normal.points * 2);
      }
    }
  });
  it("keeps a residual keep-apart penalty for share-table pairs, even at distant seats", () => {
    const constraints: ConstraintPair[] = [
      { id: "together", type: "prefer_adjacent", guestAId: "a", guestBId: "b", preference: "same_table" },
      { id: "apart", type: "avoid_adjacent", guestAId: "a", guestBId: "b" }
    ];
    const score = scorePlan({ id: "both", assignments: { [rect("top", 0)]: "a", [rect("top", 5)]: "b" }, holdingGuestIds: [] }, guests, constraints, mixed);
    expect(score.preferred[0].adjacent).toBe(true);
    expect(score.avoided[0].adjacent).toBe(true);
    expect(score.avoided[0].points).toBeGreaterThan(-50);
    expect(score.avoided[0].points).toBeLessThan(0);
  });
});

describe("keep-apart distance scoring", () => {
  const apart: ConstraintPair = { id: "apart", type: "avoid_adjacent", guestAId: "a", guestBId: "b" };
  function score(at: SeatingLayout, a: number, b?: number) {
    return scorePlan({ id: "apart", assignments: { [a]: "a", ...(b ? { [b]: "b" } : {}) }, holdingGuestIds: b ? [] : ["b"] }, guests, [apart], at).avoided[0];
  }
  it("always prefers different tables to even the furthest seats at one table", () => {
    expect(score(layout, t1.top(0), t1.leftEnd)).toMatchObject({ adjacent: false, points: 24 });
    expect(score(layout, t1.top(0), t1.leftEnd).points).toBeGreaterThan(score(layout, t1.top(0), t1.rightEnd).points);
  });
  it.each([3, 10, 20])("applies the same shared-table penalty at every distance on a %i-seat circular table", seats => {
    const round = buildSeatingLayout({ tables: [{ id: 1, kind: "circular", seats }] });
    for (const destination of round.seatIds.slice(1)) {
      expect(score(round, 1, destination)).toMatchObject({ adjacent: true, points: -50 });
    }
  });
  it("quickly reduces the long-table penalty after several seat spacings, regardless of table length", () => {
    const short = buildSeatingLayout({ tables: [{ id: 1, kind: "rect", seatsPerSide: 6, leftEnd: false, rightEnd: false }] });
    const long = buildSeatingLayout({ tables: [{ id: 1, kind: "rect", seatsPerSide: 20, leftEnd: false, rightEnd: false }] });
    expect(score(short, 1, 2).points).toBe(-50);
    expect(score(short, 1, 4).points).toBeGreaterThan(-15);
    expect(score(short, 1, 5).points).toBeGreaterThan(-10);
    expect(score(short, 1, 5).points).toBe(score(long, 1, 5).points);
    expect(score(long, 1, 20).points).toBe(-4);
  });
  it("improves with distance along and across a long table, including end seats", () => {
    expect(score(layout, t1.top(0), t1.top(1)).points).toBe(-50);
    expect(score(layout, t1.top(0), t1.top(7)).points).toBeGreaterThan(score(layout, t1.top(0), t1.top(2)).points);
    expect(score(layout, t1.top(0), t1.bot(7)).points).toBeGreaterThan(score(layout, t1.top(0), t1.bot(0)).points);
    expect(score(layout, t1.rightEnd, t1.top(8)).points).toBe(-50);
    expect(score(layout, t1.rightEnd, t1.top(0)).points).toBeGreaterThan(-50);
  });
  it("does not award separate-table points to an unseated pair", () => {
    expect(score(layout, t1.top(0))).toMatchObject({ adjacent: true, points: 0 });
  });
});
