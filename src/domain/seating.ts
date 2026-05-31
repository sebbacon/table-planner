import type { Seat, SeatProximity } from "./types";

export const SEATS: Seat[] = [
  ...Array.from({ length: 9 }, (_, index) => ({
    id: 11 + index,
    tableId: 1 as const,
    side: "top" as const,
    position: index
  })),
  ...Array.from({ length: 9 }, (_, index) => ({
    id: 10 - index,
    tableId: 1 as const,
    side: "bottom" as const,
    position: index
  })),
  { id: 1, tableId: 1, side: "right-end", position: 9 },
  ...Array.from({ length: 9 }, (_, index) => ({
    id: 30 + index,
    tableId: 2 as const,
    side: "top" as const,
    position: index
  })),
  ...Array.from({ length: 9 }, (_, index) => ({
    id: 29 - index,
    tableId: 2 as const,
    side: "bottom" as const,
    position: index
  })),
  { id: 39, tableId: 2, side: "left-end", position: -1 },
  { id: 20, tableId: 2, side: "right-end", position: 9 }
];

export const SEAT_IDS = SEATS.map((seat) => seat.id);

export const SEATS_BY_ID = new Map(SEATS.map((seat) => [seat.id, seat]));

export const ADJACENT_SEAT_IDS = buildAdjacentSeatIds();

export function areSeatsAdjacent(seatAId: number, seatBId: number): boolean {
  return getSeatProximity(seatAId, seatBId) !== "none";
}

export function getSeatProximity(seatAId: number, seatBId: number): SeatProximity {
  const seatA = SEATS_BY_ID.get(seatAId);
  const seatB = SEATS_BY_ID.get(seatBId);

  if (!seatA || !seatB || seatA.tableId !== seatB.tableId) {
    return "none";
  }

  return getSeatProximityBySeat(seatA, seatB);
}

export function getSeatIdsForTable(tableId: 1 | 2): number[] {
  return SEATS.filter((seat) => seat.tableId === tableId).map((seat) => seat.id);
}

function buildAdjacentSeatIds(): Map<number, Set<number>> {
  const adjacency = new Map<number, Set<number>>();

  for (const seat of SEATS) {
    adjacency.set(seat.id, new Set<number>());
  }

  for (const seatA of SEATS) {
    for (const seatB of SEATS) {
      if (seatA.id >= seatB.id || seatA.tableId !== seatB.tableId) {
        continue;
      }

      if (getSeatProximityBySeat(seatA, seatB) !== "none") {
        adjacency.get(seatA.id)!.add(seatB.id);
        adjacency.get(seatB.id)!.add(seatA.id);
      }
    }
  }

  return adjacency;
}

function getSeatProximityBySeat(seatA: Seat, seatB: Seat): SeatProximity {
  const [left, right] = [seatA, seatB].sort((a, b) => a.position - b.position);

  if (isSideSeat(seatA) && isSideSeat(seatB)) {
    if (seatA.side === seatB.side) {
      return Math.abs(seatA.position - seatB.position) === 1 ? "left_right" : "none";
    }

    if (seatA.position === seatB.position) {
      return "opposite";
    }

    return Math.abs(seatA.position - seatB.position) === 1 ? "diagonal" : "none";
  }

  if (left.side === "left-end" && isSideSeat(right)) {
    return right.position === 0 ? "end" : "none";
  }

  if (right.side === "right-end" && isSideSeat(left)) {
    return left.position === 8 ? "end" : "none";
  }

  return "none";
}

function isSideSeat(seat: Seat): boolean {
  return seat.side === "top" || seat.side === "bottom";
}
