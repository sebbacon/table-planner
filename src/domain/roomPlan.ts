import type { VenueConfig } from "./types";
import { tablePositions } from "./venueConfig";

// Remove empty bands of floor space while preserving table alignment and order.
function compactAxis(items: { id: number; start: number; size: number }[]) {
  const result: Record<number, number> = {};
  let end = -Infinity;
  let removed = 0;
  for (const item of [...items].sort((a, b) => a.start - b.start)) {
    if (end === -Infinity) removed = item.start;
    else removed += Math.max(0, item.start - end - 24);
    result[item.id] = item.start - removed;
    end = Math.max(end, item.start + item.size);
  }
  return result;
}

export function roomPlanGeometry(config: VenueConfig) {
  const positions = tablePositions(config);
  const sizes = Object.fromEntries(config.tables.map(table => [table.id, {
    width: table.kind === "circular" ? 340 : Math.max(760, table.seatsPerSide * 80 + (Number(table.leftEnd) + Number(table.rightEnd)) * 80),
    height: table.kind === "circular" ? 370 : 290
  }]));
  const scale = Math.max(4, ...config.tables.map(table => sizes[table.id].width / (table.kind === "circular" ? 110 : 180)));
  const x = compactAxis(config.tables.map(table => ({ id: table.id, start: positions[table.id].x * scale, size: sizes[table.id].width })));
  const y = compactAxis(config.tables.map(table => ({ id: table.id, start: positions[table.id].y * scale, size: sizes[table.id].height })));
  return {
    tables: Object.fromEntries(config.tables.map(table => [table.id, { left: x[table.id], top: y[table.id], width: sizes[table.id].width }])),
    width: Math.max(0, ...config.tables.map(table => x[table.id] + sizes[table.id].width)),
    height: Math.max(0, ...config.tables.map(table => y[table.id] + sizes[table.id].height))
  };
}
