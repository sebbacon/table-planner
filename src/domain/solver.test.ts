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

it("honours the group-mixing setting during search and candidate scoring", () => {
  const layout = buildSeatingLayout({ tables: [{ id: 1, kind: "circular", seats: 4 }] });
  const guests = Array.from({ length: 4 }, (_, index) => ({ id: `g${index}`, name: `Guest ${index}`, groups: ["Family"] }));
  const options = { guests, constraints: [], layout, attempts: 4, improveIterations: 20 };
  expect(generatePlans({ ...options, mixGroups: false }).every((candidate) => candidate.score.groupPoints === 0)).toBe(true);
  expect(generatePlans({ ...options, mixGroups: true }).every((candidate) => candidate.score.groupPoints < 0)).toBe(true);
});

it.each(["next_to", "chat", "same_table"] as const)("can improve a high-priority %s pair across initial table assignments", (preference) => {
  const layout = buildSeatingLayout({ tables: [{ id: 1, kind: "circular", seats: 6 }, { id: 2, kind: "rect", seatsPerSide: 3, leftEnd: false, rightEnd: false }] });
  const guests = ["a", "b"].map(id => ({ id, name: id, groups: [] }));
  const [best] = generatePlans({ guests, constraints: [{ id: "pair", type: "prefer_adjacent", guestAId: "a", guestBId: "b", preference, priority: "high" }], layout, attempts: 5, improveIterations: 100, rng: seededRandom(17) });
  expect(best.score.preferred[0].adjacent).toBe(true);
});

it.each([1, 17, 99])("separates a keep-apart pair onto different tables where available (seed %i)", seed => {
  const layout = buildSeatingLayout({ tables: [1, 2].map(id => ({ id, kind: "circular", seats: 6 })) });
  const guests = Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, name: `Guest ${i}`, groups: [] }));
  const [best] = generatePlans({ guests, constraints: [{ id: "apart", type: "avoid_adjacent", guestAId: "g0", guestBId: "g1" }], layout, attempts: 6, improveIterations: 100, rng: seededRandom(seed) });
  expect(best.score.avoided[0]).toMatchObject({ adjacent: false, points: 24 });
});

it("retains the shared-table penalty when only one circular table is available", () => {
  const layout = buildSeatingLayout({ tables: [{ id: 1, kind: "circular", seats: 10 }] });
  const guests = Array.from({ length: 10 }, (_, i) => ({ id: `g${i}`, name: `Guest ${i}`, groups: [] }));
  const [best] = generatePlans({ guests, constraints: [{ id: "apart", type: "avoid_adjacent", guestAId: "g0", guestBId: "g1" }], layout, attempts: 6, improveIterations: 100, rng: seededRandom(17) });
  expect(best.score.avoided[0]).toMatchObject({ adjacent: true, points: -50 });
});

it.each([1, 17, 99])("keeps fixed guests at their tables during initial placement, guided swaps, and random kicks (seed %i)", seed => {
  const layout = buildSeatingLayout({ tables: [{ id: 0, kind: "circular", seats: 3 }, { id: 9, kind: "rect", seatsPerSide: 2, leftEnd: true, rightEnd: true }] });
  const guests = Array.from({ length: 12 }, (_, index) => ({ id: `g${index}`, name: `Guest ${index}`, groups: [] }));
  // Fixed guests occur after the normal overflow cutoff and fill a table more
  // heavily than the proportional occupancy target would have done.
  const columns = [{ id: "table", label: "Table", mode: "table" as const, values: { g9: ["A"], g10: ["A"], g11: ["A"], g8: ["B"] }, tableMapping: { A: 0, B: 9 } }];
  const constraints: Constraint[] = [{ id: "cross", type: "prefer_adjacent", guestAId: "g9", guestBId: "g8", preference: "same_table", priority: "high" }];
  for (const improveIterations of [0, 300]) {
    const candidates = generatePlans({ guests, constraints, layout, columns, attempts: 4, count: 4, improveIterations, rng: seededRandom(seed) });
    for (const { plan } of candidates) {
      const seated = Object.values(plan.assignments).filter(Boolean);
      expect([...seated, ...plan.holdingGuestIds].sort()).toEqual(guests.map(guest => guest.id).sort());
      for (const [id, tableId] of [["g9", 0], ["g10", 0], ["g11", 0], ["g8", 9]] as const) {
        const seat = layout.seats.find(seat => plan.assignments[seat.id] === id);
        expect(seat?.tableId).toBe(tableId);
        expect(plan.holdingGuestIds).not.toContain(id);
      }
    }
  }
});

it("rejects unresolved and overcapacity fixed assignments instead of returning a compromise", () => {
  const layout = buildSeatingLayout({ tables: [{ id: 1, kind: "circular", seats: 3 }] });
  const guests = Array.from({ length: 4 }, (_, i) => ({ id: `g${i}`, name: `Guest ${i}`, groups: [] }));
  const rule = { id: "table", label: "Table", mode: "table" as const, values: Object.fromEntries(guests.map(guest => [guest.id, ["A"]])), tableMapping: {} };
  expect(() => generatePlans({ guests, constraints: [], layout, columns: [rule] })).toThrow("choose a table");
  expect(() => generatePlans({ guests, constraints: [], layout, columns: [{ ...rule, tableMapping: { A: 1 } }] })).toThrow("4 fixed guests but only 3 seats");
});

it.each([1, 17, 99])("retains the best individual score while searching with many conflicting column rules (seed %i)", seed => {
  const layout = buildSeatingLayout({ tables: [1, 2].map(id => ({ id, kind: "circular" as const, seats: 3 })) });
  const guests = ["a", "b", "c", "d", "e", "f"].map(id => ({ id, name: id, groups: [] }));
  const constraints: Constraint[] = [{ id: "together", type: "prefer_adjacent", guestAId: "a", guestBId: "b", preference: "same_table" }];
  const columns = Array.from({ length: 300 }, (_, i) => ({ id: `col${i}`, label: `Col ${i}`, mode: "spread" as const, values: { a: ["X"], b: ["X"] }, tableMapping: {} }));
  const options = { guests, constraints, columns, layout, attempts: 1, count: 1 };
  const [initial] = generatePlans({ ...options, improveIterations: 0, rng: seededRandom(seed) });
  const [improved] = generatePlans({ ...options, improveIterations: 100, rng: seededRandom(seed) });
  expect(initial.score.preferred[0].adjacent).toBe(true);
  expect(improved.score.preferred[0].adjacent).toBe(true);
  expect(improved.score.constraintPoints).toBeGreaterThanOrEqual(initial.score.constraintPoints);
});

it("allows fixed guests to exceed proportional occupancy targets within actual table capacity", () => {
  const layout = buildSeatingLayout({ tables: [{ id: 0, kind: "circular", seats: 3 }, { id: 1, kind: "circular", seats: 9 }] });
  const guests = ["a", "b", "c"].map(id => ({ id, name: id, groups: [] }));
  const columns = [{ id: "table", label: "Table", mode: "table" as const, values: Object.fromEntries(guests.map(guest => [guest.id, ["Small"]])), tableMapping: { Small: 0 } }];
  for (const { plan } of generatePlans({ guests, constraints: [], columns, layout, attempts: 3, improveIterations: 60, rng: seededRandom(1) })) {
    expect(layout.seats.filter(seat => seat.tableId === 0).map(seat => plan.assignments[seat.id]).sort()).toEqual(["a", "b", "c"]);
    expect(plan.holdingGuestIds).toEqual([]);
  }
});

it("favours same-table column grouping over conflicting spread rules during search and ranking", () => {
  const layout = buildSeatingLayout({ tables: [1, 2].map(id => ({ id, kind: "circular" as const, seats: 3 })) });
  const guests = Array.from({ length: 6 }, (_, i) => ({ id: `g${i}`, name: `Guest ${i}`, groups: [] }));
  const values = Object.fromEntries(guests.map((guest, i) => [guest.id, [i < 3 ? "X" : "Y"]]));
  const columns = [
    { id: "household", label: "Household", mode: "cluster" as const, values, tableMapping: {} },
    ...Array.from({ length: 20 }, (_, i) => ({ id: `mix${i}`, label: `Mix ${i}`, mode: "spread" as const, values, tableMapping: {} }))
  ];
  const [best] = generatePlans({ guests, constraints: [], columns, layout, attempts: 5, improveIterations: 120, rng: seededRandom(17) });
  expect(best.score.clusterPoints).toBe(1);
  for (const tableId of layout.tableIds) {
    const tableValues = layout.seats.filter(seat => seat.tableId === tableId).flatMap(seat => values[best.plan.assignments[seat.id]!]);
    expect(new Set(tableValues).size).toBe(1);
  }
});

it.each([1, 17, 99])("keeps exact pinned seats through placement, guided search, and random kicks (seed %i)", seed => {
  const layout = buildSeatingLayout({ tables: [
    { id: 1, kind: "rect", seatsPerSide: 2, leftEnd: true, rightEnd: true },
    { id: 2, kind: "circular", seats: 3 }
  ] });
  const guests = Array.from({ length: 12 }, (_, i) => ({ id: `g${i}`, name: `Guest ${i}`, groups: [] }));
  const seatPins = { g11: layout.seatIds[0], g10: layout.seatIds[7] };
  const constraints: Constraint[] = [
    { id: "cross", type: "prefer_adjacent", guestAId: "g10", guestBId: "g11", preference: "same_table", priority: "high" },
    { id: "head", type: "prefer_head", guestId: "g11" }
  ];
  for (const improveIterations of [0, 350]) {
    for (const { plan } of generatePlans({ guests, constraints, layout, seatPins, attempts: 4, improveIterations, rng: seededRandom(seed) })) {
      for (const [id, seat] of Object.entries(seatPins)) expect(plan.assignments[seat]).toBe(id);
      expect([...Object.values(plan.assignments).filter(Boolean), ...plan.holdingGuestIds].sort()).toEqual(guests.map(guest => guest.id).sort());
    }
  }
});

it("supports all seats pinned and rejects duplicate, missing, conflicting, or overcapacity locks", () => {
  const layout = buildSeatingLayout({ tables: [1, 2].map(id => ({ id, kind: "circular" as const, seats: 3 })) });
  const guests = Array.from({ length: 6 }, (_, i) => ({ id: `g${i}`, name: `Guest ${i}`, groups: [] }));
  const seatPins = Object.fromEntries(guests.map((guest, i) => [guest.id, layout.seatIds[i]]));
  const [result] = generatePlans({ guests, constraints: [], layout, seatPins, attempts: 2, improveIterations: 120 });
  for (const [id, seat] of Object.entries(seatPins)) expect(result.plan.assignments[seat]).toBe(id);
  const options = { guests, constraints: [], layout, attempts: 1, improveIterations: 0 };
  expect(() => generatePlans({ ...options, seatPins: { g0: 1, g1: 1 } })).toThrow("more than one pinned guest");
  expect(() => generatePlans({ ...options, seatPins: { g0: 999 } })).toThrow("unavailable guest or seat");
  expect(() => generatePlans({ ...options, seatPins: { missing: 1 } })).toThrow("unavailable guest or seat");
  const column = { id: "table", label: "Table", mode: "table" as const, values: { g0: ["A"], g1: ["A"], g2: ["A"], g3: ["A"] }, tableMapping: { A: 2 } };
  expect(() => generatePlans({ ...options, columns: [column], seatPins: { g0: 1 } })).toThrow("different table");
  expect(() => generatePlans({ ...options, columns: [{ ...column, values: { g0: ["A"], g1: ["A"], g2: ["A"] } }], seatPins: { g3: 4 } })).toThrow("4 fixed guests but only 3 seats");
});
