import { restorePlannerDefaults, type PlannerData, type RestoredPlannerData } from "./plannerData";
import { PLANNER_DATA_VERSION, type PersistedPlannerData } from "./persistenceSchema";
import { parsePlannerV2 } from "./persistenceV2";

export { PLANNER_DATA_VERSION } from "./persistenceSchema";

// Keep this storage address across schema changes so upgrades find old data.
export const PLANNER_STORAGE_KEY = "table-planner-state-v2";

export class UnsupportedPlannerVersionError extends Error {
  constructor() {
    super("The data file is not a supported table planner export. It may use a newer version; update the app before opening it.");
  }
}

export function createPersistedPlannerData(data: PlannerData): PersistedPlannerData {
  const restored = restorePlannerDefaults(data);
  // Explicit projection prevents new working-model fields leaking into an old
  // format. Frozen wire types catch incompatible domain type changes as well.
  const persisted: PersistedPlannerData = {
    version: PLANNER_DATA_VERSION,
    guestText: restored.guestText,
    guestIds: restored.guestIds,
    constraints: restored.constraints,
    activePlan: restored.activePlan,
    savedLayouts: restored.savedLayouts,
    venueConfig: restored.venueConfig,
    mixGroups: restored.mixGroups,
    columns: restored.columns,
    seatPins: restored.seatPins
  };
  // The versioned parser projects nested fields as well as validating them.
  return parsePlannerV2(persisted);
}

export function parsePlannerDataJson(input: string): RestoredPlannerData {
  return migratePlannerData(parseJson(input));
}

export function parseLocalPlannerJson(input: string): RestoredPlannerData {
  const parsed = parseJson(input);
  // Only historical browser sessions may omit their version. Files and links
  // must declare one; a future version is never downgraded here.
  if (isRecord(parsed) && parsed.version === undefined) parsed.version = 1;
  return migratePlannerData(parsed);
}

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    throw new Error("The data file is not valid JSON.");
  }
}

function migratePlannerData(parsed: unknown): RestoredPlannerData {
  if (!isRecord(parsed)) throw new UnsupportedPlannerVersionError();
  return restorePlannerDefaults(parsePlannerV2(migrateToVersion2(parsed)));
}

function migrateToVersion2(parsed: Record<string, unknown>): Record<string, unknown> {
  switch (parsed.version) {
    case 1:
      // V1 used the same core fields. Historical defaults and group columns
      // are populated by restorePlannerDefaults, using stable guest ids.
      return { ...parsed, version: 2 };
    case 2:
      return parsed;
    default:
      throw new UnsupportedPlannerVersionError();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
