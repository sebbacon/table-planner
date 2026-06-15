import { describe, expect, it } from "vitest";
import { parseGuestText } from "./parser";

describe("parseGuestText", () => {
  it("parses one guest per line with optional group labels", () => {
    const result = parseGuestText("Jane Smith, Bride\nSam Jones, Groom\nAlex Lee, Bride, Younger\nPat Morgan");

    expect(result.guests.map((guest) => [guest.name, guest.groups])).toEqual([
      ["Jane Smith", ["Bride"]],
      ["Sam Jones", ["Groom"]],
      ["Alex Lee", ["Bride", "Younger"]],
      ["Pat Morgan", []]
    ]);
  });

  it("warns about duplicate names", () => {
    const result = parseGuestText("Jane\nJane");

    expect(result.warnings).toEqual(["Duplicate guest name: Jane"]);
  });
});
