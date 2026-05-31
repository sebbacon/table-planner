import { SEAT_IDS } from "./seating";
import { createEmptyAssignments, scorePlan } from "./scoring";
import type { ConstraintPair, Guest, Plan, ScoreBreakdown, SeatAssignments } from "./types";

export interface ScoredPlan {
  plan: Plan;
  score: ScoreBreakdown;
}

export interface GeneratePlansOptions {
  guests: Guest[];
  constraints: ConstraintPair[];
  count?: number;
  attempts?: number;
  improveIterations?: number;
  rng?: () => number;
}

export function generatePlans({
  guests,
  constraints,
  count = 6,
  attempts = 180,
  improveIterations = 520,
  rng = Math.random
}: GeneratePlansOptions): ScoredPlan[] {
  const candidates: ScoredPlan[] = [];
  const signatures = new Set<string>();
  const guestIds = guests.map((guest) => guest.id);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const plan = createRandomPlan(guestIds, rng, `candidate-${attempt}`);
    improvePlan(plan, guests, constraints, improveIterations, rng);
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

function createRandomPlan(guestIds: string[], rng: () => number, id: string): Plan {
  const assignments = createEmptyAssignments();
  const shuffledGuestIds = shuffle(guestIds, rng);

  SEAT_IDS.forEach((seatId, index) => {
    assignments[seatId] = shuffledGuestIds[index] ?? null;
  });

  return {
    id,
    assignments,
    holdingGuestIds: shuffledGuestIds.slice(SEAT_IDS.length)
  };
}

function improvePlan(
  plan: Plan,
  guests: Guest[],
  constraints: ConstraintPair[],
  iterations: number,
  rng: () => number
): void {
  let currentScore = scorePlan(plan, guests, constraints).total;
  const swappableSeatIds = [...SEAT_IDS];

  for (let index = 0; index < iterations; index += 1) {
    const seatAId = randomItem(swappableSeatIds, rng);
    const seatBId = randomItem(swappableSeatIds, rng);

    if (seatAId === seatBId) {
      continue;
    }

    swapAssignments(plan.assignments, seatAId, seatBId);
    const nextScore = scorePlan(plan, guests, constraints).total;
    const keepWorseMove = nextScore < currentScore && rng() < 0.012;

    if (nextScore >= currentScore || keepWorseMove) {
      currentScore = nextScore;
    } else {
      swapAssignments(plan.assignments, seatAId, seatBId);
    }
  }
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
