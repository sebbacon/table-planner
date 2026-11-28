import { COLUMN_MODE_HELP, COLUMN_MODE_LABELS, columnValues, guestColumnValues } from "./domain/guestColumns";
import type { ColumnMode, Guest, GuestColumn, SeatingLayout } from "./domain/types";

export function GuestColumnsEditor({ columns, guests, layout, onChange, disabled = false }: {
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
    {columns.length > 0 && <ul className="column-rule-summary" aria-label="Column rule summary">{columns.map(column => <li key={column.id}><strong>{column.label}:</strong> {COLUMN_MODE_LABELS[column.mode]}{column.mode === "table" && columnValues(column, guests).some(value => column.tableMapping[value] == null || !layout.tableConfigs.has(column.tableMapping[value]!)) ? " · Choose table mappings below" : ""}</li>)}</ul>}
    <p>Each column describes an attribute, such as Household or Department. Guests with the same value form a group within that column. Choose one purpose per column; blank cells have no effect.</p>
    <p className="muted-text">Fixed table assignments always apply, followed by individual seating preferences. Grouping at the same table comes next, then spreading and neighbour mixing.</p>
    {!columns.length && <p className="muted-text">Import a spreadsheet with columns such as Department, Household or Table. You can also add group labels after names in the guest list.</p>}
    {columns.length > 0 && <details className="preference-group">
    <summary>Edit column rules</summary>
    <fieldset disabled={disabled} className="column-rule-fields">
    {columns.map(column => {
      const values = columnValues(column, guests);
      return <section className="guest-column-rule" aria-label={`${column.label} column`} key={column.id}>
        <h3>{column.label}</h3>
        <p className="muted-text">{values.length} {values.length === 1 ? "value" : "values"} · {guests.filter(guest => guestColumnValues(column, guest.id).length).length} of {guests.length} guests have a value</p>
        {column.legacyGroups && <p>These labels come from commas after names, for example “Jane, Family, Younger”. All labels share this one purpose; their positions do not create separate columns. Import a spreadsheet with headings to give Household, Department or other attributes different purposes.</p>}
        <label>{`Seating purpose for ${column.label}`}<select value={column.mode} onChange={event => update(column.id, { mode: event.target.value as ColumnMode })}>
          {Object.entries(COLUMN_MODE_LABELS).map(([mode, label]) => <option value={mode} key={mode}>{label}</option>)}
        </select></label>
        <p className="muted-text">{COLUMN_MODE_HELP[column.mode]}</p>
        {column.mode === "table" ? <div className="column-table-mappings">
          {values.map(value => {
            const mapped = column.tableMapping[value];
            const valid = mapped != null && layout.tableConfigs.has(mapped);
            const suggestions = [...layout.tableConfigs.values()].filter(table => [table.label, `Table ${table.id}`, String(table.id)].some(label => label?.trim().toLocaleLowerCase() === value.toLocaleLowerCase()));
            function mapTo(tableId: number | null) { update(column.id, { tableMapping: { ...column.tableMapping, [value]: tableId } }); }
            const guestNames = guests.filter(guest => guestColumnValues(column, guest.id).includes(value)).map(guest => guest.name);
            return <div className="column-table-mapping" key={value}>
              <label>{value} ({guestNames.length} {guestNames.length === 1 ? "guest" : "guests"})<select aria-label={`Table for ${column.label}: ${value}`} value={valid ? mapped : ""} onChange={event => mapTo(event.target.value === "" ? null : Number(event.target.value))}>
                <option value="">{mapped != null && !valid ? "Table removed — choose again" : "Choose a table"}</option>
                {[...layout.tableConfigs.values()].map(table => <option value={table.id} key={table.id}>{table.label || `Table ${table.id}`} · {layout.seats.filter(seat => seat.tableId === table.id).length} seats (#{table.id})</option>)}
              </select></label>
              {!valid && suggestions.length === 1 && <button type="button" onClick={() => mapTo(suggestions[0].id)}>Use suggested table: {suggestions[0].label || `Table ${suggestions[0].id}`}</button>}
              <details><summary>View guests</summary><p>{guestNames.join(", ")}</p></details>
            </div>;
          })}
          {!values.length && <p>No assignments: this column has no filled cells.</p>}
        </div> : <details className="column-values"><summary>View values and guests</summary>
          {values.map(value => <p key={value}><strong>{value}</strong>: {guests.filter(guest => guestColumnValues(column, guest.id).includes(value)).map(guest => guest.name).join(", ")}</p>)}
          {!values.length && <p>No filled cells.</p>}
        </details>}
      </section>;
    })}
    </fieldset></details>}
  </section>;
}
