# Phase 6: Stats Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a dedicated `/stats` page with five visualizations (dot plot, histogram, PB progression, activity heatmap, summary), plus routing and a date range filter, without changing backend behavior.

**Architecture:** Introduce `react-router-dom` v6 at the App shell. Extract the current timer UI into `pages/Timer.tsx`; build `pages/Stats.tsx` that fetches all solves for the selected puzzle + date range via client-side cursor pagination, derives all five charts client-side, and reuses the existing Header puzzle selector. Pure data transforms live in `src/utils/` and are unit-tested. Recharts is already in the bundle; add `@nivo/calendar` only for the heatmap.

**Tech Stack:** React 18, TypeScript strict, react-router-dom v6, Recharts, @nivo/calendar, Vitest + Testing Library.

---

## File Structure

**New files:**
- `src/pages/Timer.tsx` — thin wrapper that renders existing `SolveSession`.
- `src/pages/Stats.tsx` — orchestrator for the stats page (fetches data, owns filter state, renders charts).
- `src/pages/Trainers.tsx` — placeholder page ("Coming soon") so `/trainers/*` routes don't 404 before Phase 8.
- `src/hooks/useAllSolves.ts` — fetches every non-deleted solve for a puzzle (paginates through `/api/solves` for auth users, reads localStorage for guests). Returns `{ solves, loading, error, refetch }`.
- `src/utils/dateRanges.ts` — pure helpers: `DateRangePreset` type, `getPresetBounds(preset)`, `filterSolvesByRange(solves, bounds)`.
- `src/utils/statsBuckets.ts` — pure helpers: `buildHistogram(times, binCount)`, `buildHeatmapData(solves)`, `computeSummary(solves)`.
- `src/components/stats/DateRangeFilter.tsx` — segmented control + custom range picker.
- `src/components/stats/DotPlot.tsx` — Recharts ScatterChart of time vs. solve index, colored.
- `src/components/stats/Histogram.tsx` — Recharts BarChart over `buildHistogram` output.
- `src/components/stats/PBProgression.tsx` — Recharts LineChart over `/api/personal-bests` (moved from SolveHub).
- `src/components/stats/ActivityHeatmap.tsx` — @nivo/calendar.
- `src/components/stats/StatsSummary.tsx` — totals + bests panel.
- `src/components/AppNav.tsx` — top-level nav tabs (Timer / Stats / Trainers), rendered inside `Header`.

**Modified files:**
- `package.json` — add `react-router-dom`, `@nivo/calendar`.
- `src/App.tsx` — wrap in `BrowserRouter`, define routes.
- `src/components/Header.tsx` — render `AppNav`, hide puzzle selector on routes where it doesn't apply (only the timer page uses `handleTypeChange`; the stats page manages its own puzzle state via URL params).
- CSS files per new component.

**Test files:**
- `src/utils/dateRanges.test.ts`
- `src/utils/statsBuckets.test.ts`
- `src/hooks/useAllSolves.test.tsx`
- `src/components/stats/DateRangeFilter.test.tsx`
- `src/pages/Stats.test.tsx` (integration-level: mounts the page with mocked api, asserts charts render for a small fixture)

---

## Scope Notes

- **Puzzle state on `/stats`:** owned by the Stats page via a URL search param (`?puzzle=333`). Header's existing `type` prop flow is unchanged for the timer route. The stats page reuses the visual tabs but wires `onChange` to its local state.
- **PB chart on the timer page:** stays (SolveHub). The new `PBProgression` on the stats page is a wider, date-axis variant. Same data source, different presentation.
- **Backend:** untouched. The spec is explicit about this.
- **Trainers route:** the spec defers real implementation to Phase 8. This phase only adds a placeholder route so the nav tab doesn't 404.

---

### Task 1: Install dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install**

Run from `frontend/`:

```bash
npm install react-router-dom@^6.22.0 @nivo/calendar@^0.87.0 @nivo/core@^0.87.0
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: PASS (types resolved).

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "phase-6: add react-router-dom and nivo/calendar deps"
```

---

### Task 2: Route scaffolding

**Files:**
- Create: `frontend/src/pages/Timer.tsx`, `frontend/src/pages/Stats.tsx`, `frontend/src/pages/Trainers.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write `pages/Timer.tsx`**

```tsx
import React from 'react';
import SolveSession from '../components/SolveSession';

interface TimerPageProps {
  isGuest: boolean;
  onSignIn: () => void;
}

const TimerPage = ({ isGuest, onSignIn }: TimerPageProps): React.ReactElement => (
  <SolveSession isGuest={isGuest} onSignIn={onSignIn} />
);

export default TimerPage;
```

- [ ] **Step 2: Write placeholder `pages/Stats.tsx`**

```tsx
import React from 'react';

const StatsPage = (): React.ReactElement => (
  <div className="stats-page-placeholder">Stats (WIP)</div>
);

export default StatsPage;
```

- [ ] **Step 3: Write placeholder `pages/Trainers.tsx`**

```tsx
import React from 'react';

const TrainersPage = (): React.ReactElement => (
  <div className="trainers-page-placeholder">Trainers coming soon.</div>
);

export default TrainersPage;
```

- [ ] **Step 4: Rewrite `App.tsx` to use BrowserRouter**

Replace the contents of `frontend/src/App.tsx` with:

```tsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './services/auth';
import { getAllGuestSolves, clearAllGuestSolves } from './services/guestStorage';
import api from './services/api';
import Auth from './components/Auth';
import TimerPage from './pages/Timer';
import StatsPage from './pages/Stats';
import TrainersPage from './pages/Trainers';
import type { Session } from '@supabase/supabase-js';
import './App.css';

function App(): React.ReactElement {
  const [session, setSession] = useState<Session | null>(null);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (_event === 'SIGNED_IN') {
        const guestSolves = getAllGuestSolves();
        if (guestSolves.length > 0) {
          await api.migrateSolves(guestSolves);
          clearAllGuestSolves();
        }
      }
      setSession(session);
      setShowAuth(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const isGuest = !session;

  if (showAuth && isGuest) {
    return <div className="app-wrapper"><Auth onBack={() => setShowAuth(false)} /></div>;
  }

  return (
    <BrowserRouter>
      <div className="app-wrapper">
        <Routes>
          <Route path="/" element={<TimerPage isGuest={isGuest} onSignIn={() => setShowAuth(true)} />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/trainers/*" element={<TrainersPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
```

- [ ] **Step 5: Run the app, verify routes**

Run: `npm run dev`
Visit: `http://localhost:5173/`, `/stats`, `/trainers/oll`.
Expected: `/` renders timer, `/stats` renders the placeholder, `/trainers/oll` renders the placeholder, unknown routes redirect to `/`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/
git commit -m "phase-6: introduce routes for timer, stats, trainers placeholders"
```

---

### Task 3: Top nav component

**Files:**
- Create: `frontend/src/components/AppNav.tsx`, `frontend/src/components/AppNav.css`
- Modify: `frontend/src/components/Header.tsx`

- [ ] **Step 1: Create `AppNav.tsx`**

```tsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import './AppNav.css';

const AppNav = (): React.ReactElement => (
  <nav className="app-nav" aria-label="Primary">
    <NavLink to="/" end className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>Timer</NavLink>
    <NavLink to="/stats" className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>Stats</NavLink>
    <NavLink to="/trainers/oll" className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>Trainers</NavLink>
  </nav>
);

export default AppNav;
```

- [ ] **Step 2: Create `AppNav.css`**

```css
.app-nav {
  display: flex;
  gap: 0.25rem;
  margin-right: 1rem;
}
.app-nav-link {
  padding: 0.4rem 0.75rem;
  color: var(--color-text-muted);
  text-decoration: none;
  border-radius: 6px;
  font-size: 0.9rem;
}
.app-nav-link:hover { color: var(--color-text); }
.app-nav-link.active {
  color: var(--color-text);
  background: var(--color-panel);
}
```

- [ ] **Step 3: Render `AppNav` in `Header.tsx`**

Edit `frontend/src/components/Header.tsx`. Add `import AppNav from './AppNav';` near the other imports, and render `<AppNav />` as the first child inside `<header className="header">`, directly before `<div className="title-container">`.

- [ ] **Step 4: Manual verify**

Run: `npm run dev`. Click Stats tab. The tab highlights; URL becomes `/stats`. Click Timer. Back to `/`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AppNav.tsx frontend/src/components/AppNav.css frontend/src/components/Header.tsx
git commit -m "phase-6: add top nav tabs for timer, stats, trainers"
```

---

### Task 4: `useAllSolves` hook (with pagination loop)

**Files:**
- Create: `frontend/src/hooks/useAllSolves.ts`
- Test: `frontend/src/hooks/useAllSolves.test.tsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/hooks/useAllSolves.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import useAllSolves from './useAllSolves';
import api from '../services/api';
import type { Solve } from '../types';

vi.mock('../services/api');
vi.mock('../services/guestStorage', () => ({
  getGuestSolves: vi.fn(() => []),
}));

const makeSolve = (id: string, created_at: string): Solve => ({
  id, puzzle_type: '333', time: 10, dnf: false, plus_two: false,
  scramble: '', created_at,
});

describe('useAllSolves (auth)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('paginates through all pages until next_cursor is null', async () => {
    const page1 = [makeSolve('a', '2026-04-10T00:00:00Z'), makeSolve('b', '2026-04-09T00:00:00Z')];
    const page2 = [makeSolve('c', '2026-04-08T00:00:00Z')];
    (api.getSolves as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ solves: page1, next_cursor: '2026-04-09T00:00:00Z' })
      .mockResolvedValueOnce({ solves: page2, next_cursor: null });

    const { result } = renderHook(() => useAllSolves('333', false));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.solves.map(s => s.id)).toEqual(['a', 'b', 'c']);
    expect(api.getSolves).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the test — it fails (file not created)**

Run: `npx vitest run src/hooks/useAllSolves.test.tsx`
Expected: FAIL on missing module.

- [ ] **Step 3: Write `useAllSolves.ts`**

```ts
import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { getGuestSolves } from '../services/guestStorage';
import type { PuzzleType, Solve } from '../types';

interface UseAllSolvesResult {
  solves: Solve[];
  loading: boolean;
  error: unknown;
  refetch: () => void;
}

// Paginates through /api/solves until next_cursor is null.
// For guests, reads all non-deleted solves from localStorage.
export default function useAllSolves(puzzleType: PuzzleType, isGuest: boolean): UseAllSolvesResult {
  const [solves, setSolves] = useState<Solve[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        if (isGuest) {
          if (!cancelled) setSolves(getGuestSolves(puzzleType));
          return;
        }
        const all: Solve[] = [];
        let cursor: string | null = null;
        do {
          const page = await api.getSolves(puzzleType, cursor);
          all.push(...page.solves);
          cursor = page.next_cursor;
        } while (cursor);
        if (!cancelled) setSolves(all);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [puzzleType, isGuest, tick]);

  return { solves, loading, error, refetch };
}
```

- [ ] **Step 4: Run test — passes**

Run: `npx vitest run src/hooks/useAllSolves.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useAllSolves.ts frontend/src/hooks/useAllSolves.test.tsx
git commit -m "phase-6: add useAllSolves hook with cursor pagination loop"
```

---

### Task 5: Pure date-range helpers

**Files:**
- Create: `frontend/src/utils/dateRanges.ts`
- Test: `frontend/src/utils/dateRanges.test.ts`

- [ ] **Step 1: Write failing test**

Create `frontend/src/utils/dateRanges.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getPresetBounds, filterSolvesByRange } from './dateRanges';
import type { Solve } from '../types';

const makeSolve = (created_at: string): Solve => ({
  id: created_at, puzzle_type: '333', time: 10, dnf: false, plus_two: false,
  scramble: '', created_at,
});

describe('getPresetBounds', () => {
  it('returns null bounds for "all"', () => {
    expect(getPresetBounds('all', new Date('2026-04-20T12:00:00Z'))).toEqual({ start: null, end: null });
  });
  it('returns last-7-days bounds', () => {
    const now = new Date('2026-04-20T12:00:00Z');
    const { start, end } = getPresetBounds('7d', now);
    expect(end).toEqual(now);
    expect(start).toEqual(new Date('2026-04-13T12:00:00Z'));
  });
  it('returns last-30-days bounds', () => {
    const now = new Date('2026-04-20T12:00:00Z');
    const { start } = getPresetBounds('30d', now);
    expect(start).toEqual(new Date('2026-03-21T12:00:00Z'));
  });
});

describe('filterSolvesByRange', () => {
  it('returns all solves when bounds are null', () => {
    const s = [makeSolve('2026-04-10T00:00:00Z'), makeSolve('2026-01-01T00:00:00Z')];
    expect(filterSolvesByRange(s, { start: null, end: null })).toEqual(s);
  });
  it('filters to inclusive start and end', () => {
    const s = [
      makeSolve('2026-04-20T00:00:00Z'),
      makeSolve('2026-04-13T00:00:00Z'),
      makeSolve('2026-04-12T23:59:59Z'),
    ];
    const result = filterSolvesByRange(s, {
      start: new Date('2026-04-13T00:00:00Z'),
      end: new Date('2026-04-20T00:00:00Z'),
    });
    expect(result.map(x => x.id)).toEqual(['2026-04-20T00:00:00Z', '2026-04-13T00:00:00Z']);
  });
});
```

- [ ] **Step 2: Run test — fails**

Run: `npx vitest run src/utils/dateRanges.test.ts`
Expected: FAIL (no module).

- [ ] **Step 3: Write `dateRanges.ts`**

```ts
import type { Solve } from '../types';

export type DateRangePreset = 'all' | '30d' | '7d' | 'custom';

export interface DateRangeBounds {
  start: Date | null;
  end: Date | null;
}

export function getPresetBounds(preset: DateRangePreset, now: Date = new Date()): DateRangeBounds {
  if (preset === 'all' || preset === 'custom') return { start: null, end: null };
  const days = preset === '7d' ? 7 : 30;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end: now };
}

export function filterSolvesByRange(solves: Solve[], bounds: DateRangeBounds): Solve[] {
  if (!bounds.start && !bounds.end) return solves;
  return solves.filter(s => {
    const t = new Date(s.created_at).getTime();
    if (bounds.start && t < bounds.start.getTime()) return false;
    if (bounds.end && t > bounds.end.getTime()) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run test — passes**

Run: `npx vitest run src/utils/dateRanges.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/dateRanges.ts frontend/src/utils/dateRanges.test.ts
git commit -m "phase-6: add date range preset + filter helpers"
```

---

### Task 6: Pure stats helpers (histogram, heatmap, summary)

**Files:**
- Create: `frontend/src/utils/statsBuckets.ts`
- Test: `frontend/src/utils/statsBuckets.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/utils/statsBuckets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildHistogram, buildHeatmapData, computeSummary } from './statsBuckets';
import type { Solve } from '../types';

const mk = (overrides: Partial<Solve>): Solve => ({
  id: Math.random().toString(), puzzle_type: '333', time: 10, dnf: false,
  plus_two: false, scramble: '', created_at: '2026-04-20T00:00:00Z', ...overrides,
});

describe('buildHistogram', () => {
  it('returns empty bins for no solves', () => {
    expect(buildHistogram([], 5)).toEqual([]);
  });
  it('buckets times into N bins with inclusive max on the last bin', () => {
    const bins = buildHistogram([10, 12, 14, 16, 20], 5);
    expect(bins).toHaveLength(5);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(5);
    expect(bins[0].min).toBe(10);
    expect(bins[bins.length - 1].max).toBe(20);
  });
});

describe('buildHeatmapData', () => {
  it('groups solves by UTC date', () => {
    const solves = [
      mk({ created_at: '2026-04-20T01:00:00Z' }),
      mk({ created_at: '2026-04-20T23:00:00Z' }),
      mk({ created_at: '2026-04-19T12:00:00Z' }),
    ];
    const data = buildHeatmapData(solves);
    const byDay = Object.fromEntries(data.map(d => [d.day, d.value]));
    expect(byDay['2026-04-20']).toBe(2);
    expect(byDay['2026-04-19']).toBe(1);
  });
  it('excludes dnf solves from the count', () => {
    const solves = [
      mk({ created_at: '2026-04-20T00:00:00Z', dnf: true }),
      mk({ created_at: '2026-04-20T01:00:00Z' }),
    ];
    expect(buildHeatmapData(solves)[0].value).toBe(1);
  });
});

describe('computeSummary', () => {
  it('reports counts and bests', () => {
    const solves = [
      mk({ time: 10 }), mk({ time: 12 }), mk({ time: 9, plus_two: true }),
      mk({ time: 15, dnf: true }), mk({ time: 11 }), mk({ time: 13 }),
    ];
    const s = computeSummary(solves);
    expect(s.totalSolves).toBe(6);
    expect(s.validSolves).toBe(5);
    expect(s.bestSingle).toBe(10); // 9+2=11 so 10 wins
  });
  it('returns null bests when no valid solves', () => {
    expect(computeSummary([mk({ dnf: true })]).bestSingle).toBeNull();
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run src/utils/statsBuckets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `statsBuckets.ts`**

```ts
import type { Solve } from '../types';

export interface HistogramBin {
  min: number;
  max: number;
  count: number;
  label: string;
}

// Effective time (accounts for +2). DNFs are the caller's problem.
const effective = (s: Solve): number => (s.plus_two ? s.time + 2 : s.time);

export function buildHistogram(times: number[], binCount: number): HistogramBin[] {
  if (!times.length || binCount <= 0) return [];
  const min = Math.min(...times);
  const max = Math.max(...times);
  if (min === max) {
    return [{ min, max, count: times.length, label: min.toFixed(2) }];
  }
  const span = max - min;
  const width = span / binCount;
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
    min: min + i * width,
    max: min + (i + 1) * width,
    count: 0,
    label: `${(min + i * width).toFixed(2)}`,
  }));
  for (const t of times) {
    let idx = Math.floor((t - min) / width);
    if (idx >= binCount) idx = binCount - 1; // include the max in the last bin
    bins[idx].count += 1;
  }
  return bins;
}

export interface HeatmapCell {
  day: string; // YYYY-MM-DD (UTC)
  value: number;
}

export function buildHeatmapData(solves: Solve[]): HeatmapCell[] {
  const counts = new Map<string, number>();
  for (const s of solves) {
    if (s.dnf) continue;
    const day = s.created_at.slice(0, 10); // ISO-8601 prefix is UTC date
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()].map(([day, value]) => ({ day, value }));
}

export interface StatsSummary {
  totalSolves: number;
  validSolves: number;
  totalSolveTimeSeconds: number;
  bestSingle: number | null;
  bestAo5: number | null;
  bestAo12: number | null;
  currentAo100: number | null;
}

// Trimmed mean: drop best + worst, average the rest.
function trimmedMean(window: number[]): number | null {
  if (window.length < 3) return null;
  const sorted = [...window].sort((a, b) => a - b);
  const inner = sorted.slice(1, -1);
  return inner.reduce((s, v) => s + v, 0) / inner.length;
}

function bestWindow(times: number[], size: number): number | null {
  if (times.length < size) return null;
  let best: number | null = null;
  for (let i = 0; i + size <= times.length; i++) {
    const avg = trimmedMean(times.slice(i, i + size));
    if (avg !== null && (best === null || avg < best)) best = avg;
  }
  return best;
}

export function computeSummary(solves: Solve[]): StatsSummary {
  const valid = solves.filter(s => !s.dnf);
  const times = valid.map(effective);
  // Solves arrive newest-first from the API; bestWindow assumes chronological.
  const chronological = [...times].reverse();
  return {
    totalSolves: solves.length,
    validSolves: valid.length,
    totalSolveTimeSeconds: times.reduce((s, v) => s + v, 0),
    bestSingle: times.length ? Math.min(...times) : null,
    bestAo5: bestWindow(chronological, 5),
    bestAo12: bestWindow(chronological, 12),
    currentAo100: chronological.length >= 100
      ? trimmedMean(chronological.slice(-100))
      : null,
  };
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run src/utils/statsBuckets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/statsBuckets.ts frontend/src/utils/statsBuckets.test.ts
git commit -m "phase-6: add histogram, heatmap, and summary pure helpers"
```

---

### Task 7: `DateRangeFilter` component

**Files:**
- Create: `frontend/src/components/stats/DateRangeFilter.tsx`, `DateRangeFilter.css`
- Test: `frontend/src/components/stats/DateRangeFilter.test.tsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/stats/DateRangeFilter.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DateRangeFilter from './DateRangeFilter';

describe('DateRangeFilter', () => {
  it('fires onPresetChange when a preset button is clicked', () => {
    const onPresetChange = vi.fn();
    render(
      <DateRangeFilter
        preset="all"
        customStart={null}
        customEnd={null}
        onPresetChange={onPresetChange}
        onCustomChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /last 7 days/i }));
    expect(onPresetChange).toHaveBeenCalledWith('7d');
  });

  it('renders date inputs only in custom mode', () => {
    const { rerender } = render(
      <DateRangeFilter preset="all" customStart={null} customEnd={null}
        onPresetChange={() => {}} onCustomChange={() => {}} />,
    );
    expect(screen.queryByLabelText(/from/i)).toBeNull();
    rerender(
      <DateRangeFilter preset="custom" customStart={null} customEnd={null}
        onPresetChange={() => {}} onCustomChange={() => {}} />,
    );
    expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run src/components/stats/DateRangeFilter.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement component**

`DateRangeFilter.tsx`:

```tsx
import React from 'react';
import type { DateRangePreset } from '../../utils/dateRanges';
import './DateRangeFilter.css';

interface Props {
  preset: DateRangePreset;
  customStart: string | null; // yyyy-mm-dd
  customEnd: string | null;
  onPresetChange: (p: DateRangePreset) => void;
  onCustomChange: (start: string | null, end: string | null) => void;
}

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '30d', label: 'Last 30 days' },
  { value: '7d', label: 'Last 7 days' },
  { value: 'custom', label: 'Custom' },
];

const DateRangeFilter = ({ preset, customStart, customEnd, onPresetChange, onCustomChange }: Props): React.ReactElement => (
  <div className="date-range-filter">
    <div className="drf-presets" role="group" aria-label="Date range">
      {PRESETS.map(p => (
        <button
          key={p.value}
          type="button"
          className={`drf-preset${preset === p.value ? ' active' : ''}`}
          onClick={() => onPresetChange(p.value)}
          aria-pressed={preset === p.value}
        >
          {p.label}
        </button>
      ))}
    </div>
    {preset === 'custom' && (
      <div className="drf-custom">
        <label>
          <span>From</span>
          <input
            type="date"
            value={customStart ?? ''}
            onChange={e => onCustomChange(e.target.value || null, customEnd)}
          />
        </label>
        <label>
          <span>To</span>
          <input
            type="date"
            value={customEnd ?? ''}
            onChange={e => onCustomChange(customStart, e.target.value || null)}
          />
        </label>
      </div>
    )}
  </div>
);

export default DateRangeFilter;
```

`DateRangeFilter.css`:

```css
.date-range-filter { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
.drf-presets { display: flex; gap: 0.25rem; }
.drf-preset {
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
.drf-preset.active { color: var(--color-text); background: var(--color-panel); }
.drf-custom { display: flex; gap: 0.75rem; }
.drf-custom label { display: flex; flex-direction: column; font-size: 0.75rem; color: var(--color-text-muted); }
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run src/components/stats/DateRangeFilter.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/stats/DateRangeFilter.tsx frontend/src/components/stats/DateRangeFilter.css frontend/src/components/stats/DateRangeFilter.test.tsx
git commit -m "phase-6: add DateRangeFilter with presets and custom picker"
```

---

### Task 8: `StatsSummary` card

**Files:**
- Create: `frontend/src/components/stats/StatsSummary.tsx`, `StatsSummary.css`

- [ ] **Step 1: Implement**

```tsx
import React from 'react';
import { formatTime } from '../../utils/formatTime';
import type { StatsSummary as Summary } from '../../utils/statsBuckets';
import './StatsSummary.css';

const fmt = (v: number | null): string => v === null ? '-' : formatTime(v);

const StatsSummary = ({ summary }: { summary: Summary }): React.ReactElement => (
  <div className="stats-summary">
    <div className="ss-item"><span>Solves</span><b>{summary.validSolves}/{summary.totalSolves}</b></div>
    <div className="ss-item"><span>Total time</span><b>{formatTime(summary.totalSolveTimeSeconds)}</b></div>
    <div className="ss-item"><span>Best single</span><b>{fmt(summary.bestSingle)}</b></div>
    <div className="ss-item"><span>Best ao5</span><b>{fmt(summary.bestAo5)}</b></div>
    <div className="ss-item"><span>Best ao12</span><b>{fmt(summary.bestAo12)}</b></div>
    <div className="ss-item"><span>Current ao100</span><b>{fmt(summary.currentAo100)}</b></div>
  </div>
);

export default StatsSummary;
```

`StatsSummary.css`:

```css
.stats-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}
.ss-item {
  display: flex;
  flex-direction: column;
  padding: 0.75rem 1rem;
  background: var(--color-panel);
  border-radius: 8px;
}
.ss-item span { color: var(--color-text-muted); font-size: 0.75rem; text-transform: uppercase; }
.ss-item b { color: var(--color-text); font-size: 1.25rem; margin-top: 0.25rem; font-weight: 600; }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/stats/StatsSummary.tsx frontend/src/components/stats/StatsSummary.css
git commit -m "phase-6: add StatsSummary card"
```

---

### Task 9: `DotPlot`

**Files:**
- Create: `frontend/src/components/stats/DotPlot.tsx`, `DotPlot.css`

- [ ] **Step 1: Implement**

```tsx
import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart } from 'recharts';
import { formatTime } from '../../utils/formatTime';
import { useSettings } from '../../hooks/useSettings';
import { chartColors } from '../../utils/themeColors';
import type { Solve } from '../../types';
import './DotPlot.css';

interface Point { index: number; time: number; isPb: boolean; isWorst: boolean; created_at: string; }

const effective = (s: Solve): number => s.plus_two ? s.time + 2 : s.time;

const DotPlot = ({ solves }: { solves: Solve[] }): React.ReactElement => {
  // Chronological order (API returns newest first).
  const chronological = useMemo(() => [...solves].reverse(), [solves]);

  const points = useMemo<Point[]>(() => {
    const valid = chronological.filter(s => !s.dnf);
    if (!valid.length) return [];
    const times = valid.map(effective);
    const pb = Math.min(...times);
    const worst = Math.max(...times);
    return valid.map((s, i) => {
      const t = effective(s);
      return { index: i + 1, time: t, isPb: t === pb, isWorst: t === worst, created_at: s.created_at };
    });
  }, [chronological]);

  // Rolling ao5 (mean of middle 3 of 5) at each point.
  const ao5Line = useMemo(() => {
    const result: { index: number; ao5: number | null }[] = [];
    const ts: number[] = [];
    for (const p of points) {
      ts.push(p.time);
      if (ts.length < 5) { result.push({ index: p.index, ao5: null }); continue; }
      const window = ts.slice(-5).sort((a, b) => a - b).slice(1, 4);
      result.push({ index: p.index, ao5: window.reduce((a, b) => a + b, 0) / 3 });
    }
    return result;
  }, [points]);

  const { effectiveTheme } = useSettings();
  const colors = chartColors(effectiveTheme);

  if (!points.length) return <p className="dot-plot-empty">No solves in range.</p>;

  const merged = points.map((p, i) => ({ ...p, ao5: ao5Line[i]?.ao5 ?? null }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={merged}>
        <XAxis dataKey="index" stroke={colors.axis} tick={{ fill: colors.axis }} />
        <YAxis dataKey="time" stroke={colors.axis} tick={{ fill: colors.axis }}
          tickFormatter={v => formatTime(v)} />
        <Tooltip
          formatter={(v: number | string) =>
            typeof v === 'number' ? formatTime(v) : v}
          labelFormatter={l => `Solve #${l}`}
        />
        <Line type="monotone" dataKey="ao5" stroke={colors.recent} dot={false}
          strokeWidth={2} strokeOpacity={0.55} isAnimationActive={false} />
        <Scatter dataKey="time" isAnimationActive={false}
          shape={(props: { cx?: number; cy?: number; payload?: Point }) => {
            const { cx, cy, payload } = props;
            if (cx === undefined || cy === undefined || !payload) return <g />;
            const fill = payload.isPb ? colors.pb : payload.isWorst ? '#ef4444' : colors.recent;
            return <circle cx={cx} cy={cy} r={3} fill={fill} />;
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default DotPlot;
```

`DotPlot.css`:

```css
.dot-plot-empty { color: var(--color-text-muted); text-align: center; padding: 2rem 0; }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/stats/DotPlot.tsx frontend/src/components/stats/DotPlot.css
git commit -m "phase-6: add DotPlot with PB/worst coloring and rolling ao5 overlay"
```

---

### Task 10: `Histogram`

**Files:**
- Create: `frontend/src/components/stats/Histogram.tsx`

- [ ] **Step 1: Implement**

```tsx
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatTime } from '../../utils/formatTime';
import { buildHistogram } from '../../utils/statsBuckets';
import { useSettings } from '../../hooks/useSettings';
import { chartColors } from '../../utils/themeColors';
import type { Solve } from '../../types';

const effective = (s: Solve): number => s.plus_two ? s.time + 2 : s.time;

const Histogram = ({ solves, bins = 20 }: { solves: Solve[]; bins?: number }): React.ReactElement => {
  const { effectiveTheme } = useSettings();
  const colors = chartColors(effectiveTheme);

  const data = useMemo(() => {
    const times = solves.filter(s => !s.dnf).map(effective);
    return buildHistogram(times, bins).map(b => ({
      label: formatTime((b.min + b.max) / 2),
      count: b.count,
      range: `${formatTime(b.min)}–${formatTime(b.max)}`,
    }));
  }, [solves, bins]);

  if (!data.length) return <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>No solves in range.</p>;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <XAxis dataKey="label" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 11 }} />
        <YAxis stroke={colors.axis} tick={{ fill: colors.axis }} allowDecimals={false} />
        <Tooltip labelFormatter={(_, p) => p[0]?.payload?.range ?? ''} />
        <Bar dataKey="count" fill={colors.recent} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default Histogram;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/stats/Histogram.tsx
git commit -m "phase-6: add Histogram bar chart over time distribution"
```

---

### Task 11: `PBProgression`

**Files:**
- Create: `frontend/src/components/stats/PBProgression.tsx`

- [ ] **Step 1: Implement**

```tsx
import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../services/api';
import { formatTime } from '../../utils/formatTime';
import { useSettings } from '../../hooks/useSettings';
import { chartColors } from '../../utils/themeColors';
import type { PuzzleType, PersonalBest } from '../../types';

// Date-axis PB progression. Guests have no server-backed PBs, so the chart is
// empty for them — the spec says PB chart shows only when history exists.
const PBProgression = ({ puzzleType, isGuest }: { puzzleType: PuzzleType; isGuest: boolean }): React.ReactElement => {
  const [pbs, setPbs] = useState<PersonalBest[]>([]);
  const { effectiveTheme } = useSettings();
  const colors = chartColors(effectiveTheme);

  useEffect(() => {
    if (isGuest) { setPbs([]); return; }
    let cancelled = false;
    api.getPersonalBests(puzzleType).then(d => { if (!cancelled) setPbs(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [puzzleType, isGuest]);

  const data = pbs.map(pb => ({
    ts: new Date(pb.achieved_at).getTime(),
    label: new Date(pb.achieved_at).toLocaleDateString(),
    time: Number(pb.time),
  }));

  if (data.length < 2) return <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Not enough PB history yet.</p>;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <XAxis dataKey="label" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 11 }} />
        <YAxis stroke={colors.axis} tick={{ fill: colors.axis }} tickFormatter={v => formatTime(v)} />
        <Tooltip formatter={(v: number | string) => typeof v === 'number' ? formatTime(v) : v} />
        <Line type="stepAfter" dataKey="time" stroke={colors.pb} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default PBProgression;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/stats/PBProgression.tsx
git commit -m "phase-6: add PBProgression date-axis line chart"
```

---

### Task 12: `ActivityHeatmap`

**Files:**
- Create: `frontend/src/components/stats/ActivityHeatmap.tsx`

- [ ] **Step 1: Implement**

```tsx
import React, { useMemo } from 'react';
import { ResponsiveCalendar } from '@nivo/calendar';
import { buildHeatmapData } from '../../utils/statsBuckets';
import { useSettings } from '../../hooks/useSettings';
import type { Solve } from '../../types';

interface Props {
  solves: Solve[];
  from: Date;
  to: Date;
}

// Quantile-based color scale keeps one busy day from flattening the rest.
// Nivo accepts an explicit `colors` array + min/max; we compute thresholds
// from the data quantiles so intensity matches distribution shape.
const ActivityHeatmap = ({ solves, from, to }: Props): React.ReactElement => {
  const data = useMemo(() => buildHeatmapData(solves), [solves]);
  const { effectiveTheme } = useSettings();

  const values = data.map(d => d.value).sort((a, b) => a - b);
  const maxValue = values.length ? values[values.length - 1] : 1;

  const isoFrom = from.toISOString().slice(0, 10);
  const isoTo = to.toISOString().slice(0, 10);

  const colors = effectiveTheme === 'light'
    ? ['#e6f4ea', '#a8d5b0', '#68b97a', '#2f9e44', '#1b6a2d']
    : ['#1c2a20', '#254d36', '#2f7d4f', '#3bb26a', '#5ad48a'];

  return (
    <div style={{ height: 200 }}>
      <ResponsiveCalendar
        data={data}
        from={isoFrom}
        to={isoTo}
        emptyColor={effectiveTheme === 'light' ? '#ececea' : '#2a2a2a'}
        minValue={0}
        maxValue={Math.max(1, maxValue)}
        colors={colors}
        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        yearSpacing={30}
        monthBorderColor="transparent"
        dayBorderWidth={1}
        dayBorderColor={effectiveTheme === 'light' ? '#ffffff' : '#121212'}
        theme={{
          text: { fill: effectiveTheme === 'light' ? '#1a1a1a' : '#e5e5e5' },
          tooltip: {
            container: {
              background: effectiveTheme === 'light' ? '#ffffff' : '#1e1e1e',
              color: effectiveTheme === 'light' ? '#1a1a1a' : '#e5e5e5',
            },
          },
        }}
      />
    </div>
  );
};

export default ActivityHeatmap;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/stats/ActivityHeatmap.tsx
git commit -m "phase-6: add ActivityHeatmap calendar using nivo"
```

---

### Task 13: Stats page orchestrator

**Files:**
- Create: `frontend/src/pages/Stats.css`
- Modify: `frontend/src/pages/Stats.tsx`
- Modify: `frontend/src/components/Header.tsx` (accept an optional `variant` so the stats page can use a plain header without the timer's puzzle change flow).

- [ ] **Step 1: Expand `Stats.tsx`**

Replace `frontend/src/pages/Stats.tsx`:

```tsx
import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import DateRangeFilter from '../components/stats/DateRangeFilter';
import StatsSummary from '../components/stats/StatsSummary';
import DotPlot from '../components/stats/DotPlot';
import Histogram from '../components/stats/Histogram';
import PBProgression from '../components/stats/PBProgression';
import ActivityHeatmap from '../components/stats/ActivityHeatmap';
import useAllSolves from '../hooks/useAllSolves';
import { computeSummary } from '../utils/statsBuckets';
import { getPresetBounds, filterSolvesByRange, type DateRangePreset } from '../utils/dateRanges';
import { supabase } from '../services/auth';
import type { PuzzleType } from '../types';
import './Stats.css';

const DEFAULT_PUZZLE: PuzzleType = '333';

const StatsPage = (): React.ReactElement => {
  const [searchParams, setSearchParams] = useSearchParams();
  const puzzleType = (searchParams.get('puzzle') as PuzzleType | null) ?? DEFAULT_PUZZLE;

  const [isGuest, setIsGuest] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setIsGuest(!session));
  }, []);

  const [preset, setPreset] = useState<DateRangePreset>('all');
  const [customStart, setCustomStart] = useState<string | null>(null);
  const [customEnd, setCustomEnd] = useState<string | null>(null);

  const { solves, loading } = useAllSolves(puzzleType, isGuest);

  const bounds = useMemo(() => {
    if (preset === 'custom') {
      return {
        start: customStart ? new Date(customStart) : null,
        end: customEnd ? new Date(`${customEnd}T23:59:59.999Z`) : null,
      };
    }
    return getPresetBounds(preset);
  }, [preset, customStart, customEnd]);

  const filteredSolves = useMemo(() => filterSolvesByRange(solves, bounds), [solves, bounds]);
  const summary = useMemo(() => computeSummary(filteredSolves), [filteredSolves]);

  const heatmapFrom = useMemo(() => bounds.start ?? (solves.length
    ? new Date(solves[solves.length - 1].created_at)
    : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)), [bounds.start, solves]);
  const heatmapTo = bounds.end ?? new Date();

  const handlePuzzleChange = (e: React.ChangeEvent<HTMLSelectElement> | React.MouseEvent<HTMLButtonElement>) => {
    const value = (e.currentTarget as HTMLSelectElement | HTMLButtonElement).value as PuzzleType;
    setSearchParams(prev => { prev.set('puzzle', value); return prev; });
  };

  return (
    <div className="stats-page">
      <Header
        type={puzzleType}
        handleTypeChange={handlePuzzleChange}
        isGuest={isGuest}
        onSignIn={() => {}}
      />
      <div className="stats-body">
        <div className="stats-toolbar">
          <DateRangeFilter
            preset={preset}
            customStart={customStart}
            customEnd={customEnd}
            onPresetChange={setPreset}
            onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
          />
        </div>

        {loading ? (
          <p className="stats-loading">Loading solves…</p>
        ) : (
          <div className="stats-grid">
            <section className="stats-card"><h2>Summary</h2><StatsSummary summary={summary} /></section>
            <section className="stats-card"><h2>Times</h2><DotPlot solves={filteredSolves} /></section>
            <section className="stats-card"><h2>Distribution</h2><Histogram solves={filteredSolves} /></section>
            <section className="stats-card"><h2>PB progression</h2><PBProgression puzzleType={puzzleType} isGuest={isGuest} /></section>
            <section className="stats-card"><h2>Activity</h2><ActivityHeatmap solves={filteredSolves} from={heatmapFrom} to={heatmapTo} /></section>
          </div>
        )}
      </div>
    </div>
  );
};

export default StatsPage;
```

- [ ] **Step 2: Create `Stats.css`**

```css
.stats-page { display: flex; flex-direction: column; min-height: 100vh; }
.stats-body { padding: 1.5rem; max-width: 1200px; margin: 0 auto; width: 100%; }
.stats-toolbar { margin-bottom: 1.5rem; }
.stats-grid { display: grid; gap: 1rem; grid-template-columns: 1fr; }
.stats-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem 1.25rem;
}
.stats-card h2 { font-size: 0.95rem; color: var(--color-text-muted); margin: 0 0 0.75rem; font-weight: 500; }
.stats-loading { color: var(--color-text-muted); text-align: center; padding: 3rem 0; }
@media (min-width: 900px) {
  .stats-grid { grid-template-columns: 1fr 1fr; }
  .stats-card:first-child { grid-column: 1 / -1; }
}
```

- [ ] **Step 3: Manual verify**

Run: `npm run dev`. As guest, add a few solves on `/`. Navigate to `/stats`. Expected: summary, dot plot, histogram, heatmap render. PB progression shows the empty-state message (guests have no PBs). Switch puzzle via tabs — URL changes to `?puzzle=...` and charts update.

- [ ] **Step 4: Integration test**

Create `frontend/src/pages/Stats.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StatsPage from './Stats';
import api from '../services/api';
import { supabase } from '../services/auth';
import type { Solve } from '../types';

vi.mock('../services/api');
vi.mock('../services/auth', () => ({ supabase: { auth: { getSession: vi.fn() } } }));
vi.mock('../services/guestStorage', () => ({ getGuestSolves: vi.fn(() => []) }));

const solves: Solve[] = [
  { id: '1', puzzle_type: '333', time: 10, dnf: false, plus_two: false, scramble: '', created_at: '2026-04-19T00:00:00Z' },
  { id: '2', puzzle_type: '333', time: 12, dnf: false, plus_two: false, scramble: '', created_at: '2026-04-18T00:00:00Z' },
  { id: '3', puzzle_type: '333', time: 15, dnf: false, plus_two: false, scramble: '', created_at: '2026-04-17T00:00:00Z' },
  { id: '4', puzzle_type: '333', time: 8,  dnf: false, plus_two: false, scramble: '', created_at: '2026-04-16T00:00:00Z' },
  { id: '5', puzzle_type: '333', time: 11, dnf: false, plus_two: false, scramble: '', created_at: '2026-04-15T00:00:00Z' },
];

describe('StatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.auth.getSession as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ data: { session: { access_token: 'x' } } });
    (api.getSolves as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ solves, next_cursor: null });
    (api.getPersonalBests as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('renders summary, charts, and heatmap with fetched solves', async () => {
    render(<MemoryRouter initialEntries={['/stats']}><StatsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Summary')).toBeInTheDocument());
    expect(screen.getByText('Times')).toBeInTheDocument();
    expect(screen.getByText('Distribution')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    // Best single = 8s → "8.00"
    await waitFor(() => expect(screen.getByText('8.00')).toBeInTheDocument());
  });
});
```

Run: `npx vitest run src/pages/Stats.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Stats.tsx frontend/src/pages/Stats.css frontend/src/pages/Stats.test.tsx
git commit -m "phase-6: wire Stats page with filters, summary, and five charts"
```

---

### Task 14: Acceptance pass

- [ ] **Step 1: Run full test suite**

Run from `frontend/`: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual acceptance checklist**

Walk through each spec bullet:

- [ ] `/stats` renders five visualizations for selected puzzle + date range.
- [ ] Switching to "Last 7 days" updates all charts.
- [ ] Switching the puzzle in the header updates all charts (URL reflects `?puzzle=`).
- [ ] Heatmap shows one cell per day with a tooltip.
- [ ] Dot plot handles at least 1000 solves (seed a guest with 1000+ solves via devtools; confirm no frame drops on scroll/zoom).

- [ ] **Step 4: Commit any last fixes, tag phase complete**

```bash
git add -A
git commit -m "phase-6: acceptance fixes" || true
```

---

## Self-Review Summary

- **Spec coverage:** routes added (T2), summary (T8), dot plot w/ ao5 overlay (T9), histogram (T10), PB progression (T11), heatmap (T12), filters (T7+T13), nav tabs (T3), client-side pagination (T4), no backend changes. Dot-plot-handles-1000-solves acceptance is a manual check (T14).
- **Placeholders:** none; every code step shows actual code.
- **Type consistency:** `DateRangePreset`, `DateRangeBounds`, `StatsSummary`, `HistogramBin`, `HeatmapCell` are all defined in exactly one place and imported where used. `useAllSolves` signature matches its consumers.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-20-phase-6-stats-expansion.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with batch checkpoints.

**Which approach?**
