import { HEAD_SEAT_IDS, SEAT_IDS, isHeadSeat } from "./seating";
import { createEmptyAssignments, scorePlan } from "./scoring";
import { isHeadSeatConstraint } from "./types";
import type { Constraint, Guest, Plan, ScoreBreakdown, SeatAssignments } from "./types";

export interface ScoredPlan {
  plan: Plan;
  score: ScoreBreakdown;
}

export interface GeneratePlansOptions {
  guests: Guest[];
  constraints: Constraint[];
  count?: number;
  attempts?: number;
  improveIterations?: number;
  rng?: () => number;
}

export const EFFORT_LEVELS = [
  { attempts: 60,  improveIterations: 400 },
  { attempts: 120, improveIterations: 700 },
  { attempts: 200, improveIterations: 1100 },
  { attempts: 320, improveIterations: 1800 },
  { attempts: 500, improveIterations: 2800 },
] as const;

export const DEFAULT_EFFORT = 3;

export function generatePlans({
  guests,
  constraints,
  count = 6,
  attempts = EFFORT_LEVELS[DEFAULT_EFFORT - 1].attempts,
  improveIterations = EFFORT_LEVELS[DEFAULT_EFFORT - 1].improveIterations,
  rng = Math.random
}: GeneratePlansOptions): ScoredPlan[] {
  const candidates: ScoredPlan[] = [];
  const signatures = new Set<string>();
  const guestIds = guests.map((guest) => guest.id);

  const preferHeadIds = new Set(
    constraints.filter(isHeadSeatConstraint).filter((c) => c.type === "prefer_head").map((c) => c.guestId)
  );
  const avoidHeadIds = new Set(
    constraints.filter(isHeadSeatConstraint).filter((c) => c.type === "avoid_head").map((c) => c.guestId)
  );

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const plan = createRandomPlan(guestIds, preferHeadIds, avoidHeadIds, rng, `candidate-${attempt}`);
    improvePlan(plan, guests, constraints, preferHeadIds, avoidHeadIds, improveIterations, rng);
    const signature = getPlanSignature(plan);

    if (signatures.has(signature)) {
      continue;
    }

    signatures.add(signature);
    candidates.push({
      plan,
      score: scorePlan(plan, guests, constraints)
    });
  }

  return candidates.sort((a, b) => b.score.total - a.score.total).slice(0, count);
}

function createRandomPlan(
  guestIds: string[],
  preferHeadIds: Set<string>,
  avoidHeadIds: Set<string>,
  rng: () => number,
  id: string
): Plan {
  const assignments = createEmptyAssignments();

  const headSeats = shuffle([...HEAD_SEAT_IDS], rng);
  const nonHeadSeats = shuffle(
    SEAT_IDS.filter((seatId) => !HEAD_SEAT_IDS.includes(seatId)),
    rng
  );

  const preferHeadGuests = shuffle(guestIds.filter((id) => preferHeadIds.has(id)), rng);
  const avoidHeadGuests = shuffle(guestIds.filter((id) => avoidHeadIds.has(id)), rng);
  const freeGuests = shuffle(guestIds.filter((id) => !preferHeadIds.has(id) && !avoidHeadIds.has(id)), rng);

  const headQueue = [...headSeats];
  const nonHeadQueue = [...nonHeadSeats];
  const holdingGuestIds: string[] = [];

  for (const guestId of preferHeadGuests) {
    const seat = headQueue.shift() ?? nonHeadQueue.shift();
    if (seat !== undefined) {
      assignments[seat] = guestId;
    } else {
      holdingGuestIds.push(guestId);
    }
  }

  for (const guestId of avoidHeadGuests) {
    const seat = nonHeadQueue.shift() ?? headQueue.shift();
    if (seat !== undefined) {
      assignments[seat] = guestId;
    } else {
      holdingGuestIds.push(guestId);
    }
  }

  const remainingSeats = [...headQueue, ...nonHeadQueue];
  for (const guestId of freeGuests) {
    const seat = remainingSeats.shift();
    if (seat !== undefined) {
      assignments[seat] = guestId;
    } else {
      holdingGuestIds.push(guestId);
    }
  }

  return { id, assignments, holdingGuestIds };
}

function improvePlan(
  plan: Plan,
  guests: Guest[],
  constraints: Constraint[],
  preferHeadIds: Set<string>,
  avoidHeadIds: Set<string>,
  iterations: number,
  rng: () => number
): void {
  let currentScore = scorePlan(plan, guests, constraints).total;
  const swappableSeatIds = [...SEAT_IDS];
  // Kick after this many consecutive swaps without strict improvement
  const kickThreshold = Math.max(50, Math.floor(iterations * 0.10));
  let noImprovementCount = 0;

  for (let index = 0; index < iterations; index += 1) {
    if (noImprovementCount >= kickThreshold) {
      // Escape local optimum: make several random valid swaps, then re-score
      for (let k = 0; k < 4; k += 1) {
        const a = randomItem(swappableSeatIds, rng);
        const b = randomItem(swappableSeatIds, rng);
        if (a !== b && isHeadSwapAllowed(a, b, plan.assignments, preferHeadIds, avoidHeadIds)) {
          swapAssignments(plan.assignments, a, b);
        }
      }
      currentScore = scorePlan(plan, guests, constraints).total;
      noImprovementCount = 0;
      continue;
    }

    const seatAId = randomItem(swappableSeatIds, rng);
    const seatBId = randomItem(swappableSeatIds, rng);

    if (seatAId === seatBId) {
      continue;
    }

    if (!isHeadSwapAllowed(seatAId, seatBId, plan.assignments, preferHeadIds, avoidHeadIds)) {
      continue;
    }

    swapAssignments(plan.assignments, seatAId, seatBId);
    const nextScore = scorePlan(plan, guests, constraints).total;
    const keepWorseMove = nextScore < currentScore && rng() < 0.012;

    if (nextScore > currentScore) {
      currentScore = nextScore;
      noImprovementCount = 0;
    } else if (keepWorseMove) {
      currentScore = nextScore;
      noImprovementCount += 1;
    } else {
      swapAssignments(plan.assignments, seatAId, seatBId);
      noImprovementCount += 1;
    }
  }
}

function isHeadSwapAllowed(
  seatAId: number,
  seatBId: number,
  assignments: SeatAssignments,
  preferHeadIds: Set<string>,
  avoidHeadIds: Set<string>
): boolean {
  if (preferHeadIds.size === 0 && avoidHeadIds.size === 0) {
    return true;
  }

  const aIsHead = isHeadSeat(seatAId);
  const bIsHead = isHeadSeat(seatBId);

  if (aIsHead === bIsHead) {
    return true;
  }

  const guestA = assignments[seatAId];
  const guestB = assignments[seatBId];

  // After swap: guestA → seatB, guestB → seatA
  if (guestA && preferHeadIds.has(guestA) && aIsHead && !bIsHead) return false;
  if (guestB && preferHeadIds.has(guestB) && bIsHead && !aIsHead) return false;
  if (guestA && avoidHeadIds.has(guestA) && !aIsHead && bIsHead) return false;
  if (guestB && avoidHeadIds.has(guestB) && !bIsHead && aIsHead) return false;

  return true;
}

function swapAssignments(assignments: SeatAssignments, seatAId: number, seatBId: number): void {
  const nextSeatA = assignments[seatBId];
  assignments[seatBId] = assignments[seatAId];
  assignments[seatAId] = nextSeatA;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function randomItem<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function getPlanSignature(plan: Plan): string {
  return SEAT_IDS.map((seatId) => plan.assignments[seatId] ?? "-").join("|");
}
