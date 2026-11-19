# Table Planner

A local-first seating planner built with Vite, React, and TypeScript. Set up your tables, add guests and optional seating preferences, then generate and adjust seating plans.

Guest lists, spreadsheet parsing, and plan generation stay in the browser. Applied changes are automatically saved in that browser's `localStorage`. Other browsers, devices, and website origins have separate data; clearing browser data removes the session. Download a backup to keep a separate copy or move your work.

## Install and run

```
npm install
npm run dev
```

Open [http://localhost:5173/table-planner/](http://localhost:5173/table-planner/). `just dev` also works.

## How to use

### 1. Setup

**Check your tables.** Use the default 39-seat layout or choose **Change tables**. Add long or circular tables, set seat counts, and optionally enable end seats on long tables. Choose **Use these tables** to apply. Changing seating geometry clears current and saved plans after a review; guests and preferences are kept. Renaming tables preserves plans. Unchanged tables leave everything intact.

**Add guests.** Choose **Paste or type names**, enter one guest per line, then choose **Done**. Changes remain a cancellable draft until Done. Existing names keep their identities when reordered or when lines are inserted. Replacing a name in a same-length list is treated as a rename, preserving its seat and preferences. Removed guests are removed from seating plans and preferences; Undo restores the previous session.

For an explicit rename, expand **View guest list** and use the pencil beside a name. Bulk edits that remove names and introduce new ones are reviewed before applying, so ambiguous renames cannot silently remove someone's seating preferences.

Optional group labels follow a comma:

```
Jane Smith, Family
Sam Jones, Friends
Alex Lee, Friends, Younger
Pat Morgan
```

**Choose spreadsheet** reads CSV, TSV, or Excel files locally. Preview the detected names and warnings before accepting. Importing a spreadsheet replaces guests and clears preferences and current/saved plans; it can be undone. **Try an example** provides sample guests when the list is empty.

**Seating preferences** is optional and collapsed by default:

- **Seat near each other:** neighbours, neighbours or opposite, or anywhere nearby (including diagonals). Closer-distance preferences receive more priority.
- **Keep apart:** avoid nearby seats, including opposite and diagonal seats.
- **End-seat preferences:** prefer or avoid end seats on long tables. These controls appear when the venue has end seats.
- **Mix guests from the same group:** optional mixing of group labels. Explicit seating preferences take priority. Disabled for new sessions; existing backups retain their previous group-mixing behaviour.

These are weighted preferences, not guarantees. Conflicting preferences are flagged during setup.

Choose **Generate seating plans** when ready. Guests beyond the available capacity remain unseated.

### 2. Plan

The app generates up to six alternatives and opens the best option. Review the seated count, unmet preferences, and alternatives. Hover or focus names in the issue lists to locate guests. Point totals are in **Scoring details**.

Drag a guest to an empty seat to move them, or to an occupied seat to swap them. Dropping an unseated guest onto an occupied seat unseats its occupant. Guests can also be dragged to **Unseated guests**.

For click, touch, or keyboard input, select a guest on the canvas or in **Move or swap a guest**, choose a destination, then use **Move / swap** or **Unseat guest**. Full names appear on guest chips and in the movement controls.

**Generate more options** explores new arrangements. **Generation settings** contains search effort (higher takes longer) and **Reseat in guest-list order**. **Undo** restores recent changes, including generation, manual moves, preference changes, imports, and deletions. History is limited to the last 20 actions in the current session and is not persisted across reloads.

**Print** produces a monochrome plan with full names. If anyone is unseated, the app warns before printing a draft and includes their names on the printout.

### 3. Saved plans and backups

**Keep this version** stores an independent snapshot in **Saved plans**. Use the pencil button to rename it, or **Open plan** to restore it. Summaries reflect the current seating preferences. Guest-list edits are reconciled across kept versions too.

Kept versions are stored in the same browser as the working plan. They are not external backups.

The **Backup & restore** menu contains:

- **Download backup:** JSON containing guests, stable guest identities, preferences, group-mixing settings, tables, the current plan, and kept versions.
- **Restore backup:** review and replace the session from a downloaded JSON file. Restore can be undone. Older exports are still supported; those without table configuration use the default tables.

Local saving errors are reported in the saving status. Unreadable sessions are left untouched until the user restores a backup or explicitly starts fresh.

## Deployment

The GitHub Actions workflow in `.github/workflows/deploy.yml` builds and deploys to [GitHub Pages](https://sebbacon.github.io/table-planner/) on pushes to `main`, or manually from the Actions tab. In **Settings → Pages**, choose **GitHub Actions** as the source. No deployment secrets are needed.

For a local production preview, run `npm run build` followed by `npm run preview`, then open `http://localhost:4173/table-planner/`. The base path is `/table-planner/`.

Moving between the local and hosted app requires downloading and restoring a backup because they have separate browser storage.

## Code quality

- `npm run lint` / `just lint`: ESLint and TypeScript rules.
- `npm test` / `just test`: domain and interaction regression tests.
- `npm run test:coverage` / `just coverage`: V8 coverage, including untested files. Reports in `coverage/`.
- `npm run metrics:crap` / `just crap`: refresh coverage and rank complexity/coverage hotspots; results in `coverage/crap.json`.
- `npm run check` / `just check`: lint, coverage, CRAP report, and production build.

CRAP is `complexity² × (1 − coverage)³ + complexity`. Function coverage uses the fraction of executable statement-start lines covered inside each function, excluding nested functions. This is a line-based approximation. Scores of 30 or more are highlighted for review; metrics are informational.

Keep generated/local files out of git: `node_modules/`, `dist/`, `.venv/`, coverage reports, and exported planner data are ignored.
