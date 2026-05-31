import { describe, expect, it } from "vitest";
import { SEATS, SEATS_BY_ID, areSeatsAdjacent, getSeatProximity } from "./seating";

describe("seating graph", () => {
  it("models 39 seats with the extra seat at the second table left end", () => {
    expect(SEATS).toHaveLength(39);
    expect(SEATS_BY_ID.get(39)).toMatchObject({
      tableId: 2,
      side: "left-end"
    });
  });

  it("treats same-side, opposite, and diagonal seats as adjacent", () => {
    expect(areSeatsAdjacent(11, 12)).toBe(true);
    expect(areSeatsAdjacent(11, 10)).toBe(true);
    expect(areSeatsAdjacent(11, 9)).toBe(true);
    expect(areSeatsAdjacent(11, 8)).toBe(false);
  });

  it("classifies adjacency into ranked proximity tiers", () => {
    expect(getSeatProximity(11, 12)).toBe("left_right");
    expect(getSeatProximity(11, 10)).toBe("opposite");
    expect(getSeatProximity(11, 9)).toBe("diagonal");
    expect(getSeatProximity(11, 8)).toBe("none");
  });

  it("connects end seats to the nearest table-end seats", () => {
    expect(areSeatsAdjacent(1, 19)).toBe(true);
    expect(areSeatsAdjacent(1, 2)).toBe(true);
    expect(areSeatsAdjacent(39, 30)).toBe(true);
    expect(areSeatsAdjacent(39, 29)).toBe(true);
    expect(areSeatsAdjacent(39, 31)).toBe(false);
  });
});
