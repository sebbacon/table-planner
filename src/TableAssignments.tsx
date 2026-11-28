import { useEffect, useRef } from "react";
import { columnValues, guestColumnValues } from "./domain/guestColumns";
import type { Guest, GuestColumn, SeatingLayout, SeatPins } from "./domain/types";

export function TableAssignments({ columns, guests, layout, seatPins, focusRequest, onChange }: {
  columns: GuestColumn[];
  guests: Guest[];
  layout: SeatingLayout;
  seatPins: SeatPins;
  focusRequest: number;
  onChange: (columns: GuestColumn[]) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const tableColumns = columns.filter(column => column.mode === "table");
  const unpinnedGuests = guests.filter(guest => !Object.hasOwn(seatPins, guest.id));
  const remaining = tableColumns.reduce((count, column) => count + columnValues(column, unpinnedGuests).filter(value => {
    const tableId = column.tableMapping[value];
    return tableId == null || !layout.tableConfigs.has(tableId);
  }).length, 0);
  useEffect(() => {
    if (!focusRequest) return;
    const firstChoice = ref.current?.querySelector<HTMLSelectElement>('select[data-needs-table="true"]');
    if (!firstChoice) return;
    firstChoice.focus({ preventScroll: true });
    ref.current?.scrollIntoView?.({ block: "start" });
  }, [focusRequest]);
  if (!tableColumns.length) return null;
  return <section className="panel-section table-assignment-step" id="table-assignments" aria-labelledby="table-assignments-title" ref={ref}>
    <h2 id="table-assignments-title">{remaining ? "Choose tables for your guest groups" : "Fixed table assignments"}</h2>
    <p>{remaining ? `Next: choose a table for each group below. ${remaining} ${remaining === 1 ? "group still needs" : "groups still need"} a table before you can generate a plan.` : "Table choices are complete for unpinned guests. You can change these choices here at any time."}</p>
    <p className="muted-text">These table choices apply when generating. Pinned guests keep their exact seats instead, even at a different table. Manual moves can override table choices. Guests with blank cells remain free to sit anywhere. Choices save as you make them.</p>
    {tableColumns.map(column => <div className="table-assignment-column" key={column.id}>
      <h3>{column.label}</h3>
      <div className="column-table-mappings">{columnValues(column, guests).map(value => {
        const mapped = column.tableMapping[value];
        const valid = mapped != null && layout.tableConfigs.has(mapped);
        const suggestions = [...layout.tableConfigs.values()].filter(table => [table.label, `Table ${table.id}`, String(table.id)].some(label => label?.trim().toLocaleLowerCase() === value.toLocaleLowerCase()));
        function mapTo(tableId: number | null) {
          onChange(columns.map(item => item.id === column.id ? { ...item, tableMapping: { ...item.tableMapping, [value]: tableId } } : item));
        }
        const members = guests.filter(guest => guestColumnValues(column, guest.id).includes(value));
        const guestNames = members.map(guest => guest.name);
        const pinnedCount = members.filter(guest => Object.hasOwn(seatPins, guest.id)).length;
        const required = pinnedCount < members.length;
        return <div className="column-table-mapping" key={value}>
          <label>{value} ({guestNames.length} {guestNames.length === 1 ? "guest" : "guests"}{pinnedCount ? `, ${pinnedCount} pinned` : ""})<select aria-label={`Table for ${column.label}: ${value}`} data-needs-table={!valid && required} value={valid ? mapped : ""} onChange={event => mapTo(event.target.value === "" ? null : Number(event.target.value))}>
            <option value="">{!required ? "Not needed while all guests are pinned" : mapped != null && !valid ? "Table removed — choose again" : "Choose a table"}</option>
            {[...layout.tableConfigs.values()].map(table => <option value={table.id} key={table.id}>{table.label || `Table ${table.id}`} · {layout.seats.filter(seat => seat.tableId === table.id).length} seats (#{table.id})</option>)}
          </select></label>
          {!valid && required && suggestions.length === 1 && <button type="button" onClick={() => mapTo(suggestions[0].id)}>Use suggested table: {suggestions[0].label || `Table ${suggestions[0].id}`}</button>}
          <details><summary>View guests</summary><p>{guestNames.join(", ")}</p></details>
        </div>;
      })}</div>
      {!columnValues(column, guests).length && <p>No assignments: this column has no filled cells.</p>}
    </div>)}
  </section>;
}
