import { AlertTriangle, Bookmark, ChevronDown, FileDown, FileUp, GripVertical, Loader, Pencil, Plus, Printer, RefreshCw, Shuffle, Trash2, Upload, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPlannerBackup, parsePlannerBackupJson, type PlannerData } from "./domain/backup";
import { analyzeConstraints, type ConstraintAnalysis } from "./domain/constraintAnalysis";
import { readFileText } from "./domain/file";
import { buildSeatingLayout } from "./domain/seating";
import { createInitialPlan, scorePlan } from "./domain/scoring";
import { DEFAULT_EFFORT, EFFORT_LEVELS, generatePlans, type ScoredPlan } from "./domain/solver";
import { spreadsheetFileToGuestText } from "./domain/spreadsheet";
import { isHeadSeatConstraint, isPairConstraint, type Constraint, type HeadSeatConstraint, type PairConstraintType, type PairStrength, type ConstraintPair, type Guest, type Plan, type SavedLayout, type ScoreBreakdown, type SeatingLayout, type TableConfig, type VenueConfig } from "./domain/types";
import { DEFAULT_VENUE_CONFIG } from "./domain/venueConfig";
import { parseGuestText, reconcileGuestText } from "./domain/parser";
const STORAGE_KEY = "table-planner-state-v2";
const PLACEHOLDER_GUESTS = Array.from({
  length: 39
}, (_, index) => {
  const group = index % 3 === 0 ? ", Bride" : index % 3 === 1 ? ", Groom" : "";
  return `Guest ${index + 1}${group}`;
}).join("\n");
export function App() {
  const [guestText, setGuestText] = useState("");
  const [guestIds, setGuestIds] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [candidates, setCandidates] = useState<ScoredPlan[]>([]);
  const [draggedGuestId, setDraggedGuestId] = useState<string | null>(null);
  const [selectedGuestId, setSelectedGuestId] = useState("");
  const [targetSeat, setTargetSeat] = useState("");
  const [highlightedGuestId, setHighlightedGuestId] = useState<string | null>(null);
  const [isEditingGuests, setIsEditingGuests] = useState(false);
  const [guestDraft, setGuestDraft] = useState("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importError, setImportError] = useState("");
  const [saveStatus, setSaveStatus] = useState("Starting local storage…");
  const [notice, setNotice] = useState("");
  const [effortLevel, setEffortLevel] = useState(DEFAULT_EFFORT);
  const [isShuffling, setIsShuffling] = useState(false);
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>([]);
  const [venueConfig, setVenueConfig] = useState<VenueConfig>(DEFAULT_VENUE_CONFIG);
  const [mixGroups, setMixGroups] = useState(false);
  const [phase, setPhase] = useState<"setup" | "planning" | "saved">("setup");
  const [editingTables, setEditingTables] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [history, setHistory] = useState<{
    data: PlannerData;
    candidates: ScoredPlan[];
  }[]>([]);
  const [pending, setPending] = useState<{
    title: string;
    description: string;
    confirm: string;
    apply: () => void;
    preview?: string;
  } | null>(null);
  const fileMenuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = parsePlannerBackupJson(JSON.stringify({
          ...JSON.parse(saved),
          version: 1
        }));
        restoreData(parsed);
        setPhase(parsed.activePlan ? "planning" : "setup");
        setNotice("Your previous session is ready.");
      }
    } catch {
      setStorageBlocked(true);
      setSaveStatus("Local saving paused to protect your unreadable session.");
      setImportError("Your saved session could not be loaded. Restore a backup, or start fresh. The unreadable session has not been overwritten.");
    }
    setReady(true);
  }, []);
  const parseResult = useMemo(() => parseGuestText(guestText, guestIds), [guestText, guestIds]);
  const guests = parseResult.guests;
  const guestsById = useMemo(() => new Map(guests.map(guest => [guest.id, guest])), [guests]);
  const validConstraints = useMemo(() => constraints.filter(constraint => isValidConstraint(constraint, guestsById)), [constraints, guestsById]);
  const layout = useMemo(() => buildSeatingLayout(venueConfig), [venueConfig]);
  useEffect(() => {
    if (!ready || storageBlocked) return;
    setSaveStatus("Saving in this browser…");
    const state: PlannerData = {
      guestText,
      guestIds,
      constraints: validConstraints,
      activePlan,
      savedLayouts,
      venueConfig,
      mixGroups
    };
    function persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setSaveStatus(`Saved in this browser · ${new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        })}`);
      } catch {
        setSaveStatus("Could not save in this browser. Download a backup to keep your work.");
      }
    }
    const timer = setTimeout(persist, 600);
    // Flush changes when leaving, including within the debounce window.
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") persist();
    }
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [ready, storageBlocked, guestText, guestIds, validConstraints, activePlan, savedLayouts, venueConfig, mixGroups]);
  const activeScore = useMemo(() => activePlan ? scorePlan(activePlan, guests, validConstraints, layout, mixGroups) : null, [activePlan, guests, validConstraints, layout, mixGroups]);
  const constraintAnalysis = useMemo(() => analyzeConstraints(guests, validConstraints), [guests, validConstraints]);
  const seatedGuestIds = new Set(Object.values(activePlan?.assignments ?? {}).filter(Boolean));
  const holdingGuestIds = guests.filter(guest => !seatedGuestIds.has(guest.id)).map(guest => guest.id);
  const hasTooManyGuests = guests.length > layout.seatIds.length;
  const hasSaveableData = Boolean(guestText.trim() || activePlan || savedLayouts.length || JSON.stringify(venueConfig) !== JSON.stringify(DEFAULT_VENUE_CONFIG));
  const guestDraftChanged = isEditingGuests && guestDraft !== guestText;
  function currentData(): PlannerData {
    return {
      guestText,
      guestIds: guests.map(guest => guest.id),
      constraints,
      activePlan,
      savedLayouts,
      venueConfig,
      mixGroups
    };
  }
  function remember() {
    setHistory(items => [...items.slice(-19), {
      data: currentData(),
      candidates
    }]);
  }
  function restoreData(data: PlannerData) {
    setStorageBlocked(false);
    setGuestText(data.guestText);
    setGuestIds(data.guestIds ?? parseGuestText(data.guestText).guests.map(guest => guest.id));
    setGuestDraft(data.guestText);
    setConstraints(data.constraints);
    setActivePlan(data.activePlan);
    setSavedLayouts(data.savedLayouts ?? []);
    setVenueConfig(data.venueConfig ?? DEFAULT_VENUE_CONFIG);
    setMixGroups(data.mixGroups ?? true);
    setSelectedGuestId("");
    setTargetSeat("");
    setEditingTables(false);
    setIsEditingGuests(false);
  }
  function undo() {
    const last = history.at(-1);
    if (!last) return;
    restoreData(last.data);
    setCandidates(last.candidates);
    setHistory(items => items.slice(0, -1));
    setNotice("Last change undone.");
  }
  function updateConstraints(next: Constraint[]) {
    remember();
    setConstraints(next);
    setCandidates([]);
    setNotice("Preferences updated. Generate new options to use them.");
  }
  function applyGuests(text: string, replace = false, explicitIds?: string[]) {
    const parsed = explicitIds ? parseGuestText(text, explicitIds) : replace ? parseGuestText(text) : reconcileGuestText(text, guests);
    const ids = new Set(parsed.guests.map(guest => guest.id));
    const removed = guests.filter(guest => !ids.has(guest.id));
    const added = parsed.guests.filter(guest => !guestsById.has(guest.id));
    if (!replace && !explicitIds && removed.length && added.length) {
      setPending({ title: "Review guest-list changes", description: "These names are treated as removed and added. Seats and preferences for removed guests will be cleared. To rename someone instead, cancel and use the pencil beside their name in View guest list.", preview: `Removed:\n${removed.map(guest => guest.name).join("\n")}\n\nAdded:\n${added.map(guest => guest.name).join("\n")}`, confirm: "Apply guest changes", apply: () => applyGuests(text, false, parsed.guests.map(guest => guest.id)) });
      return;
    }
    remember();
    setGuestText(text);
    setGuestIds(parsed.guests.map(guest => guest.id));
    setGuestDraft(text);
    setConstraints(replace ? [] : constraints.filter(constraint => constraintGuestIdsExist(constraint, ids)));
    setActivePlan(replace ? null : activePlan ? reconcilePlanForGuestIds(activePlan, ids) : null);
    setSavedLayouts(replace ? [] : savedLayouts.map(saved => ({
      ...saved,
      plan: reconcilePlanForGuestIds(saved.plan, ids) ?? {
        ...saved.plan,
        assignments: {},
        holdingGuestIds: []
      }
    })));
    setCandidates([]);
    setIsEditingGuests(false);
    setSelectedGuestId("");
    setImportError("");
    setImportWarnings([]);
    const removedPreferences = constraints.filter(constraint => !constraintGuestIdsExist(constraint, ids)).length;
    setNotice(`${parsed.guests.length} guests ready.${replace ? "" : removedPreferences ? ` ${removedPreferences} preferences removed for guests no longer on the list. Undo restores them.` : " Existing guests keep their seats and preferences."}`);
  }
  function renameGuest(id: string, name: string) {
    const text = guests.map(guest => [guest.id === id ? name : guest.name, ...guest.groups].join(", ")).join("\n");
    applyGuests(text, false, guests.map(guest => guest.id));
  }
  function startEditingGuests() {
    setGuestDraft(guestText);
    setIsEditingGuests(true);
  }
  async function handleSpreadsheetUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const result = await spreadsheetFileToGuestText(file);
      setPending({
        title: `Import ${result.importedCount} guests?`,
        description: "This replaces your guest list and clears seating preferences, the current plan, and saved versions. You can undo this change.",
        preview: result.guestText + (result.warnings.length ? `\n\n${result.warnings.join("\n")}` : ""),
        confirm: "Use this guest list",
        apply: () => {
          applyGuests(result.guestText, true);
          setImportWarnings(result.warnings);
          setPhase("setup");
          setNotice(`Imported ${result.importedCount} guests.`);
        }
      });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The spreadsheet could not be read.");
    }
  }
  async function handleDataImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = parsePlannerBackupJson(await readFileText(file));
      const guestCount = parseGuestText(imported.guestText).guests.length;
      setPending({
        title: "Restore this backup?",
        description: `${guestCount} guests · ${imported.constraints.length} seating preferences · ${imported.savedLayouts?.length ?? 0} saved versions. This replaces the current session, including tables. You can undo the restore.`,
        confirm: "Restore backup",
        apply: () => {
          remember();
          restoreData(imported);
          setCandidates([]);
          setImportWarnings([]);
          setImportError("");
          setPhase(imported.activePlan ? "planning" : "setup");
          setNotice("Backup restored, including your table layout.");
          if (fileMenuRef.current) fileMenuRef.current.open = false;
        }
      });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The backup could not be read.");
    }
  }
  function handleDataExport() {
    const blob = new Blob([JSON.stringify(createPlannerBackup(currentData()), null, 2)], {
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
    setNotice("Backup downloaded. Keep it to restore your work in another browser or device.");
    if (fileMenuRef.current) fileMenuRef.current.open = false;
  }
  async function handleShuffle() {
    if (!guests.length || isShuffling) return;
    setIsShuffling(true);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    try {
      const {
        attempts,
        improveIterations
      } = EFFORT_LEVELS[effortLevel - 1];
      const next = generatePlans({
        guests,
        constraints: validConstraints,
        layout,
        count: 6,
        attempts,
        improveIterations,
        mixGroups
      }).map(candidate => ({
        ...candidate,
        plan: {
          ...candidate.plan,
          id: crypto.randomUUID()
        }
      }));
      if (!next.length) throw new Error("No seating options were found. Check your table setup and try again.");
      remember();
      setCandidates(next);
      setActivePlan(clonePlan(next[0].plan));
      setPhase("planning");
      setNotice(`Generated ${next.length} options. Review the issues or adjust seats below.`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not generate plans. Please try again.");
    } finally {
      setIsShuffling(false);
    }
  }
  function applyPlan(plan: Plan, message: string) {
    remember();
    setActivePlan(clonePlan(plan));
    setSelectedGuestId("");
    setTargetSeat("");
    setNotice(message);
  }
  function moveGuest(guestId: string, seatId: number) {
    if (!activePlan || !guestsById.has(guestId) || !layout.seatsById.has(seatId)) return;
    applyPlan(moveGuestToSeat(activePlan, guestId, seatId), "Seating updated. You can undo this move.");
  }
  function unseatGuest(guestId: string) {
    if (!activePlan || !seatedGuestIds.has(guestId)) return;
    applyPlan(moveGuestToHolding(activePlan, guestId), "Guest moved to Unseated guests.");
  }
  function confirmTables(next: VenueConfig) {
    if (JSON.stringify(next) === JSON.stringify(venueConfig)) {
      setEditingTables(false);
      return;
    }
    const geometry = (config: VenueConfig) => config.tables.map(table => ({
      ...table,
      label: undefined
    }));
    if (JSON.stringify(geometry(next)) === JSON.stringify(geometry(venueConfig))) {
      remember();
      setVenueConfig(next);
      setEditingTables(false);
      setNotice("Table names updated. Your seating plans are kept.");
      return;
    }
    const apply = () => {
      remember();
      setVenueConfig(next);
      setActivePlan(null);
      setSavedLayouts([]);
      setCandidates([]);
      setEditingTables(false);
      setNotice("Tables updated. Your guests and seating preferences are ready to use.");
    };
    if (activePlan || savedLayouts.length) {
      setPending({
        title: "Change the table layout?",
        description: "This clears the current plan and saved versions. Guests and seating preferences are kept. You can undo the change.",
        confirm: "Change tables",
        apply
      });
    } else apply();
  }
  function saveVersion() {
    if (!activePlan) return;
    remember();
    const now = new Date();
    setSavedLayouts(items => [{
      id: crypto.randomUUID(),
      name: `Plan ${items.length + 1}`,
      savedAt: now.toISOString(),
      plan: clonePlan(activePlan),
      scoreTotal: activeScore?.total ?? 0
    }, ...items]);
    setNotice("Version kept in Saved plans. Download a backup to keep a separate copy.");
  }
  function printPlan() {
    if (holdingGuestIds.length) {
      setPending({
        title: `${holdingGuestIds.length} ${holdingGuestIds.length === 1 ? "guest is" : "guests are"} still unseated`,
        description: "The printed plan will include an unseated guest list. Seat everyone first, or print this draft.",
        confirm: "Print draft",
        apply: () => requestAnimationFrame(() => window.print())
      });
    } else window.print();
  }
  return <div className="app-shell" onDragEnd={() => setDraggedGuestId(null)}>
    <header className="top-bar">
      <div>
        <h1>Table Planner</h1>
        <p>{guests.length} guests for {layout.seatIds.length} seats</p>
      </div>
      <div className="top-actions">
        <button type="button" onClick={undo} disabled={!history.length || isShuffling || guestDraftChanged}>Undo</button>
        <details className="file-menu" ref={fileMenuRef}>
          <summary>Backup &amp; restore <ChevronDown size={15} /></summary>
          <div className="file-menu-content">
            <button type="button" onClick={handleDataExport} disabled={!hasSaveableData || guestDraftChanged}><FileDown size={17} /> Download backup</button>
            <label className="file-upload-button"><FileUp size={17} /> Restore backup<input aria-label="Restore planner backup" className="visually-hidden" type="file" accept=".json,application/json" onChange={handleDataImport} disabled={isShuffling || guestDraftChanged} /></label>
            <p>{guestDraftChanged ? "Apply your guest-list draft with Done before downloading a backup." : "Backups include guests, preferences, tables, and saved versions."}</p>
          </div>
        </details>
      </div>
    </header>
    <div className="local-banner">
      <p>Your guest list stays on this device. Plans are generated in your browser.</p>
      <details>
        <summary>How saving works</summary>
        <p>Changes are saved automatically in this browser. Other browsers and devices have separate data. Clearing browser data removes your saved plans. Download a backup to keep a separate copy or move your work. Guest-list drafts are applied with Done.</p>
      </details>
      <span className="save-status" role="status">{saveStatus}</span>
    </div>
    <nav className="flow-nav" aria-label="Planner">
      {([['setup', '1. Setup'], ['planning', '2. Plan'], ['saved', `Saved plans${savedLayouts.length ? ` (${savedLayouts.length})` : ''}`]] as const).map(([value, label]) => <button type="button" key={value} aria-current={phase === value ? "page" : undefined} onClick={() => setPhase(value)} disabled={isShuffling || guestDraftChanged}>{label}</button>)}
    </nav>
    <div className="feedback" aria-live="polite">{notice}</div>
    {importError && <div className="global-error" role="alert">
      {importError}
      {storageBlocked ? <button type="button" onClick={() => setPending({
        title: "Start a fresh session?",
        description: "This replaces the unreadable data in this browser. Restore a backup instead if you want to recover an existing plan.",
        confirm: "Start fresh",
        apply: () => {
          restoreData({
            guestText: "",
            constraints: [],
            activePlan: null,
            mixGroups: false
          });
          setImportError("");
          setPhase("setup");
        }
      })}>Start fresh</button> : <button type="button" onClick={() => setImportError("")}>Dismiss</button>}
    </div>}
    {phase === "setup" && <main className="setup-workspace">
      <div className="page-intro">
        <h2>{activePlan ? "Update your setup" : "Let’s make a seating plan"}</h2>
        <p>Check the tables, add your guests, then generate a plan. Seating preferences are optional.</p>
      </div>
      <section className="panel-section setup-step">
        <div className="section-heading">
          <div>
            <span className="step-label">Step 1</span>
            <h2>Check your tables</h2>
          </div>
          <button type="button" onClick={() => setEditingTables(value => !value)} disabled={guestDraftChanged}>{editingTables ? "Cancel table changes" : "Change tables"}</button>
        </div>
        {editingTables ? <VenueSetup config={venueConfig} onConfirm={confirmTables} /> : <>
          <p>{venueConfig.tables.length} tables · {layout.seatIds.length} seats. Use these tables or change them to match your venue.</p>
          <div className="table-previews">
            {venueConfig.tables.map(table => <div className="table-preview" key={table.id}>
              <span className={`mini-table ${table.kind}`} aria-hidden="true" />
              <strong>{table.label || `Table ${table.id}`}</strong>
              <span>{table.kind === "rect" ? `${table.seatsPerSide * 2 + Number(table.leftEnd) + Number(table.rightEnd)} seats · long table` : `${table.seats} seats · round table`}</span>
            </div>)}
          </div>
        </>}
      </section>
      <section className="panel-section setup-step">
        <div className="section-heading">
          <div>
            <span className="step-label">Step 2</span>
            <h2>Add your guests</h2>
          </div>
          <span>{guests.length} guests</span>
        </div>
        <div className="guest-entry-actions">
          {!isEditingGuests && <button type="button" className={!guests.length ? "primary-button" : ""} onClick={startEditingGuests}>
            <Pencil size={16} />
            {guests.length ? "Edit names" : "Paste or type names"}
          </button>}
          <label className="file-upload-button"><Upload size={16} /> Choose spreadsheet<input aria-label="Choose guest spreadsheet" className="visually-hidden" type="file" accept=".xlsx,.csv,.tsv,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleSpreadsheetUpload} disabled={guestDraftChanged} /></label>
        </div>
        <p className="muted-text">CSV or Excel. Read locally; never uploaded.</p>
        {isEditingGuests ? <div className="guest-editor">
          <label htmlFor="guest-list">One guest per line</label>
          <p className="muted-text" id="guest-help">Optional group labels follow a comma, for example “Jane Smith, Family”. Existing names keep their seats when reordered. Replacing a name in a list of the same length renames that guest. For other renames, use the pencil beside a name in View guest list. Use Done to apply your changes.</p>
          <textarea id="guest-list" aria-label="Guest list" aria-describedby="guest-help" className="guest-input" value={guestDraft} onChange={event => setGuestDraft(event.target.value)} placeholder={"Jane Smith, Family\nSam Jones, Friends\nAlex Lee"} autoFocus />
          {parseGuestText(guestDraft).warnings.map(warning => <p className="warning-text" key={warning}>{warning}</p>)}
          <div className="inline-actions">
            <button type="button" className="primary-button" onClick={() => applyGuests(guestDraft)}>Done</button>
            <button type="button" onClick={() => setIsEditingGuests(false)}>Cancel</button>
            {guestDraftChanged && <span className="muted-text">Draft · not applied yet</span>}
          </div>
        </div> : guests.length ? <details className="guest-disclosure">
          <summary>View guest list ({guests.length})</summary>
          <GuestList guests={guests} constraints={validConstraints} onGuestHighlight={setHighlightedGuestId} onRename={renameGuest} />
        </details> : <p className="muted-text">Just exploring? <button className="text-button" type="button" onClick={() => {
          applyGuests(PLACEHOLDER_GUESTS, true);
          setNotice("Example guests added. Use Edit names to replace them with your own.");
        }}>Try an example with 39 guests</button></p>}
        {importWarnings.map(warning => <p className="warning-text" key={warning}>{warning}</p>)}
        {hasTooManyGuests && <p className="warning-text" role="alert">{guests.length - layout.seatIds.length} more guests than seats. Add seats or remove guests; extra guests will remain unseated.</p>}
      </section>
      <details className="panel-section preferences-disclosure">
        <summary><span className="step-label">Optional</span> Seating preferences <span className="muted-text">{validConstraints.length ? `${validConstraints.length} added` : "Who should sit near whom?"}</span></summary>
        <p>We’ll try to meet these preferences; some may conflict. You can generate a plan without any.</p>
        <fieldset disabled={!guests.length || guestDraftChanged}>
          {!guests.length && <p className="muted-text">Add guests above to set seating preferences.</p>}
          <PairEditor title="Seat near each other" type="prefer_adjacent" showStrength guests={guests} constraints={constraints} onChange={updateConstraints} />
          <PairEditor title="Keep apart" type="avoid_adjacent" guests={guests} constraints={constraints} onChange={updateConstraints} />
          {layout.headSeatIds.length > 0 && <HeadSeatEditor guests={guests} constraints={constraints} onChange={updateConstraints} />}
          <label className="mix-setting"><input type="checkbox" checked={mixGroups} onChange={event => {
            remember();
            setMixGroups(event.target.checked);
            setCandidates([]);
          }} /> Mix guests from the same group</label>
          <p className="muted-text">When enabled, group labels encourage mixing by avoiding same-group neighbours. Explicit seating preferences take priority.</p>
        </fieldset>
        <ConstraintAnalysisPanel analysis={constraintAnalysis} guestsById={guestsById} onGuestHighlight={setHighlightedGuestId} />
      </details>
      <div className="setup-next">
        <p>{guestDraftChanged ? "Use Done to apply your guest list first." : editingTables ? "Use these tables or cancel table changes before generating." : !guests.length ? "Add your guests to generate seating options." : `Ready: ${guests.length} guests · ${layout.seatIds.length} seats`}</p>
        <button type="button" className="primary-button" onClick={handleShuffle} disabled={!guests.length || isShuffling || guestDraftChanged || editingTables}>
          {isShuffling ? <Loader size={18} className="spinning" /> : <Shuffle size={18} />}
          {isShuffling ? "Generating…" : "Generate seating plans"}
        </button>
      </div>
    </main>}
    {phase === "planning" && <main className="planning-workspace">
      {!activePlan ? <section className="panel-section first-plan">
        <Users size={32} />
        <h2>Your seating plan will appear here</h2>
        <p>{guests.length ? "Your guests are ready. Generate options, or return to setup to add preferences." : "Start by checking your tables and adding guests."}</p>
        <div className="inline-actions">
          <button type="button" onClick={() => setPhase("setup")}>Go to setup</button>
          {guests.length > 0 && <button className="primary-button" type="button" onClick={handleShuffle} disabled={isShuffling}>{isShuffling ? "Generating…" : "Generate seating plans"}</button>}
        </div>
      </section> : <>
        <div className="plan-toolbar">
          <div>
            <h2>Your seating plan</h2>
            <p>{seatedGuestIds.size} of {guests.length} guests seated{holdingGuestIds.length ? ` · ${holdingGuestIds.length} unseated` : ""}</p>
          </div>
          <div className="inline-actions">
            <button type="button" onClick={handleShuffle} disabled={isShuffling}>
              {isShuffling ? <Loader size={17} className="spinning" /> : <Shuffle size={17} />}
              {isShuffling ? "Generating…" : "Generate more options"}
            </button>
            <button className="primary-button" type="button" onClick={saveVersion} disabled={isShuffling}><Bookmark size={17} />Keep this version</button>
            <button type="button" onClick={printPlan} disabled={isShuffling}><Printer size={17} />Print</button>
          </div>
        </div>
        <div className="plan-grid">
          <section className="planner-surface">
            <div className="surface-toolbar">
              <h2>Seating layout</h2>
              <span className="muted-text">Drag guests to move or swap seats</span>
            </div>
            <div className="print-area">
              <TablePlan plan={activePlan} layout={layout} guestsById={guestsById} highlightedGuestId={highlightedGuestId ?? selectedGuestId} onDragStart={setDraggedGuestId} onSelectGuest={setSelectedGuestId} onDropIntoSeat={seatId => {
                if (draggedGuestId) moveGuest(draggedGuestId, seatId);
                setDraggedGuestId(null);
              }} />
              <HoldingArea guestIds={holdingGuestIds} guestsById={guestsById} highlightedGuestId={highlightedGuestId ?? selectedGuestId} onDragStart={setDraggedGuestId} onSelectGuest={setSelectedGuestId} onDropIntoHolding={() => {
                if (draggedGuestId) unseatGuest(draggedGuestId);
                setDraggedGuestId(null);
              }} />
            </div>
            <fieldset className="manual-adjustment" disabled={isShuffling}>
              <legend>Move or swap a guest</legend>
              <p className="muted-text">Select a guest on the plan or choose a name below. An occupied destination swaps the two guests; an unseated guest takes the seat and unseats its occupant.</p>
              <label>Guest<select value={selectedGuestId} onChange={event => setSelectedGuestId(event.target.value)}>
                <option value="">Choose a guest</option>
                {guests.map(guest => <option value={guest.id} key={guest.id}>{guest.name}</option>)}
              </select></label>
              <label>Destination<select value={targetSeat} onChange={event => setTargetSeat(event.target.value)}>
                <option value="">Choose a seat</option>
                {layout.seats.map(seat => <option value={seat.id} key={seat.id}>{layout.tableConfigs.get(seat.tableId)?.label || `Table ${seat.tableId}`} · seat {seat.id}{activePlan.assignments[seat.id] ? ` · ${guestsById.get(activePlan.assignments[seat.id]!)?.name ?? ""}` : " · empty"}</option>)}
              </select></label>
              <div className="inline-actions">
                <button type="button" disabled={!selectedGuestId || !targetSeat} onClick={() => moveGuest(selectedGuestId, Number(targetSeat))}>Move / swap</button>
                <button type="button" disabled={!selectedGuestId || !seatedGuestIds.has(selectedGuestId)} onClick={() => unseatGuest(selectedGuestId)}>Unseat guest</button>
              </div>
            </fieldset>
          </section>
          <aside className="results-panel">
            <ScorePanel score={activeScore} guestsById={guestsById} onGuestHighlight={setHighlightedGuestId} mixGroups={mixGroups} />
            {candidates.length > 0 && <CandidateList candidates={candidates} activePlan={activePlan} onSelect={plan => applyPlan(plan, "Option loaded. Your previous arrangement can be restored with Undo.")} />}
          </aside>
        </div>
      </>}
      {guests.length > 0 && <details className="panel-section generation-settings">
        <summary>Generation settings</summary>
        <label className="effort-control">Search effort<input type="range" min={1} max={EFFORT_LEVELS.length} value={effortLevel} onChange={event => setEffortLevel(Number(event.target.value))} /><span>{effortLevel} / {EFFORT_LEVELS.length}</span></label>
        <p className="muted-text">Higher effort takes longer and searches more arrangements. It cannot guarantee every preference will be met.</p>
        <button type="button" disabled={isShuffling} onClick={() => applyPlan(createInitialPlan(guests.map(guest => guest.id), layout), "Guests reseated in list order. Undo restores the previous plan.")}><RefreshCw size={16} />Reseat in guest-list order</button>
      </details>}
    </main>}
    {phase === "saved" && <main className="saved-workspace">
      <div className="page-intro">
        <h2>Saved plans</h2>
        <p>Keep versions while you explore. These are stored in this browser; download a backup to keep a separate copy.</p>
      </div>
      <LibraryPanel savedLayouts={savedLayouts.map(saved => ({
        ...saved,
        summary: describeScore(scorePlan(saved.plan, guests, validConstraints, layout, mixGroups))
      }))} activePlanId={activePlan?.id ?? null} onLoad={plan => {
        applyPlan(plan, "Saved version loaded.");
        setPhase("planning");
      }} onDelete={id => {
        remember();
        setSavedLayouts(items => items.filter(saved => saved.id !== id));
        setNotice("Saved version deleted. Use Undo to restore it.");
      }} onRename={(id, name) => {
        remember();
        setSavedLayouts(items => items.map(saved => saved.id === id ? {
          ...saved,
          name
        } : saved));
      }} />
      {!savedLayouts.length && <button type="button" onClick={() => setPhase(activePlan ? "planning" : "setup")}>{activePlan ? "Return to plan to keep a version" : "Start a seating plan"}</button>}
    </main>}
    {pending && <ReviewDialog title={pending.title} description={pending.description} preview={pending.preview} confirm={pending.confirm} onCancel={() => setPending(null)} onConfirm={() => {
      pending.apply();
      setPending(null);
    }} />}
  </div>;
}
function ReviewDialog({
  title,
  description,
  preview,
  confirm,
  onCancel,
  onConfirm
}: {
  title: string;
  description: string;
  preview?: string;
  confirm: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog className="review-dialog" ref={ref} aria-labelledby="review-title" aria-describedby="review-description" onCancel={event => {
    event.preventDefault();
    onCancel();
  }}>
    <h2 id="review-title">{title}</h2>
    <p id="review-description">{description}</p>
    {preview && <pre>{preview}</pre>}
    <div className="inline-actions">
      <button type="button" onClick={onCancel} autoFocus>Cancel</button>
      <button type="button" className="primary-button" onClick={onConfirm}>{confirm}</button>
    </div>
  </dialog>;
}
function ConstraintAnalysisPanel({
  analysis,
  guestsById,
  onGuestHighlight
}: {
  analysis: ConstraintAnalysis;
  guestsById: Map<string, Guest>;
  onGuestHighlight: (guestId: string | null) => void;
}) {
  if (!analysis.hasAnyIssue) return null;
  return <section className="panel-section constraint-analysis-panel">
    <div className="section-heading">
      <h2>Preference conflicts</h2>
      <AlertTriangle size={15} className="conflict-icon" />
    </div>
    {analysis.overloadedGuests.map(overload => {
      const guest = guestsById.get(overload.guestId);
      if (!guest) return null;
      const badgeTone = overload.strength === "high" ? "high" : "mid";
      return <div key={overload.guestId} className="analysis-warning">
        <p className="analysis-warning-title">
          <PairResultName guest={guest} onGuestHighlight={onGuestHighlight} />
          {" "}has {overload.constraintCount}{" "}
          <span className={`constraint-badge constraint-badge-${badgeTone}`}>{overload.strength}</span>
          {" "}constraints — at most {overload.maxSatisfiable} can be satisfied
        </p>
        <div className="analysis-partner-list">
          {overload.pairs.map(pair => {
            const otherId = pair.guestAId === overload.guestId ? pair.guestBId : pair.guestAId;
            const other = guestsById.get(otherId);
            const strength = pair.strength ?? "medium";
            const tone = strength === "high" ? "high" : strength === "medium" ? "mid" : "low";
            return <span key={pair.id} className="analysis-partner-chip">
              <PairResultName guest={other} onGuestHighlight={onGuestHighlight} />
              <span className={`constraint-badge constraint-badge-${tone}`}>{strength}</span>
            </span>;
          })}
        </div>
      </div>;
    })}
    {analysis.crossClusterPairs.length > 0 && <div className="analysis-warning">
      <p className="analysis-warning-title">
        At-risk pairs — these guests belong to competing high-priority groups and will likely end up at different tables:
      </p>
      {analysis.crossClusterPairs.map(({
        pair
      }) => {
        const guestA = guestsById.get(pair.guestAId);
        const guestB = guestsById.get(pair.guestBId);
        const strength = pair.strength ?? "medium";
        const tone = strength === "high" ? "high" : strength === "medium" ? "mid" : "low";
        return <p key={pair.id} className="analysis-cross-pair">
          <PairResultName guest={guestA} onGuestHighlight={onGuestHighlight} />
          <span aria-hidden="true"> / </span>
          <PairResultName guest={guestB} onGuestHighlight={onGuestHighlight} />
          <span className={`constraint-badge constraint-badge-${tone}`}>{strength}</span>
        </p>;
      })}
    </div>}
  </section>;
}
function GuestList({
  guests,
  constraints,
  onGuestHighlight,
  onRename
}: {
  guests: Guest[];
  constraints: Constraint[];
  onGuestHighlight: (guestId: string | null) => void;
  onRename: (guestId: string, name: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  if (guests.length === 0) {
    return <p className="muted-text">No guests yet. Paste names or choose a spreadsheet to get started.</p>;
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
  return <div className="guest-list-view">
    {sorted.map(guest => {
      const count = counts.get(guest.id) ?? 0;
      const badgeTone = count >= 3 ? "high" : count === 2 ? "mid" : "low";
      return <div className="guest-list-row" key={guest.id}>{editingId === guest.id ? <form className="rename-guest-form" onSubmit={event => { event.preventDefault(); if (!name.trim() || /[,\r\n]/.test(name)) return; onRename(guest.id, name.trim()); setEditingId(null); }}><label>Guest name<input value={name} onChange={event => setName(event.target.value)} autoFocus /></label><button type="submit" disabled={!name.trim() || /[,\r\n]/.test(name)}>Apply name</button><button type="button" onClick={() => setEditingId(null)}>Cancel</button></form> : <><button className="guest-list-name" type="button" onMouseEnter={() => onGuestHighlight(guest.id)} onMouseLeave={() => onGuestHighlight(null)} onFocus={() => onGuestHighlight(guest.id)} onBlur={() => onGuestHighlight(null)}>
        <span>{guest.name}</span>
        {count > 0 && <span className={`constraint-badge constraint-badge-${badgeTone}`} title={`${count} constraint${count === 1 ? "" : "s"}`}>
          {count}
        </span>}
      </button><button type="button" className="icon-button" aria-label={`Rename ${guest.name}`} onClick={() => { setEditingId(guest.id); setName(guest.name); }}><Pencil size={14} /></button></>}</div>;
    })}
  </div>;
}
const STRENGTH_LABELS: Record<PairStrength, string> = {
  high: "Neighbours",
  medium: "Neighbours or opposite",
  low: "Anywhere nearby"
};
interface PairEditorProps {
  title: string;
  type: PairConstraintType;
  guests: Guest[];
  constraints: Constraint[];
  showStrength?: boolean;
  onChange: (constraints: Constraint[]) => void;
}
function PairEditor({
  title,
  type,
  guests,
  constraints,
  showStrength,
  onChange
}: PairEditorProps) {
  const pairs = constraints.filter((constraint): constraint is ConstraintPair => isPairConstraint(constraint) && constraint.type === type);
  const [draft, setDraft] = useState<{
    guestAId: string;
    guestBId: string;
    strength: PairStrength;
  } | null>(null);
  function alreadyAdded(a: string, b: string, except?: string) {
    return pairs.some(pair => pair.id !== except && (pair.guestAId === a && pair.guestBId === b || pair.guestAId === b && pair.guestBId === a));
  }
  const canAdd = Boolean(draft && draft.guestAId !== draft.guestBId && guests.some(guest => guest.id === draft.guestAId) && guests.some(guest => guest.id === draft.guestBId) && !alreadyAdded(draft.guestAId, draft.guestBId));
  function addPair() {
    if (!draft || !canAdd) return;
    onChange([...constraints, {
      id: `${type}-${crypto.randomUUID()}`,
      type,
      guestAId: draft.guestAId,
      guestBId: draft.guestBId,
      ...(showStrength ? {
        strength: draft.strength
      } : {})
    }]);
    setDraft(null);
  }
  function updatePair(pairId: string, field: "guestAId" | "guestBId" | "strength", value: string) {
    onChange(constraints.map(constraint => isPairConstraint(constraint) && constraint.id === pairId ? {
      ...constraint,
      [field]: value
    } : constraint));
  }
  function removePair(pairId: string) {
    onChange(constraints.filter(pair => pair.id !== pairId));
  }
  return <section className="panel-section">
    <div className="section-heading">
      <h2>{title}</h2>
      <button type="button" className="icon-text-button" onClick={() => setDraft({
        guestAId: "",
        guestBId: "",
        strength: "medium"
      })} disabled={guests.length < 2 || draft !== null} aria-label={`Add ${title} pair`}>
        <Plus size={16} /> Add pair
      </button>
    </div>
    {showStrength ? <details className="distance-help">
      <summary>What counts as nearby?</summary>
      <div className="proximity-example" aria-hidden="true">
        <span>Diagonal</span>
        <span>Opposite</span>
        <span>Diagonal</span>
        <i />
        <i>Table</i>
        <i />
        <span>Neighbour</span>
        <strong>Guest</strong>
        <span>Neighbour</span>
      </div>
      <p>Neighbours includes adjacent end seats. Anywhere nearby also includes diagonals. Closer-distance preferences receive more priority.</p>
    </details> : <p className="muted-text">Avoid nearby seats, including opposite and diagonal seats. This is a preference, not a guarantee.</p>}
    {draft && <form className="add-pair-form" onSubmit={event => {
      event.preventDefault();
      addPair();
    }}>
      <label>First guest<select value={draft.guestAId} onChange={event => setDraft({
        ...draft,
        guestAId: event.target.value
      })} autoFocus>
        <option value="">Choose a guest</option>
        {guests.map(guest => <option key={guest.id} value={guest.id} disabled={guest.id === draft.guestBId}>{guest.name}</option>)}
      </select></label>
      <label>Second guest<select value={draft.guestBId} onChange={event => setDraft({
        ...draft,
        guestBId: event.target.value
      })}>
        <option value="">Choose a guest</option>
        {guests.map(guest => <option key={guest.id} value={guest.id} disabled={guest.id === draft.guestAId}>{guest.name}</option>)}
      </select></label>
      {showStrength && <label>Distance<select value={draft.strength} onChange={event => setDraft({
        ...draft,
        strength: event.target.value as PairStrength
      })}>
        {(["high", "medium", "low"] as PairStrength[]).map(strength => <option value={strength} key={strength}>{STRENGTH_LABELS[strength]}</option>)}
      </select></label>}
      {alreadyAdded(draft.guestAId, draft.guestBId) && <p className="warning-text">This pair is already on this list.</p>}
      <div className="inline-actions">
        <button type="submit" className="primary-button" disabled={!canAdd}>Add pair</button>
        <button type="button" onClick={() => setDraft(null)}>Cancel</button>
      </div>
    </form>}
    <div className="pair-list">
      {pairs.length === 0 ? <p className="muted-text">No pairs yet.</p> : null}
      {pairs.map(pair => {
        const conflict = constraints.some(c => isPairConstraint(c) && c.type !== type && (c.guestAId === pair.guestAId && c.guestBId === pair.guestBId || c.guestAId === pair.guestBId && c.guestBId === pair.guestAId));
        const strength: PairStrength = pair.strength ?? "medium";
        return <div className={`pair-row${showStrength ? " has-strength" : ""}`} key={pair.id}>
          <select aria-label="First guest" value={pair.guestAId} onChange={event => updatePair(pair.id, "guestAId", event.target.value)}>
            {guests.map(guest => <option value={guest.id} key={guest.id} disabled={guest.id === pair.guestBId || alreadyAdded(guest.id, pair.guestBId, pair.id)}>{guest.name}</option>)}
          </select>
          <select aria-label="Second guest" value={pair.guestBId} onChange={event => updatePair(pair.id, "guestBId", event.target.value)}>
            {guests.map(guest => <option value={guest.id} key={guest.id} disabled={guest.id === pair.guestAId || alreadyAdded(pair.guestAId, guest.id, pair.id)}>{guest.name}</option>)}
          </select>
          {showStrength && <label className="distance-control">Distance
            <select aria-label="Seating distance" value={strength} onChange={event => updatePair(pair.id, "strength", event.target.value)}>
              {(["high", "medium", "low"] as PairStrength[]).map(value => <option key={value} value={value}>{STRENGTH_LABELS[value]}</option>)}
            </select>
          </label>}
          {conflict ? <span title="This pair also appears in the opposite constraint list">
            <AlertTriangle size={15} className="conflict-icon" />
          </span> : <span />}
          <button type="button" className="icon-button danger" onClick={() => removePair(pair.id)} aria-label="Remove pair">
            <Trash2 size={16} />
          </button>
        </div>;
      })}
    </div>
  </section>;
}
interface HeadSeatEditorProps {
  guests: Guest[];
  constraints: Constraint[];
  onChange: (constraints: Constraint[]) => void;
}
function HeadSeatEditor({
  guests,
  constraints,
  onChange
}: HeadSeatEditorProps) {
  const headConstraints = constraints.filter(isHeadSeatConstraint);
  function addConstraint() {
    if (guests.length === 0) {
      return;
    }
    onChange([...constraints, {
      id: `head-${crypto.randomUUID()}`,
      type: "prefer_head",
      guestId: guests[0].id
    }]);
  }
  function updateConstraint(constraintId: string, field: "guestId" | "type", value: HeadSeatConstraint["guestId"] | HeadSeatConstraint["type"]) {
    onChange(constraints.map(constraint => isHeadSeatConstraint(constraint) && constraint.id === constraintId ? {
      ...constraint,
      [field]: value
    } : constraint));
  }
  function removeConstraint(constraintId: string) {
    onChange(constraints.filter(constraint => constraint.id !== constraintId));
  }
  return <section className="panel-section">
    <div className="section-heading">
      <h2>End-seat preferences</h2>
      <button type="button" className="icon-text-button" onClick={addConstraint} disabled={guests.length === 0} aria-label="Add end-seat preference">
        <Plus size={16} /> Add preference
      </button>
    </div>
    <div className="pair-list">
      {headConstraints.length === 0 ? <p className="muted-text">No end-seat preferences yet.</p> : null}
      {headConstraints.map(constraint => <div className="head-row" key={constraint.id}>
        <select aria-label="Guest for end-seat preference" value={constraint.guestId} onChange={event => updateConstraint(constraint.id, "guestId", event.target.value)}>
          {guests.map(guest => <option value={guest.id} key={guest.id}>{guest.name}</option>)}
        </select>
        <select aria-label="End-seat preference" value={constraint.type} onChange={event => updateConstraint(constraint.id, "type", event.target.value as HeadSeatConstraint["type"])}>
          <option value="prefer_head">Prefer an end seat</option>
          <option value="avoid_head">Avoid end seats</option>
        </select>
        <button type="button" className="icon-button danger" onClick={() => removeConstraint(constraint.id)} aria-label="Remove end-seat preference">
          <Trash2 size={16} />
        </button>
      </div>)}
    </div>
  </section>;
}
interface TablePlanProps {
  plan: Plan;
  layout: SeatingLayout;
  guestsById: Map<string, Guest>;
  highlightedGuestId: string | null;
  onDragStart: (guestId: string) => void;
  onSelectGuest: (guestId: string) => void;
  onDropIntoSeat: (seatId: number) => void;
}
function TablePlan({
  plan,
  layout,
  guestsById,
  highlightedGuestId,
  onDragStart,
  onSelectGuest,
  onDropIntoSeat
}: TablePlanProps) {
  return <div className="table-plan" aria-label="Seating layout">
    {layout.tableIds.map(tableId => {
      const config = layout.tableConfigs.get(tableId)!;
      const tableSeats = layout.seats.filter(s => s.tableId === tableId);
      const label = config.label ?? `Table ${tableId}`;
      if (config.kind === "circular") {
        return <div className="table-block circular-block" key={tableId}>
          <div className="table-label">{label}</div>
          <CircularTableBlock seats={tableSeats} totalSeats={config.seats} plan={plan} guestsById={guestsById} highlightedGuestId={highlightedGuestId} onDragStart={onDragStart} onSelectGuest={onSelectGuest} onDropIntoSeat={onDropIntoSeat} />
        </div>;
      }
      const seatsPerSide = config.seatsPerSide;
      const hasLeft = config.leftEnd;
      const hasRight = config.rightEnd;
      const sideColStart = hasLeft ? 2 : 1;
      const gridTemplateColumns = [hasLeft ? "4.5rem" : "", `repeat(${seatsPerSide}, minmax(4.35rem, 1fr))`, hasRight ? "4.5rem" : ""].filter(Boolean).join(" ");
      const rectColEnd = sideColStart + seatsPerSide;
      return <div className="table-block" key={tableId}>
        <div className="table-label">{label}</div>
        <div className="table-grid" style={{
          gridTemplateColumns
        }}>
          <div className="table-rectangle" style={{
            gridColumn: `${sideColStart} / ${rectColEnd}`,
            gridRow: "2"
          }} />
          {tableSeats.map(seat => {
            const guestId = plan.assignments[seat.id];
            const guest = guestId ? guestsById.get(guestId) : undefined;
            return <SeatCell key={seat.id} seatId={seat.id} side={seat.side} position={seat.position} seatsPerSide={seatsPerSide} hasLeftEnd={hasLeft} guest={guest} occupied={Boolean(guestId)} highlighted={Boolean(guest && guest.id === highlightedGuestId)} onDragStart={onDragStart} onSelectGuest={onSelectGuest} onDropIntoSeat={onDropIntoSeat} />;
          })}
        </div>
      </div>;
    })}
  </div>;
}
interface CircularTableBlockProps {
  seats: {
    id: number;
    position: number;
  }[];
  totalSeats: number;
  plan: Plan;
  guestsById: Map<string, Guest>;
  highlightedGuestId: string | null;
  onDragStart: (guestId: string) => void;
  onSelectGuest: (guestId: string) => void;
  onDropIntoSeat: (seatId: number) => void;
}
function CircularTableBlock({
  seats,
  totalSeats,
  plan,
  guestsById,
  highlightedGuestId,
  onDragStart,
  onSelectGuest,
  onDropIntoSeat
}: CircularTableBlockProps) {
  const size = 340;
  const cx = size / 2;
  const cy = size / 2;
  const tableR = 55;
  const seatR = size / 2 - 42;
  return <svg width={size} height={size} className="circular-table-svg" viewBox={`0 0 ${size} ${size}`}>
    <circle cx={cx} cy={cy} r={tableR} fill="white" stroke="#40484f" strokeWidth={2} />
    {seats.map(seat => {
      const angle = 2 * Math.PI * seat.position / totalSeats - Math.PI / 2;
      const x = cx + seatR * Math.cos(angle);
      const y = cy + seatR * Math.sin(angle);
      const guestId = plan.assignments[seat.id];
      const guest = guestId ? guestsById.get(guestId) : undefined;
      return <foreignObject key={seat.id} x={x - 38} y={y - 30} width={76} height={60}>
        <SeatCell seatId={seat.id} side="circular" position={seat.position} seatsPerSide={0} hasLeftEnd={false} guest={guest} occupied={Boolean(guestId)} highlighted={Boolean(guest && guest.id === highlightedGuestId)} onDragStart={onDragStart} onSelectGuest={onSelectGuest} onDropIntoSeat={onDropIntoSeat} />
      </foreignObject>;
    })}
  </svg>;
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
  onSelectGuest: (guestId: string) => void;
  onDropIntoSeat: (seatId: number) => void;
}
function SeatCell({
  seatId,
  side,
  position,
  seatsPerSide,
  hasLeftEnd,
  guest,
  occupied,
  highlighted,
  onDragStart,
  onSelectGuest,
  onDropIntoSeat
}: SeatCellProps) {
  const style = getSeatStyle(side, position, seatsPerSide, hasLeftEnd);
  return <div className={`seat-cell ${occupied ? "occupied" : "empty"}`} style={style} onDragOver={event => {
    event.preventDefault();
  }} onDrop={event => {
    event.preventDefault();
    onDropIntoSeat(seatId);
  }}>
    <div className="seat-number">{seatId}</div>
    {guest ? <button type="button" className={`guest-chip ${getGroupClass(guest)}${highlighted ? " highlighted" : ""}`} draggable onClick={() => onSelectGuest(guest.id)} onDragStart={() => onDragStart(guest.id)} title={`${guest.name}${guest.groups.length > 0 ? `, ${guest.groups.join(", ")}` : ""}`}>
      <GripVertical size={14} />
      <span>{guest.name}</span>
    </button> : <span className="empty-seat-label">Empty</span>}
  </div>;
}
interface HoldingAreaProps {
  guestIds: string[];
  guestsById: Map<string, Guest>;
  highlightedGuestId: string | null;
  onDragStart: (guestId: string) => void;
  onSelectGuest: (guestId: string) => void;
  onDropIntoHolding: () => void;
}
function HoldingArea({
  guestIds,
  guestsById,
  highlightedGuestId,
  onDragStart,
  onSelectGuest,
  onDropIntoHolding
}: HoldingAreaProps) {
  return <div className="holding-area" onDragOver={event => event.preventDefault()} onDrop={event => {
    event.preventDefault();
    onDropIntoHolding();
  }}>
    <div className="holding-title">Unseated guests ({guestIds.length})</div>
    <div className="holding-list">
      {guestIds.length === 0 ? <span className="muted-text">Everyone has a seat. Drag someone here to unseat them.</span> : null}
      {guestIds.map(guestId => {
        const guest = guestsById.get(guestId);
        return guest ? <button className={`guest-chip holding-chip ${getGroupClass(guest)}${guest.id === highlightedGuestId ? " highlighted" : ""}`} type="button" draggable onClick={() => onSelectGuest(guest.id)} onDragStart={() => onDragStart(guest.id)} key={guest.id} title={`${guest.name}${guest.groups.length > 0 ? `, ${guest.groups.join(", ")}` : ""}`}>
          <GripVertical size={14} />
          <span>{guest.name}</span>
        </button> : null;
      })}
    </div>
  </div>;
}
interface ScorePanelProps {
  score: ScoreBreakdown | null;
  guestsById: Map<string, Guest>;
  onGuestHighlight: (guestId: string | null) => void;
}
function ScorePanel({
  score,
  guestsById,
  onGuestHighlight,
  mixGroups
}: ScorePanelProps & {
  mixGroups: boolean;
}) {
  if (!score) return null;
  const missedGood = score.preferred.filter(result => !result.adjacent);
  const badAdjacent = score.avoided.filter(result => result.adjacent);
  const missedHeadSeat = score.headSeat.filter(result => !result.satisfied);
  const issues = missedGood.length + badAdjacent.length + missedHeadSeat.length;
  return <section className="panel-section score-panel">
    <h2>{issues ? `${issues} seating ${issues === 1 ? "preference" : "preferences"} to review` : score.preferred.length + score.avoided.length + score.headSeat.length ? "Seating preferences met" : "Review your plan"}</h2>
    {!score.preferred.length && !score.avoided.length && !score.headSeat.length && <p className="muted-text">No seating preferences added. You can add them in Setup.</p>}
    <div className="review-summary">
      {score.preferred.length > 0 && <p>{score.preferred.length - missedGood.length} of {score.preferred.length} near-seating preferences met</p>}
      {score.avoided.length > 0 && <p>{badAdjacent.length} keep-apart issues</p>}
      {score.headSeat.length > 0 && <p>{score.headSeat.length - missedHeadSeat.length} of {score.headSeat.length} end-seat preferences met</p>}
    </div>
    <PairResults title="Guests to seat nearer" results={missedGood} guestsById={guestsById} onGuestHighlight={onGuestHighlight} />
    <PairResults title="Guests to move apart" results={badAdjacent} guestsById={guestsById} onGuestHighlight={onGuestHighlight} />
    <HeadSeatResults results={missedHeadSeat} guestsById={guestsById} onGuestHighlight={onGuestHighlight} />
    <details className="scoring-details">
      <summary>Scoring details</summary>
      <p className="muted-text">Higher scores favour more preferences. Compare scores only with the same guests and settings.</p>
      <div className="metric-grid">
        <Metric label="Preference points" value={String(score.constraintPoints)} />
        {mixGroups && <Metric label="Group mixing points" value={String(score.groupPoints)} />}
        <Metric label="Total points" value={String(score.total)} />
      </div>
    </details>
  </section>;
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
  return <div className="pair-results">
    <h3>{title}</h3>
    {results.map(result => {
      const guestA = guestsById.get(result.pair.guestAId);
      const guestB = guestsById.get(result.pair.guestBId);
      const strength = result.pair.strength;
      const badgeTone = strength === "high" ? "high" : strength === "medium" ? "mid" : strength === "low" ? "low" : null;
      return <p key={result.pair.id}>
        <PairResultName guest={guestA} onGuestHighlight={onGuestHighlight} />
        <span aria-hidden="true"> / </span>
        <PairResultName guest={guestB} onGuestHighlight={onGuestHighlight} />
        {badgeTone && <span className={`constraint-badge constraint-badge-${badgeTone}`}>
          {STRENGTH_LABELS[strength!]}
        </span>}
      </p>;
    })}
  </div>;
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
  return <div className="pair-results">
    <h3>End-seat issues</h3>
    {results.map(result => {
      const guest = guestsById.get(result.constraint.guestId);
      const label = result.constraint.type === "prefer_head" ? "prefers an end seat" : "should avoid end seats";
      return <p key={result.constraint.id}>
        <PairResultName guest={guest} onGuestHighlight={onGuestHighlight} />
        <span> {label}</span>
      </p>;
    })}
  </div>;
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
  return <button className="pair-result-name" type="button" onBlur={() => onGuestHighlight(null)} onFocus={() => onGuestHighlight(guest.id)} onMouseEnter={() => onGuestHighlight(guest.id)} onMouseLeave={() => onGuestHighlight(null)}>
    {guest.name}
  </button>;
}
function describeScore(score: ScoreBreakdown): string {
  const parts: string[] = [];
  if (score.preferred.length) parts.push(`${score.preferred.filter(pair => pair.adjacent).length} of ${score.preferred.length} near preferences met`);
  if (score.avoided.length) parts.push(`${score.avoided.filter(pair => pair.adjacent).length} keep-apart issues`);
  if (score.headSeat.length) parts.push(`${score.headSeat.filter(result => !result.satisfied).length} end-seat issues`);
  return parts.join(" · ") || "No seating preferences added";
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
  return <section className="panel-section">
    <h2>Alternatives</h2>
    <div className="candidate-list">
      {candidates.length === 0 ? <p className="muted-text">Shuffle to compare options.</p> : null}
      {candidates.map((candidate, index) => <button type="button" className={`candidate-button ${activePlan?.id === candidate.plan.id ? "active" : ""}`} onClick={() => onSelect(candidate.plan)} aria-pressed={activePlan?.id === candidate.plan.id} key={candidate.plan.id}>
        <span>Option {index + 1}</span>
        <span className="candidate-summary">{describeScore(candidate.score)}</span>
      </button>)}
    </div>
  </section>;
}
function LibraryPanel({
  savedLayouts,
  activePlanId,
  onLoad,
  onDelete,
  onRename
}: {
  savedLayouts: (SavedLayout & {
    summary: string;
  })[];
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
  return <section className="panel-section">
    <h2>Kept versions</h2>
    <div className="library-list">
      {savedLayouts.length === 0 ? <p className="muted-text">No versions yet. Choose “Keep this version” on your plan to save an arrangement.</p> : null}
      {savedLayouts.map(layout => <div className={`library-entry${layout.plan.id === activePlanId ? " active" : ""}`} key={layout.id}>
        <div className="library-entry-info">
          {editingId === layout.id ? <input aria-label="Version name" className="library-name-input" value={editingName} autoFocus onChange={e => setEditingName(e.target.value)} onBlur={commitEdit} onKeyDown={e => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") setEditingId(null);
          }} /> : <button className="library-name" type="button" title="Open saved plan" onClick={() => onLoad(layout.plan)}>
            {layout.name}
          </button>}
          <span className="candidate-summary">{layout.summary}</span>
          <span className="muted-text">{new Date(layout.savedAt).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short"
          })}</span>
        </div>
        <div className="library-entry-actions">
          <button type="button" className="icon-button" aria-label={`Rename ${layout.name}`} onClick={() => startEditing(layout)}>
            <Pencil size={15} />
          </button>
          <button type="button" className="icon-text-button" onClick={() => onLoad(layout.plan)}>
            Open plan
          </button>
          <button type="button" className="icon-button danger" onClick={() => onDelete(layout.id)} aria-label="Delete saved layout">
            <Trash2 size={15} />
          </button>
        </div>
      </div>)}
    </div>
  </section>;
}
function Metric({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return <div className={`metric ${tone ?? ""}`}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>;
}
function moveGuestToSeat(plan: Plan, guestId: string, seatId: number): Plan {
  const nextPlan = clonePlan(plan);
  nextPlan.id = crypto.randomUUID();
  const source = Object.keys(nextPlan.assignments).map(Number).find(id => nextPlan.assignments[id] === guestId);
  const displaced = nextPlan.assignments[seatId];
  if (source === seatId) return plan;
  if (source !== undefined) nextPlan.assignments[source] = displaced ?? null;
  nextPlan.assignments[seatId] = guestId;
  nextPlan.holdingGuestIds = nextPlan.holdingGuestIds.filter(id => id !== guestId);
  if (source === undefined && displaced && !nextPlan.holdingGuestIds.includes(displaced)) nextPlan.holdingGuestIds.push(displaced);
  return nextPlan;
}
function moveGuestToHolding(plan: Plan, guestId: string): Plan {
  const nextPlan = clonePlan(plan);
  nextPlan.id = crypto.randomUUID();
  for (const seatId of Object.keys(nextPlan.assignments).map(Number)) {
    if (nextPlan.assignments[seatId] === guestId) nextPlan.assignments[seatId] = null;
  }
  if (!nextPlan.holdingGuestIds.includes(guestId)) nextPlan.holdingGuestIds.push(guestId);
  return nextPlan;
}
function isValidConstraint(constraint: Constraint, guestsById: Map<string, Guest>): boolean {
  if (isPairConstraint(constraint)) {
    return constraint.guestAId !== constraint.guestBId && guestsById.has(constraint.guestAId) && guestsById.has(constraint.guestBId);
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
    if (assignedGuestIds.has(guestId)) {
      nextPlan.assignments[seatId] = null;
      continue;
    }
    assignedGuestIds.add(guestId);
  }
  nextPlan.holdingGuestIds = nextPlan.holdingGuestIds.filter(guestId => guestIds.has(guestId) && !assignedGuestIds.has(guestId));
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
    assignments: {
      ...plan.assignments
    },
    holdingGuestIds: [...plan.holdingGuestIds]
  };
}
const GROUP_CLASS_COUNT = 6;
function getGroupClass(guest: Guest): string {
  if (guest.groups.length === 0) return "";
  let hash = 0;
  for (let i = 0; i < guest.groups[0].length; i++) {
    hash = hash * 31 + guest.groups[0].charCodeAt(i) >>> 0;
  }
  return `group-${hash % GROUP_CLASS_COUNT + 1}`;
}
interface VenueSetupProps {
  config: VenueConfig;
  onConfirm: (config: VenueConfig) => void;
}
function VenueSetup({
  config,
  onConfirm
}: VenueSetupProps) {
  const [tables, setTables] = useState<TableConfig[]>(config.tables);
  let nextId = Math.max(0, ...tables.map(t => t.id)) + 1;
  function addRect() {
    setTables([...tables, {
      kind: "rect",
      id: nextId++,
      label: `Table ${nextId - 1}`,
      seatsPerSide: 9,
      leftEnd: false,
      rightEnd: true
    }]);
  }
  function addCircular() {
    setTables([...tables, {
      kind: "circular",
      id: nextId++,
      label: `Table ${nextId - 1}`,
      seats: 8
    }]);
  }
  function removeTable(id: number) {
    setTables(tables.filter(t => t.id !== id));
  }
  function updateTable(updated: TableConfig) {
    setTables(tables.map(t => t.id === updated.id ? updated : t));
  }
  return <div className="venue-setup">
    <h2>Table setup</h2>
    <p className="venue-setup-hint">Match the tables to your venue. Layout changes clear seating plans; guests and preferences are kept.</p>
    <div className="venue-setup-tables">
      {tables.map(table => <div className="venue-setup-table" key={table.id}>
        <div className="venue-setup-table-header">
          <input aria-label={`Table ${table.id} name`} className="venue-setup-label-input" value={table.label ?? ""} onChange={e => updateTable({
            ...table,
            label: e.target.value
          })} placeholder="Table name" />
          <span className="venue-setup-kind">{table.kind === "rect" ? "Long table" : "Circular"}</span>
          <button type="button" onClick={() => removeTable(table.id)} aria-label="Remove table">
            <Trash2 size={14} />
          </button>
        </div>
        {table.kind === "rect" ? <div className="venue-setup-table-fields">
          <label>
            Seats per side
            <input type="number" min={1} max={20} value={table.seatsPerSide} onChange={e => updateTable({
              ...table,
              seatsPerSide: Math.max(1, Math.min(20, Number(e.target.value)))
            })} />
          </label>
          <label>
            <input type="checkbox" checked={table.leftEnd} onChange={e => updateTable({
              ...table,
              leftEnd: e.target.checked
            })} />
            Head seat (left end)
          </label>
          <label>
            <input type="checkbox" checked={table.rightEnd} onChange={e => updateTable({
              ...table,
              rightEnd: e.target.checked
            })} />
            Head seat (right end)
          </label>
        </div> : <div className="venue-setup-table-fields">
          <label>
            Seats
            <input type="number" min={3} max={30} value={table.seats} onChange={e => updateTable({
              ...table,
              seats: Math.max(3, Math.min(30, Number(e.target.value)))
            })} />
          </label>
        </div>}
      </div>)}
    </div>
    <div className="venue-setup-actions">
      <button type="button" onClick={addRect}><Plus size={14} /> Long table</button>
      <button type="button" onClick={addCircular}><Plus size={14} /> Circular table</button>
      <button type="button" className="primary-button" disabled={tables.length === 0} onClick={() => onConfirm({
        tables
      })}>
        Use these tables
      </button>
    </div>
  </div>;
}
function getSeatStyle(side: string, position: number, seatsPerSide: number, hasLeftEnd: boolean) {
  const colOffset = hasLeftEnd ? 2 : 1;
  if (side === "top") return {
    gridColumn: `${position + colOffset}`,
    gridRow: "1"
  };
  if (side === "bottom") return {
    gridColumn: `${position + colOffset}`,
    gridRow: "3"
  };
  if (side === "left-end") return {
    gridColumn: "1",
    gridRow: "2"
  };
  if (side === "right-end") return {
    gridColumn: `${seatsPerSide + colOffset}`,
    gridRow: "2"
  };
  return {};
}
