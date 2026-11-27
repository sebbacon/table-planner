import { expect, it } from "vitest";
import { analyzeConstraints } from "./constraintAnalysis";
import { buildSeatingLayout } from "./seating";
import type { ConstraintPair, Guest } from "./types";
const guests: Guest[] = Array.from({ length: 7 }, (_, index) => ({ id: `g${index}`, name: `Guest ${index}`, groups: [] }));
const round = buildSeatingLayout({ tables: [{ id: 1, kind: "circular", seats: 10 }] });
const rect = buildSeatingLayout({ tables: [{ id: 1, kind: "rect", seatsPerSide: 5, leftEnd: false, rightEnd: false }] });
const pairs = (preference: ConstraintPair["preference"], count: number, priority: ConstraintPair["priority"] = "normal"): ConstraintPair[] =>
  guests.slice(1, count + 1).map(guest => ({ id: guest.id, type: "prefer_adjacent", guestAId: "g0", guestBId: guest.id, preference, priority }));
it("uses conversation capacity for the actual table shape rather than priority", () => {
  expect(analyzeConstraints(guests, pairs("chat", 5), round).overloadedGuests[0]).toMatchObject({ guestId: "g0", preference: "chat", maxSatisfiable: 4 });
  expect(analyzeConstraints(guests, pairs("chat", 5, "high"), rect).overloadedGuests).toEqual([]);
});
it("limits next-to pairs to the available immediate neighbours and excludes same-table pairs", () => {
  expect(analyzeConstraints(guests, pairs("next_to", 3), round).overloadedGuests[0]).toMatchObject({ preference: "next_to", maxSatisfiable: 2 });
  expect(analyzeConstraints(guests, pairs("same_table", 6, "high"), round).overloadedGuests).toEqual([]);
});
