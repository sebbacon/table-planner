import { HEAD_SEAT_IDS, SEAT_IDS, getSeatIdsForTable, getSeatProximity, isHeadSeat } from "./seating";
import { createEmptyAssignments, getGuestSeatIds, scorePlan } from "./scoring";
import { isHeadSeatConstraint, isPairConstraint } from "./types";
import type { Constraint, ConstraintPair, Guest, Plan, ScoreBreakdown, SeatAssignments } from "./types";

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
  const preferPairs = constraints.filter(
    (c): c is ConstraintPair => isPairConstraint(c) && c.type === "prefer_adjacent"
  );

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const plan = createRandomPlan(guestIds, preferHeadIds, avoidHeadIds, preferPairs, rng, `candidate-${attempt}`);
    improvePlan(plan, guests, constraints, preferHeadIds, avoidHeadIds, preferPairs, improveIterations, rng);
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
  preferPairs: ConstraintPair[],
  rng: () => number,
  id: string
): Plan {
  const assignments = createEmptyAssignments();

  const table1SeatIds = getSeatIdsForTable(1);
  const table2SeatIds = getSeatIdsForTable(2);
  const totalSeats = table1SeatIds.length + table2SeatIds.length;
  const n = Math.min(guestIds.length, totalSeats);
  const t1Cap = Math.min(table1SeatIds.length, Math.ceil(n / 2));
  const t2Cap = Math.min(table2SeatIds.length, n - t1Cap);

  const { table1Guests, table2Guests } = partitionGuestsByTable(
    guestIds.slice(0, n), preferPairs, t1Cap, t2Cap, rng
  );

  assignToTable(table1Guests, table1SeatIds, preferHeadIds, avoidHeadIds, assignments, rng);
  assignToTable(table2Guests, table2SeatIds, preferHeadIds, avoidHeadIds, assignments, rng);

  return { id, assignments, holdingGuestIds: guestIds.slice(n) };
}

function partitionGuestsByTable(
  guestIds: string[],
  preferPairs: ConstraintPair[],
  t1Cap: number,
  t2Cap: number,
  rng: () => number
): { table1Guests: string[]; table2Guests: string[] } {
  const guestSet = new Set(guestIds);
  const tableOf = new Map<string, 1 | 2>();
  let t1Count = 0;
  let t2Count = 0;

  function tryAssign(guestId: string, table: 1 | 2): boolean {
    if (!guestSet.has(guestId)) return false;
    if (tableOf.has(guestId)) return tableOf.get(guestId) === table;
    const cap = table === 1 ? t1Cap : t2Cap;
    const count = table === 1 ? t1Count : t2Count;
    if (count >= cap) return false;
    tableOf.set(guestId, table);
    if (table === 1) t1Count += 1; else t2Count += 1;
    return true;
  }

  const strengthWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const sortedPairs = [...preferPairs].sort(
    (a, b) => (strengthWeight[b.strength ?? "medium"] ?? 2) - (strengthWeight[a.strength ?? "medium"] ?? 2)
  );

  for (const pair of sortedPairs) {
    const aTable = tableOf.get(pair.guestAId);
    const bTable = tableOf.get(pair.guestBId);

    if (aTable !== undefined && bTable !== undefined) continue;

    if (aTable !== undefined) {
      tryAssign(pair.guestBId, aTable);
    } else if (bTable !== undefined) {
      tryAssign(pair.guestAId, bTable);
    } else {
      const preferred: 1 | 2 = t1Count <= t2Count ? 1 : 2;
      const fallback: 1 | 2 = preferred === 1 ? 2 : 1;
      if (!tryAssign(pair.guestAId, preferred)) tryAssign(pair.guestAId, fallback);
      const aFinal = tableOf.get(pair.guestAId);
      if (aFinal !== undefined) {
        if (!tryAssign(pair.guestBId, aFinal)) tryAssign(pair.guestBId, aFinal === 1 ? 2 : 1);
      }
    }
  }

  for (const guestId of shuffle(guestIds.filter(id => !tableOf.has(id)), rng)) {
    if (t1Count < t1Cap) tryAssign(guestId, 1);
    else tryAssign(guestId, 2);
  }

  return {
    table1Guests: guestIds.filter(id => tableOf.get(id) === 1),
    table2Guests: guestIds.filter(id => tableOf.get(id) === 2)
  };
}

function assignToTable(
  guestIds: string[],
  tableSeatIds: number[],
  preferHeadIds: Set<string>,
  avoidHeadIds: Set<string>,
  assignments: SeatAssignments,
  rng: () => number
): void {
  const headQueue = shuffle(tableSeatIds.filter(id => HEAD_SEAT_IDS.includes(id)), rng);
  const nonHeadQueue = shuffle(tableSeatIds.filter(id => !HEAD_SEAT_IDS.includes(id)), rng);

  const preferHead = shuffle(guestIds.filter(id => preferHeadIds.has(id)), rng);
  const avoidHead = shuffle(guestIds.filter(id => avoidHeadIds.has(id)), rng);
  const free = shuffle(guestIds.filter(id => !preferHeadIds.has(id) && !avoidHeadIds.has(id)), rng);

  for (const guestId of preferHead) {
    const seat = headQueue.shift() ?? nonHeadQueue.shift();
    if (seat !== undefined) assignments[seat] = guestId;
  }

  for (const guestId of avoidHead) {
    const seat = nonHeadQueue.shift() ?? headQueue.shift();
    if (seat !== undefined) assignments[seat] = guestId;
  }

  const remaining = [...headQueue, ...nonHeadQueue];
  for (const guestId of free) {
    const seat = remaining.shift();
    if (seat !== undefined) assignments[seat] = guestId;
  }
}

function improvePlan(
  plan: Plan,
  guests: Guest[],
  constraints: Constraint[],
  preferHeadIds: Set<string>,
  avoidHeadIds: Set<string>,
  preferPairs: ConstraintPair[],
  iterations: number,
  rng: () => number
): void {
  let currentScore = scorePlan(plan, guests, constraints).total;
  const swappableSeatIds = [...SEAT_IDS];
  const kickThreshold = Math.max(50, Math.floor(iterations * 0.10));
  let noImprovementCount = 0;

  for (let index = 0; index < iterations; index += 1) {
    if (noImprovementCount >= kickThreshold) {
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

    let seatAId: number;
    let seatBId: number;

    const guided = preferPairs.length > 0 && rng() < 0.40
      ? findGuidedSwap(plan, preferPairs, preferHeadIds, avoidHeadIds, rng)
      : null;

    if (guided) {
      ({ seatAId, seatBId } = guided);
    } else {
      seatAId = randomItem(swappableSeatIds, rng);
      seatBId = randomItem(swappableSeatIds, rng);
    }

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

function findGuidedSwap(
  plan: Plan,
  preferPairs: ConstraintPair[],
  preferHeadIds: Set<string>,
  avoidHeadIds: Set<string>,
  rng: () => number
): { seatAId: number; seatBId: number } | null {
  const guestSeatIds = getGuestSeatIds(plan.assignments);

  const unsatisfied = preferPairs.filter(pair => {
    const seatA = guestSeatIds.get(pair.guestAId);
    const seatB = guestSeatIds.get(pair.guestBId);
    if (seatA === undefined || seatB === undefined) return false;
    const proximity = getSeatProximity(seatA, seatB);
    const strength = pair.strength ?? "medium";
    if (strength === "high") return proximity !== "left_right" && proximity !== "end";
    if (strength === "medium") return proximity === "diagonal" || proximity === "none";
    return proximity === "none";
  });

  if (unsatisfied.length === 0) return null;

  const pair = randomItem(unsatisfied, rng);
  const strength = pair.strength ?? "medium";

  const [moverId, anchorId] = rng() < 0.5
    ? [pair.guestAId, pair.guestBId]
    : [pair.guestBId, pair.guestAId];

  const moverSeatId = guestSeatIds.get(moverId);
  const anchorSeatId = guestSeatIds.get(anchorId);
  if (moverSeatId === undefined || anchorSeatId === undefined) return null;

  const targetSeats = SEAT_IDS.filter(seatId => {
    const proximity = getSeatProximity(anchorSeatId, seatId);
    if (strength === "high") return proximity === "left_right" || proximity === "end";
    if (strength === "medium") return proximity === "left_right" || proximity === "end" || proximity === "opposite";
    return proximity !== "none";
  });

  if (targetSeats.length === 0) return null;

  const targetSeatId = randomItem(targetSeats, rng);
  if (targetSeatId === moverSeatId) return null;
  if (!isHeadSwapAllowed(moverSeatId, targetSeatId, plan.assignments, preferHeadIds, avoidHeadIds)) return null;

  return { seatAId: moverSeatId, seatBId: targetSeatId };
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
