import type {
  PersistedConstraintV2 as Constraint, PersistedPlanV2 as Plan,
  PersistedSavedLayoutV2 as SavedLayout, PersistedVenueV2 as VenueConfig,
  PersistedColumnV2 as GuestColumn, PersistedPlannerV2, PersistedTableV2
} from "./persistenceSchema";

type SeatAssignments = Plan["assignments"];
type SeatPins = NonNullable<PersistedPlannerV2["seatPins"]>;
type ColumnMode = GuestColumn["mode"];

// Keep this parser for published v2 payloads when introducing later schemas.
export function parsePlannerV2(parsed: Partial<Record<keyof PersistedPlannerV2, unknown>>): PersistedPlannerV2 {
  if (typeof parsed.guestText !== "string") throw new Error("The data file is missing a guest list.");
  if (!Array.isArray(parsed.constraints)) throw new Error("The data file is missing constraints.");
  return {
    version: 2,
    guestText: parsed.guestText,
    constraints: parsed.constraints.map(parseConstraint),
    activePlan: parsed.activePlan === null ? null : parsePlan(parsed.activePlan),
    savedLayouts: Array.isArray(parsed.savedLayouts) ? parsed.savedLayouts.map(parseSavedLayout) : [],
    venueConfig: parseVenueConfig(parsed.venueConfig) ?? legacyVenueV2(),
    guestIds: parseGuestIds(parsed.guestIds, parsed.guestText),
    ...(parsed.seatPins !== undefined ? { seatPins: parseSeatPins(parsed.seatPins) } : {}),
    ...(parsed.columns !== undefined ? { columns: parseGuestColumns(parsed.columns) } : {}),
    ...(typeof parsed.mixGroups === "boolean" ? { mixGroups: parsed.mixGroups } : {})
  };
}

function legacyVenueV2(): VenueConfig {
  // Freeze the original geometry: future changes to the app's default venue
  // must not reinterpret seating assignments in old files or links.
  return { tables: [
    { kind: "rect", id: 1, label: "Table 1", seatsPerSide: 9, leftEnd: false, rightEnd: true },
    { kind: "rect", id: 2, label: "Table 2", seatsPerSide: 9, leftEnd: true, rightEnd: true }
  ] };
}

function parseGuestIds(value: unknown, guestText: string): string[] | undefined {
  if (!Array.isArray(value) || !value.every(id => typeof id === "string")) return undefined;
  if (new Set(value).size !== value.length || value.length !== guestText.split(/\r?\n/).filter(line => line.trim()).length) return undefined;
  return value;
}

function parseConstraint(value: unknown): Constraint {
  if (!isRecord(value) || typeof value.id !== "string") throw new Error("The data file contains an invalid constraint.");
  const { id, type } = value;
  switch (type) {
    case "prefer_adjacent":
    case "avoid_adjacent":
      return parsePairConstraint(value, id, type);
    case "prefer_head":
    case "avoid_head":
      if (typeof value.guestId !== "string") throw new Error("The data file contains an invalid constraint.");
      return { id, type, guestId: value.guestId };
    default:
      throw new Error("The data file contains an invalid constraint.");
  }
}

function parsePairConstraint(value: Record<string, unknown>, id: string, type: "prefer_adjacent" | "avoid_adjacent"): Constraint {
  const { guestAId, guestBId } = value;
  if (typeof guestAId !== "string" || typeof guestBId !== "string") throw new Error("The data file contains an invalid constraint.");
  const pair = { id, type, guestAId, guestBId };
  if (type === "avoid_adjacent") return pair;
  return {
    ...pair,
    strength: optionalEnum(value.strength, ["high", "medium", "low"]),
    preference: optionalEnum(value.preference, ["next_to", "chat", "same_table"]),
    priority: optionalEnum(value.priority, ["normal", "high"])
  };
}

function optionalEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? value as T : undefined;
}

function parsePlan(value: unknown): Plan {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.assignments)) {
    throw new Error("The data file contains an invalid seating plan.");
  }

  if (!Array.isArray(value.holdingGuestIds) || value.holdingGuestIds.some((guestId) => typeof guestId !== "string")) {
    throw new Error("The data file contains an invalid seating plan.");
  }

  const assignments: SeatAssignments = {};

  for (const [seatId, guestId] of Object.entries(value.assignments)) {
    if (guestId !== null && typeof guestId !== "string") {
      throw new Error("The data file contains an invalid seating plan.");
    }

    assignments[Number(seatId)] = guestId;
  }

  return {
    id: value.id,
    assignments,
    holdingGuestIds: value.holdingGuestIds
  };
}

function parseSavedLayout(value: unknown): SavedLayout {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    throw new Error("The data file contains an invalid saved layout.");
  }

  return {
    id: value.id,
    name: value.name,
    savedAt: typeof value.savedAt === "string" ? value.savedAt : new Date().toISOString(),
    plan: parsePlan(value.plan),
    scoreTotal: typeof value.scoreTotal === "number" ? value.scoreTotal : 0
  };
}

function parseVenueConfig(value: unknown): VenueConfig | undefined {
  if (!isRecord(value) || !Array.isArray(value.tables)) return undefined;

  try {
    const tables = value.tables.map(parseTable);
    const positions = parsePositions(value.positions, tables);
    return { tables, ...(typeof value.nextTableId === "number" && Number.isSafeInteger(value.nextTableId) ? { nextTableId: value.nextTableId } : {}), ...(Object.keys(positions).length ? { positions } : {}) };
  } catch {
    return undefined;
  }
}

function parseTable(value: unknown): PersistedTableV2 {
  if (!isRecord(value) || typeof value.id !== "number") throw new Error();
  const common = { id: value.id, label: typeof value.label === "string" ? value.label : undefined };
  if (value.kind === "rect" && typeof value.seatsPerSide === "number") {
    return { ...common, kind: "rect", seatsPerSide: value.seatsPerSide, leftEnd: Boolean(value.leftEnd), rightEnd: Boolean(value.rightEnd) };
  }
  if (value.kind === "circular" && typeof value.seats === "number") return { ...common, kind: "circular", seats: value.seats };
  throw new Error();
}

function parsePositions(value: unknown, tables: PersistedTableV2[]): NonNullable<VenueConfig["positions"]> {
  const positions: NonNullable<VenueConfig["positions"]> = {};
  if (!isRecord(value)) return positions;
  for (const table of tables) {
    const position = value[table.id];
    if (!isPosition(position)) continue;
    positions[table.id] = {
      x: Math.max(0, Math.min(table.kind === "circular" ? 790 : 720, position.x)),
      y: Math.max(0, Math.min(490, position.y))
    };
  }
  return positions;
}

function isPosition(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && typeof value.x === "number" && Number.isFinite(value.x)
    && typeof value.y === "number" && Number.isFinite(value.y);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseGuestColumns(value: unknown): GuestColumn[] {
  if (!Array.isArray(value)) throw new Error("The data file contains invalid guest columns.");
  const ids = new Set<string>();
  const modes = new Set<ColumnMode>(["ignore", "spread", "cluster", "neighbours", "table"]);
  return value.map(column => {
    if (!isRecord(column) || typeof column.id !== "string" || !column.id || ids.has(column.id)
      || typeof column.label !== "string" || !column.label.trim()
      || !modes.has(column.mode as ColumnMode) || !isRecord(column.values) || !isRecord(column.tableMapping)) {
      throw new Error("The data file contains invalid guest columns.");
    }
    ids.add(column.id);
    const values = Object.fromEntries(Object.entries(column.values).map(([id, values]) => {
      if (!Array.isArray(values) || !values.every(value => typeof value === "string")) throw new Error("The data file contains invalid guest column values.");
      return [id, [...new Set(values.filter(value => value.trim()))]];
    }));
    const tableMapping = Object.fromEntries(Object.entries(column.tableMapping).map(([value, tableId]) => {
      if (tableId !== null && (typeof tableId !== "number" || !Number.isSafeInteger(tableId))) throw new Error("The data file contains an invalid table mapping.");
      return [value, tableId];
    }));
    return { id: column.id, label: column.label, mode: column.mode as ColumnMode, values, tableMapping,
      ...(column.legacyGroups === true ? { legacyGroups: true } : {}) };
  });
}

function parseSeatPins(value: unknown): SeatPins {
  if (!isRecord(value) || Object.entries(value).some(([id, seatId]) => !id || typeof seatId !== "number" || !Number.isSafeInteger(seatId) || seatId < 1)) {
    throw new Error("The data file contains invalid seat pins.");
  }
  return Object.fromEntries(Object.entries(value)) as SeatPins;
}
