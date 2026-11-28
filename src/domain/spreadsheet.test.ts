import { describe, expect, it } from "vitest";
import { defaultSpreadsheetOptions, rowsToGuestText, spreadsheetFileToGuestText } from "./spreadsheet";
import { parseGuestText } from "./parser";

describe("spreadsheet import", () => {
  it("retains every attribute column, with all rules off by default", () => {
    const result = rowsToGuestText([
      ["Name", "Department", "Household", "Gender", "Table"],
      ["Jane Smith", "Engineering", "Smith", "F", "VIP"],
      ["Sam Jones", "Sales", "Jones", "M", ""]
    ]);
    expect(result.guestText).toBe("Jane Smith\nSam Jones");
    expect(result.columns.map(column => [column.label, column.mode])).toEqual([
      ["Department", "ignore"], ["Household", "ignore"], ["Gender", "ignore"], ["Table", "ignore"]
    ]);
    expect(result.columns[0].values).toEqual({ "guest-1-jane-smith": ["Engineering"], "guest-2-sam-jones": ["Sales"] });
    expect(result.columns[3].values["guest-2-sam-jones"]).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("combines first and last names without turning either into an attribute", () => {
    const result = rowsToGuestText([["First Name", "Last Name", "Sex"], ["Alex", "Lee", "F"]]);
    expect(result.guestText).toBe("Alex Lee");
    expect(result.columns.map(column => column.label)).toEqual(["Sex"]);
  });

  it("allows manual header and name selection and skipping irrelevant columns", () => {
    const rows = [["Team", "Attendee label", "Private notes"], ["Blue", "Jane", "Skip me"]];
    const result = rowsToGuestText(rows, { hasHeader: true, nameColumns: [1], includedColumns: [0] });
    expect(result.guestText).toBe("Jane");
    expect(result.columns.map(column => column.label)).toEqual(["Team"]);
    expect(JSON.stringify(result)).not.toContain("Skip me");
  });

  it("supports headerless files and keeps the first guest", () => {
    const rows = [["Jane Smith", "Bride"], ["Sam Jones", "Groom"]];
    expect(defaultSpreadsheetOptions(rows)).toEqual({ hasHeader: false, nameColumns: [0] });
    const result = rowsToGuestText(rows);
    expect(result.guestText).toBe("Jane Smith\nSam Jones");
    expect(result.columns[0].label).toBe("Column 2");
    expect(result.warnings[0]).toContain("No header row selected");
  });

  it("distinguishes duplicate and blank headers and aligns values after skipping nameless rows", () => {
    const result = rowsToGuestText([["Name", "Group", "Group", null], ["", "discard", "discard", "discard"], ["Sam", "A", "B", 0]]);
    expect(result.columns.map(column => column.label)).toEqual(["Group (column 2)", "Group (column 3)", "Column 4"]);
    expect(result.columns.map(column => Object.values(column.values))).toEqual([[["A"]], [["B"]], [["0"]]]);
    expect(result.warnings).toEqual(["Skipped row 2 because it has no name."]);
  });

  it("preserves quoted commas and quotes in guest names and attribute values", async () => {
    const result = await spreadsheetFileToGuestText(new File(['Name,Department\n"Doe, Jane","Arts, crafts"\n"Sam ""Sunny"" Jones",Music'], "guests.csv"));
    expect(parseGuestText(result.guestText).guests.map(guest => guest.name)).toEqual(["Doe, Jane", 'Sam "Sunny" Jones']);
    expect(Object.values(result.columns[0].values)).toEqual([["Arts, crafts"], ["Music"]]);
  });

  it("supports TSV and reports empty files and unsupported file types", async () => {
    const result = await spreadsheetFileToGuestText(new File(["Name\tGroup\nJane\tFamily"], "guests.tsv"));
    expect(result.guestText).toBe("Jane");
    expect(Object.values(result.columns[0].values)).toEqual([["Family"]]);
    expect(rowsToGuestText([])).toMatchObject({ importedCount: 0, columns: [], warnings: ["The spreadsheet did not contain any guest rows."] });
    await expect(spreadsheetFileToGuestText(new File([""], "guests.pdf"))).rejects.toThrow("Upload a .xlsx");
  });
});
