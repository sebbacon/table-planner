export type Gender = "M" | "F" | "Other" | "Unknown";

export type PairConstraintType = "prefer_adjacent" | "avoid_adjacent";
export type PairStrength = "high" | "medium" | "low";
export type HeadSeatConstraintType = "prefer_head" | "avoid_head";
export type ConstraintType = PairConstraintType | HeadSeatConstraintType;

export interface Guest {
  id: string;
  name: string;
  gender: Gender;
}

export interface ConstraintPair {
  id: string;
  type: PairConstraintType;
  guestAId: string;
  guestBId: string;
  strength?: PairStrength; // only meaningful for prefer_adjacent; absent/undefined = "medium"
}

export interface HeadSeatConstraint {
  id: string;
  type: HeadSeatConstraintType;
  guestId: string;
}

export type Constraint = ConstraintPair | HeadSeatConstraint;

export type SeatSide = "top" | "bottom" | "left-end" | "right-end";

export interface Seat {
  id: number;
  tableId: 1 | 2;
  side: SeatSide;
  position: number;
}

export type SeatProximity = "left_right" | "opposite" | "end" | "diagonal" | "none";

export type SeatAssignments = Record<number, string | null>;

export interface Plan {
  id: string;
  assignments: SeatAssignments;
  holdingGuestIds: string[];
}

export interface PairScoreResult {
  pair: ConstraintPair;
  adjacent: boolean;
  proximity: SeatProximity;
  points: number;
}

export interface HeadSeatScoreResult {
  constraint: HeadSeatConstraint;
  atHead: boolean;
  points: number;
  satisfied: boolean;
}

export interface TableGenderScore {
  tableId: 1 | 2;
  male: number;
  female: number;
  points: number;
}

export interface ScoreBreakdown {
  total: number;
  preferencePoints: number;
  avoidPoints: number;
  headSeatPoints: number;
  genderPoints: number;
  preferred: PairScoreResult[];
  avoided: PairScoreResult[];
  headSeat: HeadSeatScoreResult[];
  tableGender: TableGenderScore[];
  mixedAdjacentPairs: number;
  sameGenderAdjacentPairs: number;
}

export interface SavedLayout {
  id: string;
  name: string;
  savedAt: string;
  plan: Plan;
  scoreTotal: number;
}

export function isPairConstraint(constraint: Constraint): constraint is ConstraintPair {
  return constraint.type === "prefer_adjacent" || constraint.type === "avoid_adjacent";
}

export function isHeadSeatConstraint(constraint: Constraint): constraint is HeadSeatConstraint {
  return constraint.type === "prefer_head" || constraint.type === "avoid_head";
}
