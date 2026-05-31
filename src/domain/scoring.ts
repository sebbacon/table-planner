import { ADJACENT_SEAT_IDS, SEAT_IDS, SEATS_BY_ID, getSeatProximity, isHeadSeat } from "./seating";
import type {
  Constraint,
  ConstraintPair,
  Gender,
  Guest,
  HeadSeatConstraint,
  HeadSeatScoreResult,
  PairScoreResult,
  PairStrength,
  Plan,
  ScoreBreakdown,
  SeatAssignments,
  SeatProximity,
  TableGenderScore
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
const MIXED_ADJACENT_POINTS = 2;
const SAME_GENDER_ADJACENT_PENALTY = -1;

export function createEmptyAssignments(): SeatAssignments {
  return Object.fromEntries(SEAT_IDS.map((seatId) => [seatId, null]));
}

export function createInitialPlan(guestIds: string[]): Plan {
  const assignments = createEmptyAssignments();

  SEAT_IDS.forEach((seatId, index) => {
    assignments[seatId] = guestIds[index] ?? null;
  });

  return {
    id: `plan-${Date.now()}`,
    assignments,
    holdingGuestIds: guestIds.slice(SEAT_IDS.length)
  };
}

export function scorePlan(
  plan: Plan,
  guests: Guest[],
  constraints: Constraint[]
): ScoreBreakdown {
  const guestsById = new Map(guests.map((guest) => [guest.id, guest]));
  const guestSeatIds = getGuestSeatIds(plan.assignments);
  const preferred = constraints
    .filter((constraint): constraint is ConstraintPair => isPairConstraint(constraint) && constraint.type === "prefer_adjacent")
    .map((pair) => scorePreferencePair(pair, guestSeatIds));
  const avoided = constraints
    .filter((constraint): constraint is ConstraintPair => isPairConstraint(constraint) && constraint.type === "avoid_adjacent")
    .map((pair) => scoreAvoidPair(pair, guestSeatIds));
  const headSeat = constraints
    .filter(isHeadSeatConstraint)
    .map((constraint) => scoreHeadSeatConstraint(constraint, guestSeatIds));
  const tableGender = scoreTableGender(plan.assignments, guestsById);
  const adjacencyGender = scoreAdjacentGender(plan.assignments, guestsById);
  const preferencePoints = sumPoints(preferred);
  const avoidPoints = sumPoints(avoided);
  const headSeatPoints = headSeat.reduce((total, result) => total + result.points, 0);
  const genderPoints =
    tableGender.reduce((total, result) => total + result.points, 0) +
    adjacencyGender.points;

  return {
    total: preferencePoints + avoidPoints + headSeatPoints + genderPoints,
    preferencePoints,
    avoidPoints,
    headSeatPoints,
    genderPoints,
    preferred,
    avoided,
    headSeat,
    tableGender,
    mixedAdjacentPairs: adjacencyGender.mixedAdjacentPairs,
    sameGenderAdjacentPairs: adjacencyGender.sameGenderAdjacentPairs
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
  guestSeatIds: Map<string, number>
): PairScoreResult {
  const proximity = getGuestSeatProximity(pair, guestSeatIds);
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
  guestSeatIds: Map<string, number>
): PairScoreResult {
  const proximity = getGuestSeatProximity(pair, guestSeatIds);
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
  guestSeatIds: Map<string, number>
): SeatProximity {
  const seatAId = guestSeatIds.get(pair.guestAId);
  const seatBId = guestSeatIds.get(pair.guestBId);

  if (seatAId === undefined || seatBId === undefined) {
    return "none";
  }

  return getSeatProximity(seatAId, seatBId);
}

function scoreHeadSeatConstraint(
  constraint: HeadSeatConstraint,
  guestSeatIds: Map<string, number>
): HeadSeatScoreResult {
  const seatId = guestSeatIds.get(constraint.guestId);
  const atHead = seatId === undefined ? false : isHeadSeat(seatId);
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

function scoreTableGender(
  assignments: SeatAssignments,
  guestsById: Map<string, Guest>
): TableGenderScore[] {
  return ([1, 2] as const).map((tableId) => {
    let male = 0;
    let female = 0;

    for (const [seatId, guestId] of Object.entries(assignments)) {
      const seat = SEATS_BY_ID.get(Number(seatId));
      const guest = guestId ? guestsById.get(guestId) : undefined;

      if (seat?.tableId !== tableId || !guest) {
        continue;
      }

      if (guest.gender === "M") {
        male += 1;
      } else if (guest.gender === "F") {
        female += 1;
      }
    }

    const known = male + female;
    const imbalance = Math.abs(male - female);
    const points = known < 2 ? 0 : Math.max(0, 14 - imbalance * 3);

    return { tableId, male, female, points };
  });
}

function scoreAdjacentGender(
  assignments: SeatAssignments,
  guestsById: Map<string, Guest>
): {
  points: number;
  mixedAdjacentPairs: number;
  sameGenderAdjacentPairs: number;
} {
  let points = 0;
  let mixedAdjacentPairs = 0;
  let sameGenderAdjacentPairs = 0;

  for (const [seatAId, neighbors] of ADJACENT_SEAT_IDS.entries()) {
    for (const seatBId of neighbors) {
      if (seatAId >= seatBId) {
        continue;
      }

      const genderA = getBinaryGender(assignments[seatAId], guestsById);
      const genderB = getBinaryGender(assignments[seatBId], guestsById);

      if (!genderA || !genderB) {
        continue;
      }

      if (genderA === genderB) {
        sameGenderAdjacentPairs += 1;
        points += SAME_GENDER_ADJACENT_PENALTY;
      } else {
        mixedAdjacentPairs += 1;
        points += MIXED_ADJACENT_POINTS;
      }
    }
  }

  return { points, mixedAdjacentPairs, sameGenderAdjacentPairs };
}

function getBinaryGender(
  guestId: string | null,
  guestsById: Map<string, Guest>
): Extract<Gender, "M" | "F"> | null {
  const gender = guestId ? guestsById.get(guestId)?.gender : undefined;

  return gender === "M" || gender === "F" ? gender : null;
}

function sumPoints(results: PairScoreResult[]): number {
  return results.reduce((total, result) => total + result.points, 0);
}
