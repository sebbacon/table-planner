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

**Choose spreadsheet** reads CSV, TSV, or Excel files locally. Preview the names and other columns before accepting. Confirm whether the first row contains headings, choose one or two name columns, and uncheck any columns you do not want to import. All imported columns start with no seating effect. Importing a spreadsheet replaces guests and clears preferences and current/saved plans; it can be undone. **Try an example** provides sample guests when the list is empty.

**Seating preferences** is optional. Each preference group is collapsible and starts collapsed, with its count visible:

- **Seat near each other:** choose **Sit next to each other**, **Sit where they can chat**, or **Share a table**. Chatting includes neighbours, opposite seats and diagonals on long tables, or neighbours and next-but-one on circular tables. Sharing a table gives equal credit anywhere at that table. Choose **Normal** or **High** priority independently; High doubles the scoring weight without changing which seats qualify. Expand **How seating preferences work** for illustrated examples.
- **Keep apart:** prefer separate tables. On long tables, the penalty fades quickly with distance in seat spacings, leaving only a small penalty several seats away. On circular tables, the shared-table penalty stays constant at every distance. The review panel flags pairs still sharing a table, even when seated far apart. Room-canvas positions do not affect distance scoring.
- **End-seat preferences:** prefer or avoid end seats on long tables. These controls appear when the venue has end seats.
- **Rules from guest columns:** choose a purpose for each imported column: **Don’t use for seating**, **Spread across tables**, **Group at the same table**, **Mix neighbouring seats**, or **Table assignment**. Spreading accounts for table capacities and overall group proportions. Clustering prefers matching values at the same table; large groups can span several tables. Blank cells are unspecified. Same-table grouping takes priority over spreading and neighbour mixing. All column preferences come after individual seating preference scores. Rules within each tier have equal importance.
- **Table assignment:** map each nonblank spreadsheet value (for example, “A” or “VIP”) to a table explicitly. Matching names provide suggestions for you to accept. Links use stable table identities, so renaming a table preserves assignments. Removing a table requires remapping its values; newly added tables never reuse removed identities. Missing mappings, conflicting assignments, and overfilled tables block generation. Manual moves and saved-plan loading cannot create new violations of fixed assignments.

Older backups map “Neighbours” to next-to with High priority, and “Neighbours or opposite” / “Anywhere nearby” to chatting with Normal priority. Explicit new preference and priority fields take precedence over legacy fields.

Individual and group rules are weighted preferences. Fixed table assignments are guarantees. The solver compares individual preference scores first, then same-table column grouping, then spreading and neighbour mixing. Lower-tier improvements cannot outweigh a higher-tier improvement. Conflicting preferences are flagged during setup.

Existing comma-separated labels migrate to a **Groups** column with every membership preserved. Its original nearby-seat mixing setting remains enabled or disabled as before. Labels edited in the text guest list stay in sync. Existing plans, saved versions, guest identities, and individual preferences are preserved; older backups remain importable. New backups and local sessions use version 2 and include all column values, rules, and table mappings.

Choose **Generate seating plans** when ready. Guests beyond the available capacity remain unseated.

### 2. Plan

The app generates up to six alternatives and opens the best option. Review the seated count, unmet preferences, and alternatives. Hover or focus names in the issue lists to locate guests. Point totals are in **Scoring details**.

**Pin seats.** Use the pin toggle beside an occupied seat number to keep that guest in that exact seat. Pins apply when generating more options, making manual moves, and opening saved plans. Unpin before moving a pinned guest or displacing them. The **Pinned seats** list in Setup and Plan also lets you remove pins, including conflicting or unavailable ones. Pins follow guest identities through renames and are included in local saving, backups, and Undo. Removing a guest removes their pin. Table renames keep pins; changing table geometry clears them along with the current and saved plans after the existing review. Conflicts between pins and fixed table assignments must be resolved before generating.

Drag a guest to an empty seat to move them, or to an occupied seat to swap them. Dropping an unseated guest onto an occupied seat unseats its occupant. Guests can also be dragged to **Unseated guests**.

For click, touch, or keyboard input, select a guest on the canvas or in **Move or swap a guest**, choose a destination, then use **Move / swap** or **Unseat guest**. Full names appear on guest chips and in the movement controls.

**Generate more options** explores new arrangements. **Generation settings** contains search effort (higher takes longer) and **Reseat in guest-list order**. **Undo** restores recent changes, including generation, manual moves, preference changes, imports, and deletions. History is limited to the last 20 actions in the current session and is not persisted across reloads.

**Print** produces a monochrome plan with full names. If anyone is unseated, the app warns before printing a draft and includes their names on the printout.

### 3. Saved plans and backups

**Keep this version** stores an independent snapshot in **Saved plans**. Use the pencil button to rename it, or **Open plan** to restore it. Summaries reflect the current seating preferences. Guest-list edits are reconciled across kept versions too.

Kept versions are stored in the same browser as the working plan. They are not external backups.

**Share plan → Copy share link** creates a snapshot containing guest names and identities, seating preferences, guest columns and fixed table mappings, table geometry and room positions, seat pins, and the current seating plan. Saved versions, generated alternatives, undo history, and unapplied guest-list drafts are excluded. Apply drafts with **Done** before sharing.

The compressed snapshot is carried in the URL fragment (`#plan=…`), so sharing needs no backend. Anyone with the link can read the included data. Later edits require a new link. Opening a link previews it before replacing the local session; **Undo** restores the previous session. Once opened or cancelled, the fragment is removed so reloading uses the current local session. Long links show a reminder to use a backup if a messaging app cannot send them; oversized plans must use backups.

The **Backup & restore** menu contains:

- **Download backup:** JSON containing guests, stable guest identities, preferences, guest columns and their rules, fixed table mappings, tables, the current plan, and kept versions.
- **Restore backup:** review and replace the session from a downloaded JSON file. Restore can be undone. Older exports are still supported; those without table configuration use the default tables.

Local saving errors are reported in the saving status. Unreadable sessions are left untouched until the user restores a backup or explicitly starts fresh.

## Deployment

The GitHub Actions workflow in `.github/workflows/deploy.yml` builds and deploys to [GitHub Pages](https://sebbacon.github.io/table-planner/) on pushes to `main`, or manually from the Actions tab. In **Settings → Pages**, choose **GitHub Actions** as the source. No deployment secrets are needed.

For a local production preview, run `npm run build` followed by `npm run preview`, then open `http://localhost:4173/table-planner/`. The base path is `/table-planner/`.

The local and hosted app have separate browser storage. Transfer a snapshot using a share link (with its base URL changed to the destination app), or download and restore a backup to include saved versions.

## Code quality

- `npm run lint` / `just lint`: ESLint and TypeScript rules.
- `npm test` / `just test`: domain and interaction regression tests.
- `npm run test:coverage` / `just coverage`: V8 coverage, including untested files. Reports in `coverage/`.
- `npm run metrics:crap` / `just crap`: refresh coverage and rank complexity/coverage hotspots; results in `coverage/crap.json`.
- `npm run check` / `just check`: lint, coverage, CRAP report, and production build.

CRAP is `complexity² × (1 − coverage)³ + complexity`. Function coverage uses the fraction of executable statement-start lines covered inside each function, excluding nested functions. This is a line-based approximation. Scores of 30 or more are highlighted for review; metrics are informational.

## Changing saved data

Backups, browser sessions, and share-link payloads all use `createPersistedPlannerData` and the migration path in `src/domain/persistence.ts`. `PLANNER_DATA_VERSION` and the current wire type are selected in `persistenceSchema.ts`. These wire types describe published data independently of the working `PlannerData` model; the versioned parser projects both top-level and nested fields explicitly. Readers return the working model with legacy defaults already applied.

For changes to persisted fields, enum meanings, or seat numbering, add a new wire schema and migration, retain the older parsers, and advance the central data version. Do not change the meaning of V2 fields in place. Preserve historical venue geometry when migrating plans with numbered seats. The local-storage key is a stable address: keep it unchanged when raising the data version so upgrades can find existing sessions. Only historical browser sessions may omit a version; unknown versions are rejected and local saving pauses to protect those sessions.

Link encoding has its own version (`v1`, deflate plus URL-safe base64), independent of the contained data schema. Change it only when the envelope/encoding changes, and retain old decoders. A newer data schema inside a known encoding prompts the recipient to update the app.

`src/domain/__fixtures__/` contains immutable V1/V2 backups, an unversioned session, and an original encoded share link. Keep these fixtures when extending the format, add an example for each new version, and test its migration alongside current round-trips. Run `npm run metrics:crap` before and after persistence changes and review affected functions for increases as well as new scores of 30 or more.

Keep generated/local files out of git: `node_modules/`, `dist/`, `.venv/`, coverage reports, and exported planner data are ignored.
