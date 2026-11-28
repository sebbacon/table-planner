import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { WelcomeDialog, WELCOME_STORAGE_KEY } from "./WelcomeDialog";

beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => vi.restoreAllMocks());

it("welcomes new visitors, links to help and remembers dismissal on later visits", async () => {
  const user = userEvent.setup();
  const view = render(<WelcomeDialog />);
  expect(screen.getByRole("dialog", { name: "Welcome to Table Planner" })).toBeVisible();
  expect(screen.getByRole("link", { name: /Read the full guide/ })).toHaveAttribute("href", "./help.html");
  await user.click(screen.getByRole("button", { name: "Get started" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  view.unmount();
  render(<WelcomeDialog />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("waits for other dialogs and remembers dismissal with Escape", () => {
  const view = render(<WelcomeDialog suspended />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(localStorage.getItem(WELCOME_STORAGE_KEY)).toBeNull();
  view.rerender(<WelcomeDialog />);
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(localStorage.getItem(WELCOME_STORAGE_KEY)).toBe("true");
  view.unmount();
  render(<WelcomeDialog />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("can be dismissed when browser storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Unavailable"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Unavailable"); });
  render(<WelcomeDialog />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Get started" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
