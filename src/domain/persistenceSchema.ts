// Published wire types: do not import the working model here or change the
// meaning of existing fields. Add a schema version and migration for changes.
export const PLANNER_DATA_VERSION = 2;
export type PersistedPlannerData = PersistedPlannerV2;

export interface PersistedPlanV2 {
  id: string;
  assignments: Record<number, string | null>;
  holdingGuestIds: string[];
}

export type PersistedConstraintV2 = {
  id: string;
  type: "prefer_adjacent" | "avoid_adjacent";
  guestAId: string;
  guestBId: string;
  strength?: "high" | "medium" | "low";
  preference?: "next_to" | "chat" | "same_table";
  priority?: "normal" | "high";
} | {
  id: string;
  type: "prefer_head" | "avoid_head";
  guestId: string;
};

export type PersistedTableV2 = {
  kind: "rect";
  id: number;
  label?: string;
  seatsPerSide: number;
  leftEnd: boolean;
  rightEnd: boolean;
} | {
  kind: "circular";
  id: number;
  label?: string;
  seats: number;
};

export interface PersistedVenueV2 {
  tables: PersistedTableV2[];
  nextTableId?: number;
  positions?: Record<number, { x: number; y: number }>;
}

export interface PersistedColumnV2 {
  id: string;
  label: string;
  mode: "ignore" | "spread" | "cluster" | "neighbours" | "table";
  values: Record<string, string[]>;
  tableMapping: Record<string, number | null>;
  legacyGroups?: boolean;
}

export interface PersistedSavedLayoutV2 {
  id: string;
  name: string;
  savedAt: string;
  plan: PersistedPlanV2;
  scoreTotal: number;
}

// Optional fields remain optional because already-published v2 data omit them.
// Seat ids retain the original global numbering in table/side order.
export interface PersistedPlannerV2 {
  version: 2;
  guestText: string;
  constraints: PersistedConstraintV2[];
  activePlan: PersistedPlanV2 | null;
  savedLayouts?: PersistedSavedLayoutV2[];
  venueConfig?: PersistedVenueV2;
  guestIds?: string[];
  mixGroups?: boolean;
  columns?: PersistedColumnV2[];
  seatPins?: Record<string, number>;
}
