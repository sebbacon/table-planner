import { describe, expect, it } from "vitest";
import { createPlannerBackup, parsePlannerBackupJson } from "./backup";
import type { ConstraintPair } from "./types";

const pair: ConstraintPair = {
  id: "pair-1",
  type: "prefer_adjacent",
  guestAId: "guest-1-jane",
  guestBId: "guest-2-sam"
};

describe("planner backup", () => {
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
    const parsed = parsePlannerBackupJson(
      JSON.stringify({
        version: 1,
        exportedAt: "2026-05-27T12:00:00.000Z",
        guestText: "Jane, F\nSam, M",
        constraints: [pair],
        activePlan: {
          id: "plan-1",
          assignments: { 11: "guest-1-jane", 12: "guest-2-sam" },
          holdingGuestIds: []
        }
      })
    );

    expect(parsed.constraints).toEqual([pair]);
    expect(parsed.activePlan?.assignments[11]).toBe("guest-1-jane");
  });

  it("rejects unsupported files", () => {
    expect(() => parsePlannerBackupJson(JSON.stringify({ version: 99 }))).toThrow(
      "The data file is not a supported table planner export."
    );
  });
});
