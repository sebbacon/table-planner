import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { App } from "./App";
import { readFileText } from "./domain/file";
import type { PlannerData } from "./domain/backup";

const storageKey = "table-planner-state-v2";
const initial: PlannerData = {
  guestText: "Jane Smith\nAlex Brown\nSam Jones",
  constraints: [{ id: "near", type: "prefer_adjacent", guestAId: "guest-1-jane-smith", guestBId: "guest-3-sam-jones" }],
  activePlan: { id: "plan-1", assignments: { 1: "guest-1-jane-smith", 2: "guest-3-sam-jones", 3: null }, holdingGuestIds: ["guest-2-alex-brown"] }
};
function seed(data: PlannerData = initial) { localStorage.setItem(storageKey, JSON.stringify(data)); }
function saved(): PlannerData { return JSON.parse(localStorage.getItem(storageKey) ?? "{}"); }
async function editGuests(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByRole("button", { name: "1. Setup" }));
  await user.click(screen.getByRole("button", { name: /edit names|paste or type names/i }));
  fireEvent.change(screen.getByLabelText("Guest list"), { target: { value: text } });
  await user.click(screen.getByRole("button", { name: "Done" }));
  const review = screen.queryByRole("dialog", { name: "Review guest-list changes" });
  if (review) await user.click(within(review).getByRole("button", { name: "Apply guest changes" }));
}
async function restoreBackup(user: ReturnType<typeof userEvent.setup>, data: PlannerData) {
  await user.click(screen.getByText("Backup & restore"));
  await user.upload(screen.getByLabelText("Restore planner backup"), new File([JSON.stringify({ ...data, version: 1 })], "backup.json", { type: "application/json" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Restore backup" }));
}

beforeEach(() => {
  localStorage.clear();
  // jsdom doesn't implement the native dialog lifecycle/focus trap.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => vi.restoreAllMocks());

describe("guided setup", () => {
  it("orders the plan by room position and toggles the printable room arrangement", async () => {
    const user = userEvent.setup();
    seed({ ...initial, venueConfig: {
      tables: [1, 2].map(id => ({ id, kind: "circular", seats: 5 })),
      positions: { 1: { x: 300, y: 250 }, 2: { x: 20, y: 20 } }
    } });
    render(<App />);
    await user.click(screen.getByRole("button", { name: "2. Plan" }));
    const surface = screen.getByLabelText("Seating layout");
    expect([...surface.querySelectorAll(".table-label")].map(node => node.textContent)).toEqual(["Table 2", "Table 1"]);
    const toggle = screen.getByRole("button", { name: "Show as room layout" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(toggle).toHaveTextContent("Show as vertical list");
    expect(surface).toHaveClass("room-plan-viewport");
    expect(surface.querySelector(".room-plan-canvas")).toBeInTheDocument();
    expect(surface.querySelector(".table-block")).toHaveStyle({ left: "0px", top: "0px" });
    expect(screen.getByLabelText("Zoom")).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveTextContent("Show as room layout");
    expect(surface).not.toHaveClass("room-plan-viewport");
    expect(screen.queryByLabelText("Zoom")).not.toBeInTheDocument();
  });

  it("saves room positions without clearing seating plans and restores them on reload", async () => {
    const user = userEvent.setup();
    seed();
    const view = render(<App />);
    await user.click(screen.getByRole("button", { name: "1. Setup" }));
    const table = screen.getByRole("button", { name: "Move Table 1" });
    table.focus();
    await user.keyboard("{ArrowRight}{Shift>}{ArrowDown}{/Shift}");
    await waitFor(() => expect(saved().venueConfig?.positions?.[1]).toEqual({ x: 40, y: 70 }));
    expect(saved().activePlan).toEqual(initial.activePlan);
    view.unmount();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "1. Setup" }));
    expect(screen.getByRole("button", { name: "Move Table 1" })).toHaveStyle({ left: "40px", top: "70px" });
  });

  it("starts with clear actions, local reassurance, and optional preferences", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("heading", { name: "Let’s make a seating plan" })).toBeInTheDocument();
    expect(screen.getByText(/Your guest list stays on this device/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate seating plans" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "Alternatives" })).not.toBeInTheDocument();
    const preferences = screen.getByText("Seating preferences", { selector: "summary" }).closest("details")!;
    expect(preferences).not.toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Paste or type names" }));
    fireEvent.change(screen.getByLabelText("Guest list"), { target: { value: "Jane Smith\nSam Jones" } });
    expect(screen.getByRole("button", { name: "Generate seating plans" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Generate seating plans" })).toBeEnabled();
    await waitFor(() => expect(saved().guestText).toBe("Jane Smith\nSam Jones"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved in this browser");
  });

  it("keeps guest changes as a cancellable draft until Done", async () => {
    const user = userEvent.setup();
    seed();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "1. Setup" }));
    await user.click(screen.getByRole("button", { name: "Edit names" }));
    await user.clear(screen.getByLabelText("Guest list"));
    expect(screen.getByText("3 guests for 39 seats")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2. Plan" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Edit names" }));
    expect(screen.getByLabelText("Guest list")).toHaveValue(initial.guestText);
  });

  it("generates plans, exposes useful summaries, and supports keeping a named version", async () => {
    const user = userEvent.setup();
    render(<App />);
    await editGuests(user, "Jane Smith\nSam Jones");
    await user.click(screen.getByRole("button", { name: "Generate seating plans" }));
    expect(await screen.findByLabelText("Seating layout", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("2 of 2 guests seated")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alternatives" })).toBeInTheDocument();
    expect(screen.getByText("Scoring details").closest("details")).not.toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Keep this version" }));
    await user.click(screen.getByRole("button", { name: "Saved plans (1)" }));
    await user.click(screen.getByRole("button", { name: "Rename Plan 1" }));
    const name = screen.getByLabelText("Version name");
    await user.clear(name);
    await user.type(name, "Dinner{Enter}");
    await user.click(screen.getByRole("button", { name: "Dinner" }));
    expect(screen.getByLabelText("Seating layout")).toBeInTheDocument();
  });

  it("reads a spreadsheet locally and previews it before replacing a session", async () => {
    const user = userEvent.setup();
    seed();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "1. Setup" }));
    await user.upload(screen.getByLabelText("Choose guest spreadsheet"), new File(["Name,Gender\nPat Morgan,F\nRobin Green,M"], "guests.csv", { type: "text/csv" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Pat Morgan, F");
    expect(screen.getByText("3 guests for 39 seats")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Use this guest list" }));
    expect(screen.getByText("2 guests for 39 seats")).toBeInTheDocument();
    await waitFor(() => expect(saved().constraints).toEqual([]));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(saved().activePlan).toEqual(initial.activePlan));
    expect(saved().constraints).toEqual(initial.constraints);
  });

  it("does not replace the current session when a preview is cancelled", async () => {
    const user = userEvent.setup();
    seed();
    render(<App />);
    await user.click(screen.getByText("Backup & restore"));
    await user.upload(screen.getByLabelText("Restore planner backup"), new File([JSON.stringify({ version: 1, guestText: "Other Guest", constraints: [], activePlan: null })], "backup.json", { type: "application/json" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("3 guests for 39 seats")).toBeInTheDocument();
    expect(screen.getByLabelText("Seating layout")).toBeInTheDocument();
  });
});

describe("stable guests and saved data", () => {
  it("edits tables in room order with shape clues and reversible shape changes", async () => {
    const user = userEvent.setup();
    seed({ ...initial, activePlan: null, venueConfig: {
      tables: [
        { id: 1, label: "Long", kind: "rect", seatsPerSide: 4, leftEnd: true, rightEnd: false },
        { id: 2, label: "Round", kind: "circular", seats: 7 }
      ], positions: { 1: { x: 300, y: 300 }, 2: { x: 20, y: 20 } }
    } });
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Change tables" }));
    expect(screen.getAllByRole("textbox", { name: /Table .* name/ }).map(input => input.getAttribute("aria-label"))).toEqual(["Table 2 name", "Table 1 name"]);
    const row = screen.getByLabelText("Table 1 name").closest(".venue-setup-table")!;
    expect(row.querySelector(".venue-table-shape")).toHaveClass("rect");
    await user.selectOptions(screen.getByLabelText("Table 1 shape"), "circular");
    expect(row.querySelector(".venue-table-shape")).toHaveClass("circular");
    expect(within(row as HTMLElement).getByLabelText("Seats")).toHaveValue(9);
    await user.selectOptions(screen.getByLabelText("Table 1 shape"), "rect");
    expect(within(row as HTMLElement).getByLabelText("Seats per side")).toHaveValue(4);
    expect(within(row as HTMLElement).getByLabelText("Head seat (left end)")).toBeChecked();
    await user.selectOptions(screen.getByLabelText("Table 2 shape"), "rect");
    await user.click(screen.getByRole("button", { name: "Use these tables" }));
    await waitFor(() => expect(saved().venueConfig?.tables[1]).toEqual({ id: 2, label: "Round", kind: "rect", seatsPerSide: 3, leftEnd: false, rightEnd: true }));
    expect(saved().venueConfig?.positions?.[2]).toEqual({ x: 20, y: 20 });
  });

  it.each([
    { action: "remove a seated guest", text: "Jane Smith\nAlex Brown", assignments: { 1: "guest-1-jane-smith", 2: null, 3: null }, holding: ["guest-2-alex-brown"] },
    { action: "insert at the start", text: "Robin Green\nJane Smith\nAlex Brown\nSam Jones", assignments: initial.activePlan!.assignments, holding: ["guest-2-alex-brown", "guest-1-robin-green"] },
    { action: "rename and reorder guests", text: "Sam Jones\nAlex Brown\nJane Smith", assignments: initial.activePlan!.assignments, holding: ["guest-2-alex-brown"] }
  ])("preserves seating identities when you $action", async ({ text, assignments, holding }) => {
    const user = userEvent.setup();
    seed();
    render(<App />);
    await editGuests(user, text);
    await waitFor(() => expect(saved().guestText).toBe(text));
    expect(saved().activePlan?.assignments).toEqual(assignments);
    expect(saved().activePlan?.holdingGuestIds).toEqual(holding);
    if (text.includes("Sam Jones")) expect(saved().constraints).toEqual(initial.constraints);
    else expect(saved().constraints).toEqual([]);
  });

  it("keeps renamed guests and their preferences through a reload", async () => {
    const user = userEvent.setup();
    seed();
    const view = render(<App />);
    await editGuests(user, "Jane Cooper\nAlex Brown\nSam Jones");
    await waitFor(() => expect(saved().guestText).toContain("Jane Cooper"));
    expect(saved().guestIds?.[0]).toBe("guest-1-jane-smith");
    expect(saved().constraints).toEqual(initial.constraints);
    view.unmount();
    render(<App />);
    expect(within(screen.getByLabelText("Seating layout")).getByRole("button", { name: "Jane Cooper" })).toBeInTheDocument();
  });

  it("clears the plan when all guests are removed, with Undo available", async () => {
    const user = userEvent.setup();
    seed();
    render(<App />);
    await editGuests(user, "");
    await waitFor(() => expect(saved().activePlan).toBeNull());
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(saved().guestText).toBe(initial.guestText));
    expect(saved().activePlan).toEqual(initial.activePlan);
  });

  it("persists table-only changes and avoids clearing a plan for unchanged tables", async () => {
    const user = userEvent.setup();
    seed();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "1. Setup" }));
    await user.click(screen.getByRole("button", { name: "Change tables" }));
    await user.click(screen.getByRole("button", { name: "Use these tables" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change tables" }));
    fireEvent.change(screen.getByLabelText("Table 1 name"), { target: { value: "Family" } });
    await user.click(screen.getByRole("button", { name: "Use these tables" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(saved().venueConfig?.tables[0].label).toBe("Family"));
    expect(saved().activePlan).toEqual(initial.activePlan);
    await user.click(screen.getByRole("button", { name: "Change tables" }));
    fireEvent.change(screen.getAllByLabelText("Seats per side")[0], { target: { value: 8 } });
    await user.click(screen.getByRole("button", { name: "Use these tables" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Change tables" }));
    await waitFor(() => expect(saved().activePlan).toBeNull());
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(saved().activePlan).toEqual(initial.activePlan));
  });

  it("adds a batch of round tables without changing existing tables and reloads it", async () => {
    const user = userEvent.setup();
    const tables = [{ id: 7, kind: "circular" as const, label: "Family", seats: 5 }];
    seed({ ...initial, activePlan: null, venueConfig: { tables } });
    const view = render(<App />);
    await user.click(screen.getByRole("button", { name: "Change tables" }));
    fireEvent.change(screen.getByLabelText("Number of tables"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Seats per table"), { target: { value: "10" } });
    await user.click(screen.getByRole("button", { name: "Add tables" }));
    expect(screen.getByLabelText("Table 19 name")).toHaveValue("Table 19");
    await user.click(screen.getByRole("button", { name: "Use these tables" }));
    await waitFor(() => expect(saved().venueConfig?.tables).toHaveLength(13));
    expect(saved().venueConfig?.tables[0]).toEqual(tables[0]);
    expect(saved().venueConfig?.tables.slice(1)).toEqual(Array.from({ length: 12 }, (_, i) => ({ id: i + 8, label: `Table ${i + 8}`, kind: "circular", seats: 10 })));
    expect(saved().guestText).toBe(initial.guestText);
    expect(saved().constraints).toEqual(initial.constraints);
    view.unmount();
    render(<App />);
    expect(screen.getByText(/13 tables · 125 seats/)).toBeInTheDocument();
  });

  it("adds long tables and duplicates their full geometry with unique IDs", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Change tables" }));
    await user.selectOptions(screen.getByLabelText("Shape"), "rect");
    fireEvent.change(screen.getByLabelText("Number of tables"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Seats per side for new tables"), { target: { value: "6" } });
    await user.click(screen.getByLabelText("New tables: head seat (left end)"));
    await user.click(screen.getByLabelText("New tables: head seat (right end)"));
    await user.click(screen.getByRole("button", { name: "Add tables" }));
    await user.click(screen.getByRole("button", { name: "Duplicate table 3" }));
    await user.click(screen.getByRole("button", { name: "Use these tables" }));
    await waitFor(() => expect(saved().venueConfig?.tables).toHaveLength(5));
    expect(saved().venueConfig?.tables.slice(2)).toEqual([3, 4, 5].map(id => ({ id, label: `Table ${id}`, kind: "rect", seatsPerSide: 6, leftEnd: true, rightEnd: false })));
  });

  it("preserves an existing session through upgrade, cancelled drafts, and undo", async () => {
    const user = userEvent.setup();
    const data: PlannerData = { ...initial, mixGroups: false, venueConfig: { tables: [{ id: 9, kind: "circular", label: "Dinner", seats: 5 }] }, savedLayouts: [{ id: "kept", name: "Original", savedAt: "2026-01-01", plan: initial.activePlan!, scoreTotal: 12 }] };
    seed(data);
    render(<App />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved in this browser"));
    expect(saved()).toMatchObject(data);
    await user.click(screen.getByRole("button", { name: "1. Setup" }));
    await user.click(screen.getByRole("button", { name: "Change tables" }));
    await user.click(screen.getByRole("button", { name: "Duplicate table 9" }));
    await user.click(screen.getByRole("button", { name: "Cancel table changes" }));
    expect(saved()).toMatchObject(data);
    await user.click(screen.getByRole("button", { name: "Change tables" }));
    expect(screen.queryByLabelText("Table 10 name")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Duplicate table 9" }));
    await user.click(screen.getByRole("button", { name: "Use these tables" }));
    expect(saved()).toMatchObject(data);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Change tables" }));
    await waitFor(() => expect(saved().venueConfig?.tables).toHaveLength(2));
    expect(saved().venueConfig?.tables[1]).toEqual({ id: 10, label: "Table 10", kind: "circular", seats: 5 });
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(saved()).toMatchObject(data));
  });

  it("round-trips custom tables, stable guest IDs, group settings, and kept versions via the UI backup", async () => {
    const user = userEvent.setup();
    const data: PlannerData = { ...initial, guestIds: ["jane", "alex", "sam"], mixGroups: false, constraints: [], venueConfig: { tables: [{ id: 1, kind: "circular", label: "Dinner", seats: 5 }] }, activePlan: { id: "round", assignments: { 1: "jane", 2: "sam" }, holdingGuestIds: ["alex"] } };
    seed(data);
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((value: Blob) => { blob = value; return "blob:backup"; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Keep this version" }));
    await user.click(screen.getByText("Backup & restore"));
    await user.click(screen.getByRole("button", { name: "Download backup" }));
    const backup = JSON.parse(await readFileText(blob! as File));
    expect(backup.venueConfig).toEqual(data.venueConfig);
    expect(backup.guestIds).toEqual(data.guestIds);
    expect(backup.mixGroups).toBe(false);
    expect(backup.savedLayouts).toHaveLength(1);
    await editGuests(user, "Someone Else");
    await restoreBackup(user, backup);
    expect(screen.getByText("3 guests for 5 seats")).toBeInTheDocument();
    await waitFor(() => expect(saved().savedLayouts).toHaveLength(1));
    expect(saved().venueConfig).toEqual(data.venueConfig);
    expect(saved().activePlan).toEqual(data.activePlan);
  });

  it("reports storage failure without claiming the plan was saved", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Could not save"));
  });
});

describe("review and manual adjustments", () => {
  it("supports keyboard-friendly seat swaps, unseating, and undo", async () => {
    const user = userEvent.setup();
    seed();
    render(<App />);
    const seating = within(screen.getByLabelText("Seating layout"));
    await user.click(seating.getByRole("button", { name: "Jane Smith" }));
    await user.selectOptions(screen.getByLabelText("Destination"), "2");
    await user.click(screen.getByRole("button", { name: "Move / swap" }));
    await waitFor(() => expect(saved().activePlan?.assignments[2]).toBe("guest-1-jane-smith"));
    expect(saved().activePlan?.assignments[1]).toBe("guest-3-sam-jones");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(saved().activePlan).toEqual(initial.activePlan));
    await user.selectOptions(screen.getByLabelText("Guest", { selector: "select" }), "guest-1-jane-smith");
    await user.click(screen.getByRole("button", { name: "Unseat guest" }));
    expect(screen.getByText("Unseated guests (2)")).toBeInTheDocument();
  });

  it("swaps occupied seats by dragging, and moves a displaced occupant to unseated when needed", async () => {
    const user = userEvent.setup();
    seed();
    render(<App />);
    const seating = within(screen.getByLabelText("Seating layout"));
    const jane = seating.getByRole("button", { name: "Jane Smith" });
    const samSeat = seating.getByRole("button", { name: "Sam Jones" }).parentElement!;
    fireEvent.dragStart(jane);
    const over = new Event("dragover", { bubbles: true, cancelable: true });
    fireEvent(samSeat, over);
    expect(over.defaultPrevented).toBe(true);
    fireEvent.drop(samSeat);
    await waitFor(() => expect(saved().activePlan?.assignments[1]).toBe("guest-3-sam-jones"));
    const holding = within(screen.getByText("Unseated guests (1)").parentElement!);
    fireEvent.dragStart(holding.getByRole("button", { name: "Alex Brown" }));
    fireEvent.drop(seating.getByRole("button", { name: "Jane Smith" }).parentElement!);
    await waitFor(() => expect(saved().activePlan?.assignments[2]).toBe("guest-2-alex-brown"));
    expect(screen.getByText("Unseated guests (1)").parentElement).toHaveTextContent("Jane Smith");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("Unseated guests (1)").parentElement).toHaveTextContent("Alex Brown");
  });

  it("highlights guests from actionable issues, and persists preference and priority independently", async () => {
    const user = userEvent.setup();
    seed({ ...initial, activePlan: { ...initial.activePlan!, assignments: { 1: "guest-1-jane-smith", 28: "guest-3-sam-jones" } } });
    render(<App />);
    const issues = screen.getByText("Guests to seat nearer").parentElement!;
    await user.hover(within(issues).getByRole("button", { name: "Jane Smith" }));
    expect(within(screen.getByLabelText("Seating layout")).getByRole("button", { name: "Jane Smith" })).toHaveClass("highlighted");
    await user.click(screen.getByRole("button", { name: "1. Setup" }));
    await user.click(screen.getByText("Seating preferences", { selector: "summary" }));
    expect(screen.getByLabelText("Seating preference")).toHaveValue("chat");
    expect(screen.getByLabelText("Priority")).toHaveValue("normal");
    await user.selectOptions(screen.getByLabelText("Seating preference"), "same_table");
    await user.selectOptions(screen.getByLabelText("Priority"), "high");
    await waitFor(() => expect(saved().constraints[0]).toMatchObject({ preference: "same_table", priority: "high" }));
    await user.selectOptions(screen.getByLabelText("Seating preference"), "next_to");
    expect(screen.getByLabelText("Priority")).toHaveValue("high");
    await user.selectOptions(screen.getByLabelText("Priority"), "normal");
    expect(screen.getByLabelText("Seating preference")).toHaveValue("next_to");
  });

  it("warns before printing an incomplete plan", async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    seed();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Print" }));
    expect(print).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("1 guest is still unseated");
    await user.click(within(dialog).getByRole("button", { name: "Print draft" }));
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
  });

  it("preserves kept versions through manual edits and makes deletions undoable", async () => {
    const user = userEvent.setup();
    seed();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Keep this version" }));
    const seating = within(screen.getByLabelText("Seating layout"));
    await user.click(seating.getByRole("button", { name: "Jane Smith" }));
    await user.click(screen.getByRole("button", { name: "Unseat guest" }));
    await user.click(screen.getByRole("button", { name: "Saved plans (1)" }));
    await user.click(screen.getByRole("button", { name: "Open plan" }));
    expect(screen.getByText("Unseated guests (1)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Saved plans (1)" }));
    await user.click(screen.getByRole("button", { name: "Delete saved layout" }));
    expect(screen.getByText(/No versions yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "Plan 1" })).toBeInTheDocument();
  });
});

it("protects an unreadable local session from automatic overwriting", async () => {
  const unreadable = "{not-json";
  localStorage.setItem(storageKey, unreadable);
  render(<App />);
  expect(screen.getByRole("status")).toHaveTextContent("Local saving paused");
  expect(screen.getByRole("alert")).toHaveTextContent("has not been overwritten");
  fireEvent(window, new Event("pagehide"));
  expect(localStorage.getItem(storageKey)).toBe(unreadable);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Start fresh" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Start fresh" }));
  await waitFor(() => expect(saved().guestText).toBe(""));
});

it("adds a seating pair only after the user chooses two different guests", async () => {
  const user = userEvent.setup();
  seed({ ...initial, constraints: [], activePlan: null });
  render(<App />);
  await user.click(screen.getByText("Seating preferences", { selector: "summary" }));
  await user.click(screen.getByRole("button", { name: "Add Seat near each other pair" }));
  const form = screen.getByRole("button", { name: "Add pair" }).closest("form")!;
  expect(within(form).getByRole("button", { name: "Add pair" })).toBeDisabled();
  await user.selectOptions(within(form).getByLabelText("First guest"), "guest-1-jane-smith");
  expect(within(form).getByRole("option", { name: "Jane Smith", selected: false })).toBeDisabled();
  await user.selectOptions(within(form).getByLabelText("Second guest"), "guest-3-sam-jones");
  await user.click(within(form).getByRole("button", { name: "Add pair" }));
  await waitFor(() => expect(saved().constraints).toHaveLength(1));
  expect(saved().constraints[0]).toMatchObject({ guestAId: "guest-1-jane-smith", guestBId: "guest-3-sam-jones", preference: "chat", priority: "normal" });
});

it("restores and explains end-seat issues from a legacy backup", async () => {
  const user = userEvent.setup();
  render(<App />);
  await restoreBackup(user, { ...initial, constraints: [{ id: "end", type: "avoid_head", guestId: "guest-1-jane-smith" }], activePlan: { ...initial.activePlan!, assignments: { 19: "guest-1-jane-smith", 1: "guest-3-sam-jones" } } });
  expect(screen.getByText("End-seat issues")).toBeInTheDocument();
  expect(screen.getByText(/should avoid end seats/)).toBeInTheDocument();
  expect(screen.getByText("0 of 1 end-seat preferences met")).toBeInTheDocument();
});

it("provides an explicit rename that preserves seats and preferences before inserting another guest", async () => {
  const user = userEvent.setup();
  seed();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "1. Setup" }));
  await user.click(screen.getByText("View guest list (3)"));
  await user.click(screen.getByRole("button", { name: "Rename Jane Smith" }));
  await user.clear(screen.getByLabelText("Guest name"));
  await user.type(screen.getByLabelText("Guest name"), "Jane Cooper");
  await user.click(screen.getByRole("button", { name: "Apply name" }));
  await editGuests(user, "Robin Green\nSam Jones\nJane Cooper\nAlex Brown");
  await waitFor(() => expect(saved().guestText).toContain("Robin Green"));
  expect(saved().activePlan?.assignments).toEqual(initial.activePlan?.assignments);
  expect(saved().constraints).toEqual(initial.constraints);
});
