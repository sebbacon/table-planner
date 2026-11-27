import { describe, expect, it } from "vitest";
import { legacyGroupColumn, reconcileColumns, resolveTableAssignments, tableAssignmentViolations } from "./guestColumns";
import { comparePreferenceScores, scorePlan } from "./scoring";
import { buildSeatingLayout } from "./seating";
import type { Guest, GuestColumn, Plan } from "./types";

const guests: Guest[] = ["a", "b", "c", "d"].map(id => ({ id, name: id.toUpperCase(), groups: [] }));
const layout = buildSeatingLayout({ tables: [{ id: 0, kind: "circular", seats: 3 }, { id: 9, kind: "circular", seats: 3 }] });
function column(changes: Partial<GuestColumn> = {}): GuestColumn {
  return { id: "department", label: "Department", mode: "spread", values: { a: ["X"], b: ["X"], c: ["Y"], d: ["Y"] }, tableMapping: {}, ...changes };
}
function plan(ids: string[]): Plan {
  return { id: "plan", assignments: Object.fromEntries(layout.seatIds.map((seatId, index) => [seatId, ids[index] ?? null])), holdingGuestIds: [] };
}
const clustered = plan(["a", "b", "", "c", "d", ""]);
const spread = plan(["a", "c", "", "b", "d", ""]);
const points = (plan: Plan, columns: GuestColumn[]) => scorePlan(plan, guests, [], layout, false, columns).groupPoints;

describe("column rules", () => {
  it("spreads matching values across tables or clusters them according to the selected rule", () => {
    expect(points(spread, [column()])).toBeGreaterThan(points(clustered, [column()]));
    expect(points(clustered, [column({ mode: "cluster" })])).toBeGreaterThan(points(spread, [column({ mode: "cluster" })]));
    expect(points(spread, [column({ mode: "ignore" })])).toBe(0);
    expect(points(clustered, [column({ mode: "table" })])).toBe(0);
  });

  it("targets proportional table capacity, even with unequal group sizes", () => {
    const uneven = buildSeatingLayout({ tables: [{ id: 1, kind: "circular", seats: 3 }, { id: 2, kind: "circular", seats: 6 }] });
    const people = Array.from({ length: 9 }, (_, i) => ({ id: `g${i}`, name: `G${i}`, groups: [] }));
    const rule = column({ values: Object.fromEntries(people.map((guest, i) => [guest.id, [i < 3 ? "Small" : "Large"]])) });
    const balanced = { id: "balanced", holdingGuestIds: [], assignments: Object.fromEntries(uneven.seatIds.map((id, i) => [id, ["g0", "g3", "g4", "g1", "g2", "g5", "g6", "g7", "g8"][i]])) };
    const score = scorePlan(balanced, people, [], uneven, false, [rule]);
    expect(score.groupPoints).toBe(0);
  });

  it("ignores blank cells rather than treating them as a shared group", () => {
    const blank = column({ values: { a: [], b: [] }, mode: "neighbours" });
    expect(points(clustered, [blank])).toBe(0);
    expect(points(clustered, [{ ...blank, mode: "cluster" }])).toBe(0);
    expect(points(clustered, [{ ...blank, mode: "spread" }])).toBe(0);
  });

  it("mixes neighbours within a table independently of table distribution", () => {
    const long = buildSeatingLayout({ tables: [{ id: 1, kind: "rect", seatsPerSide: 4, leftEnd: false, rightEnd: false }] });
    const adjacent = { id: "a", assignments: { 1: "a", 2: "b", 3: "c", 4: "d" }, holdingGuestIds: [] };
    const mixed = { ...adjacent, assignments: { 1: "a", 2: "c", 3: "b", 4: "d" } };
    const rule = column({ mode: "neighbours" });
    expect(scorePlan(mixed, guests, [], long, false, [rule]).groupPoints).toBeGreaterThan(scorePlan(adjacent, guests, [], long, false, [rule]).groupPoints);
  });

  it("prioritizes same-table grouping over any number of spreading rules, below individual preferences", () => {
    const columns = [column({ id: "household", mode: "cluster" }),
      ...Array.from({ length: 20 }, (_, i) => column({ id: `spread-${i}` }))];
    const clusterScore = scorePlan(clustered, guests, [], layout, false, columns);
    const spreadScore = scorePlan(spread, guests, [], layout, false, columns);
    expect(clusterScore.groupPoints).toBeLessThan(spreadScore.groupPoints);
    expect(comparePreferenceScores(clusterScore, spreadScore)).toBeGreaterThan(0);
    expect(comparePreferenceScores({ ...clusterScore, constraintPoints: 0 }, { ...spreadScore, constraintPoints: 1 })).toBeLessThan(0);
  });

  it("gives matching rules equal weight and never lets any column score outweigh individual preferences", () => {
    const one = points(clustered, [column({ mode: "cluster" })]);
    const two = points(clustered, [column({ mode: "cluster" }), column({ id: "copy", mode: "cluster" })]);
    expect(two).toBe(one * 2);
    expect(comparePreferenceScores({ constraintPoints: 1, clusterPoints: 0, groupPoints: -100000 }, { constraintPoints: 0, clusterPoints: 0, groupPoints: 100000 })).toBeGreaterThan(0);
    expect(comparePreferenceScores({ constraintPoints: 1, clusterPoints: 0, groupPoints: 0.5 }, { constraintPoints: 1, clusterPoints: 0, groupPoints: 0 })).toBeGreaterThan(0);
  });
});

describe("fixed table assignments", () => {
  it("resolves table id zero and blank cells, preserving links through a rename", () => {
    const rule = column({ mode: "table", values: { a: ["VIP"], b: [] }, tableMapping: { VIP: 0 } });
    const fixed = resolveTableAssignments([rule], guests, layout);
    expect(fixed.issues).toEqual([]);
    expect([...fixed.assignments]).toEqual([["a", 0]]);
    const renamed = { ...layout, tableConfigs: new Map([...layout.tableConfigs].map(([id, table]) => [id, { ...table, label: "Renamed" }])) };
    expect([...resolveTableAssignments([rule], guests, renamed).assignments]).toEqual([["a", 0]]);
  });

  it("reports unmapped or deleted targets and conflicting assignments across columns", () => {
    const rule = column({ mode: "table", tableMapping: { X: 0, Y: 100 } });
    expect(resolveTableAssignments([rule], guests, layout).issues).toEqual(["Department: choose a table for “Y”."]);
    expect(resolveTableAssignments([{ ...rule, tableMapping: {} }], guests, layout).issues).toHaveLength(2);
    const conflict = { ...rule, id: "other", label: "Other", tableMapping: { X: 9, Y: 9 } };
    expect(resolveTableAssignments([rule, conflict], guests, layout).issues).toContain("A is assigned to different tables. Choose one table.");
  });

  it("reports table overcapacity and catches wrong seats and unseated fixed guests", () => {
    const rule = column({ mode: "table", tableMapping: { X: 0, Y: 0 } });
    expect(resolveTableAssignments([rule], guests, layout).issues[0]).toContain("4 fixed guests but only 3 seats");
    expect(tableAssignmentViolations(spread, new Map([["a", 9], ["c", 0]]), guests, layout)).toEqual(["A must sit at Table 9."]);
    expect(tableAssignmentViolations({ ...spread, assignments: {} }, new Map([["a", 0]]), guests, layout)).toEqual(["A must sit at Table 0."]);
  });
});

it("migrates multiple legacy labels and reconciles imported attributes by stable guest identity", () => {
  const original = [{ ...guests[0], groups: ["Family", "Younger"] }, guests[1]];
  expect(legacyGroupColumn(original, true)[0]).toMatchObject({ label: "Groups", mode: "neighbours", values: { a: ["Family", "Younger"], b: [] } });
  expect(legacyGroupColumn(original, false)[0].mode).toBe("ignore");
  const renamed = [{ ...original[1], name: "Renamed" }, { ...original[0], groups: ["Friends"] }];
  const reconciled = reconcileColumns([...legacyGroupColumn(original, true), column()], renamed);
  expect(reconciled[0].values).toEqual({ a: ["Friends"], b: [] });
  expect(reconciled[1].values).toEqual({ a: ["X"], b: ["X"] });
  expect(legacyGroupColumn(guests, true)).toEqual([]);
});
