# Table Planner

A browser-based tool for generating and optimising seating plans. Enter your guest list, set constraints (who should sit near whom, who should avoid whom), and let the solver find the best arrangement across your tables.

State is auto-saved to `localStorage`. Export to JSON to back up or share a plan.

## Install and run

```
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

If you have [just](https://github.com/casey/just) installed, `just` also works.

## How to use

### 1. Configure your tables

Click **Table setup** in the top bar. Add long (rectangular) tables or circular tables, set the number of seats, and optionally enable head seats at either end of a long table. Click **Confirm layout** when done.

Changing the layout clears any existing plan and saved layouts.

### 2. Enter guests

Click **Edit** in the Guests panel and type one guest per line:

```
Jane Smith, F
Sam Jones, M
Alex Lee
```

The gender suffix (`F`, `M`, or `Other`) is optional but used for gender-balance tie breaker scoring if you think that sort of thing matters. You can also **Upload** a CSV or Excel spreadsheet — the first column is treated as the name, the second (if present) as gender.

### 3. Add constraints

Constraints are weighted preferences, not hard rules. The solver tries to satisfy as many as possible.

**Good Adjacent** — pairs of guests who should sit next to each other. Each pair has a strength:
- **High** — direct neighbours only
- **Med** — direct neighbours or directly opposite
- **Low** — any nearby seat counts

**Avoid Adjacent** — pairs who should not sit next to each other.

**Head Seats** — mark individual guests as preferring or avoiding the end seats of a long table.

> **Tip:** the more constraints you add, the harder it is to satisfy them all. If one guest appears in many "Good Adjacent" pairs, the solver can only place them next to so many people at once. The **Constraint Conflicts** panel (shown automatically when issues are detected) flags guests who have more constraints than can realistically be satisfied.

### 4. Generate a plan

Click **Shuffle** to generate six candidate plans. The solver runs a randomised local-search: it seeds candidate arrangements, then iteratively swaps seats to improve the score, and returns the best options.

Use the **Effort** slider to trade speed for quality — higher effort means more search iterations.

The **Alternatives** panel on the right lists all six candidates with their scores. Click any to load it as the active plan.

### 5. Review and adjust

The **Score** panel breaks down the active plan:
- Good pairs met vs. total
- Bad adjacencies
- Head seat constraints satisfied
- Gender balance points

Hover over a guest name to highlight their seat in the layout. Drag guest chips to swap seats manually, or drag someone to the **Holding Area** to leave their seat empty.

### 6. Save and export

- **Save to library** — bookmark the current plan to compare against future shuffles. Click a saved name to rename it.
- **Export Data** — download a JSON file containing guests, constraints, and all saved layouts.
- **Import Data** — restore from a previously exported file.
- **Print** — print-optimised layout (monochrome, full names).
