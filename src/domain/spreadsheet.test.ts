import { describe, expect, it } from "vitest";
import { rowsToGuestText } from "./spreadsheet";

describe("rowsToGuestText", () => {
  it("imports name and group columns from a header row", () => {
    const result = rowsToGuestText([
      ["Name", "Group"],
      ["Jane Smith", "Bride"],
      ["Sam Jones", "Groom"]
    ]);

    expect(result).toEqual({
      guestText: "Jane Smith, Bride\nSam Jones, Groom",
      importedCount: 2,
      warnings: []
    });
  });

  it("accepts legacy 'Gender' and 'Sex' column headers for backward compatibility", () => {
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
      ["Alex", "Lee", "Bride"]
    ]);

    expect(result.guestText).toBe("Alex Lee, Bride");
    expect(result.importedCount).toBe(1);
  });

  it("uses the first two columns when there is no header row", () => {
    const result = rowsToGuestText([
      ["Jane Smith", "Bride"],
      ["Sam Jones", "Groom"]
    ]);

    expect(result.guestText).toBe("Jane Smith, Bride\nSam Jones, Groom");
    expect(result.warnings).toEqual(["No header row found. Used column A for names and column B for groups."]);
  });

  it("skips non-empty rows without a name", () => {
    const result = rowsToGuestText([
      ["Name", "Group", "Notes"],
      ["", "Bride", "Needs review"],
      ["Sam Jones", "Groom", ""]
    ]);

    expect(result.guestText).toBe("Sam Jones, Groom");
    expect(result.warnings).toEqual(["Skipped row 2 because it has no name."]);
  });
});
