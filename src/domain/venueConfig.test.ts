import { describe, expect, it } from "vitest";
import { roomTableOrder } from "./venueConfig";

describe("room table order", () => {
  it("reads approximate rows left to right, then top to bottom", () => {
    expect(roomTableOrder({
      tables: [1, 2, 3, 4].map(id => ({ id, kind: "circular", seats: 8 })),
      positions: { 1: { x: 20, y: 300 }, 2: { x: 400, y: 20 }, 3: { x: 20, y: 45 }, 4: { x: 400, y: 300 } }
    })).toEqual([3, 2, 1, 4]);
  });
});
