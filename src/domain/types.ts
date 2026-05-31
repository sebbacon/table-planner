export type Gender = "M" | "F" | "Other" | "Unknown";

export type ConstraintType = "prefer_adjacent" | "avoid_adjacent";

export interface Guest {
  id: string;
  name: string;
  gender: Gender;
}

export interface ConstraintPair {
  id: string;
  type: ConstraintType;
  guestAId: string;
  guestBId: string;
}

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
  genderPoints: number;
  preferred: PairScoreResult[];
  avoided: PairScoreResult[];
  tableGender: TableGenderScore[];
  mixedAdjacentPairs: number;
  sameGenderAdjacentPairs: number;
}
