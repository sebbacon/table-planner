# Agent Notes

## Project Shape
- This is a local Vite + React + TypeScript app. Use `just dev` or `npm run dev -- --port 5173` to start it.
- Keep generated/local files out of git: `node_modules/`, `dist/`, `.venv/`, and exported planner data such as `data.json` are ignored.

## Table Plan
- The fixed table/seat layout is defined in `src/domain/seating.ts`.
- `SEATS` is the source of truth for seat ids, table membership, side/end placement, and ordering. Seat `39` is the extra left-end seat on table 2.
- Seat proximity and adjacency are also defined in `src/domain/seating.ts`. Good-pair scoring depends on proximity tiers, so update the seating tests when changing the table geometry.

## Constraint Solver
- Individual and group constraints are weighted preferences. Fixed table assignments from guest columns are hard rules during generation, except where overridden by seat pins. Manual moves and plan loading may override all seating rules while preserving pins. The solver generates random candidate plans, improves them by local seat swaps, scores each candidate, then returns the best options.
- High-level scoring lives in `src/domain/scoring.ts`: good pairings express next-to, chatting, or same-table intent with independent Normal/High priority; avoid pairings prefer separate tables and otherwise apply a distance-decaying penalty on long tables or a constant shared-table penalty on circular tables, head-seat constraints prefer or avoid table-end seats, and gender balance adds smaller distribution points.
- Next-to accepts immediate neighbours and adjacent end seats. Chatting also accepts opposite and diagonal seats on long tables, and next-but-one on circular tables. Same-table gives equal credit at any distance. High priority doubles points without changing satisfaction.
- Keep-apart scoring favours separate tables over any same-table placement; on a shared long table, the penalty decays exponentially with absolute seat distance (40% remaining per extra seat spacing, with a small residual penalty); on circular tables, the shared-table penalty is constant at all distances. Geometry for this distance is defined in `getSeatDistance`; room-canvas positions do not affect scoring.
- Legacy `strength` values are read through `pairPreferences.ts`; new pairs use `preference` and `priority`.
- Candidate generation and local search live in `src/domain/solver.ts`. Keep scoring policy in `scoring.ts` unless the search strategy itself changes.

## Guest Columns and Migration
- `src/domain/guestColumns.ts` owns legacy group migration, identity-based column reconciliation, and fixed table assignment resolution/validation.
- `GuestColumn` stores a stable id, label, mode, values keyed by guest id, and explicit value-to-table-id mappings. Blank cells have no membership or assignment. New imports default to `ignore`.
- Column scoring belongs in `scoring.ts`. Rules within each tier have equal normalized weight. Compare individual constraint points first, then same-table column grouping points, then other column points, during both search and final ranking; do not combine these tiers for decisions. Search retains its best plan across exploratory moves.
- During generation, fixed guests are placed before other guests, including overflow guests, and cannot be swapped off their resolved table (pins take priority). Manual moves and loading plans are exempt from table rules. Missing mappings, contradictory assignments, or table overcapacity block generation.
- Table ids are stable across renames; `VenueConfig.nextTableId` prevents reuse after deletion. Deleting tables clears their mappings for explicit remapping.
- Backups/local storage use version 2; version 1 remains readable. Missing columns migrate via `legacyGroupColumn`, preserving multiple group labels and `mixGroups` (default true for legacy data). `legacyGroups` columns retain original nearby-seat geometry and stay in sync with text-list group edits.
- Imported attributes follow stable guest identities through renames/reordering; removed guests lose memberships, and Undo/backups preserve the complete column state.

## Seat Pins
- `PlannerData.seatPins` maps stable guest ids to exact seat ids; it is optional in version 1/2 backups and defaults to empty. Pins apply across generated alternatives and saved-plan loading.
- Resolve pins together with fixed table assignments before generating, with pins taking priority over table assignments, while validating duplicate/missing seats and combined table capacity. Seed pinned guests first and exclude pinned seats from every local-search/guided/kick swap.
- Pin toggles appear on occupied seats in long/circular tables and both Plan views. Manual moves and plan loading must preserve every pin. Undo, reload, and backups retain pins; guest deletion prunes pins. Geometry changes explicitly clear pins because global seat numbering may change; table renames preserve them.

## Persistence and Share Links
- Backups, local sessions, and link payloads use the common serializer and migrations in `src/domain/persistence.ts`. Keep the storage key stable across data-version upgrades.
- Published wire types in `persistenceSchema.ts` are independent of the working model. For persisted structure, enum-meaning, or seat-numbering changes, add a schema version and migration instead of changing existing wire semantics. Retain old parsers and historical default geometry.
- The link encoding version is independent of the contained data version. Unknown data versions must be rejected without overwriting local sessions.
- Keep `src/domain/__fixtures__/` immutable; add new fixtures for new versions. Compare CRAP scores before and after persistence changes, addressing new hotspots and increases in affected functions.
