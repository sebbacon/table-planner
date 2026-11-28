import { createPersistedPlannerData, parsePlannerDataJson } from "./persistence";
import type { PersistedPlannerData } from "./persistenceSchema";
import type { PlannerData } from "./plannerData";

// Retain the public type import used by existing callers.
export type { PlannerData } from "./plannerData";

export interface PlannerBackup extends PersistedPlannerData {
  exportedAt: string;
}

export function createPlannerBackup(data: PlannerData, exportedAt = new Date().toISOString()): PlannerBackup {
  return { ...createPersistedPlannerData(data), exportedAt };
}

export const parsePlannerBackupJson = parsePlannerDataJson;
