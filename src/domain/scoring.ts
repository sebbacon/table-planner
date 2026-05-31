import { ADJACENT_SEAT_IDS, SEAT_IDS, SEATS_BY_ID, getSeatProximity } from "./seating";
import type {
  ConstraintPair,
  Gender,
  Guest,
  PairScoreResult,
  Plan,
  ScoreBreakdown,
  SeatAssignments,
  SeatProximity,
  TableGenderScore
} from "./types";

const PREFER_PROXIMITY_POINTS: Record<SeatProximity, number> = {
  left_right: 48,
  opposite: 32,
  end: 18,
  diagonal: 12,
  none: 0
};
const AVOID_ADJACENT_PENALTY = -50;
const AVOID_CLEAR_POINTS = 4;
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
  constraints: ConstraintPair[]
): ScoreBreakdown {
  const guestsById = new Map(guests.map((guest) => [guest.id, guest]));
  const guestSeatIds = getGuestSeatIds(plan.assignments);
  const preferred = constraints
    .filter((pair) => pair.type === "prefer_adjacent")
    .map((pair) => scorePreferencePair(pair, guestSeatIds));
  const avoided = constraints
    .filter((pair) => pair.type === "avoid_adjacent")
    .map((pair) => scoreAvoidPair(pair, guestSeatIds));
  const tableGender = scoreTableGender(plan.assignments, guestsById);
  const adjacencyGender = scoreAdjacentGender(plan.assignments, guestsById);
  const preferencePoints = sumPoints(preferred);
  const avoidPoints = sumPoints(avoided);
  const genderPoints =
    tableGender.reduce((total, result) => total + result.points, 0) +
    adjacencyGender.points;

  return {
    total: preferencePoints + avoidPoints + genderPoints,
    preferencePoints,
    avoidPoints,
    genderPoints,
    preferred,
    avoided,
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

  return {
    pair,
    adjacent: proximity !== "none",
    proximity,
    points: PREFER_PROXIMITY_POINTS[proximity]
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
