import type { CircularTableConfig, RectTableConfig, Seat, SeatingLayout, SeatProximity, VenueConfig } from "./types";

export function buildSeatingLayout(config: VenueConfig): SeatingLayout {
  const seats: Seat[] = [];
  let nextId = 1;

  for (const table of config.tables) {
    if (table.kind === "rect") {
      for (let pos = 0; pos < table.seatsPerSide; pos++) {
        seats.push({ id: nextId++, tableId: table.id, side: "top", position: pos });
      }
      for (let pos = 0; pos < table.seatsPerSide; pos++) {
        seats.push({ id: nextId++, tableId: table.id, side: "bottom", position: pos });
      }
      if (table.leftEnd) {
        seats.push({ id: nextId++, tableId: table.id, side: "left-end", position: -1 });
      }
      if (table.rightEnd) {
        seats.push({ id: nextId++, tableId: table.id, side: "right-end", position: table.seatsPerSide });
      }
    } else {
      for (let pos = 0; pos < table.seats; pos++) {
        seats.push({ id: nextId++, tableId: table.id, side: "circular", position: pos });
      }
    }
  }

  const seatsById = new Map(seats.map((s) => [s.id, s]));
  const headSeatIds = seats
    .filter((s) => s.side === "left-end" || s.side === "right-end")
    .map((s) => s.id);
  const tableConfigs = new Map(config.tables.map((t) => [t.id, t]));

  return {
    seats,
    seatIds: seats.map((s) => s.id),
    seatsById,
    headSeatIds,
    adjacentSeatIds: buildAdjacentSeatIds(seats, seatsById, tableConfigs),
    tableIds: config.tables.map((t) => t.id),
    tableConfigs
  };
}

export function getSeatProximity(
  seatAId: number,
  seatBId: number,
  layout: SeatingLayout
): SeatProximity {
  const seatA = layout.seatsById.get(seatAId);
  const seatB = layout.seatsById.get(seatBId);

  if (!seatA || !seatB || seatA.tableId !== seatB.tableId) return "none";

  const tableConfig = layout.tableConfigs.get(seatA.tableId);
  if (!tableConfig) return "none";

  return getProximityBySeat(seatA, seatB, tableConfig);
}

export function isHeadSeat(seatId: number, layout: SeatingLayout): boolean {
  return layout.headSeatIds.includes(seatId);
}

export function getSeatIdsForTable(tableId: number, layout: SeatingLayout): number[] {
  return layout.seats.filter((s) => s.tableId === tableId).map((s) => s.id);
}

export function areSeatsAdjacent(
  seatAId: number,
  seatBId: number,
  layout: SeatingLayout
): boolean {
  return getSeatProximity(seatAId, seatBId, layout) !== "none";
}

function buildAdjacentSeatIds(
  seats: Seat[],
  seatsById: Map<number, Seat>,
  tableConfigs: Map<number, import("./types").TableConfig>
): Map<number, Set<number>> {
  const adjacency = new Map<number, Set<number>>();
  for (const seat of seats) adjacency.set(seat.id, new Set());

  for (const seatA of seats) {
    for (const seatB of seats) {
      if (seatA.id >= seatB.id || seatA.tableId !== seatB.tableId) continue;
      const tableConfig = tableConfigs.get(seatA.tableId);
      if (!tableConfig) continue;
      if (getProximityBySeat(seatA, seatB, tableConfig) !== "none") {
        adjacency.get(seatA.id)!.add(seatB.id);
        adjacency.get(seatB.id)!.add(seatA.id);
      }
    }
  }

  return adjacency;
}

function getProximityBySeat(
  seatA: Seat,
  seatB: Seat,
  tableConfig: import("./types").TableConfig
): SeatProximity {
  if (tableConfig.kind === "circular") {
    return getCircularProximity(seatA, seatB, tableConfig);
  }
  return getRectProximity(seatA, seatB, tableConfig);
}

function getCircularProximity(
  seatA: Seat,
  seatB: Seat,
  tableConfig: CircularTableConfig
): SeatProximity {
  const n = tableConfig.seats;
  const dist = Math.min(
    Math.abs(seatA.position - seatB.position),
    n - Math.abs(seatA.position - seatB.position)
  );
  if (dist === 1) return "left_right";
  if (dist === 2) return "diagonal";
  if (n % 2 === 0 && dist === n / 2) return "opposite";
  return "none";
}

function getRectProximity(
  seatA: Seat,
  seatB: Seat,
  tableConfig: RectTableConfig
): SeatProximity {
  const lastPos = tableConfig.seatsPerSide - 1;

  if (isSideSeat(seatA) && isSideSeat(seatB)) {
    if (seatA.side === seatB.side) {
      return Math.abs(seatA.position - seatB.position) === 1 ? "left_right" : "none";
    }
    if (seatA.position === seatB.position) return "opposite";
    return Math.abs(seatA.position - seatB.position) === 1 ? "diagonal" : "none";
  }

  const [left, right] = seatA.position <= seatB.position ? [seatA, seatB] : [seatB, seatA];

  if (left.side === "left-end" && isSideSeat(right)) {
    return right.position === 0 ? "end" : "none";
  }
  if (right.side === "right-end" && isSideSeat(left)) {
    return left.position === lastPos ? "end" : "none";
  }

  return "none";
}

function isSideSeat(seat: Seat): boolean {
  return seat.side === "top" || seat.side === "bottom";
}
