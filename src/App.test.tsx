import { render, screen } from "@testing-library/react";
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
    expect(screen.getByText("Imported data with 1 pairing")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Jane Smith")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Sam Jones")).toBeInTheDocument();
  });
});
