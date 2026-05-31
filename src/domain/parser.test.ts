import { describe, expect, it } from "vitest";
import { parseGuestText } from "./parser";

describe("parseGuestText", () => {
  it("parses one guest per line with optional gender labels", () => {
    const result = parseGuestText("Jane Smith, F\nSam Jones, male\nAlex Lee, Other\nPat Morgan");

    expect(result.guests.map((guest) => [guest.name, guest.gender])).toEqual([
      ["Jane Smith", "F"],
      ["Sam Jones", "M"],
      ["Alex Lee", "Other"],
      ["Pat Morgan", "Unknown"]
    ]);
  });

  it("warns about duplicate names", () => {
    const result = parseGuestText("Jane\nJane");

    expect(result.warnings).toEqual(["Duplicate guest name: Jane"]);
  });
});
