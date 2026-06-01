import { describe, expect, it } from "vitest";
import { buildSeatingLayout } from "./seating";
import { generatePlans } from "./solver";
import { DEFAULT_VENUE_CONFIG } from "./venueConfig";
import type { Guest } from "./types";

describe("generatePlans", () => {
  it("returns best-effort candidates for 39 guests", () => {
    const layout = buildSeatingLayout(DEFAULT_VENUE_CONFIG);
    const guests: Guest[] = Array.from({ length: 39 }, (_, index) => ({
      id: `guest-${index + 1}`,
      name: `Guest ${index + 1}`,
      gender: index % 2 === 0 ? "F" : "M"
    }));
    const candidates = generatePlans({
      guests,
      constraints: [],
      layout,
      count: 3,
      attempts: 8,
      improveIterations: 10,
      rng: seededRandom(10)
    });

    expect(candidates).toHaveLength(3);
    expect(Object.values(candidates[0].plan.assignments).filter(Boolean)).toHaveLength(layout.seatIds.length);
  });
});

function seededRandom(seed: number) {
  let value = seed;

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}
