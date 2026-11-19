import { describe, expect, it } from "vitest";
import { buildSeatingLayout } from "./seating";
import { generatePlans } from "./solver";
import { DEFAULT_VENUE_CONFIG } from "./venueConfig";
import type { Constraint, Guest, VenueConfig } from "./types";

const invariantVenues: { name: string; config: VenueConfig }[] = [
  { name: "small rectangular table", config: { tables: [
    { kind: "rect", id: 10, seatsPerSide: 1, leftEnd: true, rightEnd: false }
  ] } },
  { name: "circular table", config: { tables: [{ kind: "circular", id: 0, seats: 5 }] } },
  { name: "mixed unequal tables", config: { tables: [
    { kind: "rect", id: 10, seatsPerSide: 1, leftEnd: false, rightEnd: false },
    { kind: "circular", id: 30, seats: 5 },
    { kind: "rect", id: 50, seatsPerSide: 2, leftEnd: true, rightEnd: true }
  ] } },
  { name: "four small tables", config: { tables: [1, 2, 3, 4].map((id) => ({
    kind: "rect" as const, id, seatsPerSide: 1, leftEnd: false, rightEnd: false
  })) } },
  { name: "seven sparsely occupied tables", config: { tables: [1, 2, 3, 4, 5, 6, 7].map((id) => ({
    kind: "rect" as const, id, seatsPerSide: 1, leftEnd: false, rightEnd: false
  })) } },
  { name: "empty venue", config: { tables: [] } }
];

describe.each(invariantVenues)("guest conservation: $name", ({ config }) => {
  const layout = buildSeatingLayout(config);
  const guestCounts = [...new Set([0, 1, 2, 3, Math.max(0, layout.seatIds.length - 1), layout.seatIds.length, layout.seatIds.length + 3])];

  it.each(guestCounts)("seats or holds each of %i guests exactly once", (guestCount) => {
    const guests: Guest[] = Array.from({ length: guestCount }, (_, i) => ({
      id: `guest-${i}`, name: `Guest ${i}`, groups: []
    }));
    const constraints: Constraint[] = guests.slice(1).map((guest, i) => ({
      id: `pair-${i}`, type: "prefer_adjacent", guestAId: guests[i].id, guestBId: guest.id,
      strength: (["high", "medium", "low"] as const)[i % 3]
    }));
    if (guests.length > 0) {
      constraints.push({ id: "head", type: "prefer_head", guestId: guests[0].id });
      constraints.push({ id: "avoid-head", type: "avoid_head", guestId: guests[guests.length - 1].id });
    }
    for (const seed of [1, 17, 99]) {
      for (const improveIterations of [0, 120]) {
        const candidates = generatePlans({
          guests, constraints, layout, attempts: 3, count: 2, improveIterations, rng: seededRandom(seed)
        });
        expect(candidates.length).toBeGreaterThan(0);
        for (const { plan } of candidates) {
          const seatedIds = Object.values(plan.assignments).filter((id) => id !== null);
          expect(Object.keys(plan.assignments).map(Number).sort((a, b) => a - b)).toEqual(layout.seatIds);
          expect(seatedIds).toHaveLength(Math.min(guestCount, layout.seatIds.length));
          expect([...seatedIds, ...plan.holdingGuestIds].sort()).toEqual(guests.map((guest) => guest.id).sort());
        }
      }
    }
  });
});

describe("generatePlans", () => {
  it.each([10, 42, 99])("preserves seeded constraint search results (seed %i)", (seed) => {
    const layout = buildSeatingLayout(DEFAULT_VENUE_CONFIG);
    const guests: Guest[] = Array.from({ length: 41 }, (_, i) => ({
      id: `g${i}`, name: `Guest ${i}`, groups: [i % 2 ? "Bride" : "Groom"]
    }));
    const constraints: Constraint[] = [
      { id: "head", type: "prefer_head", guestId: "g0" },
      { id: "avoid-head", type: "avoid_head", guestId: "g1" },
      ...Array.from({ length: 12 }, (_, i): Constraint => ({
        id: `pair${i}`, type: "prefer_adjacent", guestAId: `g${i}`,
        guestBId: `g${i + 1}`, strength: (["high", "medium", "low"] as const)[i % 3]
      })),
      { id: "default", type: "prefer_adjacent", guestAId: "g20", guestBId: "g25" },
      { id: "avoid", type: "avoid_adjacent", guestAId: "g4", guestBId: "g8" },
      { id: "overflow", type: "prefer_adjacent", guestAId: "g40", guestBId: "g0" }
    ];
    const candidates = generatePlans({
      guests, constraints, layout, count: 2, attempts: 4, improveIterations: 150,
      rng: seededRandom(seed)
    });

    expect(candidates.map(({ plan, score }) => ({
      seats: layout.seatIds.map((id) => plan.assignments[id]).join("|"),
      holding: plan.holdingGuestIds,
      score: { total: score.total, constraintPoints: score.constraintPoints, groupPoints: score.groupPoints }
    }))).toMatchSnapshot();
  });

  it("returns best-effort candidates for 39 guests", () => {
    const layout = buildSeatingLayout(DEFAULT_VENUE_CONFIG);
    const guests: Guest[] = Array.from({ length: 39 }, (_, index) => ({
      id: `guest-${index + 1}`,
      name: `Guest ${index + 1}`,
      groups: index % 2 === 0 ? ["Bride"] : ["Groom"]
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
