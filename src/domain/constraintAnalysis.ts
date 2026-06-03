import type { Constraint, ConstraintPair, Guest } from "./types";
import { isPairConstraint } from "./types";

export interface GuestOverload {
  guestId: string;
  strength: "high" | "medium";
  constraintCount: number;
  maxSatisfiable: number;
  pairs: ConstraintPair[];
}

export interface ConstraintCluster {
  memberIds: string[];
  pairIds: string[];
}

export interface CrossClusterPair {
  pair: ConstraintPair;
  clusterAMemberIds: string[];
  clusterBMemberIds: string[];
}

export interface ConstraintAnalysis {
  clusters: ConstraintCluster[];
  overloadedGuests: GuestOverload[];
  crossClusterPairs: CrossClusterPair[];
  hasAnyIssue: boolean;
}

// Physical adjacency limits per seat position:
// High-strength (left_right/end only): at most 2 direct neighbours
// Medium-strength (adds opposite): at most 3
const HIGH_MAX = 2;
const MEDIUM_MAX = 3;

function makeUnionFind(ids: string[]) {
  const parent = new Map<string, string>(ids.map((id) => [id, id]));

  function find(id: string): string {
    const p = parent.get(id) ?? id;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  }

  function union(a: string, b: string) {
    parent.set(find(a), find(b));
  }

  return { find, union };
}

export function analyzeConstraints(
  guests: Guest[],
  constraints: Constraint[]
): ConstraintAnalysis {
  const preferPairs = constraints.filter(
    (c): c is ConstraintPair => isPairConstraint(c) && c.type === "prefer_adjacent"
  );

  const guestIds = guests.map((g) => g.id);

  // === Connected components (all prefer_adjacent edges) ===
  const allUF = makeUnionFind(guestIds);
  for (const pair of preferPairs) {
    allUF.union(pair.guestAId, pair.guestBId);
  }

  const componentMembers = new Map<string, string[]>();
  for (const id of guestIds) {
    const root = allUF.find(id);
    if (!componentMembers.has(root)) componentMembers.set(root, []);
    componentMembers.get(root)!.push(id);
  }

  const componentPairIds = new Map<string, string[]>();
  for (const pair of preferPairs) {
    const root = allUF.find(pair.guestAId);
    if (!componentPairIds.has(root)) componentPairIds.set(root, []);
    componentPairIds.get(root)!.push(pair.id);
  }

  const clusters: ConstraintCluster[] = [];
  for (const [root, memberIds] of componentMembers) {
    const pairIds = componentPairIds.get(root) ?? [];
    if (memberIds.length >= 2 && pairIds.length > 0) {
      clusters.push({ memberIds, pairIds });
    }
  }

  // === Per-guest overload detection ===
  const highPairsByGuest = new Map<string, ConstraintPair[]>();
  const medHighPairsByGuest = new Map<string, ConstraintPair[]>();

  for (const pair of preferPairs) {
    const strength = pair.strength ?? "medium";
    for (const guestId of [pair.guestAId, pair.guestBId]) {
      if (strength === "high") {
        if (!highPairsByGuest.has(guestId)) highPairsByGuest.set(guestId, []);
        highPairsByGuest.get(guestId)!.push(pair);
      }
      if (strength === "high" || strength === "medium") {
        if (!medHighPairsByGuest.has(guestId)) medHighPairsByGuest.set(guestId, []);
        medHighPairsByGuest.get(guestId)!.push(pair);
      }
    }
  }

  const overloadedGuests: GuestOverload[] = [];
  for (const guest of guests) {
    const highPairs = highPairsByGuest.get(guest.id) ?? [];
    const medHighPairs = medHighPairsByGuest.get(guest.id) ?? [];

    if (highPairs.length > HIGH_MAX) {
      overloadedGuests.push({
        guestId: guest.id,
        strength: "high",
        constraintCount: highPairs.length,
        maxSatisfiable: HIGH_MAX,
        pairs: highPairs,
      });
    } else if (medHighPairs.length > MEDIUM_MAX) {
      overloadedGuests.push({
        guestId: guest.id,
        strength: "medium",
        constraintCount: medHighPairs.length,
        maxSatisfiable: MEDIUM_MAX,
        pairs: medHighPairs,
      });
    }
  }

  // === Cross high-cluster pair detection ===
  // Build high-strength only connected components to find which guests
  // are "locked in" to separate tight clusters.
  const highPairs = preferPairs.filter((p) => p.strength === "high");
  const highUF = makeUnionFind(guestIds);
  for (const pair of highPairs) {
    highUF.union(pair.guestAId, pair.guestBId);
  }

  const highComponentMembers = new Map<string, string[]>();
  for (const id of guestIds) {
    const root = highUF.find(id);
    if (!highComponentMembers.has(root)) highComponentMembers.set(root, []);
    highComponentMembers.get(root)!.push(id);
  }

  // Only mark guests as belonging to a meaningful high cluster if
  // they have at least one high-strength neighbour (non-singleton component).
  const guestHighCluster = new Map<string, string[]>();
  for (const [, members] of highComponentMembers) {
    if (members.length >= 2) {
      for (const id of members) guestHighCluster.set(id, members);
    }
  }

  // Flag prefer_adjacent pairs whose two endpoints are locked into
  // different high-strength clusters — they're unlikely to land at the same table.
  const crossClusterPairs: CrossClusterPair[] = [];
  const seen = new Set<string>();
  for (const pair of preferPairs) {
    const clusterA = guestHighCluster.get(pair.guestAId);
    const clusterB = guestHighCluster.get(pair.guestBId);
    if (
      clusterA &&
      clusterB &&
      highUF.find(pair.guestAId) !== highUF.find(pair.guestBId) &&
      !seen.has(pair.id)
    ) {
      seen.add(pair.id);
      crossClusterPairs.push({
        pair,
        clusterAMemberIds: clusterA,
        clusterBMemberIds: clusterB,
      });
    }
  }

  const hasAnyIssue = overloadedGuests.length > 0 || crossClusterPairs.length > 0;

  return { clusters, overloadedGuests, crossClusterPairs, hasAnyIssue };
}
