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

describe("stable guest identities", () => {
  it("keeps seats addressable after insertion, reordering, group edits, and a rename", async () => {
    const { reconcileGuestText } = await import("./parser");
    const original = parseGuestText("Jane Smith\nSam Jones\nPat Morgan").guests;
    const reordered = reconcileGuestText("Pat Morgan, Family\nJane Cooper\nSam Jones", original);
    expect(reordered.guests.map((guest) => guest.id)).toEqual([original[2].id, original[0].id, original[1].id]);
    const inserted = reconcileGuestText("Robin Green\nPat Morgan, Family\nJane Cooper\nSam Jones", reordered.guests);
    expect(inserted.guests.slice(1).map((guest) => guest.id)).toEqual(reordered.guests.map((guest) => guest.id));
    expect(new Set(inserted.guests.map((guest) => guest.id)).size).toBe(4);
  });

  it("does not reuse a renamed guest's ID for a newly inserted guest with the old name", async () => {
    const { reconcileGuestText } = await import("./parser");
    const original = parseGuestText("Jane\nSam").guests;
    const renamed = reconcileGuestText("Joan\nSam", original).guests;
    const inserted = reconcileGuestText("Jane\nJoan\nSam", renamed).guests;
    expect(inserted[1].id).toBe(original[0].id);
    expect(inserted[0].id).not.toBe(original[0].id);
  });

  it("restores persisted identities instead of regenerating them from names", () => {
    const restored = parseGuestText("Jane Cooper\nSam Jones", ["jane", "sam"]);
    expect(restored.guests.map((guest) => guest.id)).toEqual(["jane", "sam"]);
  });
});
