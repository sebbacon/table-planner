import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each([
    {
      action: "removes a seated guest",
      guestText: "Jane Smith\nAlex Brown",
      expectedPlan: {
        id: "plan-1", assignments: { 1: "guest-1-jane-smith", 2: null, 3: null },
        holdingGuestIds: ["guest-2-alex-brown"]
      },
      heldNames: ["Alex"], seatedNames: ["Jane"]
    },
    {
      action: "adds a guest to holding",
      guestText: "Jane Smith\nAlex Brown\nSam Jones\nRobin Green",
      expectedPlan: {
        id: "plan-1", assignments: { 1: "guest-1-jane-smith", 2: "guest-3-sam-jones", 3: null },
        holdingGuestIds: ["guest-2-alex-brown", "guest-4-robin-green"]
      },
      heldNames: ["Alex", "Robin"], seatedNames: ["Jane", "Sam"]
    },
    {
      action: "clears the guest list",
      guestText: "",
      expectedPlan: null,
      heldNames: [], seatedNames: []
    }
  ])("reconciles and persists the plan when an edit $action", async ({
    guestText, expectedPlan, heldNames, seatedNames
  }) => {
    const user = userEvent.setup();
    localStorage.setItem("table-planner-state-v2", JSON.stringify({
      guestText: "Jane Smith\nAlex Brown\nSam Jones",
      constraints: [],
      activePlan: {
        id: "plan-1",
        assignments: { 1: "guest-1-jane-smith", 2: "guest-3-sam-jones", 3: null },
        // Reconciliation must also remove stale and already-seated holding entries.
        holdingGuestIds: ["guest-2-alex-brown", "guest-1-jane-smith", "removed-guest"]
      }
    }));
    render(<App />);
    await screen.findByText("3 guests for 39 seats");
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.change(screen.getByLabelText("Guest list"), { target: { value: guestText } });

    if (expectedPlan) {
      const seating = within(screen.getByLabelText("Seating layout"));
      const holding = within(screen.getByText("Holding Area").parentElement!);
      expect(seating.queryAllByRole("button")).toHaveLength(seatedNames.length);
      for (const name of seatedNames) {
        expect(seating.getByRole("button", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
      }
      expect(holding.queryAllByRole("button").map((button) => button.textContent?.trim()))
        .toEqual(heldNames);
    } else {
      expect(screen.queryByLabelText("Seating layout")).not.toBeInTheDocument();
      expect(screen.queryByText("Holding Area")).not.toBeInTheDocument();
    }
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("table-planner-state-v2") ?? "{}");
      expect(saved.guestText).toBe(guestText);
      expect(saved.activePlan).toEqual(expectedPlan);
    }, { timeout: 2000 });
  });

  it("loads placeholder guests and renders the fixed 39-seat plan", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await user.click(screen.getByRole("button", { name: /fill/i }));
    await user.click(screen.getByRole("button", { name: /reset/i }));

    expect(screen.getByText("39 guests for 39 seats")).toBeInTheDocument();
    expect(screen.getByLabelText("Seating layout")).toBeInTheDocument();
    expect(screen.getByText("39", { selector: ".seat-number" })).toBeInTheDocument();
  });

  it("shows only first names on seating labels", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await user.type(screen.getByLabelText("Guest list"), "Jane Smith, Bride\nSam Jones, Groom");
    await user.click(screen.getByRole("button", { name: /reset/i }));

    const janeLabel = screen.getByRole("button", { name: /jane/i });
    const samLabel = screen.getByRole("button", { name: /sam/i });

    expect(janeLabel).toBeInTheDocument();
    expect(samLabel).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /jane smith/i })).not.toBeInTheDocument();
    expect(janeLabel.className).toMatch(/\bgroup-\d\b/);
    expect(samLabel.className).toMatch(/\bgroup-\d\b/);
  });

  it("imports guests from an uploaded CSV spreadsheet", async () => {
    const user = userEvent.setup();
    const file = new File(["Name,Gender\nJane Smith,F\nSam Jones,M"], "guests.csv", {
      type: "text/csv"
    });

    render(<App />);

    await user.upload(screen.getByLabelText("Upload spreadsheet"), file);

    expect(await screen.findByDisplayValue(/Jane Smith, F/)).toBeInTheDocument();
    expect(screen.getByText("2 guests for 39 seats")).toBeInTheDocument();
    expect(screen.getByText("Imported 2 guests")).toBeInTheDocument();
  });

  it("imports planner data with pairings", async () => {
    const user = userEvent.setup();
    const backup = {
      version: 1,
      exportedAt: "2026-05-27T12:00:00.000Z",
      guestText: "Jane Smith, F\nSam Jones, M",
      constraints: [
        {
          id: "pair-1",
          type: "prefer_adjacent",
          guestAId: "guest-1-jane-smith",
          guestBId: "guest-2-sam-jones"
        }
      ],
      activePlan: null
    };
    const file = new File([JSON.stringify(backup)], "table-planner.json", {
      type: "application/json"
    });

    render(<App />);

    await user.upload(screen.getByLabelText("Import planner data"), file);

    expect(await screen.findByDisplayValue(/Jane Smith, F/)).toBeInTheDocument();
    expect(screen.getByText("2 guests for 39 seats")).toBeInTheDocument();
    expect(screen.getByText("Imported data with 1 constraint")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Jane Smith")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Sam Jones")).toBeInTheDocument();
  });

  it("persists pair strength selection in state and to localStorage", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "table-planner-state-v2",
      JSON.stringify({
        guestText: "Jane Smith\nSam Jones",
        constraints: [
          {
            id: "pair-1",
            type: "prefer_adjacent",
            guestAId: "guest-1-jane-smith",
            guestBId: "guest-2-sam-jones"
          }
        ],
        activePlan: null
      })
    );

    render(<App />);
    await screen.findByText("2 guests for 39 seats");

    const highBtn = screen.getByRole("button", { name: "High" });
    const medBtn = screen.getByRole("button", { name: "Med" });
    expect(medBtn).toHaveClass("active");
    expect(highBtn).not.toHaveClass("active");

    await user.click(highBtn);
    expect(highBtn).toHaveClass("active");
    expect(medBtn).not.toHaveClass("active");

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("table-planner-state-v2") ?? "{}");
      expect(saved.constraints[0].strength).toBe("high");
    }, { timeout: 2000 });
  });

  it("saves guest text edits without requiring a seating plan or dropping pairings", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "table-planner-state-v2",
      JSON.stringify({
        guestText: "Jane Smith\nSam Jones",
        constraints: [
          {
            id: "pair-1",
            type: "prefer_adjacent",
            guestAId: "guest-1-jane-smith",
            guestBId: "guest-2-sam-jones"
          }
        ],
        activePlan: null
      })
    );

    render(<App />);

    await screen.findByText("2 guests for 39 seats");
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const guestInput = screen.getByLabelText("Guest list");
    await waitFor(() => expect(guestInput).toHaveValue("Jane Smith\nSam Jones"));
    fireEvent.change(guestInput, {
      target: {
        value: "Jane Smith, F\nSam Jones, M"
      }
    });

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("table-planner-state-v2") ?? "{}");
      expect(saved.guestText).toBe("Jane Smith, F\nSam Jones, M");
      expect(saved.constraints).toHaveLength(1);
      expect(saved.constraints[0]).toMatchObject({
        guestAId: "guest-1-jane-smith",
        guestBId: "guest-2-sam-jones"
      });
    }, { timeout: 2000 });
  });

  it("highlights a seated guest when hovering a missed good-pair name", async () => {
    const user = userEvent.setup();
    const backup = {
      version: 1,
      exportedAt: "2026-05-31T08:00:00.000Z",
      guestText: "Jane Smith, F\nSam Jones, M",
      constraints: [
        {
          id: "pair-1",
          type: "prefer_adjacent",
          guestAId: "guest-1-jane-smith",
          guestBId: "guest-2-sam-jones"
        }
      ],
      activePlan: {
        id: "plan-1",
        assignments: {
          11: "guest-1-jane-smith",
          8: "guest-2-sam-jones"
        },
        holdingGuestIds: []
      }
    };
    const file = new File([JSON.stringify(backup)], "table-planner.json", {
      type: "application/json"
    });

    render(<App />);

    await user.upload(screen.getByLabelText("Import planner data"), file);
    await screen.findByText("Missed good pairs");

    const missedName = screen.getByRole("button", { name: "Jane Smith" });
    // Scope to the seating plan; jsdom also includes the print surname in
    // the accessible name because it does not apply the app's styles.
    const seatedLabel = within(screen.getByLabelText("Seating layout"))
      .getByRole("button", { name: /^Jane/ });

    expect(seatedLabel).not.toHaveClass("highlighted");

    await user.hover(missedName);

    expect(seatedLabel).toHaveClass("highlighted");

    await user.unhover(missedName);

    expect(seatedLabel).not.toHaveClass("highlighted");
  });

  it("imports and scores head-seat constraints", async () => {
    const user = userEvent.setup();
    const backup = {
      version: 1,
      exportedAt: "2026-05-31T08:00:00.000Z",
      guestText: "Jane Smith, F\nSam Jones, M",
      constraints: [
        {
          id: "head-1",
          type: "avoid_head",
          guestId: "guest-1-jane-smith"
        }
      ],
      activePlan: {
        id: "plan-1",
        assignments: {
          19: "guest-1-jane-smith",
          1: "guest-2-sam-jones"
        },
        holdingGuestIds: []
      }
    };
    const file = new File([JSON.stringify(backup)], "table-planner.json", {
      type: "application/json"
    });

    render(<App />);

    await user.upload(screen.getByLabelText("Import planner data"), file);

    expect(await screen.findByText("Head seat issues")).toBeInTheDocument();
    expect(screen.getByText(/should avoid head seats/)).toBeInTheDocument();
    expect(screen.getByText("0/1")).toBeInTheDocument();
  });
});
