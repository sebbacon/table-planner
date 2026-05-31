import { describe, expect, it } from "vitest";
import { SEAT_IDS } from "./seating";
import { generatePlans } from "./solver";
import type { Guest } from "./types";

describe("generatePlans", () => {
  it("returns best-effort candidates for 39 guests", () => {
    const guests: Guest[] = Array.from({ length: 39 }, (_, index) => ({
      id: `guest-${index + 1}`,
      name: `Guest ${index + 1}`,
      gender: index % 2 === 0 ? "F" : "M"
    }));
    const candidates = generatePlans({
      guests,
      constraints: [],
      count: 3,
      attempts: 8,
      improveIterations: 10,
      rng: seededRandom(10)
    });

    expect(candidates).toHaveLength(3);
    expect(Object.values(candidates[0].plan.assignments).filter(Boolean)).toHaveLength(SEAT_IDS.length);
  });
});

function seededRandom(seed: number) {
  let value = seed;

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}
