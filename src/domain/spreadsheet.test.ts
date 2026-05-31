import { describe, expect, it } from "vitest";
import { rowsToGuestText } from "./spreadsheet";

describe("rowsToGuestText", () => {
  it("imports name and gender columns from a header row", () => {
    const result = rowsToGuestText([
      ["Name", "Gender"],
      ["Jane Smith", "F"],
      ["Sam Jones", "M"]
    ]);

    expect(result).toEqual({
      guestText: "Jane Smith, F\nSam Jones, M",
      importedCount: 2,
      warnings: []
    });
  });

  it("combines first and last name columns when there is no full-name column", () => {
    const result = rowsToGuestText([
      ["First Name", "Last Name", "Sex"],
      ["Alex", "Lee", "Other"]
    ]);

    expect(result.guestText).toBe("Alex Lee, Other");
    expect(result.importedCount).toBe(1);
  });

  it("uses the first two columns when there is no header row", () => {
    const result = rowsToGuestText([
      ["Jane Smith", "Female"],
      ["Sam Jones", "Male"]
    ]);

    expect(result.guestText).toBe("Jane Smith, Female\nSam Jones, Male");
    expect(result.warnings).toEqual(["No header row found. Used column A for names and column B for genders."]);
  });

  it("skips non-empty rows without a name", () => {
    const result = rowsToGuestText([
      ["Name", "Gender", "Notes"],
      ["", "F", "Needs review"],
      ["Sam Jones", "M", ""]
    ]);

    expect(result.guestText).toBe("Sam Jones, M");
    expect(result.warnings).toEqual(["Skipped row 2 because it has no name."]);
  });
});
