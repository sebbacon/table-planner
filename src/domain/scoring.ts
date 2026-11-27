import { getPairPreference, getPairPriority } from "./pairPreferences";
import { getSeatProximity, getSeatDistance, isHeadSeat } from "./seating";
import type {
  Constraint,
  ConstraintPair,
  Guest,
  HeadSeatConstraint,
  HeadSeatScoreResult,
  PairScoreResult,
  Plan,
  ScoreBreakdown,
  SeatingLayout,
  SeatAssignments
} from "./types";
import { isHeadSeatConstraint, isPairConstraint } from "./types";

// Satisfaction depends on intent and table shape. Priority only scales points.
export function scoreSeatPreference(pair: ConstraintPair, seatAId: number | undefined, seatBId: number | undefined, layout: SeatingLayout) {
  const a = seatAId === undefined ? undefined : layout.seatsById.get(seatAId);
  const b = seatBId === undefined ? undefined : layout.seatsById.get(seatBId);
  const sameTable = Boolean(a && b && a.id !== b.id && a.tableId === b.tableId);
  const proximity = a && b ? getSeatProximity(a.id, b.id, layout) : "none";
  const intent = getPairPreference(pair);
  const neighbour = proximity === "left_right" || proximity === "end";
  const circular = a?.side === "circular";
  const chatting = neighbour || proximity === "diagonal" || (!circular && proximity === "opposite");
  const satisfied = sameTable && (intent === "same_table" || (intent === "next_to" ? neighbour : chatting));
  const nearbyPoints = neighbour ? 48 : proximity === "opposite" ? 32 : 24;
  const basePoints = satisfied ? (intent === "same_table" ? 48 : nearbyPoints) : -48;
  return { adjacent: satisfied, proximity, points: basePoints * (getPairPriority(pair) === "high" ? 2 : 1) };
}
const AVOID_NEIGHBOUR_PENALTY = -50;
const AVOID_DISTANT_PENALTY = -4;
const AVOID_SEPARATE_TABLE_POINTS = 24;
const PREFER_HEAD_POINTS = 36;
const AVOID_HEAD_PENALTY = -36;
const AVOID_HEAD_CLEAR_POINTS = 4;
const SAME_GROUP_ADJACENT_PENALTY = -1;

export function createEmptyAssignments(layout: SeatingLayout): SeatAssignments {
  return Object.fromEntries(layout.seatIds.map((seatId) => [seatId, null]));
}

export function createInitialPlan(guestIds: string[], layout: SeatingLayout): Plan {
  const assignments = createEmptyAssignments(layout);

  layout.seatIds.forEach((seatId, index) => {
    assignments[seatId] = guestIds[index] ?? null;
  });

  return {
    id: `plan-${Date.now()}`,
    assignments,
    holdingGuestIds: guestIds.slice(layout.seatIds.length)
  };
}

export function scorePlan(
  plan: Plan,
  guests: Guest[],
  constraints: Constraint[],
  layout: SeatingLayout,
  mixGroups = true
): ScoreBreakdown {
  const guestsById = new Map(guests.map((guest) => [guest.id, guest]));
  const guestSeatIds = getGuestSeatIds(plan.assignments);
  const preferred = constraints
    .filter((constraint): constraint is ConstraintPair => isPairConstraint(constraint) && constraint.type === "prefer_adjacent")
    .map((pair) => scorePreferencePair(pair, guestSeatIds, layout));
  const avoided = constraints
    .filter((constraint): constraint is ConstraintPair => isPairConstraint(constraint) && constraint.type === "avoid_adjacent")
    .map((pair) => scoreAvoidPair(pair, guestSeatIds, layout));
  const headSeat = constraints
    .filter(isHeadSeatConstraint)
    .map((constraint) => scoreHeadSeatConstraint(constraint, guestSeatIds, layout));
  const adjacencyGroup = scoreAdjacentGroup(plan.assignments, guestsById, layout);
  const preferencePoints = sumPoints(preferred);
  const avoidPoints = sumPoints(avoided);
  const headSeatPoints = headSeat.reduce((total, result) => total + result.points, 0);
  const constraintPoints = preferencePoints + avoidPoints + headSeatPoints;
  const groupPoints = mixGroups ? adjacencyGroup.points : 0;

  return {
    total: constraintPoints + groupPoints,
    constraintPoints,
    preferencePoints,
    avoidPoints,
    headSeatPoints,
    groupPoints,
    preferred,
    avoided,
    headSeat,
    sameGroupAdjacentPairs: adjacencyGroup.sameGroupAdjacentPairs
  };
}

export function getGuestSeatIds(assignments: SeatAssignments): Map<string, number> {
  const guestSeatIds = new Map<string, number>();

  for (const [seatId, guestId] of Object.entries(assignments)) {
    if (guestId) {
      guestSeatIds.set(guestId, Number(seatId));
    }
  }

  return guestSeatIds;
}

function scorePreferencePair(
  pair: ConstraintPair,
  guestSeatIds: Map<string, number>,
  layout: SeatingLayout
): PairScoreResult {
  return {
    pair,
    ...scoreSeatPreference(pair, guestSeatIds.get(pair.guestAId), guestSeatIds.get(pair.guestBId), layout)
  };
}

function scoreAvoidPair(
  pair: ConstraintPair,
  guestSeatIds: Map<string, number>,
  layout: SeatingLayout
): PairScoreResult {
  const seatAId = guestSeatIds.get(pair.guestAId);
  const seatBId = guestSeatIds.get(pair.guestBId);
  const a = seatAId === undefined ? undefined : layout.seatsById.get(seatAId);
  const b = seatBId === undefined ? undefined : layout.seatsById.get(seatBId);
  const proximity = a && b ? getSeatProximity(a.id, b.id, layout) : "none";
  if (!a || !b) return { pair, adjacent: true, proximity, points: 0 };
  const sameTable = a.tableId === b.tableId;
  const neighbour = proximity === "left_right" || proximity === "end";
  const distance = neighbour ? 1 : getSeatDistance(a.id, b.id, layout);
  // Circular tables keep a constant shared-table penalty. At long tables,
  // each extra seat-spacing leaves only 40% of the remaining close-seat cost.
  // Use absolute distance so four seats apart means the same on any length.
  const remainingPenalty = a.side === "circular" ? 1 : 0.4 ** Math.max(0, distance - 1);
  const points = sameTable
    ? Math.round(AVOID_DISTANT_PENALTY + (AVOID_NEIGHBOUR_PENALTY - AVOID_DISTANT_PENALTY) * remainingPenalty)
    : AVOID_SEPARATE_TABLE_POINTS;
  // For avoided pairs, "adjacent" now flags the unmet ideal of separate tables.
  return { pair, adjacent: sameTable, proximity, points };
}

function scoreHeadSeatConstraint(
  constraint: HeadSeatConstraint,
  guestSeatIds: Map<string, number>,
  layout: SeatingLayout
): HeadSeatScoreResult {
  const seatId = guestSeatIds.get(constraint.guestId);
  const atHead = seatId === undefined ? false : isHeadSeat(seatId, layout);
  const satisfied =
    (constraint.type === "prefer_head" && atHead) ||
    (constraint.type === "avoid_head" && !atHead);

  return {
    constraint,
    atHead,
    satisfied,
    points: getHeadSeatPoints(constraint, atHead)
  };
}

function getHeadSeatPoints(constraint: HeadSeatConstraint, atHead: boolean): number {
  if (constraint.type === "prefer_head") {
    return atHead ? PREFER_HEAD_POINTS : 0;
  }

  return atHead ? AVOID_HEAD_PENALTY : AVOID_HEAD_CLEAR_POINTS;
}

function scoreAdjacentGroup(
  assignments: SeatAssignments,
  guestsById: Map<string, Guest>,
  layout: SeatingLayout
): {
  points: number;
  sameGroupAdjacentPairs: number;
} {
  let points = 0;
  let sameGroupAdjacentPairs = 0;

  for (const [seatAId, neighbors] of layout.adjacentSeatIds.entries()) {
    for (const seatBId of neighbors) {
      if (seatAId >= seatBId) continue;

      const groupsA = assignments[seatAId] ? (guestsById.get(assignments[seatAId]!)?.groups ?? []) : [];
      const groupsB = assignments[seatBId] ? (guestsById.get(assignments[seatBId]!)?.groups ?? []) : [];

      if (groupsA.length === 0 || groupsB.length === 0) continue;

      const setB = new Set(groupsB);
      let sharedCount = 0;
      for (const g of groupsA) {
        if (setB.has(g)) sharedCount += 1;
      }

      if (sharedCount > 0) {
        sameGroupAdjacentPairs += 1;
        points += SAME_GROUP_ADJACENT_PENALTY * sharedCount;
      }
    }
  }

  return { points, sameGroupAdjacentPairs };
}

function sumPoints(results: PairScoreResult[]): number {
  return results.reduce((total, result) => total + result.points, 0);
}
