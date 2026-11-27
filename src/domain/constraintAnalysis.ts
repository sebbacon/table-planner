import { getPairPreference } from "./pairPreferences";
import { scoreSeatPreference } from "./scoring";
import type { Constraint, ConstraintPair, Guest, PairPreference, SeatingLayout } from "./types";
import { isPairConstraint } from "./types";

export interface GuestOverload {
  guestId: string;
  preference: PairPreference;
  constraintCount: number;
  maxSatisfiable: number;
  pairs: ConstraintPair[];
}

export interface ConstraintAnalysis {
  overloadedGuests: GuestOverload[];
  hasAnyIssue: boolean;
}

export function analyzeConstraints(
  guests: Guest[],
  constraints: Constraint[],
  layout: SeatingLayout
): ConstraintAnalysis {
  const preferPairs = constraints.filter(
    (c): c is ConstraintPair => isPairConstraint(c) && c.type === "prefer_adjacent"
  );

  // Capacity depends on the actual table shapes and sizes, not priority.
  const overloadedGuests: GuestOverload[] = [];
  for (const preference of ["next_to", "chat"] as const) {
    const sample: ConstraintPair = { id: "capacity", type: "prefer_adjacent", guestAId: "a", guestBId: "b", preference };
    const maximum = Math.max(0, ...layout.seatIds.map(a => layout.seatIds.filter(b => scoreSeatPreference(sample, a, b, layout).adjacent).length));
    for (const guest of guests) {
      if (overloadedGuests.some(item => item.guestId === guest.id)) continue;
      const pairs = preferPairs.filter(pair => (pair.guestAId === guest.id || pair.guestBId === guest.id)
        && (getPairPreference(pair) === "next_to" || (preference === "chat" && getPairPreference(pair) === "chat")));
      if (pairs.length > maximum) overloadedGuests.push({ guestId: guest.id, preference, constraintCount: pairs.length, maxSatisfiable: maximum, pairs });
    }
  }

  return { overloadedGuests, hasAnyIssue: overloadedGuests.length > 0 };
}
