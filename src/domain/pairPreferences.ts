import type { ConstraintPair, PairPreference, PairPriority } from "./types";

export const PREFERENCE_LABELS: Record<PairPreference, string> = {
  next_to: "Sit next to each other",
  chat: "Sit where they can chat",
  same_table: "Share a table"
};

// Old distance choices map to the closest intent; only the old strictest
// choice had high priority. Explicit new fields always take precedence.
export function getPairPreference(pair: ConstraintPair): PairPreference {
  return pair.preference ?? (pair.strength === "high" ? "next_to" : "chat");
}

export function getPairPriority(pair: ConstraintPair): PairPriority {
  return pair.priority ?? (pair.strength === "high" ? "high" : "normal");
}
