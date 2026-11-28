import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { Blob as NodeBlob } from "node:buffer";
import { TextEncoder } from "node:util";
import { deflateSync } from "node:zlib";
import { App } from "./App";
import { createShareUrl, readShareHash } from "./domain/share";
import type { PlannerData } from "./domain/backup";
import { PLANNER_DATA_VERSION } from "./domain/persistence";
import legacySession from "./domain/__fixtures__/session-unversioned.json";

const key = "table-planner-state-v2";
const local: PlannerData = { guestText: "Local Guest", guestIds: ["local"], constraints: [], activePlan: null };
const incoming: PlannerData = { guestText: "Shared Guest", guestIds: ["shared"], constraints: [], activePlan: { id: "p", assignments: { 1: "shared" }, holdingGuestIds: [] }, seatPins: { shared: 1 } };
beforeEach(() => {
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("TextEncoder", TextEncoder);
  localStorage.clear();
  window.history.replaceState(null, "", "/table-planner/");
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("copies a snapshot link and offers manual copying if clipboard access fails", async () => {
  const user = userEvent.setup();
  localStorage.setItem(key, JSON.stringify(incoming));
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Share plan" }));
  const dialog = await screen.findByRole("dialog", { name: "Share this plan" });
  const url = within(dialog).getByRole("textbox", { name: "Share link" }) as HTMLInputElement;
  expect(await readShareHash(new URL(url.value).hash)).toMatchObject(incoming);
  const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  await user.click(within(dialog).getByRole("button", { name: "Copy share link" }));
  expect(write).toHaveBeenCalledWith(url.value);
  expect(within(dialog).getByRole("status")).toHaveTextContent("Link copied");
  write.mockRejectedValue(new Error("Denied"));
  await user.click(within(dialog).getByRole("button", { name: "Copy share link" }));
  expect(within(dialog).getByRole("status")).toHaveTextContent("copy it manually");
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("previews a shared plan, preserves local data on cancel, and supports undo and reload after opening", async () => {
  const user = userEvent.setup();
  const url = await createShareUrl(incoming, window.location.href);
  localStorage.setItem(key, JSON.stringify(local));
  window.history.replaceState(null, "", url);
  const view = render(<App />);
  let dialog = await screen.findByRole("dialog", { name: "Open shared plan?" });
  fireEvent(window, new Event("pagehide"));
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject(local);
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(window.location.hash).toBe("");
  view.unmount();
  window.history.replaceState(null, "", url);
  const next = render(<App />);
  dialog = await screen.findByRole("dialog", { name: "Open shared plan?" });
  await user.click(within(dialog).getByRole("button", { name: "Open shared plan" }));
  expect(screen.getByRole("button", { name: "2. Plan" })).toHaveAttribute("aria-current", "page");
  expect(window.location.hash).toBe("");
  fireEvent(window, new Event("pagehide"));
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject(incoming);
  await user.click(screen.getByRole("button", { name: "Undo" }));
  fireEvent(window, new Event("pagehide"));
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject(local);
  next.unmount();
  render(<App />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("1 guests for 39 seats")).toBeInTheDocument();
});

it("leaves the local session intact when a shared link is damaged", async () => {
  localStorage.setItem(key, JSON.stringify(local));
  window.history.replaceState(null, "", "#plan=v1.broken");
  render(<App />);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("share link could not be opened"));
  fireEvent(window, new Event("pagehide"));
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject(local);
});

it("disables sharing until guest-list edits have been applied", async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByRole("button", { name: "Share plan" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Paste or type names" }));
  fireEvent.change(screen.getByLabelText("Guest list"), { target: { value: "New Guest" } });
  expect(screen.getByRole("button", { name: "Share plan" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.getByRole("button", { name: "Share plan" })).toBeEnabled();
});

it("opens a link navigated to in an existing tab and keeps subsequent edits on reload", async () => {
  const user = userEvent.setup();
  localStorage.setItem(key, JSON.stringify(local));
  const view = render(<App />);
  const url = await createShareUrl(incoming, window.location.href);
  window.history.replaceState(null, "", url);
  fireEvent(window, new Event("hashchange"));
  const dialog = await screen.findByRole("dialog", { name: "Open shared plan?" });
  await user.click(within(dialog).getByRole("button", { name: "Open shared plan" }));
  await user.click(screen.getByRole("button", { name: "Unpin Shared Guest from seat 1" }));
  fireEvent(window, new Event("pagehide"));
  view.unmount();
  render(<App />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pin Shared Guest to seat 1" })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ ...incoming, seatPins: {} });
});

it("upgrades an archived unversioned session through the common writer without losing legacy groups", () => {
  localStorage.setItem(key, JSON.stringify(legacySession));
  render(<App />);
  fireEvent(window, new Event("pagehide"));
  const stored = JSON.parse(localStorage.getItem(key)!);
  expect(stored).toMatchObject({
    version: PLANNER_DATA_VERSION,
    guestText: legacySession.guestText,
    guestIds: ["guest-1-jane", "guest-2-sam"],
    activePlan: legacySession.activePlan,
    mixGroups: true,
    seatPins: {},
    columns: [{ id: "legacy-groups", mode: "neighbours", legacyGroups: true,
      values: { "guest-1-jane": ["Family", "Younger"], "guest-2-sam": ["Friends"] } }]
  });
  expect(stored).not.toHaveProperty("exportedAt");
});

it("protects a session from a future data version from automatic overwriting", async () => {
  const futureSession = JSON.stringify({ ...incoming, version: 999, futureField: "keep this" });
  localStorage.setItem(key, futureSession);
  render(<App />);
  expect(screen.getByRole("status")).toHaveTextContent("Local saving paused");
  fireEvent(window, new Event("pagehide"));
  await new Promise(resolve => setTimeout(resolve, 650));
  expect(localStorage.getItem(key)).toBe(futureSession);
});

it("explains future-version links without replacing the local session", async () => {
  localStorage.setItem(key, JSON.stringify(local));
  const encoded = deflateSync(JSON.stringify({ ...incoming, version: 999 })).toString("base64url");
  window.history.replaceState(null, "", `#plan=v1.${encoded}`);
  render(<App />);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("unsupported data version. Update the app"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent(window, new Event("pagehide"));
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject(local);
});
