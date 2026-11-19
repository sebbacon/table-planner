import { isHeadSeat } from "./seating";
import type { ConstraintPair, PairStrength, SeatAssignments, SeatingLayout } from "./types";

const TABLE_PULL_WEIGHTS: Record<PairStrength, number> = { high: 3, medium: 2, low: 1 };

export function getTablePullWeight(pair: ConstraintPair): number {
  return TABLE_PULL_WEIGHTS[pair.strength ?? "medium"] ?? 2;
}

function getPartnerId(pair: ConstraintPair, guestId: string): string | null {
  if (pair.guestAId === guestId) return pair.guestBId;
  if (pair.guestBId === guestId) return pair.guestAId;
  return null;
}

function getTablePulls(
  guestIds: string[],
  preferPairs: ConstraintPair[],
  tableOf: Map<string, number>
): Map<number, number> {
  const pull = new Map<number, number>();
  for (const guestId of guestIds) {
    for (const pair of preferPairs) {
      const partnerId = getPartnerId(pair, guestId);
      if (!partnerId) continue;
      const tableId = tableOf.get(partnerId);
      if (tableId === undefined) continue;
      pull.set(tableId, (pull.get(tableId) ?? 0) + getTablePullWeight(pair));
    }
  }
  return pull;
}

// Only consider tables with space. Iteration order breaks equal-strength ties.
export function findPreferredTable(
  guestIds: string[],
  preferPairs: ConstraintPair[],
  tableOf: Map<string, number>,
  availableTableIds: number[]
): number | null {
  const pull = getTablePulls(guestIds, preferPairs, tableOf);
  let bestTable: number | null = null;
  let bestPull = 0;
  for (const tableId of availableTableIds) {
    const weight = pull.get(tableId) ?? 0;
    if (weight > bestPull) {
      bestPull = weight;
      bestTable = tableId;
    }
  }
  return bestTable;
}

function isProtectedGuest(guestId: string | null, protectedIds: Set<string>): boolean {
  return Boolean(guestId && protectedIds.has(guestId));
}

// Preserve satisfied head preferences during search; unsatisfied guests may move.
export function isHeadSwapAllowed(
  seatAId: number,
  seatBId: number,
  assignments: SeatAssignments,
  preferHeadIds: Set<string>,
  avoidHeadIds: Set<string>,
  layout: SeatingLayout
): boolean {
  if (preferHeadIds.size === 0 && avoidHeadIds.size === 0) return true;

  const aIsHead = isHeadSeat(seatAId, layout);
  const bIsHead = isHeadSeat(seatBId, layout);
  if (aIsHead === bIsHead) return true;

  const headGuest = assignments[aIsHead ? seatAId : seatBId];
  const nonHeadGuest = assignments[aIsHead ? seatBId : seatAId];
  return !isProtectedGuest(headGuest, preferHeadIds)
    && !isProtectedGuest(nonHeadGuest, avoidHeadIds);
}
