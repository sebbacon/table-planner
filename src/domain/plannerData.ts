import { legacyGroupColumn } from "./guestColumns";
import { parseGuestText } from "./parser";
import type { Constraint, GuestColumn, Plan, SavedLayout, SeatPins, VenueConfig } from "./types";
import { DEFAULT_VENUE_CONFIG } from "./venueConfig";

// The working model may evolve independently of the persisted schema.
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

export type RestoredPlannerData = Required<PlannerData>;

// Apply historical defaults once, for files, browser sessions, links, and Undo.
export function restorePlannerDefaults(data: PlannerData): RestoredPlannerData {
  const guests = parseGuestText(data.guestText, data.guestIds).guests;
  const mixGroups = data.mixGroups ?? true;
  return {
    guestText: data.guestText,
    constraints: data.constraints,
    activePlan: data.activePlan,
    guestIds: guests.map(guest => guest.id),
    savedLayouts: data.savedLayouts ?? [],
    venueConfig: data.venueConfig ?? DEFAULT_VENUE_CONFIG,
    mixGroups,
    columns: data.columns ?? legacyGroupColumn(guests, mixGroups),
    seatPins: data.seatPins ?? {}
  };
}
