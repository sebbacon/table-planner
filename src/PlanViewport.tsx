import { useRef, useState, type CSSProperties, type ReactNode } from "react";

export function PlanViewport({ roomView, width, height, children }: {
  roomView: boolean; width: number; height: number; children: ReactNode;
}) {
  const [zoom, setZoom] = useState(0.75);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  return <>
    {roomView && <div className="room-view-controls">
      <label>Zoom <select value={zoom} onChange={event => setZoom(Number(event.target.value))}>
        {[0.25, 0.5, 0.75, 1].map(value => <option key={value} value={value}>{value * 100}%</option>)}
      </select></label>
      <span>Drag the background to pan, or scroll. Touch: swipe to pan.</span>
    </div>}
    <div className={`table-plan${roomView ? " room-plan-viewport" : ""}`} aria-label="Seating layout"
      tabIndex={roomView ? 0 : undefined}
      onPointerDown={event => {
        if (!roomView || event.pointerType === "touch" || event.button !== 0 || (event.target as HTMLElement).closest(".table-block")) return;
        pan.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (!pan.current) return;
        event.currentTarget.scrollLeft = pan.current.left + pan.current.x - event.clientX;
        event.currentTarget.scrollTop = pan.current.top + pan.current.y - event.clientY;
      }}
      onPointerUp={() => { pan.current = null; }} onPointerCancel={() => { pan.current = null; }} onLostPointerCapture={() => { pan.current = null; }}>
      <div className={roomView ? "room-plan-canvas" : undefined} style={roomView ? { width, height, zoom, "--print-zoom": Math.min(1, 700 / width, 950 / height) } as CSSProperties : undefined}>
        {children}
      </div>
    </div>
  </>;
}
