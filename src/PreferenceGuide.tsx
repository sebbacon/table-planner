import { useState } from "react";
import { PREFERENCE_LABELS } from "./domain/pairPreferences";
import type { PairPreference } from "./domain/types";

export function PreferenceGuide() {
  const [preference, setPreference] = useState<PairPreference>("chat");
  function seat(x: number, y: number, guest: boolean, neighbour: boolean, chat: boolean, key: string) {
    const accepted = preference === "same_table" || (preference === "next_to" ? neighbour : chat);
    return <g key={key}>
      <circle cx={x} cy={y} r={11} fill={guest ? "#263c52" : accepted ? "#b5dec4" : "#fff"} stroke={guest ? "#263c52" : accepted ? "#327650" : "#9ba5ac"} strokeWidth={2} />
      {guest && <text x={x} y={y + 4} textAnchor="middle" fill="white" fontSize={12}>A</text>}
    </g>;
  }
  return <details className="distance-help">
    <summary>How seating preferences work</summary>
    <p><strong>Sit next to each other:</strong> immediate neighbours, including around the end of a long table.</p>
    <p><strong>Sit where they can chat:</strong> neighbours, directly opposite or diagonally across on long tables; neighbours or next-but-one on circular tables. Closer seats score more highly.</p>
    <p><strong>Share a table:</strong> any two seats at the same table, with no preference for distance.</p>
    <label>Illustrate preference <select value={preference} onChange={event => setPreference(event.target.value as PairPreference)}>
      {Object.entries(PREFERENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <div className="preference-diagrams">
      <svg viewBox="0 0 240 180" role="img" aria-label={`${PREFERENCE_LABELS[preference]} at a long table. A marks the first guest; green seats are acceptable for their partner.`}>
        <rect x={22} y={55} width={196} height={55} rx={5} fill="#f0f3ef" stroke="#647d70" />
        {[0, 1, 2, 3, 4].flatMap(index => [seat(40 + index * 40, 35, false, false, Math.abs(index - 2) <= 1, `top-${index}`), seat(40 + index * 40, 133, index === 2, Math.abs(index - 2) === 1, Math.abs(index - 2) === 1, `bottom-${index}`)])}
        <text x={120} y={170} textAnchor="middle" fontSize={13}>Long table</text>
      </svg>
      <svg viewBox="0 0 240 180" role="img" aria-label={`${PREFERENCE_LABELS[preference]} at a circular table. A marks the first guest; green seats are acceptable for their partner.`}>
        <circle cx={120} cy={78} r={42} fill="#f0f3ef" stroke="#647d70" />
        {Array.from({ length: 10 }, (_, index) => {
          const angle = index * Math.PI / 5 - Math.PI / 2;
          const distance = Math.min(index, 10 - index);
          return seat(120 + 63 * Math.cos(angle), 78 + 63 * Math.sin(angle), index === 0, distance === 1, distance <= 2, `round-${index}`);
        })}
        <text x={120} y={170} textAnchor="middle" fontSize={13}>Circular table</text>
      </svg>
    </div>
    <p>A marks the first guest. Green seats are acceptable for their partner.</p>
    <p><strong>Priority:</strong> Normal or High changes how strongly the solver tries to meet a preference, independently of distance. All preferences remain flexible.</p>
  </details>;
}
