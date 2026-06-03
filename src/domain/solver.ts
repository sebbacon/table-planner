import { getSeatIdsForTable, getSeatProximity, isHeadSeat } from "./seating";
import { createEmptyAssignments, getGuestSeatIds, scorePlan } from "./scoring";
import { isHeadSeatConstraint, isPairConstraint } from "./types";
import type { Constraint, ConstraintPair, Guest, Plan, ScoreBreakdown, SeatingLayout, SeatAssignments, SeatProximity, PairStrength } from "./types";

export interface ScoredPlan {
  plan: Plan;
  score: ScoreBreakdown;
}

export interface GeneratePlansOptions {
  guests: Guest[];
  constraints: Constraint[];
  layout: SeatingLayout;
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
  layout,
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
    const plan = createRandomPlan(guestIds, preferHeadIds, avoidHeadIds, preferPairs, layout, rng, `candidate-${attempt}`);
    improvePlan(plan, guests, constraints, preferHeadIds, avoidHeadIds, preferPairs, layout, improveIterations, rng);
    const signature = getPlanSignature(plan, layout);

    if (signatures.has(signature)) continue;

    signatures.add(signature);
    candidates.push({
      plan,
      score: scorePlan(plan, guests, constraints, layout)
    });
  }

  return candidates.sort((a, b) => b.score.total - a.score.total).slice(0, count);
}

function createRandomPlan(
  guestIds: string[],
  preferHeadIds: Set<string>,
  avoidHeadIds: Set<string>,
  preferPairs: ConstraintPair[],
  layout: SeatingLayout,
  rng: () => number,
  id: string
): Plan {
  const assignments = createEmptyAssignments(layout);

  const totalSeats = layout.seatIds.length;
  const n = Math.min(guestIds.length, totalSeats);

  // Compute per-table capacities proportional to table size
  const tableSeatIds = layout.tableIds.map((tableId) => getSeatIdsForTable(tableId, layout));
  const caps = computeTableCaps(tableSeatIds, n);

  const { tableGuests } = partitionGuestsByTable(
    guestIds.slice(0, n), preferPairs, layout.tableIds, caps, rng
  );

  for (let i = 0; i < layout.tableIds.length; i++) {
    assignToTable(tableGuests[i], tableSeatIds[i], preferHeadIds, avoidHeadIds, layout, assignments, rng);
  }

  return { id, assignments, holdingGuestIds: guestIds.slice(n) };
}

function computeTableCaps(tableSeatIds: number[][], n: number): number[] {
  const total = tableSeatIds.reduce((s, ids) => s + ids.length, 0);
  const caps: number[] = [];
  let remaining = n;

  for (let i = 0; i < tableSeatIds.length; i++) {
    if (i === tableSeatIds.length - 1) {
      caps.push(Math.min(tableSeatIds[i].length, remaining));
    } else {
      const share = Math.round((tableSeatIds[i].length / total) * n);
      const cap = Math.min(tableSeatIds[i].length, share);
      caps.push(cap);
      remaining -= cap;
    }
  }

  return caps;
}

function partitionGuestsByTable(
  guestIds: string[],
  preferPairs: ConstraintPair[],
  tableIds: number[],
  caps: number[],
  rng: () => number
): { tableGuests: string[][] } {
  const guestSet = new Set(guestIds);
  const tableOf = new Map<string, number>(); // guestId → tableId
  const counts = new Map<number, number>(tableIds.map((id) => [id, 0]));

  function tryAssign(guestId: string, tableId: number): boolean {
    if (!guestSet.has(guestId)) return false;
    if (tableOf.has(guestId)) return tableOf.get(guestId) === tableId;
    const idx = tableIds.indexOf(tableId);
    if (idx === -1) return false;
    if ((counts.get(tableId) ?? 0) >= caps[idx]) return false;
    tableOf.set(guestId, tableId);
    counts.set(tableId, (counts.get(tableId) ?? 0) + 1);
    return true;
  }

  function smallestTable(): number {
    let best = tableIds[0];
    let bestRatio = Infinity;
    for (let i = 0; i < tableIds.length; i++) {
      const id = tableIds[i];
      const ratio = (counts.get(id) ?? 0) / caps[i];
      if (ratio < bestRatio) { bestRatio = ratio; best = id; }
    }
    return best;
  }

  const strengthWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };

  // Return the table that constraint partners of these guests are already on,
  // weighted by strength. Returns null if no pull or pulled table is full.
  function pullTable(guestIdsToPlace: string[]): number | null {
    const pull = new Map<number, number>(tableIds.map((id) => [id, 0]));
    for (const guestId of guestIdsToPlace) {
      for (const p of preferPairs) {
        const partnerId = p.guestAId === guestId ? p.guestBId : p.guestBId === guestId ? p.guestAId : null;
        if (!partnerId) continue;
        const partnerTable = tableOf.get(partnerId);
        if (partnerTable === undefined) continue;
        pull.set(partnerTable, (pull.get(partnerTable) ?? 0) + (strengthWeight[p.strength ?? "medium"] ?? 2));
      }
    }
    let bestTable: number | null = null;
    let bestPull = 0;
    for (const [tableId, p] of pull.entries()) {
      if (p > bestPull) {
        const idx = tableIds.indexOf(tableId);
        if ((counts.get(tableId) ?? 0) < caps[idx]) {
          bestPull = p;
          bestTable = tableId;
        }
      }
    }
    return bestTable;
  }

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
      // Pull toward the table that already has this pair's constraint partners
      const preferred = pullTable([pair.guestAId, pair.guestBId]) ?? smallestTable();
      if (!tryAssign(pair.guestAId, preferred)) {
        const fallback = tableIds.find((id) => id !== preferred) ?? preferred;
        tryAssign(pair.guestAId, fallback);
      }
      const aFinal = tableOf.get(pair.guestAId);
      if (aFinal !== undefined) {
        if (!tryAssign(pair.guestBId, aFinal)) {
          const fallback = tableIds.find((id) => id !== aFinal) ?? aFinal;
          tryAssign(pair.guestBId, fallback);
        }
      }
    }
  }

  for (const guestId of shuffle(guestIds.filter((id) => !tableOf.has(id)), rng)) {
    const target = smallestTable();
    if (!tryAssign(guestId, target)) {
      for (const id of tableIds) {
        if (tryAssign(guestId, id)) break;
      }
    }
  }

  return {
    tableGuests: tableIds.map((tableId) => guestIds.filter((id) => tableOf.get(id) === tableId))
  };
}

function assignToTable(
  guestIds: string[],
  tableSeatIds: number[],
  preferHeadIds: Set<string>,
  avoidHeadIds: Set<string>,
  layout: SeatingLayout,
  assignments: SeatAssignments,
  rng: () => number
): void {
  const headQueue = shuffle(tableSeatIds.filter((id) => isHeadSeat(id, layout)), rng);
  const nonHeadQueue = shuffle(tableSeatIds.filter((id) => !isHeadSeat(id, layout)), rng);

  const preferHead = shuffle(guestIds.filter((id) => preferHeadIds.has(id)), rng);
  const avoidHead = shuffle(guestIds.filter((id) => avoidHeadIds.has(id)), rng);
  const free = shuffle(guestIds.filter((id) => !preferHeadIds.has(id) && !avoidHeadIds.has(id)), rng);

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
  layout: SeatingLayout,
  iterations: number,
  rng: () => number
): void {
  let currentScore = scorePlan(plan, guests, constraints, layout).total;
  const swappableSeatIds = [...layout.seatIds];
  const kickThreshold = Math.max(50, Math.floor(iterations * 0.10));
  let noImprovementCount = 0;

  // Guests in high-strength pairs: their table assignment comes from the
  // partition phase and should not be disrupted by the improvement phase.
  const highStrengthGuestIds = new Set(
    preferPairs.filter((p) => p.strength === "high").flatMap((p) => [p.guestAId, p.guestBId])
  );

  for (let index = 0; index < iterations; index += 1) {
    if (noImprovementCount >= kickThreshold) {
      for (let k = 0; k < 4; k += 1) {
        const a = randomItem(swappableSeatIds, rng);
        const b = randomItem(swappableSeatIds, rng);
        if (a !== b
          && isHeadSwapAllowed(a, b, plan.assignments, preferHeadIds, avoidHeadIds, layout)
          && isTableSwapAllowed(a, b, plan.assignments, highStrengthGuestIds, layout)
        ) {
          swapAssignments(plan.assignments, a, b);
        }
      }
      currentScore = scorePlan(plan, guests, constraints, layout).total;
      noImprovementCount = 0;
      continue;
    }

    let seatAId: number;
    let seatBId: number;

    const guided = preferPairs.length > 0 && rng() < 0.40
      ? findGuidedSwap(plan, preferPairs, preferHeadIds, avoidHeadIds, layout, rng)
      : null;

    if (guided) {
      ({ seatAId, seatBId } = guided);
    } else {
      seatAId = randomItem(swappableSeatIds, rng);
      seatBId = randomItem(swappableSeatIds, rng);
    }

    if (seatAId === seatBId) continue;
    if (!isHeadSwapAllowed(seatAId, seatBId, plan.assignments, preferHeadIds, avoidHeadIds, layout)) continue;
    if (!isTableSwapAllowed(seatAId, seatBId, plan.assignments, highStrengthGuestIds, layout)) continue;

    swapAssignments(plan.assignments, seatAId, seatBId);
    const nextScore = scorePlan(plan, guests, constraints, layout).total;
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
  layout: SeatingLayout,
  rng: () => number
): { seatAId: number; seatBId: number } | null {
  const guestSeatIds = getGuestSeatIds(plan.assignments);

  const unsatisfied = preferPairs.filter((pair) => {
    const seatA = guestSeatIds.get(pair.guestAId);
    const seatB = guestSeatIds.get(pair.guestBId);
    if (seatA === undefined || seatB === undefined) return false;
    const proximity = getSeatProximity(seatA, seatB, layout);
    const strength = pair.strength ?? "medium";
    if (strength === "high") return proximity !== "left_right" && proximity !== "end";
    if (strength === "medium") return proximity === "diagonal" || proximity === "none";
    return proximity === "none";
  });

  if (unsatisfied.length === 0) return null;

  // Weight selection by strength so high pairs get proportionally more guided attempts.
  const strengthWeight: Record<string, number> = { high: 9, medium: 3, low: 1 };
  const weights = unsatisfied.map((p) => strengthWeight[p.strength ?? "medium"] ?? 3);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  let pick = rng() * totalWeight;
  let pairIndex = 0;
  for (let i = 0; i < weights.length; i++) {
    pick -= weights[i];
    if (pick <= 0) { pairIndex = i; break; }
  }
  const pair = unsatisfied[pairIndex];
  const strength = pair.strength ?? "medium";

  const [moverId, anchorId] = rng() < 0.5
    ? [pair.guestAId, pair.guestBId]
    : [pair.guestBId, pair.guestAId];

  const moverSeatId = guestSeatIds.get(moverId);
  const anchorSeatId = guestSeatIds.get(anchorId);
  if (moverSeatId === undefined || anchorSeatId === undefined) return null;

  const currentMoverProximity = getSeatProximity(moverSeatId, anchorSeatId, layout);
  const targetSeats = getBestAvailableTargetSeats(anchorSeatId, currentMoverProximity, strength, layout);

  if (targetSeats.length === 0) return null;

  const targetSeatId = randomItem(targetSeats, rng);
  if (targetSeatId === moverSeatId) return null;
  if (!isHeadSwapAllowed(moverSeatId, targetSeatId, plan.assignments, preferHeadIds, avoidHeadIds, layout)) return null;

  return { seatAId: moverSeatId, seatBId: targetSeatId };
}

function getBestAvailableTargetSeats(
  anchorSeatId: number,
  currentMoverProximity: SeatProximity,
  strength: PairStrength,
  layout: SeatingLayout
): number[] {
  const tiers: SeatProximity[][] =
    strength === "high"
      ? [["left_right", "end"], ["opposite"], ["diagonal"]]
      : strength === "medium"
      ? [["left_right", "end", "opposite"], ["diagonal"]]
      : [["left_right", "end", "opposite", "diagonal"]];

  // Only target tiers strictly better than where the mover currently sits
  const currentTierIdx = tiers.findIndex((tier) => tier.includes(currentMoverProximity));
  const candidateTiers = currentTierIdx === -1 ? tiers : tiers.slice(0, currentTierIdx);

  for (const tier of candidateTiers) {
    const seats = layout.seatIds.filter((seatId) =>
      tier.includes(getSeatProximity(anchorSeatId, seatId, layout))
    );
    if (seats.length > 0) return seats;
  }

  return [];
}

// Prevent high-strength cluster members from crossing tables during improvement.
// Their table assignment is determined by the partition phase and should be stable.
function isTableSwapAllowed(
  seatAId: number,
  seatBId: number,
  assignments: SeatAssignments,
  highStrengthGuestIds: Set<string>,
  layout: SeatingLayout
): boolean {
  if (highStrengthGuestIds.size === 0) return true;
  const seatA = layout.seatsById.get(seatAId);
  const seatB = layout.seatsById.get(seatBId);
  if (!seatA || !seatB || seatA.tableId === seatB.tableId) return true;
  const guestA = assignments[seatAId];
  const guestB = assignments[seatBId];
  if (guestA && highStrengthGuestIds.has(guestA)) return false;
  if (guestB && highStrengthGuestIds.has(guestB)) return false;
  return true;
}

function isHeadSwapAllowed(
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

  const guestA = assignments[seatAId];
  const guestB = assignments[seatBId];

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

function getPlanSignature(plan: Plan, layout: SeatingLayout): string {
  return layout.seatIds.map((seatId) => plan.assignments[seatId] ?? "-").join("|");
}
