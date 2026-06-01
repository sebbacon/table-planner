import { describe, expect, it } from "vitest";
import { areSeatsAdjacent, buildSeatingLayout, getSeatProximity, isHeadSeat } from "./seating";
import { DEFAULT_VENUE_CONFIG } from "./venueConfig";
import type { SeatingLayout } from "./types";

const layout: SeatingLayout = buildSeatingLayout(DEFAULT_VENUE_CONFIG);

describe("seating graph", () => {
  it("models 39 seats with the extra seat at the second table left end", () => {
    expect(layout.seats).toHaveLength(39);
    const leftEnd = layout.seats.find((s) => s.side === "left-end" && s.tableId === 2);
    expect(leftEnd).toBeDefined();
  });

  it("treats same-side, opposite, and diagonal seats as adjacent", () => {
    // Table 1 top seats: IDs 1-9 (positions 0-8), bottom: 10-18, right-end: 19
    // seat at top pos 0 = id 1, top pos 1 = id 2, bottom pos 0 = id 10, bottom pos 1 = id 11
    const topPos0 = layout.seats.find((s) => s.tableId === 1 && s.side === "top" && s.position === 0)!;
    const topPos1 = layout.seats.find((s) => s.tableId === 1 && s.side === "top" && s.position === 1)!;
    const botPos0 = layout.seats.find((s) => s.tableId === 1 && s.side === "bottom" && s.position === 0)!;
    const botPos1 = layout.seats.find((s) => s.tableId === 1 && s.side === "bottom" && s.position === 1)!;
    const topPos2 = layout.seats.find((s) => s.tableId === 1 && s.side === "top" && s.position === 2)!;

    expect(areSeatsAdjacent(topPos0.id, topPos1.id, layout)).toBe(true);  // left_right
    expect(areSeatsAdjacent(topPos0.id, botPos0.id, layout)).toBe(true);  // opposite
    expect(areSeatsAdjacent(topPos0.id, botPos1.id, layout)).toBe(true);  // diagonal
    expect(areSeatsAdjacent(topPos0.id, topPos2.id, layout)).toBe(false); // too far
  });

  it("classifies adjacency into ranked proximity tiers", () => {
    const topPos0 = layout.seats.find((s) => s.tableId === 1 && s.side === "top" && s.position === 0)!;
    const topPos1 = layout.seats.find((s) => s.tableId === 1 && s.side === "top" && s.position === 1)!;
    const botPos0 = layout.seats.find((s) => s.tableId === 1 && s.side === "bottom" && s.position === 0)!;
    const botPos1 = layout.seats.find((s) => s.tableId === 1 && s.side === "bottom" && s.position === 1)!;
    const topPos2 = layout.seats.find((s) => s.tableId === 1 && s.side === "top" && s.position === 2)!;

    expect(getSeatProximity(topPos0.id, topPos1.id, layout)).toBe("left_right");
    expect(getSeatProximity(topPos0.id, botPos0.id, layout)).toBe("opposite");
    expect(getSeatProximity(topPos0.id, botPos1.id, layout)).toBe("diagonal");
    expect(getSeatProximity(topPos0.id, topPos2.id, layout)).toBe("none");
  });

  it("connects end seats to the nearest table-end seats", () => {
    const t1RightEnd = layout.seats.find((s) => s.tableId === 1 && s.side === "right-end")!;
    const t1TopLast = layout.seats.find((s) => s.tableId === 1 && s.side === "top" && s.position === 8)!;
    const t1BotLast = layout.seats.find((s) => s.tableId === 1 && s.side === "bottom" && s.position === 8)!;
    const t1TopFirst = layout.seats.find((s) => s.tableId === 1 && s.side === "top" && s.position === 0)!;

    expect(areSeatsAdjacent(t1RightEnd.id, t1TopLast.id, layout)).toBe(true);
    expect(areSeatsAdjacent(t1RightEnd.id, t1BotLast.id, layout)).toBe(true);
    expect(areSeatsAdjacent(t1RightEnd.id, t1TopFirst.id, layout)).toBe(false);

    const t2LeftEnd = layout.seats.find((s) => s.tableId === 2 && s.side === "left-end")!;
    const t2TopFirst = layout.seats.find((s) => s.tableId === 2 && s.side === "top" && s.position === 0)!;
    const t2BotFirst = layout.seats.find((s) => s.tableId === 2 && s.side === "bottom" && s.position === 0)!;
    const t2TopSecond = layout.seats.find((s) => s.tableId === 2 && s.side === "top" && s.position === 1)!;

    expect(areSeatsAdjacent(t2LeftEnd.id, t2TopFirst.id, layout)).toBe(true);
    expect(areSeatsAdjacent(t2LeftEnd.id, t2BotFirst.id, layout)).toBe(true);
    expect(areSeatsAdjacent(t2LeftEnd.id, t2TopSecond.id, layout)).toBe(false);
  });

  it("treats table-end seats as head seats", () => {
    const headSeats = layout.seats.filter((s) => s.side === "left-end" || s.side === "right-end");
    expect(headSeats).toHaveLength(3);
    for (const s of headSeats) {
      expect(isHeadSeat(s.id, layout)).toBe(true);
    }
    const nonHead = layout.seats.find((s) => s.side === "top")!;
    expect(isHeadSeat(nonHead.id, layout)).toBe(false);
  });

  it("circular table: adjacent seats are left_right, two-apart are diagonal, half-way are opposite", () => {
    const circLayout = buildSeatingLayout({
      tables: [{ kind: "circular", id: 1, seats: 8 }]
    });
    const [s0, s1, s2, s3, s4] = circLayout.seats;

    expect(getSeatProximity(s0.id, s1.id, circLayout)).toBe("left_right");
    expect(getSeatProximity(s0.id, s2.id, circLayout)).toBe("diagonal");
    expect(getSeatProximity(s0.id, s4.id, circLayout)).toBe("opposite");  // 8/2 = 4 apart
    expect(getSeatProximity(s0.id, s3.id, circLayout)).toBe("none");
    // wrap-around: seat 7 is adjacent to seat 0
    expect(getSeatProximity(s0.id, circLayout.seats[7].id, circLayout)).toBe("left_right");
  });

  it("circular table with odd seats has no opposite", () => {
    const circLayout = buildSeatingLayout({
      tables: [{ kind: "circular", id: 1, seats: 7 }]
    });
    const [s0, , , s3] = circLayout.seats;
    expect(getSeatProximity(s0.id, s3.id, circLayout)).toBe("none");
  });
});
