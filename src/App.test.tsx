import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads placeholder guests and renders the fixed 39-seat plan", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /fill placeholders/i }));
    await user.click(screen.getByRole("button", { name: /reset/i }));

    expect(screen.getByText("39 guests for 39 seats")).toBeInTheDocument();
    expect(screen.getByLabelText("Seating layout")).toBeInTheDocument();
    expect(screen.getByText("39")).toBeInTheDocument();
  });

  it("shows only first names on seating labels", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.type(screen.getByLabelText("Guest list"), "Jane Smith, F\nSam Jones, M");
    await user.click(screen.getByRole("button", { name: /reset/i }));

    const janeLabel = screen.getByRole("button", { name: /jane/i });
    const samLabel = screen.getByRole("button", { name: /sam/i });

    expect(janeLabel).toBeInTheDocument();
    expect(samLabel).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /jane smith/i })).not.toBeInTheDocument();
    expect(janeLabel).toHaveClass("gender-f");
    expect(samLabel).toHaveClass("gender-m");
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

  it("saves guest gender edits without requiring a seating plan or dropping pairings", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "table-planner-state-v1",
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
    const guestInput = screen.getByLabelText("Guest list");
    await waitFor(() => expect(guestInput).toHaveValue("Jane Smith\nSam Jones"));
    fireEvent.change(guestInput, {
      target: {
        value: "Jane Smith, F\nSam Jones, M"
      }
    });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const saved = JSON.parse(localStorage.getItem("table-planner-state-v1") ?? "{}");
    expect(saved.guestText).toBe("Jane Smith, F\nSam Jones, M");
    expect(saved.constraints).toHaveLength(1);
    expect(saved.constraints[0]).toMatchObject({
      guestAId: "guest-1-jane-smith",
      guestBId: "guest-2-sam-jones"
    });
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
    const seatedLabel = screen.getByRole("button", { name: "Jane" });

    await user.hover(missedName);

    expect(seatedLabel).toHaveClass("highlighted");
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
          1: "guest-1-jane-smith",
          11: "guest-2-sam-jones"
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
