import type { Guest } from "./types";

export interface GuestParseResult {
  guests: Guest[];
  warnings: string[];
}

export function parseGuestText(input: string): GuestParseResult {
  const warnings: string[] = [];
  const seenNames = new Map<string, number>();
  const guests = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const { name, groups } = parseGuestLine(line);
      const normalizedName = name.toLocaleLowerCase();
      const seenCount = seenNames.get(normalizedName) ?? 0;
      seenNames.set(normalizedName, seenCount + 1);

      if (seenCount > 0) {
        warnings.push(`Duplicate guest name: ${name}`);
      }

      return {
        id: `guest-${index + 1}-${slugify(name)}`,
        name,
        groups
      };
    });

  return { guests, warnings };
}

function parseGuestLine(line: string): { name: string; groups: string[] } {
  const parts = line
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return { name: line.trim(), groups: [] };
  }

  return {
    name: parts[0],
    groups: parts.slice(1)
  };
}

function slugify(value: string): string {
  return (
    value
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "guest"
  );
}
