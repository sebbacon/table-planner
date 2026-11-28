import type { Guest } from "./types";

export interface GuestParseResult {
  guests: Guest[];
  warnings: string[];
}

export function parseGuestText(input: string, guestIds?: string[]): GuestParseResult {
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
        id: guestIds?.[index] ?? `guest-${index + 1}-${slugify(name)}`,
        name,
        groups
      };
    });

  return { guests, warnings };
}

// Match names before positions so inserting or reordering lines preserves identity.
// Unmatched names at the same position in a same-length list are renames.
export function reconcileGuestText(input: string, previous: Guest[]): GuestParseResult {
  const result = parseGuestText(input);
  const available = [...previous];
  const ids = result.guests.map((guest) => {
    const index = available.findIndex((old) => old.name.toLocaleLowerCase() === guest.name.toLocaleLowerCase());
    return index < 0 ? undefined : available.splice(index, 1)[0].id;
  });
  if (result.guests.length === previous.length) {
    if (available.length === 1) ids[ids.indexOf(undefined)] = available.pop()!.id;
    ids.forEach((id, index) => {
      if (id) return;
      const old = previous[index];
      const unmatched = available.findIndex((guest) => guest.id === old.id);
      if (unmatched >= 0) ids[index] = available.splice(unmatched, 1)[0].id;
    });
  }
  const reserved = new Set([...previous.map((guest) => guest.id), ...ids.filter(Boolean)]);
  result.guests = result.guests.map((guest, index) => {
    const id = ids[index] ?? (reserved.has(guest.id) ? `guest-${crypto.randomUUID()}` : guest.id);
    reserved.add(id);
    return { ...guest, id };
  });
  return result;
}

function parseGuestLine(line: string): { name: string; groups: string[] } {
  const parts: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"' && (quoted || !cell.trim())) {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (line[i] === "," && !quoted) { parts.push(cell.trim()); cell = ""; }
    else cell += line[i];
  }
  parts.push(cell.trim());
  if (parts.length <= 1) {
    return { name: parts[0] ?? "", groups: [] };
  }

  return {
    name: parts[0],
    groups: parts.slice(1).filter(Boolean)
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

export function formatGuestLine(name: string, groups: string[] = []): string {
  return [name, ...groups].map(value => /[,"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join(", ");
}
