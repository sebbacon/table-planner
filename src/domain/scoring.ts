import { getSeatProximity, isHeadSeat } from "./seating";
import type {
  Constraint,
  ConstraintPair,
  Guest,
  HeadSeatConstraint,
  HeadSeatScoreResult,
  PairScoreResult,
  PairStrength,
  Plan,
  ScoreBreakdown,
  SeatingLayout,
  SeatAssignments,
  SeatProximity
} from "./types";
import { isHeadSeatConstraint, isPairConstraint } from "./types";

const PREFER_PROXIMITY_POINTS: Record<PairStrength, Record<SeatProximity, number>> = {
  high:   { left_right: 80, end: 80, opposite: -20, diagonal: -40, none: -80 },
  medium: { left_right: 48, end: 48, opposite: 32,  diagonal:   8, none: -16 },
  low:    { left_right: 24, end: 24, opposite: 18,  diagonal:  12, none: -12 },
};

function isAdjacentForStrength(proximity: SeatProximity, strength: PairStrength): boolean {
  if (strength === "high") return proximity === "left_right" || proximity === "end";
  if (strength === "medium") return proximity !== "none" && proximity !== "diagonal";
  return proximity !== "none"; // low: diagonal counts as satisfied
}
const AVOID_ADJACENT_PENALTY = -50;
const AVOID_CLEAR_POINTS = 4;
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
  layout: SeatingLayout
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
  const groupPoints = adjacencyGroup.points;

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
  const proximity = getGuestSeatProximity(pair, guestSeatIds, layout);
  const strength: PairStrength = pair.strength ?? "medium";

  return {
    pair,
    adjacent: isAdjacentForStrength(proximity, strength),
    proximity,
    points: PREFER_PROXIMITY_POINTS[strength][proximity]
  };
}

function scoreAvoidPair(
  pair: ConstraintPair,
  guestSeatIds: Map<string, number>,
  layout: SeatingLayout
): PairScoreResult {
  const proximity = getGuestSeatProximity(pair, guestSeatIds, layout);
  const adjacent = proximity !== "none";

  return {
    pair,
    adjacent,
    proximity,
    points: adjacent ? AVOID_ADJACENT_PENALTY : AVOID_CLEAR_POINTS
  };
}

function getGuestSeatProximity(
  pair: ConstraintPair,
  guestSeatIds: Map<string, number>,
  layout: SeatingLayout
): SeatProximity {
  const seatAId = guestSeatIds.get(pair.guestAId);
  const seatBId = guestSeatIds.get(pair.guestBId);

  if (seatAId === undefined || seatBId === undefined) return "none";

  return getSeatProximity(seatAId, seatBId, layout);
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
