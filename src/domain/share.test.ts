// @vitest-environment node
import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { createShareUrl, readShareHash } from "./share";
import type { PlannerData } from "./backup";

const data: PlannerData = {
  guestText: "Zoë 李\nSam", guestIds: ["zoe", "sam"], mixGroups: false,
  constraints: [{ id: "pair", type: "prefer_adjacent", guestAId: "zoe", guestBId: "sam", preference: "chat", priority: "high" }],
  activePlan: { id: "plan", assignments: { 1: "zoe", 2: "sam", 3: null }, holdingGuestIds: [] },
  seatPins: { zoe: 1 },
  venueConfig: { nextTableId: 5, tables: [{ id: 4, kind: "circular", seats: 3, label: "Friends" }], positions: { 4: { x: 100, y: 200 } } },
  columns: [{ id: "family", label: "Family", mode: "table", values: { zoe: ["A"], sam: ["A"] }, tableMapping: { A: 4 } }],
  savedLayouts: [{ id: "saved", name: "Private alternative", savedAt: "2026-11-27", scoreTotal: 10, plan: { id: "old", assignments: {}, holdingGuestIds: ["zoe", "sam"] } }]
};
const hashFor = (value: unknown) => `#plan=v1.${deflateSync(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url")}`;

describe("share links", () => {
  it("round-trips Unicode, identities, assignments, pins, columns, preferences and room positions without saved versions", async () => {
    const url = new URL(await createShareUrl(data, "https://example.org/table-planner/?view=1#old"));
    expect(url.pathname + url.search).toBe("/table-planner/?view=1");
    expect(url.hash).toMatch(/^#plan=v1\.[A-Za-z0-9_-]+$/);
    expect(await readShareHash(url.hash)).toEqual({ ...data, savedLayouts: [] });
    expect(data.savedLayouts).toHaveLength(1);
  });
  it("supports a setup with no seating plan yet", async () => {
    const url = new URL(await createShareUrl({ guestText: "Sam", constraints: [], activePlan: null }, "https://example.org/"));
    expect(await readShareHash(url.hash)).toMatchObject({ guestText: "Sam", activePlan: null });
  });
  it("ignores unrelated fragments", async () => {
    expect(await readShareHash("")).toBeNull();
    expect(await readShareHash("#help")).toBeNull();
  });
  it.each(["#plan=v9.abc", "#plan=v1.", "#plan=v1.a!", "#plan=v1.abc", `#plan=v1.${"a".repeat(100001)}`, hashFor("not json"), hashFor({ version: 2 }), hashFor({ ...data, seatPins: { zoe: -1 } }), hashFor("a".repeat(1000001))])("rejects unsupported, damaged, oversized or invalid data (%#)", async hash => {
    await expect(readShareHash(hash)).rejects.toThrow(/share link/i);
  });
  it("rejects oversized exports with a backup fallback", async () => {
    await expect(createShareUrl({ ...data, guestText: "a".repeat(1000001) }, "https://example.org/")).rejects.toThrow(/backup/);
  });
  it.each([1e100, -1, 2.5, 5001])("rejects table geometry that would expand into invalid or excessive seats (%s)", async seats => {
    const invalid = { ...data, venueConfig: { tables: [{ id: 1, kind: "circular" as const, seats }] } };
    await expect(createShareUrl(invalid, "https://example.org/")).rejects.toThrow(/backup/);
    await expect(readShareHash(hashFor({ ...invalid, version: 2 }))).rejects.toThrow(/share link/);
  });
});
