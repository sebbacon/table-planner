import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlannerBackup, parsePlannerBackupJson } from "./backup";
import type { PlannerData } from "./backup";
import type { Constraint, ConstraintPair } from "./types";

const pair: ConstraintPair = {
  id: "pair-1",
  type: "prefer_adjacent",
  guestAId: "guest-1-jane",
  guestBId: "guest-2-sam"
};

describe("planner backup", () => {
  afterEach(() => vi.useRealTimers());

  const plan = { id: "plan-1", assignments: { 1: "jane", 2: null }, holdingGuestIds: ["sam"] };
  const minimalBackup = { version: 1, guestText: "Jane\nSam", constraints: [], activePlan: null };
  const parseWith = (fields: Record<string, unknown>) =>
    parsePlannerBackupJson(JSON.stringify({ ...minimalBackup, ...fields }));

  it("round-trips saved layouts, holding guests, all constraints, and mixed table shapes", () => {
    const data: PlannerData = {
      guestText: "Jane\nSam",
      constraints: [
        ...(["high", "medium", "low"] as const).map((strength) => ({ ...pair, id: strength, strength })),
        { ...pair, id: "avoid", type: "avoid_adjacent" },
        { id: "head", type: "prefer_head", guestId: "jane" },
        { id: "no-head", type: "avoid_head", guestId: "sam" }
      ],
      activePlan: plan,
      savedLayouts: [{ id: "saved", name: "Dinner", savedAt: "2026-01-01T00:00:00.000Z", plan, scoreTotal: 123 }],
      venueConfig: { positions: { 10: { x: 240, y: 180 }, 20: { x: 30, y: 40 } }, tables: [
        { kind: "rect", id: 10, label: "Top", seatsPerSide: 3, leftEnd: true, rightEnd: false },
        { kind: "circular", id: 20, label: "Family", seats: 5 }
      ] }
    };
    expect(parsePlannerBackupJson(JSON.stringify(createPlannerBackup(data)))).toEqual(data);
  });

  it("loads older exports without saved layouts, venue configuration, or pair strength", () => {
    expect(parseWith({ constraints: [pair] })).toEqual({
      guestText: minimalBackup.guestText, constraints: [pair], activePlan: null,
      savedLayouts: [], venueConfig: undefined
    });
  });

  it("supplies defaults for older saved layouts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));
    expect(parseWith({ savedLayouts: [{ id: "saved", name: "Old plan", plan }] }).savedLayouts).toEqual([
      { id: "saved", name: "Old plan", plan, scoreTotal: 0, savedAt: "2026-01-02T00:00:00.000Z" }
    ]);
  });

  it("rejects malformed JSON", () => {
    expect(() => parsePlannerBackupJson("{")).toThrow("not valid JSON");
  });

  it.each([null, [], 3, { version: 2 }])("rejects unsupported export structures (%j)", (value) => {
    expect(() => parsePlannerBackupJson(JSON.stringify(value))).toThrow("not a supported table planner export");
  });

  it.each([
    { fields: { guestText: null }, message: "missing a guest list" },
    { fields: { constraints: {} }, message: "missing constraints" }
  ])("rejects an export $message", ({ fields, message }) => {
    expect(() => parseWith(fields)).toThrow(message);
  });

  it.each([
    null, { ...pair, id: 1 }, { ...pair, type: null }, { ...pair, type: "unknown" },
    { ...pair, guestAId: null }, { ...pair, guestBId: 5 },
    { id: "head", type: "prefer_head", guestId: null }
  ])("rejects malformed constraints (%j)", (constraint) => {
    expect(() => parseWith({ constraints: [constraint] })).toThrow("invalid constraint");
  });

  it.each(["invalid", null, 1])("ignores unsupported preference strengths (%j)", (strength) => {
    expect(parseWith({ constraints: [{ ...pair, strength }] }).constraints).toEqual([pair]);
  });

  it("ignores strength on avoidance constraints", () => {
    const avoided = { ...pair, type: "avoid_adjacent" };
    expect(parseWith({ constraints: [{ ...avoided, strength: "high" }] }).constraints).toEqual([avoided]);
  });

  it.each([
    undefined, [], { ...plan, id: 1 }, { ...plan, assignments: [] },
    { ...plan, assignments: { 1: false } }, { ...plan, holdingGuestIds: null },
    { ...plan, holdingGuestIds: ["sam", 3] }
  ])("rejects malformed active plans (%j)", (activePlan) => {
    expect(() => parseWith({ activePlan })).toThrow("invalid seating plan");
  });

  it.each([null, { id: 1, name: "Saved", plan }, { id: "saved", name: null, plan }])(
    "rejects malformed saved layouts (%j)", (saved) => {
      expect(() => parseWith({ savedLayouts: [saved] })).toThrow("invalid saved layout");
    }
  );

  it("validates the plan inside each saved layout", () => {
    expect(() => parseWith({ savedLayouts: [{ id: "saved", name: "Saved", plan: null }] }))
      .toThrow("invalid seating plan");
  });

  it.each([
    null, {}, { tables: null }, { tables: [null] }, { tables: [{ kind: "rect", id: "a", seatsPerSide: 2 }] },
    { tables: [{ kind: "rect", id: 1 }] }, { tables: [{ kind: "circular", id: 1, seats: "4" }] },
    { tables: [{ kind: "unknown", id: 1 }] }
  ])("falls back from malformed venue configuration without losing the plan (%j)", (venueConfig) => {
    const parsed = parseWith({ venueConfig, activePlan: plan });
    expect(parsed.venueConfig).toBeUndefined();
    expect(parsed.activePlan).toEqual(plan);
  });

  it("supports table configurations without optional labels or end flags", () => {
    expect(parseWith({ venueConfig: { tables: [
      { kind: "rect", id: 1, seatsPerSide: 2 }, { kind: "circular", id: 2, seats: 4 }
    ] } }).venueConfig).toEqual({ tables: [
      { kind: "rect", id: 1, seatsPerSide: 2, leftEnd: false, rightEnd: false },
      { kind: "circular", id: 2, seats: 4 }
    ] });
  });

  it("creates a versioned backup that includes pairings", () => {
    const backup = createPlannerBackup(
      {
        guestText: "Jane, F\nSam, M",
        constraints: [pair],
        activePlan: null
      },
      "2026-05-27T12:00:00.000Z"
    );

    expect(backup).toEqual({
      version: 1,
      exportedAt: "2026-05-27T12:00:00.000Z",
      guestText: "Jane, F\nSam, M",
      constraints: [pair],
      activePlan: null
    });
  });

  it("parses a valid backup", () => {
    const headConstraint: Constraint = {
      id: "head-1",
      type: "prefer_head",
      guestId: "guest-1-jane"
    };
    const parsed = parsePlannerBackupJson(
      JSON.stringify({
        version: 1,
        exportedAt: "2026-05-27T12:00:00.000Z",
        guestText: "Jane, F\nSam, M",
        constraints: [pair, headConstraint],
        activePlan: {
          id: "plan-1",
          assignments: { 11: "guest-1-jane", 12: "guest-2-sam" },
          holdingGuestIds: []
        }
      })
    );

    expect(parsed.constraints).toEqual([pair, headConstraint]);
    expect(parsed.activePlan?.assignments[11]).toBe("guest-1-jane");
  });

  it("rejects unsupported files", () => {
    expect(() => parsePlannerBackupJson(JSON.stringify({ version: 99 }))).toThrow(
      "The data file is not a supported table planner export."
    );
  });
});

it("round-trips stable guest identities and explicit group-mixing settings", () => {
  const data: PlannerData = { guestText: "Jane Cooper\nSam Jones", guestIds: ["jane", "sam"], constraints: [], activePlan: null, savedLayouts: [], mixGroups: false };
  expect(parsePlannerBackupJson(JSON.stringify(createPlannerBackup(data)))).toMatchObject(data);
});

it.each([["same", "same"], ["one"], [1, 2]])("ignores invalid persisted guest identities: %j", (...guestIds) => {
  const parsed = parsePlannerBackupJson(JSON.stringify({ version: 1, guestText: "Jane\nSam", guestIds, constraints: [], activePlan: null }));
  expect(parsed.guestIds).toBeUndefined();
});

it("round-trips seating intent and priority independently, including legacy fields", () => {
  for (const preference of ["next_to", "chat", "same_table"] as const) {
    for (const priority of ["normal", "high"] as const) {
      const constraints = [{ ...pair, preference, priority, strength: "high" as const }];
      const data = { guestText: "Jane\nSam", constraints, activePlan: null };
      expect(parsePlannerBackupJson(JSON.stringify(createPlannerBackup(data))).constraints).toEqual(constraints);
    }
  }
});

it("ignores invalid intent and priority fields and excludes them from avoidance pairs", () => {
  const data = { version: 1, guestText: "Jane\nSam", activePlan: null };
  expect(parsePlannerBackupJson(JSON.stringify({ ...data, constraints: [{ ...pair, preference: "bad", priority: "urgent" }] })).constraints).toEqual([pair]);
  const avoided = { ...pair, type: "avoid_adjacent" };
  expect(parsePlannerBackupJson(JSON.stringify({ ...data, constraints: [{ ...avoided, preference: "chat", priority: "high" }] })).constraints).toEqual([avoided]);
});
