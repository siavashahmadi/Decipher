# Phase 7: Export & Scramble History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSV export (csTimer-compatible) on the Stats page, enable "Use this scramble" replay from the Solve Detail Modal, and surface a scramble history panel on Stats.

**Architecture:** Three self-contained features that touch the frontend only. (1) A pure `buildCsv` util paired with a browser-download helper, wired to an "Export CSV" button on the Stats page. (2) Router-state handoff from the Detail Modal back to the Timer page so a solve's scramble can be replayed without a new random scramble; the Timer injects it via an override on `useScrambleQueue`. (3) A `ScrambleHistory` component on the Stats page listing the last 100 scrambles with click-to-replay.

**Tech Stack:** React 18 + TypeScript, Vite, react-router-dom v6, vitest, existing `useScrambleQueue` / `ScrambleQueue` abstraction, existing `Solve` types from `src/types/index.ts`.

---

## File structure

- Create: `frontend/src/utils/exportCsv.ts` — pure `buildCsv(solves: Solve[]): string` + `downloadCsv(filename, content)` helper.
- Create: `frontend/src/utils/exportCsv.test.ts` — unit tests for `buildCsv`.
- Modify: `frontend/src/pages/Stats.tsx` — add Export CSV button in `.stats-toolbar`; mount `ScrambleHistory` card.
- Modify: `frontend/src/pages/Stats.css` — styling for export button and history section (add, don't replace existing rules).
- Create: `frontend/src/components/stats/ScrambleHistory.tsx` — list of last 100 scrambles with replay action.
- Create: `frontend/src/components/stats/ScrambleHistory.css` — component styling.
- Create: `frontend/src/components/stats/ScrambleHistory.test.tsx` — render + click behavior tests.
- Modify: `frontend/src/components/SolveDetailModal.tsx` — add "Use this scramble" button navigating to `/` with router state.
- Modify: `frontend/src/components/SolveDetailModal.test.tsx` — cover the new button.
- Modify: `frontend/src/lib/scrambleQueue.ts` — add `override(scramble: string)` method so external callers can force the current scramble.
- Modify: `frontend/src/hooks/useScrambleQueue.ts` — expose `override(s)`.
- Modify: `frontend/src/hooks/useScrambleQueue.test.tsx` — cover override.
- Modify: `frontend/src/components/SolveSession.tsx` — consume router location state on mount, call `override` when a `replayScramble` is present, then clear the state.
- Modify: `frontend/src/pages/Timer.tsx` — thread through if any prop wiring needed (likely no change; `SolveSession` reads location directly).

---

## Task 1: `buildCsv` pure util

**Files:**
- Create: `frontend/src/utils/exportCsv.ts`
- Test: `frontend/src/utils/exportCsv.test.ts`

csTimer row format per solve:
```
"[penalty, solve_ms]","","Scramble string","unix_ms","",""
```
Columns: `Time,Comment,Scramble,Date,P.1,P.2`. Penalty values: `0` normal, `2000` for +2, `-1` for DNF. `solve_ms` is `Math.round(solve.time * 1000)` for non-DNF; for DNF keep the recorded time too (csTimer stores DNF as `[-1, ms]`). Dates are `new Date(solve.created_at).getTime()`.

Quoting rule: wrap every field in double quotes; escape inner `"` as `""`. Rows separated by `\r\n`.

- [ ] **Step 1: Write failing tests**

```ts
// frontend/src/utils/exportCsv.test.ts
import { describe, it, expect } from 'vitest';
import { buildCsv } from './exportCsv';
import type { Solve } from '../types';

const mk = (p: Partial<Solve>): Solve => ({
  id: 'x', puzzle_type: '333', time: 12.34, dnf: false, plus_two: false,
  scramble: "R U R'", created_at: '2026-01-01T00:00:00.000Z', ...p,
});

describe('buildCsv', () => {
  it('emits header row exactly', () => {
    const csv = buildCsv([]);
    expect(csv).toBe('"Time","Comment","Scramble","Date","P.1","P.2"\r\n');
  });

  it('formats a clean solve', () => {
    const csv = buildCsv([mk({ time: 12.34 })]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe(
      `"[0, 12340]","","R U R'","${new Date('2026-01-01T00:00:00.000Z').getTime()}","",""`,
    );
  });

  it('encodes +2 as penalty 2000', () => {
    const csv = buildCsv([mk({ time: 10, plus_two: true })]);
    expect(csv).toContain('"[2000, 10000]"');
  });

  it('encodes DNF as penalty -1', () => {
    const csv = buildCsv([mk({ time: 8.5, dnf: true })]);
    expect(csv).toContain('"[-1, 8500]"');
  });

  it('escapes inner quotes in scramble', () => {
    const csv = buildCsv([mk({ scramble: 'A "B" C' })]);
    expect(csv).toContain('"A ""B"" C"');
  });

  it('preserves solve order (newest first as given)', () => {
    const a = mk({ id: 'a', time: 1, created_at: '2026-01-02T00:00:00.000Z' });
    const b = mk({ id: 'b', time: 2, created_at: '2026-01-01T00:00:00.000Z' });
    const csv = buildCsv([a, b]);
    const lines = csv.trim().split('\r\n');
    expect(lines[1]).toContain('[0, 1000]');
    expect(lines[2]).toContain('[0, 2000]');
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `cd frontend && npx vitest run src/utils/exportCsv.test.ts`
Expected: FAIL with "Cannot find module './exportCsv'".

- [ ] **Step 3: Implement `exportCsv.ts`**

```ts
// frontend/src/utils/exportCsv.ts
import type { Solve } from '../types';

const HEADER = ['Time', 'Comment', 'Scramble', 'Date', 'P.1', 'P.2'];

const quote = (v: string): string => `"${v.replace(/"/g, '""')}"`;

const timeField = (s: Solve): string => {
  const ms = Math.round(s.time * 1000);
  const penalty = s.dnf ? -1 : s.plus_two ? 2000 : 0;
  return `[${penalty}, ${ms}]`;
};

export function buildCsv(solves: Solve[]): string {
  const rows: string[] = [HEADER.map(quote).join(',')];
  for (const s of solves) {
    const date = new Date(s.created_at).getTime();
    rows.push([
      quote(timeField(s)),
      quote(''),
      quote(s.scramble ?? ''),
      quote(String(Number.isFinite(date) ? date : 0)),
      quote(''),
      quote(''),
    ].join(','));
  }
  return rows.join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Re-run tests, confirm pass**

Run: `cd frontend && npx vitest run src/utils/exportCsv.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/exportCsv.ts frontend/src/utils/exportCsv.test.ts
git commit -m "phase-7: add buildCsv util for csTimer-compatible export"
```

---

## Task 2: Wire Export CSV button into Stats page

**Files:**
- Modify: `frontend/src/pages/Stats.tsx`
- Modify: `frontend/src/pages/Stats.css`

Use filename `decipher-<puzzle>-<YYYY-MM-DD>.csv` with today's date. Scope: `filteredSolves` (already in scope, respects puzzle + date range). Disable the button when `filteredSolves.length === 0`.

- [ ] **Step 1: Add import and handler in Stats.tsx**

At the top of `frontend/src/pages/Stats.tsx`, add:

```ts
import { buildCsv, downloadCsv } from '../utils/exportCsv';
```

Inside `StatsPage`, right after `const summary = useMemo(...)` at line 44, add:

```ts
const handleExport = (): void => {
  const today = new Date().toISOString().slice(0, 10);
  const filename = `decipher-${puzzleType}-${today}.csv`;
  downloadCsv(filename, buildCsv(filteredSolves));
};
```

- [ ] **Step 2: Render the button in the toolbar**

Replace the `.stats-toolbar` block (currently wraps only `<DateRangeFilter ... />`) with:

```tsx
<div className="stats-toolbar">
  <DateRangeFilter
    preset={preset}
    customStart={customStart}
    customEnd={customEnd}
    onPresetChange={setPreset}
    onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
  />
  <button
    type="button"
    className="stats-export-btn"
    onClick={handleExport}
    disabled={filteredSolves.length === 0}
    aria-label="Export filtered solves to CSV"
  >
    Export CSV
  </button>
</div>
```

- [ ] **Step 3: Style the button**

Append to `frontend/src/pages/Stats.css`:

```css
.stats-export-btn {
  margin-left: auto;
  padding: 0.5rem 1rem;
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}
.stats-export-btn:hover:not(:disabled) {
  background: var(--color-panel);
}
.stats-export-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.stats-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
}
```

(If `.stats-toolbar` already has rules, merge rather than duplicate. Inspect current file first.)

- [ ] **Step 4: Verify manually**

Run: `cd frontend && npm run dev` and open `/stats`. Click "Export CSV". Expected: browser downloads a file named `decipher-333-YYYY-MM-DD.csv`. Open it: header row matches csTimer format; rows present for current filter.

Also run: `cd frontend && npx vitest run src/pages/Stats.test.tsx`
Expected: existing Stats tests still pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Stats.tsx frontend/src/pages/Stats.css
git commit -m "phase-7: add Export CSV button to Stats toolbar"
```

---

## Task 3: Add `override` to ScrambleQueue + hook

**Files:**
- Modify: `frontend/src/lib/scrambleQueue.ts`
- Modify: `frontend/src/hooks/useScrambleQueue.ts`
- Modify: `frontend/src/hooks/useScrambleQueue.test.tsx`

Goal: let external callers force the current scramble to a specific string (replaying a past scramble) without regenerating. `next` should keep its existing prefetched scramble (or let generation continue) so the very next solve gets a fresh random scramble.

- [ ] **Step 1: Read the current `scrambleQueue.ts`**

Open `frontend/src/lib/scrambleQueue.ts` to confirm the snapshot shape and notification pattern. The class should have fields for current/next and a subscriber list.

- [ ] **Step 2: Write failing test in `useScrambleQueue.test.tsx`**

Append a test:

```tsx
it('override() sets currentScramble without regenerating next', async () => {
  const { result } = renderHook(() => useScrambleQueue('333'));
  // Wait for initial scramble to populate.
  await waitFor(() => expect(result.current.currentScramble).not.toBeNull());
  const originalNext = result.current.nextScramble;

  act(() => { result.current.override("R U R' U'"); });
  expect(result.current.currentScramble).toBe("R U R' U'");
  // next should be unchanged (still pre-fetched)
  expect(result.current.nextScramble).toBe(originalNext);
});
```

Ensure `act` and `waitFor` are imported from `@testing-library/react` alongside `renderHook`.

- [ ] **Step 3: Run test, confirm failure**

Run: `cd frontend && npx vitest run src/hooks/useScrambleQueue.test.tsx`
Expected: FAIL with "result.current.override is not a function".

- [ ] **Step 4: Implement `override` on `ScrambleQueue`**

In `frontend/src/lib/scrambleQueue.ts`, add a method:

```ts
override(scramble: string): void {
  // Force-set current scramble. Leave `next` intact so the post-solve
  // advance() still hands the user a fresh pre-generated random scramble.
  this.current = scramble;
  this.notify();
}
```

(Field name may be `currentScramble` — inspect the file and match the existing naming. Adapt accordingly.)

- [ ] **Step 5: Expose `override` on the hook**

In `frontend/src/hooks/useScrambleQueue.ts`:

```ts
export interface UseScrambleQueueResult {
  currentScramble: string | null;
  nextScramble: string | null;
  loading: boolean;
  advance: () => void;
  override: (scramble: string) => void;
}
```

Inside the hook body, after `advance`:

```ts
const override = useCallback((scramble: string) => {
  queueRef.current!.override(scramble);
}, []);
```

And include `override` in the returned object.

- [ ] **Step 6: Re-run tests, confirm pass**

Run: `cd frontend && npx vitest run src/hooks/useScrambleQueue.test.tsx src/lib`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/scrambleQueue.ts frontend/src/hooks/useScrambleQueue.ts frontend/src/hooks/useScrambleQueue.test.tsx
git commit -m "phase-7: add scramble override to queue for replay"
```

---

## Task 4: "Use this scramble" button on SolveDetailModal

**Files:**
- Modify: `frontend/src/components/SolveDetailModal.tsx`
- Modify: `frontend/src/components/SolveDetailModal.test.tsx`

The modal navigates to `/` and passes `{ replayScramble, replayPuzzle }` via `useNavigate` location state. Add a button next to "Copy scramble".

- [ ] **Step 1: Write failing test**

Append to `SolveDetailModal.test.tsx`:

```tsx
it('navigates to / with replay state when "Use this scramble" clicked', () => {
  const navigate = vi.fn();
  vi.mocked(useNavigate).mockReturnValue(navigate);
  const solve: Solve = {
    id: 's1', puzzle_type: '333', time: 12.34, dnf: false, plus_two: false,
    scramble: "R U R'", created_at: '2026-01-01T00:00:00.000Z',
  };
  render(
    <MemoryRouter>
      <SolveDetailModal solve={solve} window={[solve]} index={0}
        onClose={() => {}} onUpdate={() => {}} onDelete={() => {}} />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: /use this scramble/i }));
  expect(navigate).toHaveBeenCalledWith('/', {
    state: { replayScramble: "R U R'", replayPuzzle: '333' },
  });
});
```

Mock `useNavigate` at the top of the test file:

```tsx
import { useNavigate, MemoryRouter } from 'react-router-dom';
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: vi.fn() };
});
```

If the existing test file already mocks router, merge. Inspect before adding.

- [ ] **Step 2: Run test, confirm failure**

Run: `cd frontend && npx vitest run src/components/SolveDetailModal.test.tsx`
Expected: the new test FAILS ("button named /use this scramble/ not found").

- [ ] **Step 3: Implement the button**

At the top of `SolveDetailModal.tsx`, add:

```ts
import { useNavigate } from 'react-router-dom';
```

Inside the component, after `const ao5 = computeAo5(...)`:

```ts
const navigate = useNavigate();
const useThisScramble = (): void => {
  if (!solve.scramble) return;
  navigate('/', {
    state: { replayScramble: solve.scramble, replayPuzzle: solve.puzzle_type },
  });
  onClose();
};
```

In the scramble section JSX (around the "Copy scramble" button), add a sibling:

```tsx
<button
  type="button"
  onClick={useThisScramble}
  disabled={!solve.scramble}
  aria-label="Use this scramble in the timer"
>
  Use this scramble
</button>
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `cd frontend && npx vitest run src/components/SolveDetailModal.test.tsx`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SolveDetailModal.tsx frontend/src/components/SolveDetailModal.test.tsx
git commit -m "phase-7: add 'Use this scramble' action to solve detail modal"
```

---

## Task 5: Consume replay state in SolveSession

**Files:**
- Modify: `frontend/src/components/SolveSession.tsx`

On mount (and whenever location state appears), read `location.state.replayScramble` + `replayPuzzle`, apply them, and clear via `navigate('/', { replace: true, state: null })` so a refresh doesn't reapply.

- [ ] **Step 1: Add imports**

At the top of `SolveSession.tsx`:

```ts
import { useLocation, useNavigate } from 'react-router-dom';
```

- [ ] **Step 2: Destructure `override` from `useScrambleQueue`**

Change:

```ts
const { currentScramble, loading: scrambleLoading, advance: advanceScramble } = useScrambleQueue(puzzleType);
```

to:

```ts
const { currentScramble, loading: scrambleLoading, advance: advanceScramble, override: overrideScramble } = useScrambleQueue(puzzleType);
```

- [ ] **Step 3: Add replay effect**

After the `useScrambleQueue` line, add:

```ts
const location = useLocation();
const navigate = useNavigate();

useEffect(() => {
  const state = location.state as { replayScramble?: string; replayPuzzle?: PuzzleType } | null;
  if (!state?.replayScramble) return;
  if (state.replayPuzzle && state.replayPuzzle !== puzzleType) {
    setPuzzleType(state.replayPuzzle);
    // Defer override to the next render after puzzle-type switch completes.
    // A microtask is sufficient: ScrambleQueue handles the puzzle change synchronously.
    queueMicrotask(() => overrideScramble(state.replayScramble!));
  } else {
    overrideScramble(state.replayScramble);
  }
  navigate('/', { replace: true, state: null });
}, [location.state, navigate, overrideScramble, puzzleType]);
```

- [ ] **Step 4: Manual verification**

Run: `cd frontend && npm run dev`. Navigate to `/stats`, click a solve, click "Use this scramble". Expected: URL returns to `/`, the scramble shown on the Timer page matches the solve's scramble, puzzle type switches if the solve was on a different puzzle. Refresh the page: the replay does NOT reapply (confirms state was cleared).

Run: `cd frontend && npx vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SolveSession.tsx
git commit -m "phase-7: consume replay scramble state on Timer page"
```

---

## Task 6: `ScrambleHistory` component

**Files:**
- Create: `frontend/src/components/stats/ScrambleHistory.tsx`
- Create: `frontend/src/components/stats/ScrambleHistory.css`
- Create: `frontend/src/components/stats/ScrambleHistory.test.tsx`

Lists the most recent 100 solves (already newest-first from the API). Each row: date, time, truncated scramble (first 60 chars + "..."), and a "Replay" button navigating to `/` with the same router state used in Task 4.

- [ ] **Step 1: Write failing test**

```tsx
// frontend/src/components/stats/ScrambleHistory.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import ScrambleHistory from './ScrambleHistory';
import type { Solve } from '../../types';

vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: vi.fn() };
});

const mk = (id: string, scramble: string): Solve => ({
  id, puzzle_type: '333', time: 10, dnf: false, plus_two: false,
  scramble, created_at: '2026-01-01T00:00:00Z',
});

describe('ScrambleHistory', () => {
  it('renders up to 100 rows with truncated scrambles', () => {
    const solves = Array.from({ length: 150 }, (_, i) => mk(`s${i}`, `R${i} U`));
    render(<MemoryRouter><ScrambleHistory solves={solves} /></MemoryRouter>);
    expect(screen.getAllByRole('button', { name: /replay/i })).toHaveLength(100);
  });

  it('replay navigates to / with scramble state', () => {
    const navigate = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    const solves = [mk('a', "F R U")];
    render(<MemoryRouter><ScrambleHistory solves={solves} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /replay/i }));
    expect(navigate).toHaveBeenCalledWith('/', {
      state: { replayScramble: 'F R U', replayPuzzle: '333' },
    });
  });

  it('renders an empty-state message when no solves', () => {
    render(<MemoryRouter><ScrambleHistory solves={[]} /></MemoryRouter>);
    expect(screen.getByText(/no scrambles/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

Run: `cd frontend && npx vitest run src/components/stats/ScrambleHistory.test.tsx`
Expected: FAIL ("Cannot find module './ScrambleHistory'").

- [ ] **Step 3: Implement the component**

```tsx
// frontend/src/components/stats/ScrambleHistory.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatTime } from '../../utils/formatTime';
import type { Solve } from '../../types';
import './ScrambleHistory.css';

interface ScrambleHistoryProps {
  solves: Solve[];
}

const MAX_ROWS = 100;
const TRUNCATE = 60;

const truncate = (s: string): string =>
  s.length <= TRUNCATE ? s : `${s.slice(0, TRUNCATE)}...`;

const label = (s: Solve): string =>
  s.dnf ? 'DNF' : formatTime(s.plus_two ? s.time + 2 : s.time);

const ScrambleHistory = ({ solves }: ScrambleHistoryProps): React.ReactElement => {
  const navigate = useNavigate();
  const rows = solves.slice(0, MAX_ROWS);

  if (rows.length === 0) {
    return <p className="scramble-history-empty">No scrambles in this range.</p>;
  }

  const replay = (s: Solve): void => {
    if (!s.scramble) return;
    navigate('/', {
      state: { replayScramble: s.scramble, replayPuzzle: s.puzzle_type },
    });
  };

  return (
    <ul className="scramble-history-list">
      {rows.map(s => (
        <li key={s.id} className="scramble-history-row">
          <span className="scramble-history-date">
            {new Date(s.created_at).toLocaleDateString()}
          </span>
          <span className="scramble-history-time">{label(s)}</span>
          <code className="scramble-history-text" title={s.scramble}>
            {truncate(s.scramble || '\u2014')}
          </code>
          <button
            type="button"
            className="scramble-history-replay"
            onClick={() => replay(s)}
            disabled={!s.scramble}
            aria-label={`Replay scramble from ${new Date(s.created_at).toLocaleString()}`}
          >
            Replay
          </button>
        </li>
      ))}
    </ul>
  );
};

export default ScrambleHistory;
```

```css
/* frontend/src/components/stats/ScrambleHistory.css */
.scramble-history-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 420px;
  overflow-y: auto;
}
.scramble-history-row {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.25rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.85rem;
}
.scramble-history-date { color: var(--color-text-muted); }
.scramble-history-time { font-variant-numeric: tabular-nums; }
.scramble-history-text {
  color: var(--color-text-muted);
  font-family: ui-monospace, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scramble-history-replay {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}
.scramble-history-replay:hover:not(:disabled) {
  background: var(--color-panel);
}
.scramble-history-replay:disabled { opacity: 0.5; cursor: not-allowed; }
.scramble-history-empty {
  color: var(--color-text-muted);
  font-style: italic;
  margin: 0;
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `cd frontend && npx vitest run src/components/stats/ScrambleHistory.test.tsx`
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/stats/ScrambleHistory.tsx frontend/src/components/stats/ScrambleHistory.css frontend/src/components/stats/ScrambleHistory.test.tsx
git commit -m "phase-7: add ScrambleHistory component with replay"
```

---

## Task 7: Mount ScrambleHistory on Stats page

**Files:**
- Modify: `frontend/src/pages/Stats.tsx`

- [ ] **Step 1: Import**

Add near the other stats imports:

```ts
import ScrambleHistory from '../components/stats/ScrambleHistory';
```

- [ ] **Step 2: Render as a new stats card**

Inside the `.stats-grid` block, append after the Activity card:

```tsx
<section className="stats-card stats-card-wide">
  <h2>Scramble history</h2>
  <ScrambleHistory solves={filteredSolves} />
</section>
```

If the grid uses explicit column spans, ensure `stats-card-wide` spans both columns (add a CSS rule in `Stats.css` if needed):

```css
.stats-card-wide { grid-column: 1 / -1; }
```

- [ ] **Step 3: Manual verification**

Run `npm run dev`, navigate to `/stats`. Expected: new "Scramble history" card appears at the bottom with recent solves; "Replay" buttons route back to the Timer page and apply the scramble.

Run: `cd frontend && npx vitest run`
Expected: full suite passes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Stats.tsx frontend/src/pages/Stats.css
git commit -m "phase-7: mount ScrambleHistory card on Stats page"
```

---

## Task 8: Acceptance check

- [ ] **Step 1: Full test run**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no TS errors.

- [ ] **Step 2: Manual acceptance walkthrough**

1. `/stats`: click Export CSV. File downloads as `decipher-333-<today>.csv`. Open and inspect header + first data row: matches csTimer format `[0, <ms>]`, scramble present, date is unix ms.
2. Import the file into csTimer (Options → Import → csTimer format). Expected: solves appear without error.
3. Click a row in the timer's solve log → detail modal → "Use this scramble". Expected: navigate to `/`, scramble on Timer matches the one from the modal, timer in `idle` state, refresh does NOT reapply.
4. On `/stats`, scroll to "Scramble history". Click Replay on any row. Expected: same behavior as (3).
5. Toggle puzzle type on the Timer page after a replay: a new random scramble generates normally.

- [ ] **Step 3: Final commit (only if anything needs adjustment)**

No changes expected. If adjustments were needed, commit them with a descriptive message.
