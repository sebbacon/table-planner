# Agent Notes

## Project Shape
- This is a local Vite + React + TypeScript app. Use `just dev` or `npm run dev -- --port 5173` to start it.
- Keep generated/local files out of git: `node_modules/`, `dist/`, `.venv/`, and exported planner data such as `data.json` are ignored.

## Table Plan
- The fixed table/seat layout is defined in `src/domain/seating.ts`.
- `SEATS` is the source of truth for seat ids, table membership, side/end placement, and ordering. Seat `39` is the extra left-end seat on table 2.
- Seat proximity and adjacency are also defined in `src/domain/seating.ts`. Good-pair scoring depends on proximity tiers, so update the seating tests when changing the table geometry.

## Constraint Solver
- Constraints are weighted preferences, not hard rules. The solver generates random candidate plans, improves them by local seat swaps, scores each candidate, then returns the best options.
- High-level scoring lives in `src/domain/scoring.ts`: good pairings express next-to, chatting, or same-table intent with independent Normal/High priority; avoid pairings prefer separate tables and otherwise apply a distance-decaying penalty on long tables or a constant shared-table penalty on circular tables, head-seat constraints prefer or avoid table-end seats, and gender balance adds smaller distribution points.
- Next-to accepts immediate neighbours and adjacent end seats. Chatting also accepts opposite and diagonal seats on long tables, and next-but-one on circular tables. Same-table gives equal credit at any distance. High priority doubles points without changing satisfaction.
- Keep-apart scoring favours separate tables over any same-table placement; on a shared long table, the penalty decays exponentially with absolute seat distance (40% remaining per extra seat spacing, with a small residual penalty); on circular tables, the shared-table penalty is constant at all distances. Geometry for this distance is defined in `getSeatDistance`; room-canvas positions do not affect scoring.
- Legacy `strength` values are read through `pairPreferences.ts`; new pairs use `preference` and `priority`.
- Candidate generation and local search live in `src/domain/solver.ts`. Keep scoring policy in `scoring.ts` unless the search strategy itself changes.
