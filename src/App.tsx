import {
  AlertTriangle,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Download,
  FileDown,
  FileUp,
  GripVertical,
  Loader,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Shuffle,
  Trash2,
  Upload,
  Users
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPlannerBackup, parsePlannerBackupJson, type PlannerData } from "./domain/backup";
import { analyzeConstraints, type ConstraintAnalysis } from "./domain/constraintAnalysis";
import { readFileText } from "./domain/file";
import { buildSeatingLayout } from "./domain/seating";
import { createEmptyAssignments, createInitialPlan, scorePlan } from "./domain/scoring";
import { DEFAULT_EFFORT, EFFORT_LEVELS, generatePlans, type ScoredPlan } from "./domain/solver";
import { spreadsheetFileToGuestText } from "./domain/spreadsheet";
import {
  isHeadSeatConstraint,
  isPairConstraint,
  type Constraint,
  type HeadSeatConstraint,
  type PairConstraintType,
  type PairStrength,
  type ConstraintPair,
  type Guest,
  type Plan,
  type SavedLayout,
  type ScoreBreakdown,
  type SeatingLayout,
  type TableConfig,
  type VenueConfig
} from "./domain/types";
import { DEFAULT_VENUE_CONFIG } from "./domain/venueConfig";
import { parseGuestText } from "./domain/parser";

const STORAGE_KEY = "table-planner-state-v2";

const PLACEHOLDER_GUESTS = Array.from({ length: 39 }, (_, index) => {
  const gender = index % 3 === 0 ? ", F" : index % 3 === 1 ? ", M" : "";
  return `Guest ${index + 1}${gender}`;
}).join("\n");

export function App() {
  const [guestText, setGuestText] = useState("");
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [candidates, setCandidates] = useState<ScoredPlan[]>([]);
  const [draggedGuestId, setDraggedGuestId] = useState<string | null>(null);
  const [highlightedGuestId, setHighlightedGuestId] = useState<string | null>(null);
  const [isEditingGuests, setIsEditingGuests] = useState(false);
  const [isGuestPanelCollapsed, setIsGuestPanelCollapsed] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importError, setImportError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [effortLevel, setEffortLevel] = useState(DEFAULT_EFFORT);
  const [isShuffling, setIsShuffling] = useState(false);
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>([]);
  const [venueConfig, setVenueConfig] = useState<VenueConfig>(DEFAULT_VENUE_CONFIG);
  const [phase, setPhase] = useState<"setup" | "planning">("planning");
  const [leftPanelWidth, setLeftPanelWidth] = useState(310);
  const [isResizing, setIsResizing] = useState(false);

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
      setSavedLayouts(parsed.savedLayouts ?? []);
      if (parsed.venueConfig) setVenueConfig(parsed.venueConfig);
      setSaveStatus("Loaded");
    } catch {
      setSaveStatus("Could not load saved plan");
    }
  }, []);

  const parseResult = useMemo(() => parseGuestText(guestText), [guestText]);
  const guests = parseResult.guests;
  const guestsById = useMemo(() => new Map(guests.map((guest) => [guest.id, guest])), [guests]);
  const validConstraints = useMemo(
    () => constraints.filter((constraint) => isValidConstraint(constraint, guestsById)),
    [constraints, guestsById]
  );
  const layout = useMemo(() => buildSeatingLayout(venueConfig), [venueConfig]);

  // Auto-save 600ms after the last change. The cleanup cancels any pending
  // timer from a previous render, so rapid changes coalesce into one write.
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const state: PlannerData = { guestText, constraints: validConstraints, activePlan, savedLayouts, venueConfig };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSaveStatus(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    }, 600);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [guestText, validConstraints, activePlan, savedLayouts]);
  const activeScore = useMemo(
    () => (activePlan ? scorePlan(activePlan, guests, validConstraints, layout) : null),
    [activePlan, guests, validConstraints, layout]
  );
  const constraintAnalysis = useMemo(
    () => analyzeConstraints(guests, validConstraints),
    [guests, validConstraints]
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

  async function handleShuffle() {
    if (guests.length === 0) {
      setCandidates([]);
      setActivePlan(null);
      return;
    }

    setIsShuffling(true);
    // Yield two frames so React can commit the spinner before the blocking computation
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const { attempts, improveIterations } = EFFORT_LEVELS[effortLevel - 1];
    const nextCandidates = generatePlans({
      guests,
      constraints: validConstraints,
      layout,
      count: 6,
      attempts,
      improveIterations
    });
    setCandidates(nextCandidates);
    setActivePlan(clonePlan(nextCandidates[0].plan));
    setSaveStatus("Generated");
    setIsShuffling(false);
  }

  function handleGuestTextChange(nextGuestText: string, options: { resetDerivedState?: boolean } = {}) {
    const nextGuestIds = new Set(parseGuestText(nextGuestText).guests.map((guest) => guest.id));

    setGuestText(nextGuestText);

    if (options.resetDerivedState) {
      setConstraints([]);
      setActivePlan(null);
    } else {
      setConstraints((currentConstraints) =>
        currentConstraints.filter((constraint) => constraintGuestIdsExist(constraint, nextGuestIds))
      );
      setActivePlan((currentPlan) =>
        currentPlan ? reconcilePlanForGuestIds(currentPlan, nextGuestIds) : null
      );
    }

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
      handleGuestTextChange(result.guestText, { resetDerivedState: true });
      setImportWarnings(result.warnings);
      setIsEditingGuests(true);
      setSaveStatus(`Imported ${result.importedCount} guest${result.importedCount === 1 ? "" : "s"}`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The spreadsheet could not be imported.");
      setSaveStatus("Import failed");
    }
  }

  function handleSaveToLibrary() {
    if (!activePlan) return;
    const now = new Date();
    const name =
      now.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
      " " +
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setSavedLayouts((prev) => [
      { id: crypto.randomUUID(), name, savedAt: now.toISOString(), plan: clonePlan(activePlan), scoreTotal: activeScore?.total ?? 0 },
      ...prev
    ]);
    setSaveStatus("Saved to library");
  }

  function handleDataExport() {
    const backup = createPlannerBackup({
      guestText,
      constraints,
      activePlan,
      savedLayouts
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
    setSaveStatus(`Exported ${constraints.length} constraint${constraints.length === 1 ? "" : "s"}`);
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
      setSavedLayouts(imported.savedLayouts ?? []);
      setIsEditingGuests(true);
      setSaveStatus(`Imported data with ${imported.constraints.length} constraint${imported.constraints.length === 1 ? "" : "s"}`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The data file could not be imported.");
      setSaveStatus("Data import failed");
    }
  }

  function handlePrint() {
    window.print();
  }

  function startPanelResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftPanelWidth;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMouseMove(ev: MouseEvent) {
      setLeftPanelWidth(Math.max(0, Math.min(600, startWidth + (ev.clientX - startX))));
    }
    function onMouseUp() {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function handleResetPlan() {
    const nextPlan = createInitialPlan(guests.map((guest) => guest.id), layout);
    setActivePlan(nextPlan);
    setCandidates([]);
    setSaveStatus("Plan reset");
  }

  function handleDropIntoSeat(seatId: number) {
    if (!draggedGuestId || !activePlan || activePlan.assignments[seatId]) {
      setDraggedGuestId(null);
      return;
    }

    setActivePlan(moveGuestToSeat(activePlan, draggedGuestId, seatId));
    setDraggedGuestId(null);
    setSaveStatus("Plan edited");
  }

  function handleDropIntoHolding() {
    if (!draggedGuestId || !activePlan) {
      setDraggedGuestId(null);
      return;
    }

    setActivePlan(moveGuestToHolding(activePlan, draggedGuestId));
    setDraggedGuestId(null);
    setSaveStatus("Plan edited");
  }

  const genderCounts = countGenders(guests);
  const hasTooManyGuests = guests.length > layout.seatIds.length;
  const hasSaveableData = Boolean(guestText.trim() || constraints.length > 0 || activePlan || savedLayouts.length > 0);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <h1>Table Planner</h1>
          <p>{guests.length} guests for {layout.seatIds.length} seats</p>
        </div>
        <div className="top-actions">
          <button type="button" onClick={() => setPhase(phase === "setup" ? "planning" : "setup")}>
            {phase === "setup" ? "← Back to plan" : "Table setup"}
          </button>
          <label className="effort-control">
            <span>Effort</span>
            <input
              type="range"
              className="effort-slider"
              min={1}
              max={EFFORT_LEVELS.length}
              value={effortLevel}
              onChange={(e) => setEffortLevel(Number(e.target.value))}
            />
            <span className="effort-value">{effortLevel}</span>
          </label>
          <button className="primary-button" type="button" onClick={handleShuffle} disabled={guests.length === 0 || isShuffling}>
            {isShuffling ? <Loader size={18} className="spinning" /> : <Shuffle size={18} />}
            {isShuffling ? "Shuffling…" : "Shuffle"}
          </button>
          <button type="button" onClick={handleResetPlan} disabled={guests.length === 0}>
            <RefreshCw size={18} />
            Reset
          </button>
          <button type="button" onClick={handleDataExport} disabled={!hasSaveableData}>
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

      {phase === "setup" && (
        <VenueSetup
          config={venueConfig}
          onConfirm={(nextConfig) => {
            setVenueConfig(nextConfig);
            setActivePlan(null);
            setSavedLayouts([]);
            setPhase("planning");
          }}
        />
      )}

      <main className="workspace" style={{ "--left-panel-width": `${leftPanelWidth}px`, display: phase === "setup" ? "none" : undefined } as React.CSSProperties}>
        <div
          className={`panel-resize-handle${isResizing ? " resizing" : ""}`}
          style={{ left: `calc(1.5rem + ${leftPanelWidth}px)` }}
          onMouseDown={startPanelResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize guest panel"
        >
          <div className="panel-resize-pill">
            <GripVertical size={12} />
          </div>
        </div>
        <aside className="input-panel">
          <section className="panel-section">
            <div className="section-heading">
              <h2>Guests</h2>
              <div className="guest-actions">
                <label className="file-upload-button icon-text-button">
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
                {!isGuestPanelCollapsed && (isEditingGuests ? (
                  <>
                    <button type="button" className="icon-text-button" onClick={() => handleGuestTextChange(PLACEHOLDER_GUESTS, { resetDerivedState: true })}>
                      <Download size={16} />
                      Fill
                    </button>
                    <button type="button" className="icon-text-button" onClick={() => setIsEditingGuests(false)}>
                      <Save size={16} />
                      Save
                    </button>
                  </>
                ) : (
                  <button type="button" className="icon-text-button" onClick={() => setIsEditingGuests(true)}>
                    <Pencil size={16} />
                    Edit
                  </button>
                ))}
                <button type="button" className="icon-button" onClick={() => setIsGuestPanelCollapsed((c) => !c)} aria-label={isGuestPanelCollapsed ? "Expand guest list" : "Collapse guest list"}>
                  {isGuestPanelCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </button>
              </div>
            </div>
            {!isGuestPanelCollapsed && (
              <>
                {isEditingGuests ? (
                  <textarea
                    aria-label="Guest list"
                    className="guest-input"
                    value={guestText}
                    onChange={(event) => handleGuestTextChange(event.target.value)}
                    placeholder={"Jane Smith, F\nSam Jones, M\nAlex Lee, Other\nPat Morgan"}
                  />
                ) : (
                  <GuestList guests={guests} constraints={validConstraints} onGuestHighlight={setHighlightedGuestId} />
                )}
                <div className="guest-meta">
                  <span>{genderCounts.male} M</span>
                  <span>{genderCounts.female} F</span>
                  <span>{genderCounts.other} Other</span>
                  <span>{genderCounts.unknown} unknown</span>
                </div>
                {hasTooManyGuests ? (
                  <p className="warning-text">{guests.length - layout.seatIds.length} guest(s) will start in holding.</p>
                ) : null}
                {importError ? <p className="warning-text">{importError}</p> : null}
                {importWarnings.map((warning) => (
                  <p className="warning-text" key={warning}>{warning}</p>
                ))}
                {parseResult.warnings.map((warning) => (
                  <p className="warning-text" key={warning}>{warning}</p>
                ))}
              </>
            )}
          </section>

          <PairEditor
            title="Good Adjacent"
            type="prefer_adjacent"
            showStrength
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

          <HeadSeatEditor
            guests={guests}
            constraints={constraints}
            onChange={(nextConstraints) => {
              setConstraints(nextConstraints);
              setSaveStatus("Constraints changed");
            }}
          />

          <ConstraintAnalysisPanel
            analysis={constraintAnalysis}
            guestsById={guestsById}
            onGuestHighlight={setHighlightedGuestId}
          />
        </aside>

        <section className="planner-surface">
          <div className="surface-toolbar">
            <div>
              <h2>Layout</h2>
              <p>{saveStatus}</p>
            </div>
            <div className="surface-toolbar-right">
              {activePlan && (
                <button type="button" className="icon-text-button" onClick={handleSaveToLibrary}>
                  <Bookmark size={15} />
                  Save to library
                </button>
              )}
              {activeScore ? <ScorePill score={activeScore.total} /> : null}
            </div>
          </div>

          {activePlan ? (
            <div className="print-area">
              <TablePlan
                plan={activePlan}
                layout={layout}
                guestsById={guestsById}
                highlightedGuestId={highlightedGuestId}
                onDragStart={setDraggedGuestId}
                onDropIntoSeat={handleDropIntoSeat}
              />
              <HoldingArea
                guestIds={holdingGuestIds}
                guestsById={guestsById}
                highlightedGuestId={highlightedGuestId}
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
          <ScorePanel
            score={activeScore}
            guestsById={guestsById}
            onGuestHighlight={setHighlightedGuestId}
          />
          <CandidateList
            candidates={candidates}
            activePlan={activePlan}
            onSelect={(plan) => {
              setActivePlan(clonePlan(plan));
              setSaveStatus("Candidate selected");
            }}
          />
          <LibraryPanel
            savedLayouts={savedLayouts}
            activePlanId={activePlan?.id ?? null}
            onLoad={(plan) => {
              setActivePlan(clonePlan(plan));
              setSaveStatus("Loaded from library");
            }}
            onDelete={(id) => setSavedLayouts((prev) => prev.filter((l) => l.id !== id))}
            onRename={(id, name) => setSavedLayouts((prev) => prev.map((l) => l.id === id ? { ...l, name } : l))}
          />
        </aside>
      </main>
    </div>
  );
}

function ConstraintAnalysisPanel({
  analysis,
  guestsById,
  onGuestHighlight,
}: {
  analysis: ConstraintAnalysis;
  guestsById: Map<string, Guest>;
  onGuestHighlight: (guestId: string | null) => void;
}) {
  if (!analysis.hasAnyIssue) return null;

  return (
    <section className="panel-section constraint-analysis-panel">
      <div className="section-heading">
        <h2>Constraint Conflicts</h2>
        <AlertTriangle size={15} className="conflict-icon" />
      </div>

      {analysis.overloadedGuests.map((overload) => {
        const guest = guestsById.get(overload.guestId);
        if (!guest) return null;
        const badgeTone = overload.strength === "high" ? "high" : "mid";
        return (
          <div key={overload.guestId} className="analysis-warning">
            <p className="analysis-warning-title">
              <PairResultName guest={guest} onGuestHighlight={onGuestHighlight} />
              {" "}has {overload.constraintCount}{" "}
              <span className={`constraint-badge constraint-badge-${badgeTone}`}>{overload.strength}</span>
              {" "}constraints — at most {overload.maxSatisfiable} can be satisfied
            </p>
            <div className="analysis-partner-list">
              {overload.pairs.map((pair) => {
                const otherId = pair.guestAId === overload.guestId ? pair.guestBId : pair.guestAId;
                const other = guestsById.get(otherId);
                const strength = pair.strength ?? "medium";
                const tone = strength === "high" ? "high" : strength === "medium" ? "mid" : "low";
                return (
                  <span key={pair.id} className="analysis-partner-chip">
                    <PairResultName guest={other} onGuestHighlight={onGuestHighlight} />
                    <span className={`constraint-badge constraint-badge-${tone}`}>{strength}</span>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}

      {analysis.crossClusterPairs.length > 0 && (
        <div className="analysis-warning">
          <p className="analysis-warning-title">
            At-risk pairs — these guests belong to competing high-priority groups and will likely end up at different tables:
          </p>
          {analysis.crossClusterPairs.map(({ pair }) => {
            const guestA = guestsById.get(pair.guestAId);
            const guestB = guestsById.get(pair.guestBId);
            const strength = pair.strength ?? "medium";
            const tone = strength === "high" ? "high" : strength === "medium" ? "mid" : "low";
            return (
              <p key={pair.id} className="analysis-cross-pair">
                <PairResultName guest={guestA} onGuestHighlight={onGuestHighlight} />
                <span aria-hidden="true"> / </span>
                <PairResultName guest={guestB} onGuestHighlight={onGuestHighlight} />
                <span className={`constraint-badge constraint-badge-${tone}`}>{strength}</span>
              </p>
            );
          })}
        </div>
      )}
    </section>
  );
}

function GuestList({
  guests,
  constraints,
  onGuestHighlight
}: {
  guests: Guest[];
  constraints: Constraint[];
  onGuestHighlight: (guestId: string | null) => void;
}) {
  if (guests.length === 0) {
    return <p className="muted-text">No guests yet. Click Edit to add guests.</p>;
  }

  const counts = new Map<string, number>();
  for (const c of constraints) {
    if (isPairConstraint(c)) {
      counts.set(c.guestAId, (counts.get(c.guestAId) ?? 0) + 1);
      counts.set(c.guestBId, (counts.get(c.guestBId) ?? 0) + 1);
    } else if (isHeadSeatConstraint(c)) {
      counts.set(c.guestId, (counts.get(c.guestId) ?? 0) + 1);
    }
  }

  const sorted = [...guests].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="guest-list-view">
      {sorted.map((guest) => {
        const count = counts.get(guest.id) ?? 0;
        const badgeTone = count >= 3 ? "high" : count === 2 ? "mid" : "low";
        return (
          <button
            key={guest.id}
            className="guest-list-name"
            type="button"
            onMouseEnter={() => onGuestHighlight(guest.id)}
            onMouseLeave={() => onGuestHighlight(null)}
            onFocus={() => onGuestHighlight(guest.id)}
            onBlur={() => onGuestHighlight(null)}
          >
            <span>{guest.name}</span>
            {count > 0 && (
              <span
                className={`constraint-badge constraint-badge-${badgeTone}`}
                title={`${count} constraint${count === 1 ? "" : "s"}`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const STRENGTH_LABELS: Record<PairStrength, string> = { high: "High", medium: "Med", low: "Low" };

interface PairEditorProps {
  title: string;
  type: PairConstraintType;
  guests: Guest[];
  constraints: Constraint[];
  showStrength?: boolean;
  onChange: (constraints: Constraint[]) => void;
}

function PairEditor({ title, type, guests, constraints, showStrength, onChange }: PairEditorProps) {
  const pairs = constraints.filter(
    (constraint): constraint is ConstraintPair => isPairConstraint(constraint) && constraint.type === type
  );

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
        guestBId: guests[1].id,
        ...(showStrength ? { strength: "medium" as PairStrength } : {})
      }
    ]);
  }

  function updatePair(pairId: string, field: "guestAId" | "guestBId" | "strength", value: string) {
    onChange(
      constraints.map((constraint) =>
        isPairConstraint(constraint) && constraint.id === pairId ? { ...constraint, [field]: value } : constraint
      )
    );
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
        {pairs.map((pair) => {
          const conflict = constraints.some(
            (c) =>
              isPairConstraint(c) &&
              c.type !== type &&
              ((c.guestAId === pair.guestAId && c.guestBId === pair.guestBId) ||
               (c.guestAId === pair.guestBId && c.guestBId === pair.guestAId))
          );
          const strength: PairStrength = pair.strength ?? "medium";
          return (
            <div className={`pair-row${showStrength ? " has-strength" : ""}`} key={pair.id}>
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
              {showStrength && (
                <div className="strength-toggle" role="group" aria-label="Pair strength">
                  {(["high", "medium", "low"] as PairStrength[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`strength-btn${strength === s ? " active" : ""}`}
                      onClick={() => updatePair(pair.id, "strength", s)}
                      title={s === "high" ? "Direct neighbours only" : s === "medium" ? "Direct or opposite" : "Any adjacency"}
                    >
                      {STRENGTH_LABELS[s]}
                    </button>
                  ))}
                </div>
              )}
              {conflict
                ? <span title="This pair also appears in the opposite constraint list"><AlertTriangle size={15} className="conflict-icon" /></span>
                : <span />}
              <button type="button" className="icon-button danger" onClick={() => removePair(pair.id)} aria-label="Remove pair">
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface HeadSeatEditorProps {
  guests: Guest[];
  constraints: Constraint[];
  onChange: (constraints: Constraint[]) => void;
}

function HeadSeatEditor({ guests, constraints, onChange }: HeadSeatEditorProps) {
  const headConstraints = constraints.filter(isHeadSeatConstraint);

  function addConstraint() {
    if (guests.length === 0) {
      return;
    }

    onChange([
      ...constraints,
      {
        id: `head-${crypto.randomUUID()}`,
        type: "prefer_head",
        guestId: guests[0].id
      }
    ]);
  }

  function updateConstraint(
    constraintId: string,
    field: "guestId" | "type",
    value: HeadSeatConstraint["guestId"] | HeadSeatConstraint["type"]
  ) {
    onChange(
      constraints.map((constraint) =>
        isHeadSeatConstraint(constraint) && constraint.id === constraintId
          ? { ...constraint, [field]: value }
          : constraint
      )
    );
  }

  function removeConstraint(constraintId: string) {
    onChange(constraints.filter((constraint) => constraint.id !== constraintId));
  }

  return (
    <section className="panel-section">
      <div className="section-heading">
        <h2>Head Seats</h2>
        <button type="button" className="icon-button" onClick={addConstraint} disabled={guests.length === 0} aria-label="Add Head Seats constraint">
          <Plus size={18} />
        </button>
      </div>
      <div className="pair-list">
        {headConstraints.length === 0 ? <p className="muted-text">No constraints yet.</p> : null}
        {headConstraints.map((constraint) => (
          <div className="head-row" key={constraint.id}>
            <select value={constraint.guestId} onChange={(event) => updateConstraint(constraint.id, "guestId", event.target.value)}>
              {guests.map((guest) => (
                <option value={guest.id} key={guest.id}>{guest.name}</option>
              ))}
            </select>
            <select value={constraint.type} onChange={(event) => updateConstraint(constraint.id, "type", event.target.value as HeadSeatConstraint["type"])}>
              <option value="prefer_head">Prefer head</option>
              <option value="avoid_head">Avoid head</option>
            </select>
            <button type="button" className="icon-button danger" onClick={() => removeConstraint(constraint.id)} aria-label="Remove head-seat constraint">
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
  layout: SeatingLayout;
  guestsById: Map<string, Guest>;
  highlightedGuestId: string | null;
  onDragStart: (guestId: string) => void;
  onDropIntoSeat: (seatId: number) => void;
}

function TablePlan({ plan, layout, guestsById, highlightedGuestId, onDragStart, onDropIntoSeat }: TablePlanProps) {
  return (
    <div className="table-plan" aria-label="Seating layout">
      {layout.tableIds.map((tableId) => {
        const config = layout.tableConfigs.get(tableId)!;
        const tableSeats = layout.seats.filter((s) => s.tableId === tableId);
        const label = config.label ?? `Table ${tableId}`;

        if (config.kind === "circular") {
          return (
            <div className="table-block" key={tableId}>
              <div className="table-label">{label}</div>
              <CircularTableBlock
                seats={tableSeats}
                totalSeats={config.seats}
                plan={plan}
                guestsById={guestsById}
                highlightedGuestId={highlightedGuestId}
                onDragStart={onDragStart}
                onDropIntoSeat={onDropIntoSeat}
              />
            </div>
          );
        }

        const seatsPerSide = config.seatsPerSide;
        const hasLeft = config.leftEnd;
        const hasRight = config.rightEnd;
        const colCount = seatsPerSide + (hasLeft ? 1 : 0) + (hasRight ? 1 : 0);
        const sideColStart = hasLeft ? 2 : 1;
        const gridTemplateColumns = [
          hasLeft ? "4.5rem" : "",
          `repeat(${seatsPerSide}, minmax(4.35rem, 1fr))`,
          hasRight ? "4.5rem" : ""
        ].filter(Boolean).join(" ");
        const rectColEnd = sideColStart + seatsPerSide;

        return (
          <div className="table-block" key={tableId}>
            <div className="table-label">{label}</div>
            <div className="table-grid" style={{ gridTemplateColumns }}>
              <div className="table-rectangle" style={{ gridColumn: `${sideColStart} / ${rectColEnd}`, gridRow: "2" }} />
              {tableSeats.map((seat) => {
                const guestId = plan.assignments[seat.id];
                const guest = guestId ? guestsById.get(guestId) : undefined;

                return (
                  <SeatCell
                    key={seat.id}
                    seatId={seat.id}
                    side={seat.side}
                    position={seat.position}
                    seatsPerSide={seatsPerSide}
                    hasLeftEnd={hasLeft}
                    guest={guest}
                    occupied={Boolean(guestId)}
                    highlighted={Boolean(guest && guest.id === highlightedGuestId)}
                    onDragStart={onDragStart}
                    onDropIntoSeat={onDropIntoSeat}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface CircularTableBlockProps {
  seats: { id: number; position: number }[];
  totalSeats: number;
  plan: Plan;
  guestsById: Map<string, Guest>;
  highlightedGuestId: string | null;
  onDragStart: (guestId: string) => void;
  onDropIntoSeat: (seatId: number) => void;
}

function CircularTableBlock({ seats, totalSeats, plan, guestsById, highlightedGuestId, onDragStart, onDropIntoSeat }: CircularTableBlockProps) {
  const size = 340;
  const cx = size / 2;
  const cy = size / 2;
  const tableR = 55;
  const seatR = size / 2 - 42;

  return (
    <svg width={size} height={size} className="circular-table-svg" viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={tableR} fill="white" stroke="#40484f" strokeWidth={2} />
      {seats.map((seat) => {
        const angle = (2 * Math.PI * seat.position) / totalSeats - Math.PI / 2;
        const x = cx + seatR * Math.cos(angle);
        const y = cy + seatR * Math.sin(angle);
        const guestId = plan.assignments[seat.id];
        const guest = guestId ? guestsById.get(guestId) : undefined;

        return (
          <foreignObject key={seat.id} x={x - 38} y={y - 30} width={76} height={60}>
            <SeatCell
              seatId={seat.id}
              side="circular"
              position={seat.position}
              seatsPerSide={0}
              hasLeftEnd={false}
              guest={guest}
              occupied={Boolean(guestId)}
              highlighted={Boolean(guest && guest.id === highlightedGuestId)}
              onDragStart={onDragStart}
              onDropIntoSeat={onDropIntoSeat}
            />
          </foreignObject>
        );
      })}
    </svg>
  );
}

interface SeatCellProps {
  seatId: number;
  side: string;
  position: number;
  seatsPerSide: number;
  hasLeftEnd: boolean;
  guest?: Guest;
  occupied: boolean;
  highlighted: boolean;
  onDragStart: (guestId: string) => void;
  onDropIntoSeat: (seatId: number) => void;
}

function SeatCell({ seatId, side, position, seatsPerSide, hasLeftEnd, guest, occupied, highlighted, onDragStart, onDropIntoSeat }: SeatCellProps) {
  const style = getSeatStyle(side, position, seatsPerSide, hasLeftEnd);

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
          className={`guest-chip ${getGenderClass(guest)}${highlighted ? " highlighted" : ""}`}
          draggable
          onDragStart={() => onDragStart(guest.id)}
          title={`${guest.name}${guest.gender !== "Unknown" ? `, ${guest.gender}` : ""}`}
        >
          <GripVertical size={14} />
          <span>{getGuestLabel(guest.name)}</span>
          {getGuestSurname(guest.name) && (
            <span className="print-surname">{getGuestSurname(guest.name)}</span>
          )}
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
  highlightedGuestId: string | null;
  onDragStart: (guestId: string) => void;
  onDropIntoHolding: () => void;
}

function HoldingArea({ guestIds, guestsById, highlightedGuestId, onDragStart, onDropIntoHolding }: HoldingAreaProps) {
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
              className={`guest-chip holding-chip ${getGenderClass(guest)}${guest.id === highlightedGuestId ? " highlighted" : ""}`}
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
  onGuestHighlight: (guestId: string | null) => void;
}

function ScorePanel({ score, guestsById, onGuestHighlight }: ScorePanelProps) {
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
  const missedHeadSeat = score.headSeat.filter((result) => !result.satisfied).length;

  return (
    <section className="panel-section score-panel">
      <div className="section-heading">
        <h2>Score</h2>
        <ScorePill score={score.total} />
      </div>
      <div className="metric-grid">
        <Metric label="Good pairs met" value={`${score.preferred.length - missedGood}/${score.preferred.length}`} />
        <Metric label="Bad adjacencies" value={String(badAdjacent)} tone={badAdjacent ? "bad" : "good"} />
        <Metric label="Head constraints" value={`${score.headSeat.length - missedHeadSeat}/${score.headSeat.length}`} tone={missedHeadSeat ? "bad" : "good"} />
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
      <PairResults
        title="Missed good pairs"
        results={score.preferred.filter((result) => !result.adjacent)}
        guestsById={guestsById}
        onGuestHighlight={onGuestHighlight}
      />
      <PairResults
        title="Bad adjacent pairs"
        results={score.avoided.filter((result) => result.adjacent)}
        guestsById={guestsById}
      />
      <HeadSeatResults
        results={score.headSeat.filter((result) => !result.satisfied)}
        guestsById={guestsById}
        onGuestHighlight={onGuestHighlight}
      />
    </section>
  );
}

function PairResults({
  title,
  results,
  guestsById,
  onGuestHighlight
}: {
  title: string;
  results: ScoreBreakdown["preferred"];
  guestsById: Map<string, Guest>;
  onGuestHighlight?: (guestId: string | null) => void;
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

        const strength = result.pair.strength;
        const badgeTone = strength === "high" ? "high" : strength === "medium" ? "mid" : strength === "low" ? "low" : null;

        return (
          <p key={result.pair.id}>
            <PairResultName guest={guestA} onGuestHighlight={onGuestHighlight} />
            <span aria-hidden="true"> / </span>
            <PairResultName guest={guestB} onGuestHighlight={onGuestHighlight} />
            {badgeTone && (
              <span className={`constraint-badge constraint-badge-${badgeTone}`}>
                {strength}
              </span>
            )}
          </p>
        );
      })}
    </div>
  );
}

function HeadSeatResults({
  results,
  guestsById,
  onGuestHighlight
}: {
  results: ScoreBreakdown["headSeat"];
  guestsById: Map<string, Guest>;
  onGuestHighlight: (guestId: string | null) => void;
}) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="pair-results">
      <h3>Head seat issues</h3>
      {results.map((result) => {
        const guest = guestsById.get(result.constraint.guestId);
        const label = result.constraint.type === "prefer_head" ? "wants a head seat" : "should avoid head seats";

        return (
          <p key={result.constraint.id}>
            <PairResultName guest={guest} onGuestHighlight={onGuestHighlight} />
            <span> {label}</span>
          </p>
        );
      })}
    </div>
  );
}

function PairResultName({
  guest,
  onGuestHighlight
}: {
  guest?: Guest;
  onGuestHighlight?: (guestId: string | null) => void;
}) {
  if (!guest || !onGuestHighlight) {
    return <span>{guest?.name ?? "Unknown"}</span>;
  }

  return (
    <button
      className="pair-result-name"
      type="button"
      onBlur={() => onGuestHighlight(null)}
      onFocus={() => onGuestHighlight(guest.id)}
      onMouseEnter={() => onGuestHighlight(guest.id)}
      onMouseLeave={() => onGuestHighlight(null)}
    >
      {guest.name}
    </button>
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

function LibraryPanel({
  savedLayouts,
  activePlanId,
  onLoad,
  onDelete,
  onRename
}: {
  savedLayouts: SavedLayout[];
  activePlanId: string | null;
  onLoad: (plan: Plan) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  function startEditing(layout: SavedLayout) {
    setEditingId(layout.id);
    setEditingName(layout.name);
  }

  function commitEdit() {
    if (editingId && editingName.trim()) {
      onRename(editingId, editingName.trim());
    }
    setEditingId(null);
  }

  return (
    <section className="panel-section">
      <h2>Library</h2>
      <div className="library-list">
        {savedLayouts.length === 0
          ? <p className="muted-text">Save a layout to build up options to compare.</p>
          : null}
        {savedLayouts.map((layout) => (
          <div className={`library-entry${layout.plan.id === activePlanId ? " active" : ""}`} key={layout.id}>
            <div className="library-entry-info">
              {editingId === layout.id ? (
                <input
                  className="library-name-input"
                  value={editingName}
                  autoFocus
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <button
                  className="library-name"
                  type="button"
                  title="Click to rename"
                  onClick={() => startEditing(layout)}
                >
                  {layout.name}
                </button>
              )}
              <span className="library-score">{layout.scoreTotal}</span>
            </div>
            <div className="library-entry-actions">
              <button
                type="button"
                className="icon-text-button"
                onClick={() => onLoad(layout.plan)}
                disabled={layout.plan.id === activePlanId}
              >
                Load
              </button>
              <button
                type="button"
                className="icon-button danger"
                onClick={() => onDelete(layout.id)}
                aria-label="Delete saved layout"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
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

  for (const assignedSeatId of Object.keys(nextPlan.assignments).map(Number)) {
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

  for (const seatId of Object.keys(nextPlan.assignments).map(Number)) {
    if (nextPlan.assignments[seatId] === guestId) {
      nextPlan.assignments[seatId] = null;
    }
  }

  if (!nextPlan.holdingGuestIds.includes(guestId)) {
    nextPlan.holdingGuestIds.push(guestId);
  }

  return nextPlan;
}

function isValidConstraint(constraint: Constraint, guestsById: Map<string, Guest>): boolean {
  if (isPairConstraint(constraint)) {
    return (
      constraint.guestAId !== constraint.guestBId &&
      guestsById.has(constraint.guestAId) &&
      guestsById.has(constraint.guestBId)
    );
  }

  return guestsById.has(constraint.guestId);
}

function constraintGuestIdsExist(constraint: Constraint, guestIds: Set<string>): boolean {
  if (isPairConstraint(constraint)) {
    return guestIds.has(constraint.guestAId) && guestIds.has(constraint.guestBId);
  }

  return guestIds.has(constraint.guestId);
}

function reconcilePlanForGuestIds(plan: Plan, guestIds: Set<string>): Plan | null {
  if (guestIds.size === 0) {
    return null;
  }

  const nextPlan = clonePlan(plan);
  const assignedGuestIds = new Set<string>();

  for (const seatId of Object.keys(nextPlan.assignments).map(Number)) {
    const guestId = nextPlan.assignments[seatId];

    if (!guestId || !guestIds.has(guestId)) {
      nextPlan.assignments[seatId] = null;
      continue;
    }

    assignedGuestIds.add(guestId);
  }

  nextPlan.holdingGuestIds = nextPlan.holdingGuestIds.filter(
    (guestId) => guestIds.has(guestId) && !assignedGuestIds.has(guestId)
  );

  const holdingGuestIds = new Set(nextPlan.holdingGuestIds);
  for (const guestId of guestIds) {
    if (!assignedGuestIds.has(guestId) && !holdingGuestIds.has(guestId)) {
      nextPlan.holdingGuestIds.push(guestId);
    }
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

function getGuestSurname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(1).join(" ");
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

interface VenueSetupProps {
  config: VenueConfig;
  onConfirm: (config: VenueConfig) => void;
}

function VenueSetup({ config, onConfirm }: VenueSetupProps) {
  const [tables, setTables] = useState<TableConfig[]>(config.tables);
  let nextId = Math.max(0, ...tables.map((t) => t.id)) + 1;

  function addRect() {
    setTables([...tables, { kind: "rect", id: nextId++, label: `Table ${nextId - 1}`, seatsPerSide: 9, leftEnd: false, rightEnd: true }]);
  }

  function addCircular() {
    setTables([...tables, { kind: "circular", id: nextId++, label: `Table ${nextId - 1}`, seats: 8 }]);
  }

  function removeTable(id: number) {
    setTables(tables.filter((t) => t.id !== id));
  }

  function updateTable(updated: TableConfig) {
    setTables(tables.map((t) => t.id === updated.id ? updated : t));
  }

  return (
    <div className="venue-setup">
      <h2>Table setup</h2>
      <p className="venue-setup-hint">Changing the layout will clear the current plan and saved layouts.</p>
      <div className="venue-setup-tables">
        {tables.map((table) => (
          <div className="venue-setup-table" key={table.id}>
            <div className="venue-setup-table-header">
              <input
                className="venue-setup-label-input"
                value={table.label ?? ""}
                onChange={(e) => updateTable({ ...table, label: e.target.value })}
                placeholder="Table name"
              />
              <span className="venue-setup-kind">{table.kind === "rect" ? "Long table" : "Circular"}</span>
              <button type="button" onClick={() => removeTable(table.id)} aria-label="Remove table"><Trash2 size={14} /></button>
            </div>
            {table.kind === "rect" ? (
              <div className="venue-setup-table-fields">
                <label>
                  Seats per side
                  <input type="number" min={1} max={20} value={table.seatsPerSide}
                    onChange={(e) => updateTable({ ...table, seatsPerSide: Math.max(1, Math.min(20, Number(e.target.value))) })} />
                </label>
                <label>
                  <input type="checkbox" checked={table.leftEnd}
                    onChange={(e) => updateTable({ ...table, leftEnd: e.target.checked })} />
                  Head seat (left end)
                </label>
                <label>
                  <input type="checkbox" checked={table.rightEnd}
                    onChange={(e) => updateTable({ ...table, rightEnd: e.target.checked })} />
                  Head seat (right end)
                </label>
              </div>
            ) : (
              <div className="venue-setup-table-fields">
                <label>
                  Seats
                  <input type="number" min={3} max={30} value={table.seats}
                    onChange={(e) => updateTable({ ...table, seats: Math.max(3, Math.min(30, Number(e.target.value))) })} />
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="venue-setup-actions">
        <button type="button" onClick={addRect}><Plus size={14} /> Long table</button>
        <button type="button" onClick={addCircular}><Plus size={14} /> Circular table</button>
        <button
          type="button"
          className="primary-button"
          disabled={tables.length === 0}
          onClick={() => onConfirm({ tables })}
        >
          Confirm layout →
        </button>
      </div>
    </div>
  );
}

function getSeatStyle(side: string, position: number, seatsPerSide: number, hasLeftEnd: boolean) {
  const colOffset = hasLeftEnd ? 2 : 1;

  if (side === "top") return { gridColumn: `${position + colOffset}`, gridRow: "1" };
  if (side === "bottom") return { gridColumn: `${position + colOffset}`, gridRow: "3" };
  if (side === "left-end") return { gridColumn: "1", gridRow: "2" };
  if (side === "right-end") return { gridColumn: `${seatsPerSide + colOffset}`, gridRow: "2" };

  return {};
}
