import { reconcileGuestText, formatGuestLine, parseGuestText } from "./parser";
import { reconcileColumns, reconcileImportedColumns } from "./guestColumns";
import type { SpreadsheetImportResult } from "./spreadsheet";
import type { Guest, GuestColumn } from "./types";

export interface GuestGridData {
  guests: Guest[];
  columns: GuestColumn[];
}

// File imports and pasted tables enter the same draft. Reuse existing identities
// and column mappings instead of rebuilding guests from their row positions.
export function importedGuestGrid(result: SpreadsheetImportResult, previous: GuestGridData): GuestGridData {
  const guests = reconcileGuestText(result.guestText, previous.guests, false).guests;
  if (!result.columns.length) {
    const legacy = previous.columns.find(column => column.legacyGroups);
    const retained = guests.map(guest => ({ ...guest, groups: legacy?.values[guest.id] ?? [] }));
    return { guests: retained, columns: reconcileColumns(previous.columns, retained) };
  }
  const sourceIds = parseGuestText(result.guestText).guests.map(guest => guest.id);
  const columns = reconcileImportedColumns(result.columns, sourceIds, guests, previous.columns);
  return { guests, columns };
}

export function guestGridText({ guests, columns }: GuestGridData): string {
  const legacy = columns.find(column => column.legacyGroups);
  return guests.map(guest => formatGuestLine(guest.name.trim(), legacy?.values[guest.id] ?? [])).join("\n");
}

export function cleanGuestGrid(data: GuestGridData): GuestGridData {
  const guests = data.guests.filter(guest => guest.name.trim()).map(guest => ({ ...guest, name: guest.name.trim() }));
  return { guests, columns: data.columns.map(column => ({ ...column, label: column.label.trim(),
    values: Object.fromEntries(guests.map(guest => [guest.id, (column.values[guest.id] ?? []).map(value => value.trim()).filter(Boolean)])) })) };
}
