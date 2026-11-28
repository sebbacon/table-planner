import { COLUMN_MODE_HELP, COLUMN_MODE_LABELS, columnValues, guestColumnValues } from "./domain/guestColumns";
import type { ColumnMode, Guest, GuestColumn, SeatingLayout, SeatPins } from "./domain/types";

export function GuestColumnsEditor({ columns, guests, layout, seatPins = {}, onChange, disabled = false }: {
  seatPins?: SeatPins;
  disabled?: boolean;
  columns: GuestColumn[];
  guests: Guest[];
  layout: SeatingLayout;
  onChange: (columns: GuestColumn[]) => void;
}) {
  function update(id: string, changes: Partial<GuestColumn>) {
    onChange(columns.map(column => column.id === id ? { ...column, ...changes } : column));
  }
  const active = columns.filter(column => column.mode !== "ignore").length;
  return <section className="panel-section column-rules" aria-labelledby="column-rules-title">
    <div className="section-heading"><h2 id="column-rules-title">Rules from guest columns</h2><span className="muted-text">{active} active</span></div>
    {columns.length > 0 && <ul className="column-rule-summary" aria-label="Column rule summary">{columns.map(column => <li key={column.id}><strong>{column.label}:</strong> {COLUMN_MODE_LABELS[column.mode]}{column.mode === "table" && columnValues(column, guests.filter(guest => !Object.hasOwn(seatPins, guest.id))).some(value => column.tableMapping[value] == null || !layout.tableConfigs.has(column.tableMapping[value]!)) ? " · Tables to choose above" : ""}</li>)}</ul>}
    <p>Each column describes an attribute, such as Household or Department. Guests with the same value form a group within that column. Choose one purpose per column; blank cells have no effect.</p>
    <p className="muted-text">When generating, pins take priority over table assignments, followed by individual seating preferences. Grouping at the same table comes next, then spreading and neighbour mixing. Manual moves override seating rules but preserve pins.</p>
    {!columns.length && <p className="muted-text">Choose Edit guests to add columns such as Department, Household or Table, or import a spreadsheet.</p>}
    {columns.length > 0 && <details className="preference-group">
    <summary>Edit column rules</summary>
    <fieldset disabled={disabled} className="column-rule-fields">
    {columns.map(column => {
      const values = columnValues(column, guests);
      return <section className="guest-column-rule" aria-label={`${column.label} column`} key={column.id}>
        <h3>{column.label}</h3>
        <p className="muted-text">{values.length} {values.length === 1 ? "value" : "values"} · {guests.filter(guest => guestColumnValues(column, guest.id).length).length} of {guests.length} guests have a value</p>
        {column.legacyGroups && <p>These are combined labels from your older guest list. They share one purpose. Choose Edit guests to add separate columns, such as Household and Department, with different purposes.</p>}
        <label>{`Seating purpose for ${column.label}`}<select value={column.mode} onChange={event => update(column.id, { mode: event.target.value as ColumnMode })}>
          {Object.entries(COLUMN_MODE_LABELS).map(([mode, label]) => <option value={mode} key={mode}>{label}</option>)}
        </select></label>
        <p className="muted-text">{COLUMN_MODE_HELP[column.mode]}</p>
        {column.mode === "table" ? <p><a href="#table-assignments">Choose or change tables in Fixed table assignments above</a></p> : <details className="column-values"><summary>View values and guests</summary>
          {values.map(value => <p key={value}><strong>{value}</strong>: {guests.filter(guest => guestColumnValues(column, guest.id).includes(value)).map(guest => guest.name).join(", ")}</p>)}
          {!values.length && <p>No filled cells.</p>}
        </details>}
      </section>;
    })}
    </fieldset></details>}
  </section>;
}
