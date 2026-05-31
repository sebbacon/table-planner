import type { Constraint, ConstraintType, PairStrength, Plan, SeatAssignments, SavedLayout } from "./types";

export interface PlannerData {
  guestText: string;
  constraints: Constraint[];
  activePlan: Plan | null;
  savedLayouts?: SavedLayout[];
}

export interface PlannerBackup extends PlannerData {
  version: 1;
  exportedAt: string;
}

const CONSTRAINT_TYPES = new Set<ConstraintType>([
  "prefer_adjacent",
  "avoid_adjacent",
  "prefer_head",
  "avoid_head"
]);

export function createPlannerBackup(
  data: PlannerData,
  exportedAt = new Date().toISOString()
): PlannerBackup {
  return {
    version: 1,
    exportedAt,
    guestText: data.guestText,
    constraints: data.constraints,
    activePlan: data.activePlan,
    savedLayouts: data.savedLayouts
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
    throw new Error("The data file is missing constraints.");
  }

  return {
    guestText: parsed.guestText,
    constraints: parsed.constraints.map(parseConstraint),
    activePlan: parsed.activePlan === null ? null : parsePlan(parsed.activePlan),
    savedLayouts: Array.isArray(parsed.savedLayouts)
      ? parsed.savedLayouts.map(parseSavedLayout)
      : []
  };
}

function parseConstraint(value: unknown): Constraint {
  if (!isRecord(value)) {
    throw new Error("The data file contains an invalid constraint.");
  }

  const { id, type } = value;

  if (
    typeof id !== "string" ||
    typeof type !== "string" ||
    !CONSTRAINT_TYPES.has(type as ConstraintType)
  ) {
    throw new Error("The data file contains an invalid constraint.");
  }

  if (type === "prefer_adjacent" || type === "avoid_adjacent") {
    const { guestAId, guestBId, strength } = value;

    if (typeof guestAId !== "string" || typeof guestBId !== "string") {
      throw new Error("The data file contains an invalid constraint.");
    }

    const validStrengths = new Set<string>(["high", "medium", "low"]);
    const parsedStrength: PairStrength | undefined =
      type === "prefer_adjacent" && typeof strength === "string" && validStrengths.has(strength)
        ? (strength as PairStrength)
        : undefined;

    return {
      id,
      type,
      guestAId,
      guestBId,
      ...(parsedStrength !== undefined ? { strength: parsedStrength } : {})
    };
  }

  const { guestId } = value;

  if (typeof guestId !== "string") {
    throw new Error("The data file contains an invalid constraint.");
  }

  return {
    id,
    type: type as "prefer_head" | "avoid_head",
    guestId
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

function parseSavedLayout(value: unknown): SavedLayout {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    throw new Error("The data file contains an invalid saved layout.");
  }

  return {
    id: value.id,
    name: value.name,
    savedAt: typeof value.savedAt === "string" ? value.savedAt : new Date().toISOString(),
    plan: parsePlan(value.plan),
    scoreTotal: typeof value.scoreTotal === "number" ? value.scoreTotal : 0
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
