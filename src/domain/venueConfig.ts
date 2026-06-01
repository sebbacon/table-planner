import type { VenueConfig } from "./types";

export const DEFAULT_VENUE_CONFIG: VenueConfig = {
  tables: [
    { kind: "rect", id: 1, label: "Table 1", seatsPerSide: 9, leftEnd: false, rightEnd: true },
    { kind: "rect", id: 2, label: "Table 2", seatsPerSide: 9, leftEnd: true, rightEnd: true }
  ]
};
