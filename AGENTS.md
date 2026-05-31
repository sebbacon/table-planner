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
- High-level scoring lives in `src/domain/scoring.ts`: good pairings reward proximity, avoid pairings penalize adjacency, head-seat constraints prefer or avoid table-end seats, and gender balance adds smaller distribution points.
- Good adjacency is ranked: same-side left/right first, directly opposite next, table-end adjacency next, diagonal last. Avoid adjacency still treats all adjacency/proximity tiers as bad.
- Candidate generation and local search live in `src/domain/solver.ts`. Keep scoring policy in `scoring.ts` unless the search strategy itself changes.
