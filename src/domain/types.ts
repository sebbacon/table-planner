export type PairConstraintType = "prefer_adjacent" | "avoid_adjacent";
export type PairPreference = "next_to" | "chat" | "same_table";
export type PairPriority = "normal" | "high";
export type PairStrength = "high" | "medium" | "low";
export type HeadSeatConstraintType = "prefer_head" | "avoid_head";
export type ConstraintType = PairConstraintType | HeadSeatConstraintType;

export interface Guest {
  id: string;
  name: string;
  groups: string[];
}

export interface ConstraintPair {
  id: string;
  type: PairConstraintType;
  guestAId: string;
  guestBId: string;
  preference?: PairPreference;
  priority?: PairPriority;
  /** Legacy backup field; use preference and priority for new pairs. */
  strength?: PairStrength;
}

export interface HeadSeatConstraint {
  id: string;
  type: HeadSeatConstraintType;
  guestId: string;
}

export type Constraint = ConstraintPair | HeadSeatConstraint;

export type SeatSide = "top" | "bottom" | "left-end" | "right-end" | "circular";

export interface Seat {
  id: number;
  tableId: number;
  side: SeatSide;
  position: number;
}

export type SeatProximity = "left_right" | "opposite" | "end" | "diagonal" | "none";

export type SeatAssignments = Record<number, string | null>;

// --- Venue / table configuration ---

export interface RectTableConfig {
  kind: "rect";
  id: number;
  label?: string;
  seatsPerSide: number;
  leftEnd: boolean;
  rightEnd: boolean;
}

export interface CircularTableConfig {
  kind: "circular";
  id: number;
  label?: string;
  seats: number;
}

export type TableConfig = RectTableConfig | CircularTableConfig;

export interface VenueConfig {
  positions?: Record<number, { x: number; y: number }>;
  tables: TableConfig[];
}

export interface SeatingLayout {
  seats: Seat[];
  seatIds: number[];
  seatsById: Map<number, Seat>;
  headSeatIds: number[];
  adjacentSeatIds: Map<number, Set<number>>;
  tableIds: number[];
  tableConfigs: Map<number, TableConfig>;
}

export interface Plan {
  id: string;
  assignments: SeatAssignments;
  holdingGuestIds: string[];
}

export interface PairScoreResult {
  pair: ConstraintPair;
  /** Legacy name: preferred intent met, or keep-apart ideal still unmet. */
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

export interface ScoreBreakdown {
  total: number;
  constraintPoints: number;
  preferencePoints: number;
  avoidPoints: number;
  headSeatPoints: number;
  groupPoints: number;
  preferred: PairScoreResult[];
  avoided: PairScoreResult[];
  headSeat: HeadSeatScoreResult[];
  sameGroupAdjacentPairs: number;
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
