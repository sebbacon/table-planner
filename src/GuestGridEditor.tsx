import { useRef, useState, type ClipboardEvent } from "react";
import { COLUMN_MODE_HELP, COLUMN_MODE_LABELS, organiseLegacyLabels } from "./domain/guestColumns";
import { LegacyColumnOrganizer } from "./LegacyColumnOrganizer";
import { cleanGuestGrid, importedGuestGrid, type GuestGridData } from "./domain/guestGrid";
import { parseDelimitedText, readGuestSpreadsheet, type SpreadsheetRow } from "./domain/spreadsheet";
import type { ColumnMode, Guest } from "./domain/types";
import { SpreadsheetImportDialog } from "./SpreadsheetImportDialog";

function emptyGuest(): Guest {
  return { id: `guest-${crypto.randomUUID()}`, name: "", groups: [] };
}

export function GuestGridEditor({ initial, onApply, onCancel, onDirty }: {
  initial: GuestGridData;
  onApply: (data: GuestGridData) => void;
  onCancel: () => void;
  onDirty: () => void;
}) {
  const [data, setData] = useState<GuestGridData>(() => ({ ...initial, guests: initial.guests.length ? initial.guests : [emptyGuest()] }));
  const [newColumn, setNewColumn] = useState("");
  const [paste, setPaste] = useState("");
  const [pasteRows, setPasteRows] = useState<SpreadsheetRow[] | null>(null);
  const [error, setError] = useState("");
  const [organisingLabels, setOrganisingLabels] = useState(false);
  const columnsRef = useRef<HTMLDetailsElement>(null);
  const newColumnRef = useRef<HTMLInputElement>(null);
  const clean = cleanGuestGrid(data);
  const labels = clean.columns.map(column => column.label.toLocaleLowerCase());
  const invalidLabels = labels.some((label, index) => !label || label === "name" || labels.indexOf(label) !== index);
  const namelessValues = data.guests.some(guest => !guest.name.trim() && data.columns.some(column => column.values[guest.id]?.some(value => value.trim())));
  const duplicateNames = clean.guests.filter((guest, index) => clean.guests.findIndex(other => other.name.toLocaleLowerCase() === guest.name.toLocaleLowerCase()) !== index);
  const removed = initial.guests.filter(guest => !clean.guests.some(next => next.id === guest.id));
  const legacyColumn = data.columns.find(column => column.legacyGroups);

  function update(next: GuestGridData) {
    setData(next);
    setError("");
    onDirty();
  }
  function setValues(columnId: string, guestId: string, values: string[]) {
    update({ ...data, columns: data.columns.map(column => column.id === columnId ? { ...column, values: { ...column.values, [guestId]: values } } : column) });
  }
  function pasteTable(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    if (!/[\t\r\n]/.test(text)) return;
    event.preventDefault();
    setPasteRows(parseDelimitedText(text));
  }
  function addColumn() {
    const label = newColumn.trim();
    if (!label || label.toLocaleLowerCase() === "name" || labels.includes(label.toLocaleLowerCase())) {
      setError("Choose a unique column heading, such as Household or Department.");
      return;
    }
    update({ ...data, columns: [...data.columns, { id: `column-${crypto.randomUUID()}`, label, mode: "ignore", values: {}, tableMapping: {} }] });
    setNewColumn("");
  }

  return <section className="guest-grid-editor" aria-label="Edit guest grid">
    <h3>Guest details</h3>
    <p>Edit names and values below, or paste a table with headings such as Name, Friend group and Department. Choose how columns affect seating below the guest list. Changes apply when you choose Done.</p>
    <label className="file-upload-button">Choose spreadsheet<input className="visually-hidden" aria-label="Choose guest spreadsheet" type="file" accept=".xlsx,.csv,.tsv,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={async event => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        setPasteRows(await readGuestSpreadsheet(file));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The spreadsheet could not be read.");
      }
    }} /></label>
    <details className="guest-grid-paste">
      <summary>Paste names or a table</summary>
      <p>Paste one name per line, CSV, or cells copied from a spreadsheet. Review the headings and columns before replacing the grid. You can also paste several cells into a Name cell.</p>
      <label>Paste guest data<textarea value={paste} onChange={event => setPaste(event.target.value)} placeholder={"Name,Friend group,Department\nJane,University,Finance\nSam,Running club,Engineering"} /></label>
      <button type="button" disabled={!paste.trim()} onClick={() => setPasteRows(parseDelimitedText(paste))}>Review pasted data</button>
    </details>
    <div className="guest-grid-column-actions">
      <p className="muted-text">Add a column for each attribute you want to use differently, such as Friend group or Department.</p>
      <button type="button" onClick={() => { if (columnsRef.current) columnsRef.current.open = true; newColumnRef.current?.focus(); }}>Add a column</button>
    </div>
    {legacyColumn && <div className="guest-grid-legacy-note"><p>Your older labels are combined in a single column. Each column has one seating purpose. Organise the labels into named columns to give them different purposes.</p><button type="button" onClick={() => setOrganisingLabels(true)}>Organise existing labels</button></div>}
    {organisingLabels && legacyColumn && <LegacyColumnOrganizer column={legacyColumn} columns={data.columns} guests={data.guests} onCancel={() => setOrganisingLabels(false)} onApply={headings => {
      update({ ...data, columns: organiseLegacyLabels(data.columns, data.guests, legacyColumn.id, headings) });
      setOrganisingLabels(false);
    }} />}
    <details className="guest-grid-columns" ref={columnsRef}>
      <summary>Edit columns</summary>
      <p>Name is always included. Add a heading for each extra attribute, such as Friend group or Department.</p>
      {data.columns.map(column => <div className="guest-grid-column" key={column.id}>
        <label>Column heading: {column.label}<input value={column.label} onChange={event => update({ ...data, columns: data.columns.map(item => item.id === column.id ? { ...item, label: event.target.value } : item) })} /></label>
        <button type="button" aria-label={`Remove ${column.label} column`} onClick={() => update({ ...data, columns: data.columns.filter(item => item.id !== column.id) })}>Remove column</button>
      </div>)}
      <div className="guest-grid-tools">
        <label>New column heading<input ref={newColumnRef} value={newColumn} onChange={event => setNewColumn(event.target.value)} placeholder="e.g. Department" onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addColumn(); } }} /></label>
        <button type="button" onClick={addColumn}>Add column</button>
      </div>
    </details>
    <div className="guest-grid-scroll" role="region" aria-label="Guest grid" tabIndex={0}>
      <table className="guest-grid">
        <thead><tr><th scope="col">Name</th>{data.columns.map(column => <th scope="col" key={column.id}>{column.label}</th>)}<th scope="col"><span className="visually-hidden">Remove guest</span></th></tr></thead>
        <tbody>{data.guests.map((guest, row) => <tr key={guest.id}>
          <td><input aria-label={`Guest name, row ${row + 1}`} value={guest.name} onPaste={pasteTable} onChange={event => update({ ...data, guests: data.guests.map(item => item.id === guest.id ? { ...item, name: event.target.value } : item) })} autoFocus={row === 0} /></td>
          {data.columns.map(column => {
            const values = column.values[guest.id]?.length ? column.values[guest.id] : [""];
            return <td key={column.id}>{values.map((value, index) => <input key={index} aria-label={`${column.label}, row ${row + 1}${index ? `, value ${index + 1}` : ""}`} value={value} onChange={event => setValues(column.id, guest.id, values.map((old, i) => i === index ? event.target.value : old))} />)}
              {column.legacyGroups && <button type="button" aria-label={`Add group label, row ${row + 1}`} onClick={() => setValues(column.id, guest.id, [...values, ""])}>Add label</button>}
            </td>;
          })}
          <td><button type="button" aria-label={`Remove guest, row ${row + 1}`} onClick={() => update({ ...data, guests: data.guests.filter(item => item.id !== guest.id) })}>Remove</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div><button type="button" onClick={() => update({ ...data, guests: [...data.guests, emptyGuest()] })}>Add guest</button></div>
    {data.columns.length > 0 && <section className="guest-grid-purposes" aria-labelledby="guest-grid-purposes-title">
      <h3 id="guest-grid-purposes-title">How to use these columns</h3>
      <p className="muted-text">Optional: choose a seating purpose for each column. Guests with matching values are considered together; blank cells have no effect.</p>
      {data.columns.map(column => <div className="guest-grid-purpose" key={column.id}>
        <label><span>{column.label}</span><select aria-label={`Seating purpose for ${column.label}`} value={column.mode} aria-describedby={`grid-purpose-${column.id}`} onChange={event => update({ ...data, columns: data.columns.map(item => item.id === column.id ? { ...item, mode: event.target.value as ColumnMode } : item) })}>
          {Object.entries(COLUMN_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <details className="grid-purpose-help"><summary>About this purpose</summary><p className="muted-text" id={`grid-purpose-${column.id}`}>{COLUMN_MODE_HELP[column.mode]}</p></details>
        {column.mode === "table" && <p className="muted-text">After Done, we’ll take you straight to choosing tables.</p>}
        {column.legacyGroups && <p className="muted-text">Labels from your older guest list. These share one purpose. Add separate columns for different purposes.</p>}
      </div>)}
    </section>}
    {error && <p role="alert">{error}</p>}
    {invalidLabels && <p role="alert">Each attribute needs a unique heading other than Name.</p>}
    {namelessValues && <p role="alert">Add a name to every row with values, or remove that row.</p>}
    {duplicateNames.length > 0 && <p className="warning-text">Duplicate names: {duplicateNames.map(guest => guest.name).join(", ")}. Use distinct names to tell guests apart.</p>}
    {removed.length > 0 && <p className="warning-text">Done removes {removed.length} {removed.length === 1 ? "guest" : "guests"} and their seats, pins and individual preferences: {removed.map(guest => guest.name).join(", ")}. Undo can restore them.</p>}
    <div className="inline-actions">
      <button type="button" className="primary-button" disabled={invalidLabels || namelessValues} onClick={() => onApply(clean)}>Done</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
    {pasteRows && <SpreadsheetImportDialog rows={pasteRows} onCancel={() => setPasteRows(null)} onImport={result => {
      update(importedGuestGrid(result, data));
      setPasteRows(null);
      setPaste("");
    }} />}
  </section>;
}

export function GuestGridPreview({ guests, columns }: GuestGridData) {
  return <div className="guest-grid-scroll" role="region" aria-label="Guest grid" tabIndex={0}>
    <table className="guest-grid guest-grid-preview"><thead><tr><th scope="col">Name</th>{columns.map(column => <th scope="col" key={column.id}>{column.label}</th>)}</tr></thead>
      <tbody>{guests.map(guest => <tr key={guest.id}><th scope="row">{guest.name}</th>{columns.map(column => <td key={column.id}>{column.values[guest.id]?.join(" · ") || "—"}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}
