import type { Guest, GuestColumn, Plan, SeatPins, SeatingLayout } from "./types";

export const COLUMN_MODE_LABELS = {
  ignore: "Don’t use for seating",
  spread: "Spread across tables",
  cluster: "Group at the same table",
  neighbours: "Mix neighbouring seats",
  table: "Table assignment"
} as const;

export const COLUMN_MODE_HELP = {
  ignore: "Keep this information without affecting seating.",
  spread: "Aim for a similar mix at each table, allowing for table sizes and the number of guests in each group.",
  cluster: "Prefer guests with the same value to share a table. This takes priority over spreading and neighbour mixing, after individual seating preferences. Larger groups may need several tables.",
  neighbours: "Discourage guests with the same value from sitting beside each other.",
  table: "Use chosen tables when generating. Pins take priority, and manual moves can override these choices. Blank cells leave guests free to sit anywhere."
} as const;

export function legacyGroupColumn(guests: Guest[], enabled: boolean): GuestColumn[] {
  if (!guests.some(guest => guest.groups.length)) return [];
  return [{ id: "legacy-groups", label: "Groups", mode: enabled ? "neighbours" : "ignore", legacyGroups: true,
    values: Object.fromEntries(guests.map(guest => [guest.id, guest.groups])), tableMapping: {} }];
}

export function guestColumnValues(column: GuestColumn, guestId: string): string[] {
  const values = Object.hasOwn(column.values, guestId) ? column.values[guestId] : [];
  return values;
}

export function reconcileColumns(columns: GuestColumn[], guests: Guest[]): GuestColumn[] {
  return columns.map(column => ({ ...column, values: Object.fromEntries(guests.map(guest => [guest.id,
    column.legacyGroups ? guest.groups : guestColumnValues(column, guest.id)
  ])) }));
}

export function reconcileImportedColumns(incoming: GuestColumn[], sourceIds: string[], guests: Guest[], previous: GuestColumn[]): GuestColumn[] {
  const available = [...previous];
  const used = new Set(previous.map(column => column.id));
  return incoming.map(column => {
    const index = available.findIndex(old => old.label === column.label);
    const old = index >= 0 ? available.splice(index, 1)[0] : undefined;
    const id = old?.id ?? (used.has(column.id) ? `column-${crypto.randomUUID()}` : column.id);
    used.add(id);
    return { ...column, id, tableMapping: old?.tableMapping ?? {},
      values: Object.fromEntries(guests.map((guest, row) => [guest.id, column.values[sourceIds[row]] ?? []])) };
  });
}

export function columnValues(column: GuestColumn, guests: Guest[]): string[] {
  return [...new Set(guests.flatMap(guest => guestColumnValues(column, guest.id)))].sort((a, b) => a.localeCompare(b));
}

export function organiseLegacyLabels(columns: GuestColumn[], guests: Guest[], sourceId: string, headings: Record<string, string>): GuestColumn[] {
  const source = columns.find(column => column.id === sourceId && column.legacyGroups);
  if (!source) return columns;
  const targets = new Map<string, GuestColumn>();
  const moves = new Map<string, string>();
  for (const value of columnValues(source, guests)) {
    const heading = (Object.hasOwn(headings, value) ? headings[value] : "").trim();
    if (!heading) continue;
    const key = heading.toLocaleLowerCase();
    const existing = columns.find(column => column.label.trim().toLocaleLowerCase() === key);
    if (key === "name" || existing?.legacyGroups) throw new Error("Choose a heading other than Name or your combined Groups column.");
    let target = targets.get(key);
    if (!target) {
      target = existing ? { ...existing, values: { ...existing.values }, tableMapping: { ...existing.tableMapping } }
        : { id: `column-${crypto.randomUUID()}`, label: heading, mode: "ignore", values: {}, tableMapping: {} };
      targets.set(key, target);
    }
    moves.set(value, target.id);
    for (const guest of guests) {
      if (!guestColumnValues(source, guest.id).includes(value)) continue;
      target.values = { ...target.values, [guest.id]: [...new Set([...guestColumnValues(target, guest.id), value])] };
    }
    if (Object.hasOwn(source.tableMapping, value) && !Object.hasOwn(target.tableMapping, value)) target.tableMapping = { ...target.tableMapping, [value]: source.tableMapping[value] };
  }
  if (!moves.size) throw new Error("Enter a column heading beside at least one label.");
  const remaining = { ...source, values: Object.fromEntries(guests.map(guest => [guest.id, guestColumnValues(source, guest.id).filter(value => !moves.has(value))])) };
  const changed = new Map([...targets.values()].map(column => [column.id, column]));
  const next = columns.flatMap(column => column.id === sourceId ? columnValues(remaining, guests).length ? [remaining] : [] : [changed.get(column.id) ?? column]);
  return [...next, ...[...targets.values()].filter(target => !columns.some(column => column.id === target.id))];
}

export function resolveTableAssignments(columns: GuestColumn[], guests: Guest[], layout: SeatingLayout, seatPins: SeatPins = {}) {
  const assignments = new Map<string, number>();
  const issues = new Set<string>();
  const missingMappingIssues = new Set<string>();
  for (const column of columns.filter(column => column.mode === "table")) {
    for (const guest of guests) {
      if (Object.hasOwn(seatPins, guest.id)) continue;
      for (const value of guestColumnValues(column, guest.id)) {
        const tableId = column.tableMapping[value];
        if (tableId == null || !layout.tableConfigs.has(tableId)) {
          const issue = `${column.label}: choose a table for “${value}”.`;
          issues.add(issue);
          missingMappingIssues.add(issue);
          continue;
        }
        const previous = assignments.get(guest.id);
        if (previous !== undefined && previous !== tableId) issues.add(`${guest.name} is assigned to different tables. Choose one table.`);
        assignments.set(guest.id, tableId);
      }
    }
  }
  const pinnedSeats = new Set<number>();
  const guestsById = new Map(guests.map(guest => [guest.id, guest]));
  for (const [guestId, seatId] of Object.entries(seatPins)) {
    const guest = guestsById.get(guestId);
    const seat = layout.seatsById.get(seatId);
    if (!guest || !seat) {
      issues.add(`${guest?.name ?? "A pinned guest"} has a pin for an unavailable guest or seat. Unpin it before generating.`);
      continue;
    }
    if (pinnedSeats.has(seatId)) issues.add(`Seat ${seatId} has more than one pinned guest. Unpin one before generating.`);
    pinnedSeats.add(seatId);
    assignments.set(guestId, seat.tableId);
  }
  for (const tableId of layout.tableIds) {
    const count = [...assignments.values()].filter(id => id === tableId).length;
    const capacity = layout.seats.filter(seat => seat.tableId === tableId).length;
    if (count > capacity) issues.add(`${layout.tableConfigs.get(tableId)?.label || `Table ${tableId}`} has ${count} fixed guests but only ${capacity} seats.`);
  }
  return { assignments, issues: [...issues], missingMappingIssues: [...missingMappingIssues] };
}

export function tableAssignmentViolations(plan: Plan, assignments: Map<string, number>, guests: Guest[], layout: SeatingLayout): string[] {
  const tables = new Map(Object.entries(plan.assignments).flatMap(([seatId, guestId]) => {
    const tableId = layout.seatsById.get(Number(seatId))?.tableId;
    return guestId && tableId !== undefined ? [[guestId, tableId] as const] : [];
  }));
  return guests.flatMap(guest => {
    const required = assignments.get(guest.id);
    return required !== undefined && tables.get(guest.id) !== required
      ? [`${guest.name} must sit at ${layout.tableConfigs.get(required)?.label || `Table ${required}`}.`] : [];
  });
}


export function seatPinViolations(plan: Plan, seatPins: SeatPins, guests: Guest[]): string[] {
  const guestsById = new Map(guests.map(guest => [guest.id, guest]));
  return Object.entries(seatPins).flatMap(([guestId, seatId]) => plan.assignments[seatId] === guestId ? []
    : [`Unpin ${guestsById.get(guestId)?.name ?? "this guest"} from seat ${seatId} before moving them or loading this plan.`]);
}
