import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { GuestGridEditor } from "./GuestGridEditor";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

it("lets users create named attributes with independent purposes and literal comma-containing cells", async () => {
  const user = userEvent.setup();
  const apply = vi.fn();
  render(<GuestGridEditor initial={{ guests: [], columns: [] }} onApply={apply} onCancel={vi.fn()} onDirty={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Guest name, row 1"), { target: { value: "Doe, Jane" } });
  await user.click(screen.getByRole("button", { name: "Add a column" }));
  expect(screen.getByLabelText("New column heading")).toHaveFocus();
  for (const [heading, mode, value] of [["Friend group", "cluster", "University"], ["Department", "spread", "Arts, crafts"]]) {
    await user.type(screen.getByLabelText("New column heading"), heading);
    await user.click(screen.getByRole("button", { name: "Add column" }));
    await user.selectOptions(screen.getByLabelText(`Seating purpose for ${heading}`), mode);
    fireEvent.change(screen.getByLabelText(`${heading}, row 1`), { target: { value } });
  }
  await user.click(screen.getByRole("button", { name: "Done" }));
  const data = apply.mock.calls[0][0];
  expect(data.guests[0].name).toBe("Doe, Jane");
  expect(data.columns.map((column: { label: string; mode: string }) => [column.label, column.mode])).toEqual([["Friend group", "cluster"], ["Department", "spread"]]);
  expect(data.columns[1].values[data.guests[0].id]).toEqual(["Arts, crafts"]);
});

it("pastes spreadsheet cells through the common review and produces separately editable columns", async () => {
  const user = userEvent.setup();
  const apply = vi.fn();
  render(<GuestGridEditor initial={{ guests: [], columns: [] }} onApply={apply} onCancel={vi.fn()} onDirty={vi.fn()} />);
  fireEvent.paste(screen.getByLabelText("Guest name, row 1"), { clipboardData: { getData: () => "Name\tHousehold\tDepartment\nJane\tSmith\tFinance\nSam\tJones\tSales" } });
  const dialog = await screen.findByRole("dialog", { name: "Review guest data" });
  await user.selectOptions(within(dialog).getByLabelText("Seating purpose for Household"), "cluster");
  await user.selectOptions(within(dialog).getByLabelText("Seating purpose for Department"), "neighbours");
  await user.click(within(dialog).getByRole("button", { name: "Use this guest list" }));
  expect(screen.getByLabelText("Household, row 1")).toHaveValue("Smith");
  expect(screen.getByLabelText("Department, row 2")).toHaveValue("Sales");
  expect(screen.getByLabelText("Seating purpose for Household")).toHaveValue("cluster");
  expect(screen.getByLabelText("Seating purpose for Department")).toHaveValue("neighbours");
  expect(screen.queryByLabelText("Seating purpose for Groups")).not.toBeInTheDocument();
  expect(apply).not.toHaveBeenCalled();
});

it("requires unique headings and a name for rows with values", async () => {
  const user = userEvent.setup();
  render(<GuestGridEditor initial={{ guests: [{ id: "jane", name: "Jane", groups: [] }], columns: [{ id: "dept", label: "Department", mode: "spread", values: { jane: ["Arts"] }, tableMapping: {} }] }} onApply={vi.fn()} onCancel={vi.fn()} onDirty={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Guest name, row 1"), { target: { value: "" } });
  expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Guest name, row 1"), { target: { value: "Jane" } });
  await user.click(screen.getByText("Edit columns", { selector: "summary" }));
  await user.type(screen.getByLabelText("New column heading"), "department");
  await user.click(screen.getByRole("button", { name: "Add column" }));
  expect(screen.getByRole("alert")).toHaveTextContent("unique column heading");
  fireEvent.change(screen.getByLabelText("Column heading: Department"), { target: { value: "Name" } });
  expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
});

it("imports a file into the same draft grid and allows cancellation without applying it", async () => {
  const user = userEvent.setup();
  const apply = vi.fn();
  const cancel = vi.fn();
  render(<GuestGridEditor initial={{ guests: [{ id: "kept", name: "Existing guest", groups: [] }], columns: [] }} onApply={apply} onCancel={cancel} onDirty={vi.fn()} />);
  await user.upload(screen.getByLabelText("Choose guest spreadsheet"), new File(["Name,Household,Department\nJane,Smith,Finance"], "guests.csv", { type: "text/csv" }));
  const dialog = await screen.findByRole("dialog", { name: "Review guest data" });
  await user.click(within(dialog).getByRole("button", { name: "Use this guest list" }));
  expect(screen.getByLabelText("Guest name, row 1")).toHaveValue("Jane");
  expect(screen.getByLabelText("Household, row 1")).toHaveValue("Smith");
  expect(screen.getByLabelText("Department, row 1")).toHaveValue("Finance");
  expect(screen.getByText(/Done removes 1 guest/)).toHaveTextContent("Existing guest");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(apply).not.toHaveBeenCalled();
});
