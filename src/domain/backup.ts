import type { Constraint, ConstraintType, PairStrength, Plan, SeatAssignments, SavedLayout, VenueConfig, GuestColumn, ColumnMode, SeatPins } from "./types";

export interface PlannerData {
  guestText: string;
  constraints: Constraint[];
  activePlan: Plan | null;
  savedLayouts?: SavedLayout[];
  venueConfig?: VenueConfig;
  guestIds?: string[];
  mixGroups?: boolean;
  columns?: GuestColumn[];
  seatPins?: SeatPins;
}

export interface PlannerBackup extends PlannerData {
  version: 2;
  exportedAt: string;
}

const CONSTRAINT_TYPES = new Set<ConstraintType>([
  "prefer_adjacent",
  "avoid_adjacent",
  "prefer_head",
  "avoid_head"
]);

export function createPlannerBackup(
  data: PlannerData,
  exportedAt = new Date().toISOString()
): PlannerBackup {
  return {
    version: 2,
    exportedAt,
    guestText: data.guestText,
    constraints: data.constraints,
    activePlan: data.activePlan,
    savedLayouts: data.savedLayouts,
    venueConfig: data.venueConfig,
    ...(data.guestIds ? { guestIds: data.guestIds } : {}),
    ...(data.seatPins ? { seatPins: data.seatPins } : {}),
    ...(data.columns ? { columns: data.columns } : {}),
    ...(data.mixGroups !== undefined ? { mixGroups: data.mixGroups } : {})
  };
}

export function parsePlannerBackupJson(input: string): PlannerData {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("The data file is not valid JSON.");
  }

  if (!isRecord(parsed) || (parsed.version !== 1 && parsed.version !== 2)) {
    throw new Error("The data file is not a supported table planner export.");
  }

  if (typeof parsed.guestText !== "string") {
    throw new Error("The data file is missing a guest list.");
  }

  if (!Array.isArray(parsed.constraints)) {
    throw new Error("The data file is missing constraints.");
  }

  return {
    guestText: parsed.guestText,
    constraints: parsed.constraints.map(parseConstraint),
    activePlan: parsed.activePlan === null ? null : parsePlan(parsed.activePlan),
    savedLayouts: Array.isArray(parsed.savedLayouts)
      ? parsed.savedLayouts.map(parseSavedLayout)
      : [],
    venueConfig: parseVenueConfig(parsed.venueConfig),
    ...(Array.isArray(parsed.guestIds) && parsed.guestIds.every((id) => typeof id === "string")
      && new Set(parsed.guestIds).size === parsed.guestIds.length
      && parsed.guestIds.length === parsed.guestText.split(/\r?\n/).filter((line) => line.trim()).length
      ? { guestIds: parsed.guestIds as string[] } : {}),
    ...(parsed.seatPins !== undefined ? { seatPins: parseSeatPins(parsed.seatPins) } : {}),
    ...(parsed.columns !== undefined ? { columns: parseGuestColumns(parsed.columns) } : {}),
    ...(typeof parsed.mixGroups === "boolean" ? { mixGroups: parsed.mixGroups } : {})
  };
}

function parseConstraint(value: unknown): Constraint {
  if (!isRecord(value)) {
    throw new Error("The data file contains an invalid constraint.");
  }

  const { id, type } = value;

  if (
    typeof id !== "string" ||
    typeof type !== "string" ||
    !CONSTRAINT_TYPES.has(type as ConstraintType)
  ) {
    throw new Error("The data file contains an invalid constraint.");
  }

  if (type === "prefer_adjacent" || type === "avoid_adjacent") {
    const { guestAId, guestBId, strength, preference, priority } = value;

    if (typeof guestAId !== "string" || typeof guestBId !== "string") {
      throw new Error("The data file contains an invalid constraint.");
    }

    const validStrengths = new Set<string>(["high", "medium", "low"]);
    const parsedStrength: PairStrength | undefined =
      type === "prefer_adjacent" && typeof strength === "string" && validStrengths.has(strength)
        ? (strength as PairStrength)
        : undefined;

    return {
      id,
      type,
      guestAId,
      guestBId,
      ...(parsedStrength !== undefined ? { strength: parsedStrength } : {}),
      ...(type === "prefer_adjacent" && (preference === "next_to" || preference === "chat" || preference === "same_table") ? { preference } : {}),
      ...(type === "prefer_adjacent" && (priority === "normal" || priority === "high") ? { priority } : {})
    };
  }

  const { guestId } = value;

  if (typeof guestId !== "string") {
    throw new Error("The data file contains an invalid constraint.");
  }

  return {
    id,
    type: type as "prefer_head" | "avoid_head",
    guestId
  };
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
    const tables = value.tables.map((t: unknown) => {
      if (!isRecord(t) || typeof t.id !== "number") throw new Error();
      if (t.kind === "rect") {
        if (typeof t.seatsPerSide !== "number") throw new Error();
        return {
          kind: "rect" as const,
          id: t.id,
          label: typeof t.label === "string" ? t.label : undefined,
          seatsPerSide: t.seatsPerSide,
          leftEnd: Boolean(t.leftEnd),
          rightEnd: Boolean(t.rightEnd)
        };
      }
      if (t.kind === "circular") {
        if (typeof t.seats !== "number") throw new Error();
        return {
          kind: "circular" as const,
          id: t.id,
          label: typeof t.label === "string" ? t.label : undefined,
          seats: t.seats
        };
      }
      throw new Error();
    });
    const positions: Record<number, { x: number; y: number }> = {};
    if (isRecord(value.positions)) {
      for (const table of tables) {
        const position = value.positions[table.id];
        if (isRecord(position) && typeof position.x === "number" && Number.isFinite(position.x)
          && typeof position.y === "number" && Number.isFinite(position.y)) {
          positions[table.id] = {
            x: Math.max(0, Math.min(table.kind === "circular" ? 790 : 720, position.x)),
            y: Math.max(0, Math.min(490, position.y))
          };
        }
      }
    }
    return { tables, ...(typeof value.nextTableId === "number" && Number.isSafeInteger(value.nextTableId) ? { nextTableId: value.nextTableId } : {}), ...(Object.keys(positions).length ? { positions } : {}) };
  } catch {
    return undefined;
  }
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
