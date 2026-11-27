import { expect, it } from "vitest";
import { roomPlanGeometry } from "./roomPlan";

it("packs empty floor space into small gaps while preserving room order", () => {
  const geometry = roomPlanGeometry({
    tables: [1, 2, 3].map(id => ({ id, kind: "circular", seats: 8 })),
    positions: { 1: { x: 30, y: 30 }, 2: { x: 600, y: 30 }, 3: { x: 30, y: 450 } }
  });
  expect(geometry.tables[1]).toEqual({ left: 0, top: 0, width: 340 });
  expect(geometry.tables[2]).toEqual({ left: 364, top: 0, width: 340 });
  expect(geometry.tables[3]).toEqual({ left: 0, top: 394, width: 340 });
  expect(geometry.width).toBe(704);
  expect(geometry.height).toBe(764);
});
