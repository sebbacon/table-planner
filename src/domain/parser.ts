import type { Gender, Guest } from "./types";

export interface GuestParseResult {
  guests: Guest[];
  warnings: string[];
}

const GENDER_ALIASES: Record<string, Gender> = {
  m: "M",
  male: "M",
  f: "F",
  female: "F",
  o: "Other",
  other: "Other",
  nonbinary: "Other",
  "non-binary": "Other",
  nb: "Other"
};

export function parseGuestText(input: string): GuestParseResult {
  const warnings: string[] = [];
  const seenNames = new Map<string, number>();
  const guests = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const { name, gender } = parseGuestLine(line);
      const normalizedName = name.toLocaleLowerCase();
      const seenCount = seenNames.get(normalizedName) ?? 0;
      seenNames.set(normalizedName, seenCount + 1);

      if (seenCount > 0) {
        warnings.push(`Duplicate guest name: ${name}`);
      }

      return {
        id: `guest-${index + 1}-${slugify(name)}`,
        name,
        gender
      };
    });

  return { guests, warnings };
}

function parseGuestLine(line: string): { name: string; gender: Gender } {
  const parts = line
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const maybeGender = parts.length > 1 ? parts[parts.length - 1].toLocaleLowerCase() : "";
  const gender = GENDER_ALIASES[maybeGender];

  if (gender) {
    return {
      name: parts.slice(0, -1).join(", ").trim() || line,
      gender
    };
  }

  return {
    name: line,
    gender: "Unknown"
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
