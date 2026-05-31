import type { ConstraintPair, ConstraintType, Plan, SeatAssignments } from "./types";

export interface PlannerData {
  guestText: string;
  constraints: ConstraintPair[];
  activePlan: Plan | null;
}

export interface PlannerBackup extends PlannerData {
  version: 1;
  exportedAt: string;
}

const CONSTRAINT_TYPES = new Set<ConstraintType>(["prefer_adjacent", "avoid_adjacent"]);

export function createPlannerBackup(
  data: PlannerData,
  exportedAt = new Date().toISOString()
): PlannerBackup {
  return {
    version: 1,
    exportedAt,
    guestText: data.guestText,
    constraints: data.constraints,
    activePlan: data.activePlan
  };
}

export function parsePlannerBackupJson(input: string): PlannerData {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("The data file is not valid JSON.");
  }

  if (!isRecord(parsed) || parsed.version !== 1) {
    throw new Error("The data file is not a supported table planner export.");
  }

  if (typeof parsed.guestText !== "string") {
    throw new Error("The data file is missing a guest list.");
  }

  if (!Array.isArray(parsed.constraints)) {
    throw new Error("The data file is missing pairings.");
  }

  return {
    guestText: parsed.guestText,
    constraints: parsed.constraints.map(parseConstraintPair),
    activePlan: parsed.activePlan === null ? null : parsePlan(parsed.activePlan)
  };
}

function parseConstraintPair(value: unknown): ConstraintPair {
  if (!isRecord(value)) {
    throw new Error("The data file contains an invalid pairing.");
  }

  const { id, type, guestAId, guestBId } = value;

  if (
    typeof id !== "string" ||
    typeof guestAId !== "string" ||
    typeof guestBId !== "string" ||
    typeof type !== "string" ||
    !CONSTRAINT_TYPES.has(type as ConstraintType)
  ) {
    throw new Error("The data file contains an invalid pairing.");
  }

  return {
    id,
    type: type as ConstraintType,
    guestAId,
    guestBId
  };
}

function parsePlan(value: unknown): Plan {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.assignments)) {
    throw new Error("The data file contains an invalid seating plan.");
  }

  if (!Array.isArray(value.holdingGuestIds) || value.holdingGuestIds.some((guestId) => typeof guestId !== "string")) {
    throw new Error("The data file contains an invalid seating plan.");
  }

  const assignments: SeatAssignments = {};

  for (const [seatId, guestId] of Object.entries(value.assignments)) {
    if (guestId !== null && typeof guestId !== "string") {
      throw new Error("The data file contains an invalid seating plan.");
    }

    assignments[Number(seatId)] = guestId;
  }

  return {
    id: value.id,
    assignments,
    holdingGuestIds: value.holdingGuestIds
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
