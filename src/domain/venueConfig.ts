import type { VenueConfig } from "./types";

export const DEFAULT_VENUE_CONFIG: VenueConfig = {
  tables: [
    { kind: "rect", id: 1, label: "Table 1", seatsPerSide: 9, leftEnd: false, rightEnd: true },
    { kind: "rect", id: 2, label: "Table 2", seatsPerSide: 9, leftEnd: true, rightEnd: true }
  ]
};

export function tablePositions(config: VenueConfig) {
  return Object.fromEntries(config.tables.map((table, index) => [table.id,
    config.positions?.[table.id] ?? { x: 30 + (index % 4) * 210, y: 30 + Math.floor(index / 4) * 140 % 420 }
  ]));
}

// Nearby vertical positions belong to the same approximate room row.
export function roomTableOrder(config: VenueConfig): number[] {
  const positions = tablePositions(config);
  const remaining = [...config.tables].sort((a, b) => positions[a.id].y - positions[b.id].y || positions[a.id].x - positions[b.id].x);
  const result: number[] = [];
  while (remaining.length) {
    const top = positions[remaining[0].id].y;
    const row = remaining.filter(table => positions[table.id].y < top + 55);
    remaining.splice(0, row.length);
    result.push(...row.sort((a, b) => positions[a.id].x - positions[b.id].x).map(table => table.id));
  }
  return result;
}
