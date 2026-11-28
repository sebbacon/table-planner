import { expect, it } from "vitest";
import { cleanGuestGrid, guestGridText, importedGuestGrid, type GuestGridData } from "./guestGrid";
import { parseDelimitedText, rowsToGuestText } from "./spreadsheet";
import { parseGuestText } from "./parser";
import { createPlannerBackup, parsePlannerBackupJson } from "./backup";

const previous: GuestGridData = {
  guests: [{ id: "jane", name: "Jane", groups: [] }, { id: "sam", name: "Sam", groups: [] }],
  columns: [{ id: "department", label: "Department", mode: "table", values: { jane: ["Arts"], sam: ["Music"] }, tableMapping: { Arts: 1, Music: 2 } }]
};

it("aligns imported values with stable identities after reordering and retains column mappings", () => {
  const result = rowsToGuestText(parseDelimitedText("Name,Department,Friend group\nSam,Music,School\nJane,Arts,University"));
  result.columns[0].mode = "table";
  result.columns[1].mode = "cluster";
  const data = importedGuestGrid(result, previous);
  expect(data.guests.map(guest => guest.id)).toEqual(["sam", "jane"]);
  expect(data.columns[0]).toEqual(previous.columns[0]);
  expect(data.columns[1]).toMatchObject({ label: "Friend group", mode: "cluster", values: { sam: ["School"], jane: ["University"] } });
});

it("creates new identities for new imported names even when the row count stays the same", () => {
  const data = importedGuestGrid(rowsToGuestText([["Name"], ["Alex"], ["Pat"]]), previous);
  expect(data.guests.every(guest => !["jane", "sam"].includes(guest.id))).toBe(true);
  expect(data.columns[0].values).toEqual(Object.fromEntries(data.guests.map(guest => [guest.id, []])));
});

it("retains memberships for a names-only paste, prunes removed guests and avoids column ID collisions", () => {
  const data = importedGuestGrid(rowsToGuestText([["Sam"]]), previous);
  expect(data.columns[0].values).toEqual({ sam: ["Music"] });
  const colliding = { ...previous, columns: [{ ...previous.columns[0], id: "column-2" }] };
  const imported = importedGuestGrid(rowsToGuestText([["Name", "Other", "Department"], ["Jane", "X", "Arts"]]), colliding);
  expect(new Set(imported.columns.map(column => column.id)).size).toBe(2);
  expect(imported.columns[1].id).toBe("column-2");
});

it("preserves older multiple labels and quoted names through grid edits and backups", () => {
  const data = cleanGuestGrid({
    guests: [{ id: "jane", name: ' Doe, "Jane" ', groups: [] }, { id: "blank", name: " ", groups: [] }],
    columns: [{ id: "old-groups", label: " Older groups ", legacyGroups: true, mode: "neighbours", values: { jane: [" Family ", "Younger", ""], blank: [] }, tableMapping: {} }]
  });
  const guestText = guestGridText(data);
  expect(parseGuestText(guestText).guests[0]).toMatchObject({ name: 'Doe, "Jane"', groups: ["Family", "Younger"] });
  const restored = parsePlannerBackupJson(JSON.stringify(createPlannerBackup({ guestText, guestIds: ["jane"], columns: data.columns, constraints: [], activePlan: null, seatPins: { jane: 1 } })));
  expect(restored.columns).toEqual(data.columns);
  expect(restored.seatPins).toEqual({ jane: 1 });
  const pasted = importedGuestGrid(rowsToGuestText([[data.guests[0].name]], { hasHeader: false, nameColumns: [0] }), data);
  expect(pasted.guests[0].groups).toEqual(["Family", "Younger"]);
  expect(pasted.columns[0].values).toEqual({ jane: ["Family", "Younger"] });
  expect(guestGridText({ ...data, columns: [] })).not.toContain("Family");
});
