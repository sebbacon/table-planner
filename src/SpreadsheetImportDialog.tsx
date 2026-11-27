import { useEffect, useRef, useState } from "react";
import { defaultSpreadsheetOptions, rowsToGuestText, spreadsheetHeaders, type SpreadsheetImportResult, type SpreadsheetRow } from "./domain/spreadsheet";
import { parseGuestText } from "./domain/parser";

export function SpreadsheetImportDialog({ rows, onCancel, onImport }: {
  rows: SpreadsheetRow[];
  onCancel: () => void;
  onImport: (result: SpreadsheetImportResult) => void;
}) {
  const [options, setOptions] = useState(() => defaultSpreadsheetOptions(rows));
  const [ignored, setIgnored] = useState<number[]>([]);
  const headers = spreadsheetHeaders(rows, options.hasHeader);
  const result = rowsToGuestText(rows, { ...options, includedColumns: headers.map((_, index) => index).filter(index => !ignored.includes(index)) });
  const guests = parseGuestText(result.guestText).guests;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog className="review-dialog spreadsheet-preview" ref={ref} aria-labelledby="spreadsheet-title" onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id="spreadsheet-title">Review spreadsheet import</h2>
    <p>This replaces your guest list and clears seating preferences, the current plan, and saved versions. You can undo this change.</p>
    <label className="mix-setting"><input type="checkbox" checked={options.hasHeader} onChange={event => setOptions({ ...options, hasHeader: event.target.checked })} /> First row contains column headings</label>
    <div className="spreadsheet-name-columns">
      <label>Name column<select value={options.nameColumns[0] ?? ""} onChange={event => setOptions({ ...options, nameColumns: [Number(event.target.value), ...options.nameColumns.slice(1).filter(index => index !== Number(event.target.value))] })}>
        {!headers.length && <option value="">No columns</option>}
        {headers.map((label, index) => <option value={index} key={index}>{label}</option>)}
      </select></label>
      <label>Combine with<select value={options.nameColumns[1] ?? ""} onChange={event => setOptions({ ...options, nameColumns: [options.nameColumns[0], ...(event.target.value === "" ? [] : [Number(event.target.value)])] })}>
        <option value="">No other name column</option>
        {headers.map((label, index) => index !== options.nameColumns[0] && <option value={index} key={index}>{label}</option>)}
      </select></label>
    </div>
    <fieldset><legend>Other columns to import</legend>
      {headers.map((label, index) => !options.nameColumns.includes(index) && <label className="mix-setting" key={index}><input type="checkbox" checked={!ignored.includes(index)} onChange={event => setIgnored(previous => event.target.checked ? previous.filter(value => value !== index) : [...previous, index])} />{label}</label>)}
      <p className="muted-text">Imported columns start with “Don’t use for seating”. Choose group rules or table assignments in Seating preferences.</p>
    </fieldset>
    <h3>{result.importedCount} {result.importedCount === 1 ? "guest" : "guests"} · {result.columns.length} other {result.columns.length === 1 ? "column" : "columns"}</h3>
    <div className="spreadsheet-preview-scroll"><table><thead><tr><th>Name</th>{result.columns.map(column => <th key={column.id}>{column.label}</th>)}</tr></thead><tbody>
      {guests.slice(0, 8).map(guest => <tr key={guest.id}><td>{guest.name}</td>{result.columns.map(column => <td key={column.id}>{column.values[guest.id]?.join(", ") || "—"}</td>)}</tr>)}
    </tbody></table></div>
    {guests.length > 8 && <p className="muted-text">Showing the first 8 guests.</p>}
    {result.warnings.map(warning => <p className="warning-text" key={warning}>{warning}</p>)}
    <div className="inline-actions"><button type="button" onClick={onCancel} autoFocus>Cancel</button><button type="button" className="primary-button" disabled={!result.importedCount || options.nameColumns.length === 0} onClick={() => onImport(result)}>Use this guest list</button></div>
  </dialog>;
}
