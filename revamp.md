# Decipher Rebuild Spec

> Product: speedcubing timer. Branded **Ao5** on screen, **Decipher** as project/repo/URL identity.
>
> This spec rebuilds the app in 8 phases. Each phase is self-contained enough that you can `/clear` between them. Follow them in order unless noted.

---

## Overview

Decipher is already architecturally solid. This spec is not a rewrite, it's a targeted upgrade across four tracks: (1) fix UX bugs, (2) polish visual identity, (3) add three new features (3D scramble preview, expanded stats page, minimal trainers), (4) modernize the toolchain. Current backend (Flask + Supabase) stays as-is except for one migration (soft-delete).

## Goals

- Ship a timer that feels as snappy and correct as CubeMania for the core solve loop.
- Keep the existing dark theme identity; add a light theme.
- Add a dedicated stats page with a time series dot plot, GitHub-style heatmap, and distribution histogram.
- Add minimal OLL/PLL/F2L trainers (case-specific scramble + timer, no analyzer).
- Migrate to Vite + TypeScript without changing app behavior.

## Non-goals (explicitly not doing this round)

- Multiplayer rooms, smart cube Bluetooth, manual time entry, named session archiving, public profiles/leaderboards, solve notes, streak tracking, BLD/OH/feet events, full trainer analytics. Listed here so future work has a reference.

## Design principles

1. **One format, one place.** Every time display goes through one `formatTime` utility. Every stat through one `computeStats` module. No duplicated logic across components.
2. **Data in state, not in the DOM.** No `document.querySelector` for app data.
3. **Keep the hot path cheap.** The solve loop (press, inspect, solve, save, next scramble) must not hitch on a network request. Scrambles are pre-fetched, writes are optimistic.
4. **Inspired by CubeMania's IA, not its skin.** Keep Decipher's dark-first identity. CubeMania is a reference for behavior, not colors.
5. **Destructive actions are recoverable.** Delete is soft-delete. Reset is view-only.

---

## Tech stack decisions

- **Build:** Vite 5 (replacing Create React App).
- **Language:** TypeScript, strict mode.
- **UI:** React 18 (unchanged), CSS modules per component (unchanged pattern), CSS variables for theme tokens.
- **Cube engine:** `cubing` npm package (replacing CDN import), using `randomScrambleForEvent` and `TwistyPlayer`.
- **Charts:** Recharts (unchanged). Add `@nivo/calendar` for the GitHub-style heatmap (pick whichever small lib works; Recharts doesn't do calendar heatmaps well).
- **State:** React built-ins (useState, useReducer, useContext). No Redux. Existing custom hooks (`useCircularBuffer`, `useMedianTracker`) stay.
- **Router:** `react-router-dom` v6 (new dependency). Timer at `/`, stats at `/stats`, trainers at `/trainers/oll` etc.
- **Persistence for user prefs:** localStorage for v1 (theme, inspection on/off, sound on/off). Later can upgrade to a Supabase `user_preferences` table if cross-device sync matters.

## Data model changes

Single migration. File: `backend/migrations/004_soft_delete.sql`:

```sql
ALTER TABLE solves ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX idx_solves_deleted_at ON solves (deleted_at) WHERE deleted_at IS NULL;
```

All existing `SELECT` queries in `backend/app/routes/solves.py` must add `.is_('deleted_at', None)` to filter soft-deleted rows by default. Delete endpoint becomes an `UPDATE ... SET deleted_at = now()` instead of a hard `DELETE`.

---

# Phase 1: Foundation

**Goal:** migrate to Vite + TypeScript, centralize utilities, kill the CDN import, clear outstanding dead code. No new features, no visual changes. App behavior at the end of this phase must be identical to before, just on a new foundation.

### Scope

- Migrate `frontend/` from CRA to Vite.
  - Delete `react-scripts`. Install `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`.
  - Add `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`. Use standard React + TS preset.
  - Move `public/index.html` to `frontend/index.html` at repo-root level with the Vite `<script type="module" src="/src/index.tsx">` entry.
  - Update `package.json` scripts: `dev`, `build`, `preview`. Delete `eject`.
  - Replace `process.env.REACT_APP_API_URL` with `import.meta.env.VITE_API_URL`. Rename the env var in `.env`.
- Convert every `.js` file under `frontend/src/` to `.ts` or `.tsx`. One PR-equivalent chunk per folder (services, hooks, components). Fix all `any` by inferring types from usage.
- Install `cubing` as a dependency (e.g. `cubing@^0.54`). In `src/components/Scramble.tsx`, replace the runtime CDN import with a standard top-level import.
- Create `src/utils/formatTime.ts` with one exported `formatTime(seconds: number, opts?: { showSign?: boolean }): string`. Rules:
  - `< 60`: `"SS.cc"` (e.g. `"23.45"`). Always 2-digit centiseconds, no leading zero seconds below 10 (`"9.12"` not `"09.12"`).
  - `>= 60 && < 3600`: `"M:SS.cc"` (e.g. `"2:07.45"`).
  - `>= 3600`: `"H:MM:SS.cc"` (rare but possible for megaminx).
  - Input is always seconds (float). The `+2` penalty is applied by callers before formatting.
  - DNF and null have their own display rules handled at component level, not inside `formatTime`.
- Replace every time-rendering call site across the codebase to use `formatTime`:
  - `Timer.tsx`: existing `formatTime(ms)` uses milliseconds and its own format. Remove the local version; convert `ms -> seconds` at the call site.
  - `SolveLog.tsx`: the `${time}s` patterns, and the `calculateAverage` return path.
  - `SolveHub.tsx`: all `.toFixed(2) + 's'` patterns, both custom tooltips.
- Clean up from `TASKS.txt`:
  - Remove `isSolving` dead prop (`Timer`, `SolveSession`). TASKS BUG/DEAD CODE 5.
  - Delete `reportWebVitals.js`. TASKS DEAD CODE 4 (already checked but verify it's gone).
  - Re-enable `React.StrictMode` in `index.tsx`. TASKS COMPLEXITY 6.
- Update `frontend/README.md` with Vite commands.

### Acceptance criteria

- `npm run dev` starts Vite.
- `npm run build` produces a production bundle.
- App at `localhost:5173` behaves identically to the pre-migration app at `localhost:3000`.
- Running a solve of 127.45 seconds displays `"2:07.45"` in the Timer, the SolveLog row, and the SolveHub "Best"/"Average" cells.
- `Scramble.tsx` has no runtime CDN import. Bundling succeeds.
- No `any` types remain in the codebase (run `npx tsc --noEmit` clean).

---

# Phase 2: Timer & scramble core

**Goal:** fix the inspection spacebar bug, add WCA-standard inspection warnings, add a stackmat-style hold-to-start delay, and make scrambles feel instant via prefetching.

### Timer state machine (the big fix)

Replace the current `idle | ready | inspection | running` machine with a five-state machine:

```
idle          → no timer activity
ready         → space held from idle, before hold-to-start delay completes
inspection    → WCA 15-second countdown running
armed         → space held during inspection, timer ready to start on release
running       → solve timer counting up
```

Transitions (spacebar events; `HOLD_MS = 550` by default):

| From state | Event | To state | Notes |
|---|---|---|---|
| idle | keydown(space) | ready | start hold timer |
| ready | keyup, hold < HOLD_MS | idle | "didn't mean it" |
| ready | keyup, hold ≥ HOLD_MS | inspection | inspection countdown starts |
| ready | Escape | idle | cancel |
| inspection | keydown(space) | armed | start hold timer; **inspection keeps counting down visually** |
| inspection | Escape | idle | cancel session, no solve recorded |
| armed | keyup, hold < HOLD_MS | inspection | back to countdown |
| armed | keyup, hold ≥ HOLD_MS | running | start solve timer; snapshot inspection elapsed for `+2` / DNF |
| running | any keydown or touchstart | idle | finalize solve, call `onSolveComplete` |

This is the CubeMania / stackmat behavior Sia described. Implementation notes:

- Use a ref-driven state machine. The existing `phaseRef` pattern is correct; keep it.
- The hold timer is a simple `Date.now()` snapshot on keydown, checked on keyup.
- If `inspection` elapsed > 15000ms at the moment of transition to `running`, set `inspectionOverran = true`, which becomes a `+2` penalty on the saved solve.
- If `inspection` elapsed > 17000ms, set `dnf = true` (WCA rule: >17s inspection = DNF, not just +2).
- Touch handlers must mirror keyboard handlers exactly.

### WCA inspection warnings

Current behavior: single warning color flip at 3 seconds. Change to:

- 0–7 seconds remaining: default inspection color (existing orange `var(--color-orange)`)
- 7s mark hit: optional beep + subtle visual tick (e.g. yellow border flash for 200ms). This is the WCA 8-second mark from the other direction (15 - 8 = 7s remaining)
- 3s mark hit: warning color (existing red) + optional beep. This is the WCA 12-second mark (15 - 12 = 3s remaining)
- 0s hit: "+2" badge appears next to countdown. Countdown keeps running into negatives: `-1`, `-2`.
- 2s past zero (17s elapsed): "DNF" badge.

Sound is toggleable from the settings panel (Phase 5). Default off. Use Web Audio API with short sine beeps, no external audio files. Bundle nothing heavier than a generated tone.

### Scramble prefetch queue

Current pattern (`<Scramble key={...} />` remount per solve) is a hack. Replace with:

- A small `useScrambleQueue(puzzleType)` hook in `src/hooks/useScrambleQueue.ts`.
- Maintains state: `currentScramble`, `nextScramble` (or null if still generating).
- On mount and on puzzle type change: generates two scrambles in parallel.
- Exposes `advance()`: moves `next` into `current`, kicks off generation of a new `next`.
- `SolveSession` calls `advance()` after a solve saves.
- The `Scramble` component becomes purely presentational. Receives `scramble: string | null` and a `loading` flag.
- Remove the `key={${puzzleType}-${solves.length}}` remount.

### Centiseconds, not milliseconds

The Timer currently displays 3-digit milliseconds (`01:23.456`). Speedcubing convention is 2-digit centiseconds (`1:23.45`). `formatTime` already handles this (from Phase 1). Make sure the running timer calls `formatTime` too, not its own format.

### Scope

- Rewrite `src/components/Timer.tsx` state machine per table above.
- Add Web Audio API beep utility at `src/utils/sound.ts` with `beep(freq: number, durationMs: number)`.
- Create `src/hooks/useScrambleQueue.ts`.
- Refactor `src/components/Scramble.tsx` to presentational only.
- Update `SolveSession.tsx` to use the new hook, remove remount `key` hack.
- Add Esc key handler at the `Timer` level for cancel.

### Acceptance criteria

- During the 15-second inspection, pressing and holding spacebar does NOT start the timer; only releasing (after hold delay) does.
- A quick tap that never crosses `HOLD_MS` never starts anything.
- Pressing Esc during `ready` or `inspection` returns to `idle` without recording a solve.
- A solve that starts with 16 seconds of inspection records `plus_two: true`. 18 seconds records `dnf: true`.
- After saving a solve, the next scramble appears within 1 frame (already generated in the background).
- Timer display uses centiseconds format at all times. A 9.12-second solve reads `"9.12"`, not `"00:09.120"`.

---

# Phase 3: Visual polish & responsive

**Goal:** close the visual rough edges, add light mode, and make the mobile/tablet breakpoints feel intentional instead of abrupt.

### Scope

- **Theme tokens:** Consolidate all colors into `:root` CSS variables in `src/index.css`. Current partial setup extends to cover everything hardcoded elsewhere. Audit for hardcoded colors across all `.css` files. All of `#1b2a48`, `#646464`, `#757575`, `#374151`, `#6b7280`, `#dc2626`, `#b91c1c`, `#5b5b5b`, `#ffffff0c`, `#ffffff98` must move to tokens.
- **Light theme:** Add a `[data-theme="light"]` selector block that overrides the tokens. Keep the dark palette as the default (`:root`).
  - Suggested light palette (refine as needed): background `#f7f7f5`, surface `#ffffff`, panel `#ececea`, text `#1a1a1a`, text-muted `#6b6b6b`, border `#d1d1d1`, same accent family.
- **Theme toggle:** Settings panel item (Phase 5). For now, wire up a small toggle in the Header (next to Sign In / Logout). Persist to `localStorage.theme`. On load, check `localStorage` first, then `prefers-color-scheme` media query.
- **Active tab fix:** Add CSS for `.puzzle-buttons .button.active` in `Header.css`. Visible background change + accent-colored underline or left-border. Also style the non-active `.button` so the whole tab bar looks intentional.
- **Three-tier responsive breakpoints:**
  - `>= 1024px`: full horizontal puzzle tabs (current behavior).
  - `640px–1024px`: compact chips, horizontal scroll if needed (not a dropdown). Use CSS scroll snap.
  - `< 640px`: dropdown `<select>`, maybe with the current puzzle shown more prominently above it.
- **Timer section overflow hack:** Remove `.timer-section { width: calc(100% + 3rem); }` and fix the layout properly. Use grid or negative margin only if intentional.
- **Reset Session button:** rename to "Clear View" in UI (not "Reset Session"). Move it from the top of the solve log to a quieter location (small text button at the bottom, or a kebab menu). Confirm dialog text becomes "Clear the current view? Your solves stay saved." Already was the behavior; now the UX says so.
- **Scramble semantics:** Change `<h2 class="scramble-text">` to a `<div>` or `<p>`. It's not a heading.
- **Logo:** Replace `logo.svg` (default CRA atom) with a simple typographic or minimal-geometric mark. If no time for design work, just use the "Ao5" text in the header with distinctive typography and drop the logo image entirely. Mark the old file for deletion.
- **Branding sync:** Update `package.json` `"name"` to `"decipher"`. Update `README.md` header to `# Decipher (Ao5)`. Keep the in-app title as "Ao5".

### Acceptance criteria

- At 1400px, 800px, 500px viewport widths, the header puzzle selector renders in three visually distinct modes (tabs, chips, dropdown).
- The active puzzle tab is visually obvious (not just an undefined `.active` class).
- Toggling to light mode flips every color. No element stays dark by accident. No hardcoded hex values remain in any component `.css` file.
- First-time visitors whose system is in light mode see the app in light mode.
- `Reset Session` text no longer appears anywhere in the UI.

---

# Phase 4: 3D scramble preview

**Goal:** show a visual representation of the scrambled puzzle, using `cubing.js`'s `TwistyPlayer`. Default to 3D; allow toggle to 2D.

### Scope

- Add `src/components/ScramblePreview.tsx`. Props: `{ scramble: string, puzzleType: string, mode: '3D' | '2D' }`.
- Internally: use a `<div ref>` and imperatively mount a `TwistyPlayer` instance in an effect. Destroy on unmount/update.
- Puzzle ID mapping: the scramble event IDs (`333`, `444`, `pyram`, `mega`, `sq1`, `clock`) are NOT the same as the TwistyPlayer `puzzle` prop values (`3x3x3`, `4x4x4`, `pyraminx`, `megaminx`, `square1`, `clock`). Add a map in `src/utils/puzzleIds.ts` with both directions. Unsupported puzzles (if any) render a "Preview not available" placeholder.
- TwistyPlayer config:
  - `background: 'none'`
  - `controlPanel: 'none'` (no playback controls; it's a static scrambled view)
  - `visualization: mode` (either `3D` or `2D`)
  - `alg: scramble` (TwistyPlayer applies the algorithm from the solved state)
  - `cameraLatitude`, `cameraLongitude` defaults are fine
- Layout: place the preview to the right of or above the scramble text. Collapsible: add a small chevron button to hide/show. Persist collapsed state to localStorage.
- Mode toggle (3D/2D) is a small two-button segment control next to the collapse chevron.
- Performance: lazy-load the `cubing/twisty` subpackage (it's heavier than scramble). Use dynamic import inside the component so the main bundle stays light.

### Acceptance criteria

- After the scramble renders, the 3D preview appears within 500ms on a fresh page load (cold cache may be slower on first load; subsequent scrambles are instant).
- Toggling between 3D and 2D does not regenerate the scramble or cause the timer to reset.
- Collapsing the preview survives a page refresh.
- Changing puzzle type updates the preview to the right puzzle.
- For clock and unsupported puzzles, a friendly placeholder renders instead of crashing.

---

# Phase 5: Solve management & settings

**Goal:** soft-delete, solve detail modal, hotkeys, a real settings panel.

### Data migration

Run `004_soft_delete.sql`. Update backend routes:

- `GET /api/solves`: add `.is_('deleted_at', None)` filter.
- `GET /api/personal-bests`: no change (PBs are materialized; we'll leave orphan PBs alone for v1; if the user soft-deletes a PB, that's fine, the PB record stays unless we want to complicate this. Note for future: PB re-materialization on delete is a Phase 9+ concern.)
- `DELETE /api/solves/:id`: change to `UPDATE solves SET deleted_at = now()` via Supabase client.
- Optionally expose `POST /api/solves/:id/restore` that sets `deleted_at = null`. Not required for v1 but easy to add.

### Solve detail modal

When a row in the solve log is clicked, open a modal with:

- Large time display
- Date / time stamp
- Scramble that was used (copyable, click-to-copy)
- `±2 ao5 context`: the ao5 centered on this solve (solve N's ao5 uses solves N-2 through N+2). Display the window visually: `21.10  23.45  [19.87]  25.02  22.18` with this solve bolded and the computed ao5 below.
- Penalty toggles (+2, DNF) inline, same behavior as in the log row
- Delete button (soft-delete)

Implementation: stateless `SolveDetailModal.tsx`. Controlled by parent (open/close state in `SolveSession`). Close on Esc, click-outside, and explicit X button.

### Hotkeys (when not focused in input)

- `1–9`: jump to last 1st–9th most recent solve (optional, skip if annoying)
- `2`: toggle `+2` on most recent solve
- `d`: toggle `DNF` on most recent solve
- `Shift+D`: delete most recent solve (with confirm)
- `Escape`: if in timer ready/inspection/armed, cancel; if in modal, close
- `?`: open a hotkey help panel

Put all hotkey logic in `src/hooks/useHotkeys.ts`. One place to add/change.

### Settings panel

Accessible from a gear icon in the header. Modal with:

- **Theme:** radio / toggle between System, Dark, Light. Default System.
- **Inspection:** toggle on/off. If off, spacebar from idle goes straight to `ready`, releasing starts the solve timer.
- **Sound:** toggle on/off for inspection warnings.
- **Hold-to-start delay:** slider, range 0–1000ms, default 550. (Lets speed solvers who dislike the delay set it to 0.)

Persist all of these to `localStorage` under `decipher.settings` as a single JSON object.

### Scope

- Run migration `004_soft_delete.sql`.
- Update `backend/app/routes/solves.py` delete and list handlers.
- Add `src/components/SolveDetailModal.tsx`, `src/components/SettingsModal.tsx`.
- Add `src/hooks/useHotkeys.ts`, `src/hooks/useSettings.ts`.
- Wire settings into Timer (inspection on/off, hold-to-start delay), Sound (beep on/off), and ThemeProvider.
- Update `SolveLog.tsx` so clicking a row opens the detail modal.

### Acceptance criteria

- Soft-deleting a solve removes it from the log but a row exists in Supabase with `deleted_at` set.
- Re-fetching solves does not resurrect deleted ones.
- Clicking any solve row opens the detail modal; the ao5 context shows the correct neighbor solves.
- With inspection off, the timer flow is: keydown → ready → (hold delay) → keyup → running.
- Settings persist across page refreshes and across browsers on the same machine.
- Pressing `?` shows a hotkey reference overlay.

---

# Phase 6: Stats expansion (new page)

**Goal:** a dedicated `/stats` page for the deep analysis the timer page shouldn't carry. Time series dot plot, GitHub-style heatmap, distribution histogram, PB progression, date range filter.

### Routes

Introduce `react-router-dom`. Routes:
- `/` (current timer page)
- `/stats` (this phase)
- `/trainers/oll`, `/trainers/pll`, `/trainers/f2l` (Phase 8)

### Stats page layout

Top bar: puzzle type selector (reuses the header component), date range selector (presets: All time, Last 30 days, Last 7 days, Custom; custom opens a date range picker).

Content stack (one card per viz):

1. **Dot plot** (time series): one dot per solve, x = solve date (or index), y = time. Color: green (PB), red (worst), default otherwise. Overlay: moving ao5 line (semi-transparent band spanning ao5 boundaries). This is what CubeMania shows. Recharts `ScatterChart` works.

2. **Distribution histogram:** bucketed into ~20 bins across the min-max range. Shows the shape of the user's solving distribution. Useful for seeing "I have a long tail of bad solves" or "I'm very consistent."

3. **PB progression line chart:** similar to the current SolveHub PB chart but wider, with date x-axis and hover details. Reuse the existing materialized `personal_bests` endpoint.

4. **Activity heatmap:** GitHub-style calendar. One cell per day over the selected range, intensity = number of solves that day. Tooltip on hover: "April 12, 2026 - 47 solves, best 18.43, ao12 22.10." Use `@nivo/calendar` or roll a small one. Heatmap color scale: quantile-based, not linear (avoids one outlier day making everything else look empty).

5. **Summary panel:** total solves, total solve time, best single, best ao5, best ao12, current ao100 if applicable.

### Date range filter

Controls the input to all five vizualisations. Single piece of shared state at the stats page level. Filter applies client-side for v1 (paginate through all solves for the selected range, which is fine up to ~10k solves). Beyond that, add a dedicated backend endpoint that supports date range + aggregation, but that's a Phase 9+ concern.

### Scope

- Install `react-router-dom`, `@nivo/calendar` (or equivalent).
- Refactor `App.tsx` to use `BrowserRouter` with routes.
- Add `src/pages/Timer.tsx` (extracted from current SolveSession wrapping) and `src/pages/Stats.tsx`.
- Add `src/components/stats/DotPlot.tsx`, `Histogram.tsx`, `PBProgression.tsx`, `ActivityHeatmap.tsx`, `StatsSummary.tsx`.
- Add navigation between Timer and Stats (tabs at the top of the header).
- Backend: no changes required (date range filter is client-side for v1).

### Acceptance criteria

- Navigating to `/stats` shows the five visualizations for the selected puzzle and date range.
- Switching the date range to "Last 7 days" updates all five charts.
- Switching the puzzle updates all five charts.
- The heatmap shows a cell per day with color scaled to that day's solve count; hovering reveals details.
- Dot plot handles at least 1000 solves without noticeable jank.

---

# Phase 7: Export & scramble history

**Goal:** CSV export for backups and csTimer interop. In-app scramble history (scramble column is already in the DB, just not exposed).

### CSV export

- Button on the stats page: "Export CSV".
- Format: csTimer-compatible where possible. Columns: `Time`, `Comment`, `Scramble`, `Date`, `P.1`, `P.2`.
  - `Time`: formatted as `[penalty_ms, solve_ms]` where penalty is 0, 2000 (+2), or -1 (DNF). csTimer uses this tuple convention.
  - `Comment`: blank for now (placeholder for future solve notes).
  - `Scramble`: the scramble string.
  - `Date`: unix ms timestamp.
  - `P.1`, `P.2`: blank.
- Filename: `decipher-<puzzle>-<YYYY-MM-DD>.csv`.
- Scope is the currently-selected puzzle and date range on the stats page.

### Scramble history view

- Accessible from the Solve Detail Modal (Phase 5) via a "copy scramble" button (already there) plus a "use this scramble" button that puts the scramble back into the timer without generating a new random one.
- Dedicated scramble history panel (at `/stats` or a new `/history` route, TBD during implementation, default to a section within `/stats`) lists the last 100 scrambles with timestamps. Clicking one loads it into the timer page.

### Scope

- Add `src/utils/exportCsv.ts` with a `buildCsv(solves: Solve[]): string` function.
- Add export button to stats page.
- Add "Use this scramble" action on the detail modal that navigates back to `/` with the scramble pre-loaded (via URL param or router state).
- Optional: scramble history panel on stats page.

### Acceptance criteria

- Clicking export downloads a `.csv` file containing all solves matching the current filters.
- The CSV round-trips into csTimer's import feature (csTimer → Options → Import).
- "Use this scramble" from the detail modal returns to the timer with that exact scramble loaded, timer in `idle` state.

---

# Phase 8: Minimal trainers (OLL / PLL / F2L)

**Goal:** case-specific practice mode. User picks a case (or "all"), gets a scramble that leaves only that case, times the solve. No stats panel, no weakness analyzer, no recognition/execution split. That can come later.

### How case-specific scrambles work

- For **PLL**: start from a solved cube, apply the inverse of a random PLL algorithm with a random AUF (adjust-U-face) pre-rotation. Result: a cube where only the PLL step is unsolved, in the selected case.
- For **OLL**: same approach but for OLL. Need to first set up an F2L-solved state (can just apply a random U-layer rotation), then apply inverse OLL alg.
- For **F2L**: trickier. For v1, scope F2L to "generic F2L-style scrambles that leave the last layer cross/orientation mixed up and random F2L slots empty." Full F2L case training is a big lift; leaving for future.
  - v1 F2L compromise: pick a random F2L slot, scramble only that slot with a short setup move sequence, ask the user to insert the pair. Covers the "F2L pair insertion" practice loop without the 41-case taxonomy.

### Algorithm data

- Hardcode a JSON file of PLL algorithms: `src/data/pll.json`. 21 cases (Aa, Ab, E, F, Ga, Gb, Gc, Gd, H, Ja, Jb, Na, Nb, Ra, Rb, T, Ua, Ub, V, Y, Z). Each entry: `{ name, algorithm }`.
- Same for OLL: `src/data/oll.json`. 57 cases.
- For F2L v1: no case data needed (see compromise above).
- Source these from a public reference (speedsolving.com wiki, algdb.net export). One-time manual curation.

### Trainer page layout

- Header: case selector (`All`, or any specific case) and a "skip" button (next scramble).
- Center: the scramble text, the 3D preview, the timer. All reused from Phase 2 / 4.
- Below: a tiny recent-solves strip (last 5 times), nothing more. No ao5, no log.

### Scope

- Create `src/pages/Trainers.tsx` with route children for OLL / PLL / F2L.
- Create `src/data/pll.json` and `src/data/oll.json`. Populate by hand from wiki.
- Create `src/utils/trainerScramble.ts` with `generateTrainerScramble(type: 'oll'|'pll'|'f2l', caseId?: string): string`. Uses the algorithm data and inverse-application approach.
- Reuse `Timer`, `ScramblePreview`, `Scramble` components with props.
- Add a "Trainers" tab in the header navigation.

### Acceptance criteria

- Selecting "PLL: T perm" gives a scramble that leaves only a T perm unsolved on the cube.
- 3D preview correctly shows the cube with only the selected case unsolved.
- The timer flow is identical to the main timer page.
- Switching between All and a specific case generates scrambles immediately, no network lag.
- Trainer solves are NOT saved to the `solves` table (they're practice, not real solves). v1 does not persist trainer times; they live only in memory for the current session.

---

## Deferred / out of scope (intentional)

For the future spec:
- Public user profiles, leaderboards, shareable solve links.
- Smart cube Bluetooth integration (GAN, Moyu, QiYi).
- Multiplayer race rooms with shared scrambles.
- BLD, OH, feet, and other WCA event categories.
- Manual time entry (type a time without running the timer).
- Stackmat hardware support.
- Full trainer analytics (success rate per case, weakness highlighter, recognition vs execution split).
- Solve notes / journaling.
- Ghost PB race overlay (progress bar against your PB during a solve).
- AI scramble commentary.
- Streak tracking and daily challenges.
- Cross-device settings sync via Supabase `user_preferences` table (localStorage is fine for v1).

## Target file structure (end state)

```
frontend/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── pages/
    │   ├── Timer.tsx
    │   ├── Stats.tsx
    │   └── Trainers.tsx
    ├── components/
    │   ├── Auth.tsx
    │   ├── Header.tsx
    │   ├── Timer.tsx
    │   ├── Scramble.tsx
    │   ├── ScramblePreview.tsx
    │   ├── SolveLog.tsx
    │   ├── SolveHub.tsx
    │   ├── SolveSession.tsx
    │   ├── SolveDetailModal.tsx
    │   ├── SettingsModal.tsx
    │   └── stats/
    │       ├── DotPlot.tsx
    │       ├── Histogram.tsx
    │       ├── PBProgression.tsx
    │       ├── ActivityHeatmap.tsx
    │       └── StatsSummary.tsx
    ├── hooks/
    │   ├── useCircularBuffer.ts
    │   ├── useMedianTracker.ts
    │   ├── useScrambleQueue.ts
    │   ├── useHotkeys.ts
    │   └── useSettings.ts
    ├── utils/
    │   ├── formatTime.ts
    │   ├── puzzleIds.ts
    │   ├── sound.ts
    │   ├── exportCsv.ts
    │   └── trainerScramble.ts
    ├── data/
    │   ├── pll.json
    │   └── oll.json
    ├── services/
    │   ├── api.ts
    │   ├── auth.ts
    │   └── guestStorage.ts
    └── types/
        └── index.ts   (Solve, PuzzleType, Settings, etc.)
```

## Phase-by-phase working notes for Claude Code

- Treat each phase as a separate task; `/clear` between phases.
- At the start of each phase: verify the previous phase's acceptance criteria still pass.
- Keep commits granular (one logical change per commit), matching Sia's existing commit style.
- Tests: Phase 1 adds a minimal test file for `formatTime` (that's the highest-leverage unit to test). Each subsequent phase can add tests for new pure utilities (`exportCsv`, `trainerScramble`, puzzle ID mapping) but does not need to test React components unless something is going wrong.
- The backend is barely touched: only Phase 5 has a migration and two route updates. Keep the Flask app otherwise stable.

## Global acceptance (when every phase is done)

- A cold user lands at `decipher-sepia.vercel.app`, sees `Ao5` branding, dark theme.
- Pressing space and solving a 2:07.45 time shows `"2:07.45"` everywhere it appears.
- During inspection, holding space does not start the timer until release.
- The active puzzle tab is visually obvious.
- Clicking a solve opens a modal with its scramble and ao5 context.
- Navigating to `/stats` shows five visualizations including a GitHub-style heatmap.
- Navigating to `/trainers/pll` and picking T perm generates a scramble that leaves only a T perm unsolved.
- Toggling the theme to light flips every color cleanly.
- Exporting CSV produces a file that imports into csTimer without errors.