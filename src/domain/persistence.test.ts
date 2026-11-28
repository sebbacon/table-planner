// @vitest-environment node
import { readFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createPlannerBackup, parsePlannerBackupJson } from "./backup";
import { createPersistedPlannerData, parseLocalPlannerJson, parsePlannerDataJson, PLANNER_DATA_VERSION, UnsupportedPlannerVersionError } from "./persistence";
import { readShareHash, createShareUrl } from "./share";
import { buildSeatingLayout } from "./seating";
import { DEFAULT_VENUE_CONFIG } from "./venueConfig";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
const v1Json = fixture("planner-v1.json");
const v2Json = fixture("planner-v2.json");
const unversionedJson = fixture("session-unversioned.json");
const oldLink = fixture("share-v1.txt").trim();
const v1 = JSON.parse(v1Json);
const v2 = JSON.parse(v2Json);
const expectedV1 = {
  guestText: "Jane, Family, Younger\nSam, Friends",
  guestIds: ["guest-1-jane", "guest-2-sam"],
  constraints: v1.constraints,
  activePlan: v1.activePlan,
  savedLayouts: [],
  venueConfig: { tables: [
    { kind: "rect", id: 1, label: "Table 1", seatsPerSide: 9, leftEnd: false, rightEnd: true },
    { kind: "rect", id: 2, label: "Table 2", seatsPerSide: 9, leftEnd: true, rightEnd: true }
  ] },
  seatPins: {},
  mixGroups: true,
  columns: [{ id: "legacy-groups", label: "Groups", mode: "neighbours", legacyGroups: true,
    values: { "guest-1-jane": ["Family", "Younger"], "guest-2-sam": ["Friends"] }, tableMapping: {} }]
};
// Expected values come from committed historical documents, never today's writer.
const expectedV2 = { ...v2 };
delete expectedV2.version;
delete expectedV2.exportedAt;

describe("published data compatibility", () => {
  it("migrates the archived V1 backup and unversioned browser session identically", () => {
    expect(parsePlannerBackupJson(v1Json)).toEqual(expectedV1);
    expect(parseLocalPlannerJson(unversionedJson)).toEqual(expectedV1);
    expect(parseLocalPlannerJson(v1Json)).toEqual(expectedV1);
  });

  it("reads the archived V2 backup, local session and fixed V1-encoded link", async () => {
    expect(parsePlannerBackupJson(v2Json)).toEqual(expectedV2);
    expect(parseLocalPlannerJson(v2Json)).toEqual(expectedV2);
    expect(await readShareHash(oldLink)).toEqual({ ...expectedV2, savedLayouts: [] });
  });

  it("keeps historical geometry when the app's default venue changes", () => {
    const tables = DEFAULT_VENUE_CONFIG.tables;
    try {
      DEFAULT_VENUE_CONFIG.tables = [{ id: 99, kind: "circular", seats: 4 }];
      const legacy = parsePlannerDataJson(v1Json);
      expect(legacy.venueConfig).toEqual(expectedV1.venueConfig);
      const layout = buildSeatingLayout(legacy.venueConfig);
      expect(layout.seats).toHaveLength(39);
      expect(layout.seatsById.get(39)?.tableId).toBe(2);
      expect(legacy.activePlan?.assignments[39]).toBe("guest-1-jane");
    } finally {
      DEFAULT_VENUE_CONFIG.tables = tables;
    }
  });

  it("preserves stable table ids, room positions, seat numbering, pins and saved versions", () => {
    const data = parsePlannerDataJson(v2Json);
    const layout = buildSeatingLayout(data.venueConfig);
    expect(layout.seatsById.get(3)).toEqual({ id: 3, tableId: 0, side: "left-end", position: -1 });
    expect(layout.seatsById.get(4)).toEqual({ id: 4, tableId: 4, side: "circular", position: 0 });
    expect(data.seatPins).toEqual({ zoe: 1, sam: 4 });
    expect(data.venueConfig.nextTableId).toBe(8);
    expect(data.savedLayouts[0].plan.assignments[5]).toBe("sam");
  });

  it("migrates legacy group labels using stable guest identities and explicit mixing settings", () => {
    const data = parsePlannerDataJson(JSON.stringify({ ...v1, guestIds: ["jane", "sam"], mixGroups: false }));
    expect(data.columns).toEqual([{ id: "legacy-groups", label: "Groups", mode: "ignore", legacyGroups: true,
      values: { jane: ["Family", "Younger"], sam: ["Friends"] }, tableMapping: {} }]);
  });

  it("uses one current data format for backups, browser sessions and link contents", async () => {
    const data = parsePlannerDataJson(v2Json);
    const stored = createPersistedPlannerData(data);
    expect(stored).toEqual({ ...expectedV2, version: PLANNER_DATA_VERSION });
    expect(createPlannerBackup(data, "fixed timestamp")).toEqual({ ...stored, exportedAt: "fixed timestamp" });
    const url = new URL(await createShareUrl(data, "https://example.org/table-planner/"));
    const compressed = Buffer.from(url.hash.slice("#plan=v1.".length), "base64url");
    const linkData = JSON.parse(inflateSync(compressed).toString("utf8"));
    expect(linkData).toEqual({ ...stored, savedLayouts: [] });
    expect(parseLocalPlannerJson(JSON.stringify(stored))).toEqual(data);
    expect(JSON.stringify(linkData)).not.toContain("Earlier version");
  });

  it("projects working data onto published fields, including nested objects", () => {
    const data = parsePlannerDataJson(v2Json);
    const extended = {
      ...data, runtimeOnly: "not persisted",
      activePlan: { ...data.activePlan!, runtimeOnly: true },
      constraints: data.constraints.map(pair => ({ ...pair, runtimeOnly: true })),
      columns: data.columns.map(column => ({ ...column, runtimeOnly: true })),
      venueConfig: { ...data.venueConfig, runtimeOnly: true,
        tables: data.venueConfig.tables.map(table => ({ ...table, runtimeOnly: true })),
        positions: { 0: { x: 100, y: 200, runtimeOnly: true }, 4: { x: 300, y: 40 } } }
    };
    const stored = createPersistedPlannerData(extended);
    expect(JSON.stringify(stored)).not.toContain("runtimeOnly");
    expect(parsePlannerDataJson(JSON.stringify(stored))).toEqual(expectedV2);
    expect(extended).toHaveProperty("runtimeOnly");
  });

  it("permits missing versions only in legacy browser sessions", () => {
    expect(() => parsePlannerDataJson(unversionedJson)).toThrow(UnsupportedPlannerVersionError);
    expect(parseLocalPlannerJson(unversionedJson)).toEqual(expectedV1);
  });

  it.each([0, 3, 999, null, "2"])("rejects unknown data versions without downgrading local sessions (%s)", version => {
    const json = JSON.stringify({ ...v2, version });
    expect(() => parsePlannerBackupJson(json)).toThrow(UnsupportedPlannerVersionError);
    expect(() => parseLocalPlannerJson(json)).toThrow(UnsupportedPlannerVersionError);
  });

  it("distinguishes a future data schema from a damaged link or an unknown encoding", async () => {
    const encoded = deflateSync(JSON.stringify({ ...v2, version: 999 })).toString("base64url");
    await expect(readShareHash(`#plan=v1.${encoded}`)).rejects.toThrow("unsupported data version");
    await expect(readShareHash(oldLink.replace("v1.", "v99."))).rejects.toThrow("unsupported version");
    await expect(readShareHash("#plan=v1.damaged")).rejects.toThrow("incomplete or damaged");
  });
});
