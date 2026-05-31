import {
  Download,
  FileDown,
  FileUp,
  GripVertical,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Shuffle,
  Trash2,
  Upload,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { createPlannerBackup, parsePlannerBackupJson, type PlannerData } from "./domain/backup";
import { readFileText } from "./domain/file";
import { SEAT_IDS, SEATS } from "./domain/seating";
import { createInitialPlan, scorePlan } from "./domain/scoring";
import { generatePlans, type ScoredPlan } from "./domain/solver";
import { spreadsheetFileToGuestText } from "./domain/spreadsheet";
import type { ConstraintPair, ConstraintType, Guest, Plan, ScoreBreakdown } from "./domain/types";
import { parseGuestText } from "./domain/parser";

const STORAGE_KEY = "table-planner-state-v1";

const PLACEHOLDER_GUESTS = Array.from({ length: 39 }, (_, index) => {
  const gender = index % 3 === 0 ? ", F" : index % 3 === 1 ? ", M" : "";
  return `Guest ${index + 1}${gender}`;
}).join("\n");

export function App() {
  const [guestText, setGuestText] = useState("");
  const [constraints, setConstraints] = useState<ConstraintPair[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [candidates, setCandidates] = useState<ScoredPlan[]>([]);
  const [draggedGuestId, setDraggedGuestId] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importError, setImportError] = useState("");
  const [saveStatus, setSaveStatus] = useState("Not saved");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as PlannerData;
      setGuestText(parsed.guestText ?? "");
      setConstraints(parsed.constraints ?? []);
      setActivePlan(parsed.activePlan ?? null);
      setSaveStatus("Loaded saved plan");
    } catch {
      setSaveStatus("Saved plan could not be loaded");
    }
  }, []);

  const parseResult = useMemo(() => parseGuestText(guestText), [guestText]);
  const guests = parseResult.guests;
  const guestsById = useMemo(() => new Map(guests.map((guest) => [guest.id, guest])), [guests]);
  const validConstraints = useMemo(
    () =>
      constraints.filter(
        (pair) =>
          pair.guestAId &&
          pair.guestBId &&
          pair.guestAId !== pair.guestBId &&
          guestsById.has(pair.guestAId) &&
          guestsById.has(pair.guestBId)
      ),
    [constraints, guestsById]
  );
  const activeScore = useMemo(
    () => (activePlan ? scorePlan(activePlan, guests, validConstraints) : null),
    [activePlan, guests, validConstraints]
  );
  const seatedGuestIds = useMemo(() => {
    if (!activePlan) {
      return new Set<string>();
    }

    return new Set(Object.values(activePlan.assignments).filter(Boolean) as string[]);
  }, [activePlan]);
  const unplacedGuests = guests.filter(
    (guest) =>
      !seatedGuestIds.has(guest.id) && !(activePlan?.holdingGuestIds.includes(guest.id) ?? false)
  );
  const holdingGuestIds = [...(activePlan?.holdingGuestIds ?? []), ...unplacedGuests.map((guest) => guest.id)];

  function handleShuffle() {
    if (guests.length === 0) {
      setCandidates([]);
      setActivePlan(null);
      return;
    }

    const nextCandidates = generatePlans({
      guests,
      constraints: validConstraints,
      count: 6
    });
    setCandidates(nextCandidates);
    setActivePlan(clonePlan(nextCandidates[0].plan));
    setSaveStatus("Generated, not saved");
  }

  function handleGuestTextChange(nextGuestText: string) {
    setGuestText(nextGuestText);
    setConstraints([]);
    setActivePlan(null);
    setCandidates([]);
    setImportWarnings([]);
    setImportError("");
    setSaveStatus("Guest list changed");
  }

  async function handleSpreadsheetUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const result = await spreadsheetFileToGuestText(file);
      handleGuestTextChange(result.guestText);
      setImportWarnings(result.warnings);
      setSaveStatus(`Imported ${result.importedCount} guest${result.importedCount === 1 ? "" : "s"}`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The spreadsheet could not be imported.");
      setSaveStatus("Import failed");
    }
  }

  function handleDataExport() {
    const backup = createPlannerBackup({
      guestText,
      constraints,
      activePlan
    });
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `table-planner-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setSaveStatus(`Exported ${constraints.length} pairing${constraints.length === 1 ? "" : "s"}`);
  }

  async function handleDataImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const imported = parsePlannerBackupJson(await readFileText(file));
      setGuestText(imported.guestText);
      setConstraints(imported.constraints);
      setActivePlan(imported.activePlan);
      setCandidates([]);
      setImportWarnings([]);
      setImportError("");
      setSaveStatus(`Imported data with ${imported.constraints.length} pairing${imported.constraints.length === 1 ? "" : "s"}`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The data file could not be imported.");
      setSaveStatus("Data import failed");
    }
  }

  function handleSave() {
    const state: PlannerData = {
      guestText,
      constraints: validConstraints,
      activePlan
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setSaveStatus(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  }

  function handlePrint() {
    window.print();
  }

  function handleResetPlan() {
    const nextPlan = createInitialPlan(guests.map((guest) => guest.id));
    setActivePlan(nextPlan);
    setCandidates([]);
    setSaveStatus("Reset, not saved");
  }

  function handleDropIntoSeat(seatId: number) {
    if (!draggedGuestId || !activePlan || activePlan.assignments[seatId]) {
      setDraggedGuestId(null);
      return;
    }

    setActivePlan(moveGuestToSeat(activePlan, draggedGuestId, seatId));
    setDraggedGuestId(null);
    setSaveStatus("Edited, not saved");
  }

  function handleDropIntoHolding() {
    if (!draggedGuestId || !activePlan) {
      setDraggedGuestId(null);
      return;
    }

    setActivePlan(moveGuestToHolding(activePlan, draggedGuestId));
    setDraggedGuestId(null);
    setSaveStatus("Edited, not saved");
  }

  const genderCounts = countGenders(guests);
  const hasTooManyGuests = guests.length > SEAT_IDS.length;

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <h1>Table Planner</h1>
          <p>{guests.length} guests for {SEAT_IDS.length} seats</p>
        </div>
        <div className="top-actions">
          <button className="primary-button" type="button" onClick={handleShuffle} disabled={guests.length === 0}>
            <Shuffle size={18} />
            Shuffle
          </button>
          <button type="button" onClick={handleResetPlan} disabled={guests.length === 0}>
            <RefreshCw size={18} />
            Reset
          </button>
          <button type="button" onClick={handleSave} disabled={!activePlan}>
            <Save size={18} />
            Save
          </button>
          <button type="button" onClick={handleDataExport} disabled={!guestText && constraints.length === 0 && !activePlan}>
            <FileDown size={18} />
            Export Data
          </button>
          <label className="file-upload-button top-upload-button">
            <FileUp size={18} />
            Import Data
            <input
              aria-label="Import planner data"
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              onChange={handleDataImport}
            />
          </label>
          <button type="button" onClick={handlePrint} disabled={!activePlan}>
            <Printer size={18} />
            Print
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="input-panel">
          <section className="panel-section">
            <div className="section-heading">
              <h2>Guests</h2>
              <div className="guest-actions">
                <label className="file-upload-button">
                  <Upload size={16} />
                  Upload
                  <input
                    aria-label="Upload spreadsheet"
                    className="visually-hidden"
                    type="file"
                    accept=".xlsx,.csv,.tsv,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={handleSpreadsheetUpload}
                  />
                </label>
                <button type="button" className="icon-text-button" onClick={() => handleGuestTextChange(PLACEHOLDER_GUESTS)}>
                  <Download size={16} />
                  Fill placeholders
                </button>
              </div>
            </div>
            <textarea
              aria-label="Guest list"
              className="guest-input"
              value={guestText}
              onChange={(event) => handleGuestTextChange(event.target.value)}
              placeholder={"Jane Smith, F\nSam Jones, M\nAlex Lee, Other\nPat Morgan"}
            />
            <div className="guest-meta">
              <span>{genderCounts.male} M</span>
              <span>{genderCounts.female} F</span>
              <span>{genderCounts.other} Other</span>
              <span>{genderCounts.unknown} unknown</span>
            </div>
            {hasTooManyGuests ? (
              <p className="warning-text">{guests.length - SEAT_IDS.length} guest(s) will start in holding.</p>
            ) : null}
            {importError ? <p className="warning-text">{importError}</p> : null}
            {importWarnings.map((warning) => (
              <p className="warning-text" key={warning}>{warning}</p>
            ))}
            {parseResult.warnings.map((warning) => (
              <p className="warning-text" key={warning}>{warning}</p>
            ))}
          </section>

          <PairEditor
            title="Good Adjacent"
            type="prefer_adjacent"
            guests={guests}
            constraints={constraints}
            onChange={(nextConstraints) => {
              setConstraints(nextConstraints);
              setSaveStatus("Constraints changed");
            }}
          />

          <PairEditor
            title="Avoid Adjacent"
            type="avoid_adjacent"
            guests={guests}
            constraints={constraints}
            onChange={(nextConstraints) => {
              setConstraints(nextConstraints);
              setSaveStatus("Constraints changed");
            }}
          />
        </aside>

        <section className="planner-surface">
          <div className="surface-toolbar">
            <div>
              <h2>Layout</h2>
              <p>{saveStatus}</p>
            </div>
            {activeScore ? <ScorePill score={activeScore.total} /> : null}
          </div>

          {activePlan ? (
            <div className="print-area">
              <TablePlan
                plan={activePlan}
                guestsById={guestsById}
                onDragStart={setDraggedGuestId}
                onDropIntoSeat={handleDropIntoSeat}
              />
              <HoldingArea
                guestIds={holdingGuestIds}
                guestsById={guestsById}
                onDragStart={setDraggedGuestId}
                onDropIntoHolding={handleDropIntoHolding}
              />
            </div>
          ) : (
            <div className="empty-state">
              <Users size={28} />
              <p>Enter guests and shuffle to generate seating plans.</p>
            </div>
          )}
        </section>

        <aside className="results-panel">
          <ScorePanel score={activeScore} guestsById={guestsById} />
          <CandidateList
            candidates={candidates}
            activePlan={activePlan}
            onSelect={(plan) => {
              setActivePlan(clonePlan(plan));
              setSaveStatus("Candidate selected, not saved");
            }}
          />
        </aside>
      </main>
    </div>
  );
}

interface PairEditorProps {
  title: string;
  type: ConstraintType;
  guests: Guest[];
  constraints: ConstraintPair[];
  onChange: (constraints: ConstraintPair[]) => void;
}

function PairEditor({ title, type, guests, constraints, onChange }: PairEditorProps) {
  const pairs = constraints.filter((pair) => pair.type === type);

  function addPair() {
    if (guests.length < 2) {
      return;
    }

    onChange([
      ...constraints,
      {
        id: `${type}-${crypto.randomUUID()}`,
        type,
        guestAId: guests[0].id,
        guestBId: guests[1].id
      }
    ]);
  }

  function updatePair(pairId: string, field: "guestAId" | "guestBId", value: string) {
    onChange(constraints.map((pair) => (pair.id === pairId ? { ...pair, [field]: value } : pair)));
  }

  function removePair(pairId: string) {
    onChange(constraints.filter((pair) => pair.id !== pairId));
  }

  return (
    <section className="panel-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <button type="button" className="icon-button" onClick={addPair} disabled={guests.length < 2} aria-label={`Add ${title} pair`}>
          <Plus size={18} />
        </button>
      </div>
      <div className="pair-list">
        {pairs.length === 0 ? <p className="muted-text">No pairs yet.</p> : null}
        {pairs.map((pair) => (
          <div className="pair-row" key={pair.id}>
            <select value={pair.guestAId} onChange={(event) => updatePair(pair.id, "guestAId", event.target.value)}>
              {guests.map((guest) => (
                <option value={guest.id} key={guest.id}>{guest.name}</option>
              ))}
            </select>
            <select value={pair.guestBId} onChange={(event) => updatePair(pair.id, "guestBId", event.target.value)}>
              {guests.map((guest) => (
                <option value={guest.id} key={guest.id}>{guest.name}</option>
              ))}
            </select>
            <button type="button" className="icon-button danger" onClick={() => removePair(pair.id)} aria-label="Remove pair">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

interface TablePlanProps {
  plan: Plan;
  guestsById: Map<string, Guest>;
  onDragStart: (guestId: string) => void;
  onDropIntoSeat: (seatId: number) => void;
}

function TablePlan({ plan, guestsById, onDragStart, onDropIntoSeat }: TablePlanProps) {
  return (
    <div className="table-plan" aria-label="Seating layout">
      {[1, 2].map((tableId) => (
        <div className="table-block" key={tableId}>
          <div className="table-label">Table {tableId}</div>
          <div className="table-grid">
            <div className="table-rectangle" />
            {SEATS.filter((seat) => seat.tableId === tableId).map((seat) => {
              const guestId = plan.assignments[seat.id];
              const guest = guestId ? guestsById.get(guestId) : undefined;

              return (
                <SeatCell
                  key={seat.id}
                  seatId={seat.id}
                  side={seat.side}
                  position={seat.position}
                  guest={guest}
                  occupied={Boolean(guestId)}
                  onDragStart={onDragStart}
                  onDropIntoSeat={onDropIntoSeat}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

interface SeatCellProps {
  seatId: number;
  side: string;
  position: number;
  guest?: Guest;
  occupied: boolean;
  onDragStart: (guestId: string) => void;
  onDropIntoSeat: (seatId: number) => void;
}

function SeatCell({ seatId, side, position, guest, occupied, onDragStart, onDropIntoSeat }: SeatCellProps) {
  const style = getSeatStyle(side, position);

  return (
    <div
      className={`seat-cell ${occupied ? "occupied" : "empty"}`}
      style={style}
      onDragOver={(event) => {
        if (!occupied) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropIntoSeat(seatId);
      }}
    >
      <div className="seat-number">{seatId}</div>
      {guest ? (
        <button
          type="button"
          className={`guest-chip ${getGenderClass(guest)}`}
          draggable
          onDragStart={() => onDragStart(guest.id)}
          title={`${guest.name}${guest.gender !== "Unknown" ? `, ${guest.gender}` : ""}`}
        >
          <GripVertical size={14} />
          <span>{getGuestLabel(guest.name)}</span>
        </button>
      ) : (
        <span className="empty-seat-label">Empty</span>
      )}
    </div>
  );
}

interface HoldingAreaProps {
  guestIds: string[];
  guestsById: Map<string, Guest>;
  onDragStart: (guestId: string) => void;
  onDropIntoHolding: () => void;
}

function HoldingArea({ guestIds, guestsById, onDragStart, onDropIntoHolding }: HoldingAreaProps) {
  return (
    <div
      className="holding-area"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDropIntoHolding();
      }}
    >
      <div className="holding-title">Holding Area</div>
      <div className="holding-list">
        {guestIds.length === 0 ? <span className="muted-text">Drag someone here to create an empty seat.</span> : null}
        {guestIds.map((guestId) => {
          const guest = guestsById.get(guestId);

          return guest ? (
            <button
              className={`guest-chip holding-chip ${getGenderClass(guest)}`}
              type="button"
              draggable
              onDragStart={() => onDragStart(guest.id)}
              key={guest.id}
              title={`${guest.name}${guest.gender !== "Unknown" ? `, ${guest.gender}` : ""}`}
            >
              <GripVertical size={14} />
              <span>{getGuestLabel(guest.name)}</span>
            </button>
          ) : null;
        })}
      </div>
    </div>
  );
}

interface ScorePanelProps {
  score: ScoreBreakdown | null;
  guestsById: Map<string, Guest>;
}

function ScorePanel({ score, guestsById }: ScorePanelProps) {
  if (!score) {
    return (
      <section className="panel-section">
        <h2>Score</h2>
        <p className="muted-text">No active plan.</p>
      </section>
    );
  }

  const missedGood = score.preferred.filter((result) => !result.adjacent).length;
  const badAdjacent = score.avoided.filter((result) => result.adjacent).length;

  return (
    <section className="panel-section score-panel">
      <div className="section-heading">
        <h2>Score</h2>
        <ScorePill score={score.total} />
      </div>
      <div className="metric-grid">
        <Metric label="Good pairs met" value={`${score.preferred.length - missedGood}/${score.preferred.length}`} />
        <Metric label="Bad adjacencies" value={String(badAdjacent)} tone={badAdjacent ? "bad" : "good"} />
        <Metric label="Gender points" value={String(score.genderPoints)} />
        <Metric label="Mixed adjacencies" value={String(score.mixedAdjacentPairs)} />
      </div>
      <div className="table-balance">
        {score.tableGender.map((table) => (
          <div key={table.tableId}>
            <span>Table {table.tableId}</span>
            <strong>{table.male} M / {table.female} F</strong>
          </div>
        ))}
      </div>
      <PairResults title="Missed good pairs" results={score.preferred.filter((result) => !result.adjacent)} guestsById={guestsById} />
      <PairResults title="Bad adjacent pairs" results={score.avoided.filter((result) => result.adjacent)} guestsById={guestsById} />
    </section>
  );
}

function PairResults({
  title,
  results,
  guestsById
}: {
  title: string;
  results: ScoreBreakdown["preferred"];
  guestsById: Map<string, Guest>;
}) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="pair-results">
      <h3>{title}</h3>
      {results.map((result) => {
        const guestA = guestsById.get(result.pair.guestAId);
        const guestB = guestsById.get(result.pair.guestBId);

        return (
          <p key={result.pair.id}>
            {guestA?.name ?? "Unknown"} / {guestB?.name ?? "Unknown"}
          </p>
        );
      })}
    </div>
  );
}

function CandidateList({
  candidates,
  activePlan,
  onSelect
}: {
  candidates: ScoredPlan[];
  activePlan: Plan | null;
  onSelect: (plan: Plan) => void;
}) {
  return (
    <section className="panel-section">
      <h2>Alternatives</h2>
      <div className="candidate-list">
        {candidates.length === 0 ? <p className="muted-text">Shuffle to compare options.</p> : null}
        {candidates.map((candidate, index) => (
          <button
            type="button"
            className={`candidate-button ${activePlan?.id === candidate.plan.id ? "active" : ""}`}
            onClick={() => onSelect(candidate.plan)}
            key={candidate.plan.id}
          >
            <span>Option {index + 1}</span>
            <strong>{candidate.score.total}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  return <span className="score-pill">{score}</span>;
}

function moveGuestToSeat(plan: Plan, guestId: string, seatId: number): Plan {
  const nextPlan = clonePlan(plan);

  for (const assignedSeatId of SEAT_IDS) {
    if (nextPlan.assignments[assignedSeatId] === guestId) {
      nextPlan.assignments[assignedSeatId] = null;
    }
  }

  nextPlan.holdingGuestIds = nextPlan.holdingGuestIds.filter((heldGuestId) => heldGuestId !== guestId);
  nextPlan.assignments[seatId] = guestId;

  return nextPlan;
}

function moveGuestToHolding(plan: Plan, guestId: string): Plan {
  const nextPlan = clonePlan(plan);

  for (const seatId of SEAT_IDS) {
    if (nextPlan.assignments[seatId] === guestId) {
      nextPlan.assignments[seatId] = null;
    }
  }

  if (!nextPlan.holdingGuestIds.includes(guestId)) {
    nextPlan.holdingGuestIds.push(guestId);
  }

  return nextPlan;
}

function clonePlan(plan: Plan): Plan {
  return {
    id: plan.id,
    assignments: { ...plan.assignments },
    holdingGuestIds: [...plan.holdingGuestIds]
  };
}

function countGenders(guests: Guest[]) {
  return guests.reduce(
    (counts, guest) => {
      if (guest.gender === "M") {
        counts.male += 1;
      } else if (guest.gender === "F") {
        counts.female += 1;
      } else if (guest.gender === "Other") {
        counts.other += 1;
      } else {
        counts.unknown += 1;
      }

      return counts;
    },
    { male: 0, female: 0, other: 0, unknown: 0 }
  );
}

function getGuestLabel(name: string): string {
  return name.trim().split(/\s+/, 1)[0] || name;
}

function getGenderClass(guest: Guest): string {
  if (guest.gender === "M") {
    return "gender-m";
  }

  if (guest.gender === "F") {
    return "gender-f";
  }

  return "";
}

function getSeatStyle(side: string, position: number) {
  if (side === "top") {
    return { gridColumn: `${position + 2}`, gridRow: "1" };
  }

  if (side === "bottom") {
    return { gridColumn: `${position + 2}`, gridRow: "3" };
  }

  if (side === "left-end") {
    return { gridColumn: "1", gridRow: "2" };
  }

  return { gridColumn: "11", gridRow: "2" };
}
