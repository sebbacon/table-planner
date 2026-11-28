import { useState } from "react";
import { columnValues } from "./domain/guestColumns";
import type { Guest, GuestColumn } from "./domain/types";

export function LegacyColumnOrganizer({ column, columns, guests, onApply, onCancel }: {
  column: GuestColumn;
  columns: GuestColumn[];
  guests: Guest[];
  onApply: (headings: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [headings, setHeadings] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  return <section className="legacy-column-organizer" aria-label="Organise existing group labels">
    <h3>Put your labels into named columns</h3>
    <p>Enter the same heading for labels that belong together. For example, put University and School in Friend group, and Finance and Sales in Department. Leave a heading blank to keep that label in {column.label}.</p>
    <p>New columns start with no seating purpose. Choose their purposes below after moving the labels. Your guests keep their identities, seats and pins; moved labels stop using their old column’s rule.</p>
    <div className="legacy-label-headings">
      {columnValues(column, guests).map(value => <label key={value}><span>{value}</span><input aria-label={`Column heading for label ${value}`} value={Object.hasOwn(headings, value) ? headings[value] : ""} list="existing-column-headings" placeholder="e.g. Friend group" onChange={event => setHeadings(previous => ({ ...previous, [value]: event.target.value }))} /></label>)}
    </div>
    <datalist id="existing-column-headings">{columns.filter(item => !item.legacyGroups).map(item => <option value={item.label} key={item.id} />)}</datalist>
    {error && <p role="alert">{error}</p>}
    <div className="inline-actions">
      <button type="button" onClick={() => { try { onApply(headings); } catch (cause) { setError(cause instanceof Error ? cause.message : "Check the column headings."); } }}>Move labels into columns</button>
      <button type="button" onClick={onCancel}>Cancel organising labels</button>
    </div>
  </section>;
}
