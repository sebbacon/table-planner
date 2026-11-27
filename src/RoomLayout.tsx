import { useRef, useState } from "react";
import { tablePositions } from "./domain/venueConfig";
import type { VenueConfig } from "./domain/types";

type Position = { x: number; y: number };
const WIDTH = 900;
const HEIGHT = 600;

export function RoomLayout({ config, onChange, disabled = false }: {
  config: VenueConfig;
  onChange: (positions: Record<number, Position>) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<Record<number, Position> | null>(null);
  const drag = useRef<{ id: number; pointerId: number; x: number; y: number; start: Position; positions: Record<number, Position> } | null>(null);
  const positions = tablePositions(config);
  const bounded = (id: number, position: Position) => {
    const round = config.tables.find(table => table.id === id)?.kind === "circular";
    return { x: Math.round(Math.max(0, Math.min(WIDTH - (round ? 110 : 180), position.x))), y: Math.round(Math.max(0, Math.min(HEIGHT - 110, position.y))) };
  };
  return <>
    <p id="room-layout-help">Drag tables to match your room. Or focus a table and use the arrow keys (Shift for larger moves). Positions are illustrative; seating preferences apply within each table.</p>
    <div className="room-layout-scroll">
      <div className="room-layout" role="group" aria-label="Room layout" style={{ width: WIDTH, height: HEIGHT }}>
        {config.tables.map(table => {
          const position = draft?.[table.id] ?? positions[table.id];
          const seats = table.kind === "rect" ? table.seatsPerSide * 2 + Number(table.leftEnd) + Number(table.rightEnd) : table.seats;
          return <button type="button" key={table.id} className={`room-table ${table.kind}`}
            disabled={disabled} aria-label={`Move ${table.label || `Table ${table.id}`}`} aria-describedby="room-layout-help"
            style={{ left: position.x, top: position.y }}
            onPointerDown={event => {
              if (event.button !== 0 || drag.current) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { id: table.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: position, positions };
            }}
            onPointerMove={event => {
              const current = drag.current;
              if (!current || current.id !== table.id || current.pointerId !== event.pointerId) return;
              current.positions = { ...current.positions, [table.id]: bounded(table.id, { x: current.start.x + event.clientX - current.x, y: current.start.y + event.clientY - current.y }) };
              setDraft(current.positions);
            }}
            onPointerUp={() => {
              const current = drag.current;
              if (!current) return;
              drag.current = null;
              setDraft(null);
              if (current.positions[table.id].x !== current.start.x || current.positions[table.id].y !== current.start.y) onChange(current.positions);
            }}
            onPointerCancel={() => { drag.current = null; setDraft(null); }}
            onLostPointerCapture={() => { drag.current = null; setDraft(null); }}
            onKeyDown={event => {
              const offsets: Record<string, Position> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
              const offset = offsets[event.key];
              if (!offset) return;
              event.preventDefault();
              const step = event.shiftKey ? 40 : 10;
              onChange({ ...positions, [table.id]: bounded(table.id, { x: position.x + offset.x * step, y: position.y + offset.y * step }) });
            }}>
            <strong>{table.label || `Table ${table.id}`}</strong><span>{seats} seats · {table.kind === "rect" ? "long table" : "round table"}</span>
          </button>;
        })}
      </div>
    </div>
  </>;
}
