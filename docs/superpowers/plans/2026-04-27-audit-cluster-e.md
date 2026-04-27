# Cluster E Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the duplication, dead code, and oversized files identified in Cluster E of the 2026-04-25 full-stack audit. Pure cleanup with zero behavior change (except E.13, which finishes the A.1 password-reset bug fix).

**Architecture:** 11 PRs ordered by dependency: dead-code first, then test infra, then leaf utilities, then hooks/factories, then components, then pages, then backend, then the three "L" refactors last. Each PR is independently shippable and reviewable.

**Tech Stack:** React 18 + TypeScript + Vitest (frontend), Flask + pytest + Supabase (backend), Recharts, Sonner toasts, react-router.

---

## Context

The 2026-04-25 audit (10 specialist agents) identified 24 cleanup items in Cluster E ranging from one-line dead-code deletions to splitting a 377-line Timer component into a state machine. None are bugs; all are leverage. The work has not started, but two adjacent items have moved since the audit:

- **E.23 is already done.** `routes/solves.py` and `auth.py` use `g.user_id`/`g.supabase` throughout. No `request.user_id` monkey-patching remains. Drop from this plan.
- **A.1 is partially done.** Auth.tsx's reset branch uses `toast.success` (line 38), but signup (line 32) and update (line 43) still call `alert()`. E.13 absorbs the remainder.

Cluster D items D.4 (user_stats counter), D.7 (batch endpoint), and D.8 (atomic PB RPC) shipped between 2026-04-25 and today, so `routes/solves.py` is now 489 lines (audit said ~430). Line numbers in this plan reflect current state.

User decisions (2026-04-27):
- Aggressive dead-code removal: delete production code AND its tests for items only referenced by tests.
- All three L items (E.9, E.10, E.11) get full task breakdowns.
- Bundle A.1 finish into E.13.

---

## Sequencing & Bundling

11 PRs. Each can ship independently; later PRs may rely on helpers introduced earlier.

| # | PR | Items | Effort | Depends on |
|---|----|-------|--------|------------|
| 1 | Dead code & stale comments | E.1, E.20 | S | — |
| 2 | Test fixtures (`makeSolve`) | E.22 | S | — |
| 3 | Pure-function helpers | E.2, E.3, E.5, E.6, E.19 | M | PR 2 |
| 4 | Hook factories & shared listeners | E.4, E.17 | M | — |
| 5 | Canonical puzzle list | E.18 | S | — |
| 6 | Component cleanup | E.7, E.8, E.15, E.16, E.21, E.24 | M | PR 3 |
| 7 | Stats filter hook | E.14 | M | — |
| 8 | Auth mode-config (+ finish A.1) | E.13 | M | — |
| 9 | Backend route-error helper | E.12 | M | — |
| 10 | `useSolveSession` split | E.9 | L | PRs 2, 3 |
| 11 | `Timer`/`useTimerMachine` split | E.10 | L | PR 3 |
| 12 | Backend service + repository layers | E.11 | L | PR 9 |

**Items already done (no work):** E.23 (`flask.g` migration).

Run `cd backend && pytest -q && cd frontend && npx vitest run --reporter=dot && npx tsc --noEmit` after each PR before opening it. CI from Cluster 0 (audit) is the long-term enforcement; do not regress.

---

## PR 1: Dead code & stale comments (E.1, E.20)

**Files:**
- Delete: `frontend/src/components/trainers/ComingSoon.tsx`
- Delete: `frontend/src/components/trainers/ComingSoon.css` (and any CSS import that referenced it)
- Modify: `frontend/src/utils/trainerScramble.ts:43-45,124-128`
- Modify: `frontend/src/utils/trainerScramble.test.ts` (drop `generatePllScramble` cases and `PLL_CASE_MAP` import)
- Modify: `frontend/src/services/guestStorage.ts:83-87` (remove `clearAllGuestSolves`)
- Modify: `frontend/src/pages/Stats.test.tsx` (remove the `clearAllGuestSolves` mock entry)
- Modify: `frontend/src/utils/sound.ts:29` (remove `isSoundEnabled` export)
- Modify: `frontend/src/components/Timer.test.tsx` (remove `isSoundEnabled` from the mocked module)
- Modify: `frontend/src/hooks/useScrambleQueue.ts` (remove `override` and `nextScramble` from interface and snapshot)
- Modify: `frontend/src/hooks/useScrambleQueue.test.tsx` (remove `nextScramble` and `override` cases)
- Modify: `frontend/src/lib/scrambleQueue.ts:29-45` (drop `setPuzzleType` second arg + lines 31, 35-40 unreachable branches; also drop `override`/`nextScramble` from snapshot if interface backs it)
- Modify: `frontend/src/hooks/useMedianTracker.ts` (remove `getSize` from interface and return)
- Modify: `frontend/src/types/index.ts:27` (remove `PersonalBest.category` field)
- Modify: `backend/app/routes/__init__.py:3` (delete the empty `__all__`)
- Modify: `frontend/src/components/ScramblePreview.tsx:46-47` (rewrite the stale "Task 5" comment to describe what the separate effects actually do)

**Notes:**
- `useAllSolves` items 9 (`refetch`/`tick`) from the audit are already gone — explore confirmed no such symbols exist in the file. Skip silently.
- `PersonalBest.category` audit item: type used everywhere, field never read. Removing the field changes the wire shape only if backend returns it; check `backend/app/routes/solves.py:get_personal_bests` first — if `select` enumerates columns excluding `category`, removal is safe.
- For each deletion of a tested-but-unused symbol, delete BOTH the production code and its tests in the same commit so the test suite never references a symbol that doesn't exist.

**Steps:**
- [ ] **Step 1: Verify each item before deletion**
  Run `grep -rn "ComingSoon\|generatePllScramble\|clearAllGuestSolves\|isSoundEnabled\|PersonalBest" frontend/src backend/app` and visually confirm only the files listed above contain references. If a new caller has appeared since the audit, halt and renegotiate scope.

- [ ] **Step 2: Delete `ComingSoon.tsx` and its CSS**
  ```bash
  rm frontend/src/components/trainers/ComingSoon.tsx frontend/src/components/trainers/ComingSoon.css
  grep -rn "ComingSoon" frontend/src   # expect: no output
  ```

- [ ] **Step 3: Remove `generatePllScramble` and its tests**
  Edit `trainerScramble.ts` to delete lines 124-128. Edit `trainerScramble.test.ts` to delete every `generatePllScramble` test block.
  Run: `npx vitest run frontend/src/utils/trainerScramble.test.ts`
  Expected: PASS (smaller suite).

- [ ] **Step 4: Unexport `PLL_CASE_MAP` / `OLL_CASE_MAP` / `F2L_CASE_MAP`**
  Drop the `export` keyword from lines 43-45. If the test file imports them, remove those imports and the assertions that referenced them; `CASE_MAP_BY_TYPE` is the only legitimate consumer.

- [ ] **Step 5: Remove `clearAllGuestSolves` and its mock**
  Delete the function and its mock entry in `Stats.test.tsx`.
  Run: `npx vitest run frontend/src/pages/Stats.test.tsx`
  Expected: PASS.

- [ ] **Step 6: Remove `isSoundEnabled` export and its mock**
  Delete the export in `sound.ts` and the mock entry in `Timer.test.tsx`.
  Run: `npx vitest run frontend/src/components/Timer.test.tsx`
  Expected: PASS.

- [ ] **Step 7: Remove `override` / `nextScramble` from `useScrambleQueue`**
  Drop both from the result object and interface in `useScrambleQueue.ts`. Drop from the underlying `scrambleQueue.ts` snapshot if present. Drop the corresponding test cases in `useScrambleQueue.test.tsx`.
  Run: `npx vitest run frontend/src/hooks/useScrambleQueue.test.tsx`
  Expected: PASS.

- [ ] **Step 8: Drop `setPuzzleType` second arg and unreachable branches**
  In `lib/scrambleQueue.ts:29`, change `setPuzzleType(puzzleType: PuzzleType, initialScramble?: string)` to `setPuzzleType(puzzleType: PuzzleType)`. Delete lines 31 and 35-40 (the unreachable branch).
  Run: `npx tsc --noEmit` and `npx vitest run frontend/src/lib`
  Expected: PASS.

- [ ] **Step 9: Drop `getSize` from `useMedianTracker`**
  Remove from interface (line 78), implementation (line 121), and return (line 123). Verify `useMedianTracker.test.ts` doesn't assert on it.

- [ ] **Step 10: Remove `PersonalBest.category` field**
  First, grep `backend/app/routes/solves.py` for `'category'` — if the backend never selects or returns it, safe to remove. Edit `frontend/src/types/index.ts:27`.

- [ ] **Step 11: Delete empty `__all__`**
  Edit `backend/app/routes/__init__.py:3` and remove the empty `__all__ = []` line (or the whole module if it's now empty besides the blueprint import).

- [ ] **Step 12: Rewrite stale `ScramblePreview.tsx` comment**
  Replace lines 46-47 with a description of the actual effect orchestration, not the "Task 5" reference.

- [ ] **Step 13: Run full test suites + typecheck**
  ```bash
  (cd backend && pytest -q) && (cd frontend && npx vitest run --reporter=dot && npx tsc --noEmit)
  ```
  Expected: all green.

- [ ] **Step 14: Commit**
  ```bash
  git add -A
  git commit -m "refactor(audit-E1-E20): drop dead exports, tests, and stale comments"
  ```

---

## PR 2: Test fixtures (`makeSolve`) (E.22)

**Files:**
- Create: `frontend/src/test-utils/makeSolve.ts`
- Create: `backend/tests/conftest.py` additions (or new file `backend/tests/factories.py`)
- Modify: `frontend/src/utils/averages.test.ts` (replace local `mk`)
- Modify: `frontend/src/utils/recentTrend.test.ts`
- Modify: `frontend/src/utils/statsBuckets.test.ts`
- Modify: `frontend/src/utils/dateRanges.test.ts`
- Modify: `frontend/src/utils/exportCsv.test.ts`
- Modify: `frontend/src/components/SolveDetailModal.test.tsx`

**Steps:**
- [ ] **Step 1: Write the new fixture**
  Create `frontend/src/test-utils/makeSolve.ts`:
  ```typescript
  import type { Solve } from '../types';

  let counter = 0;
  export const makeSolve = (overrides: Partial<Solve> = {}): Solve => ({
    id: `solve-${++counter}`,
    puzzle_type: '333',
    time: 10,
    dnf: false,
    plus_two: false,
    scramble: '',
    created_at: '2026-04-20T00:00:00Z',
    ...overrides,
  });
  ```

- [ ] **Step 2: Replace each local `mk` / `mkSolve`**
  In each test file listed above, replace the local helper with `import { makeSolve } from '../test-utils/makeSolve'`. Adjust call sites (rename `mk(...)` → `makeSolve(...)`).
  Run: `npx vitest run` after each file.
  Expected: all green.

- [ ] **Step 3: Add backend `make_solve` fixture**
  In `backend/tests/conftest.py`, add:
  ```python
  @pytest.fixture
  def make_solve():
      counter = {"i": 0}
      def _make(**overrides):
          counter["i"] += 1
          return {
              "id": f"solve-{counter['i']}",
              "user_id": "test-user",
              "puzzle_type": "333",
              "time": 10.0,
              "dnf": False,
              "plus_two": False,
              "scramble": "",
              "created_at": "2026-04-20T00:00:00Z",
              **overrides,
          }
      return _make
  ```
  (Sweep tests in `backend/tests/test_solves.py` opportunistically; not blocking.)

- [ ] **Step 4: Run full suites**
  Same command as PR 1 step 13.

- [ ] **Step 5: Commit**
  `git commit -m "test(audit-E22): centralize makeSolve fixture across frontend tests"`

---

## PR 3: Pure-function helpers (E.2, E.3, E.5, E.6, E.19)

**Files:**
- Create: `frontend/src/utils/solveTime.ts` (`effectiveTime` + `displayTime`)
- Create: `frontend/src/utils/solveLabel.ts` OR add to `formatTime.ts` (`formatSolveLabel`)
- Create: `frontend/src/utils/inspectionConstants.ts`
- Create: `frontend/src/utils/localDateKey.ts`
- Modify call sites listed in audit E.2 (5 declarations + ~9 inline expressions)
- Modify call sites listed in audit E.3 (5 sites)
- Modify `frontend/src/components/Timer.tsx` lines 127, 132, 154, 156, 163 to import constants
- Modify `frontend/src/utils/recentTrend.ts:19-25` and `frontend/src/utils/statsBuckets.ts:46-50`
- Modify `frontend/src/utils/recentTrend.ts:8-9, 56-57, 81-82` to drop `recentSessions`/`priorSessions`

**Notes:**
- Audit calls for two helpers: `effectiveTime(solve): number` (DNF → `Number.POSITIVE_INFINITY`, +2 → `time + 2000` ms? or `time + 2` seconds?). Current codebase uses **seconds** consistently (`s.time + 2`). Stick with seconds — do not silently change units.
- The existing `effective` definitions diverge: `averages.ts` is DNF-aware, the others ignore DNF. The DNF-ignoring versions all run on already-filtered "valid" arrays. Audit a calling context before swapping; some sites need `effectiveTime` (DNF-aware) and others can keep `displayTime`-style (seconds + plus_two only).

**Steps:**

### E.2: `effectiveTime` / `displayTime`

- [ ] **Step 1: Write tests for the new module**
  `frontend/src/utils/solveTime.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { effectiveTime, displayTime } from './solveTime';
  import { makeSolve } from '../test-utils/makeSolve';

  describe('effectiveTime', () => {
    it('returns Infinity for DNF', () => {
      expect(effectiveTime(makeSolve({ dnf: true, time: 10 }))).toBe(Number.POSITIVE_INFINITY);
    });
    it('adds 2 seconds for +2', () => {
      expect(effectiveTime(makeSolve({ plus_two: true, time: 10 }))).toBe(12);
    });
    it('returns raw time otherwise', () => {
      expect(effectiveTime(makeSolve({ time: 10 }))).toBe(10);
    });
  });

  describe('displayTime', () => {
    it('returns null for DNF', () => {
      expect(displayTime(makeSolve({ dnf: true, time: 10 }))).toBeNull();
    });
    it('adds 2 for +2', () => {
      expect(displayTime(makeSolve({ plus_two: true, time: 10 }))).toBe(12);
    });
  });
  ```

- [ ] **Step 2: Run test, expect failure**
  `npx vitest run frontend/src/utils/solveTime.test.ts`
  Expected: FAIL (module doesn't exist).

- [ ] **Step 3: Implement**
  ```typescript
  import type { Solve } from '../types';

  export const effectiveTime = (s: Solve): number =>
    s.dnf ? Number.POSITIVE_INFINITY : s.plus_two ? s.time + 2 : s.time;

  export const displayTime = (s: Solve): number | null =>
    s.dnf ? null : s.plus_two ? s.time + 2 : s.time;
  ```

- [ ] **Step 4: Verify tests pass**
  Same command. Expected: PASS.

- [ ] **Step 5: Replace each call site**
  For each file in audit E.2 list:
    - `utils/averages.ts:5` — replace local `effective` with `import { effectiveTime } from './solveTime'`. Substitute uses.
    - `utils/recentTrend.ts:17` — replace. Note: this site doesn't filter DNF first; choose `displayTime` if the consuming code expects `null`-skippable, else `effectiveTime`.
    - `utils/statsBuckets.ts:12` — same call.
    - `components/stats/Histogram.tsx:9`, `DotPlot.tsx:12` — same.
    - Inline expression sites: `useSolveSession.ts:111,156,238`, `SolveHub.tsx:69,96`, `SolveLog.tsx:121-124`, `SolveDetailModal.tsx:96`, `SharedSolve.tsx:60`, `ScrambleHistory.tsx:18`, `TrainerRecentStrip.tsx`.
  Run after each: `npx vitest run` for the changed file's test.

- [ ] **Step 6: Run full suite + typecheck**
  Expected: PASS.

### E.3: `formatSolveLabel`

- [ ] **Step 7: Write tests**
  `frontend/src/utils/solveLabel.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { formatSolveLabel } from './solveLabel';
  import { makeSolve } from '../test-utils/makeSolve';

  describe('formatSolveLabel', () => {
    it('returns "DNF" for DNF', () => expect(formatSolveLabel(makeSolve({ dnf: true }))).toBe('DNF'));
    it('appends "+" for +2', () => expect(formatSolveLabel(makeSolve({ plus_two: true, time: 12.34 }))).toBe('14.34+'));
    it('formats raw time', () => expect(formatSolveLabel(makeSolve({ time: 12.34 }))).toBe('12.34'));
    it('honors plusSuffix=false', () => expect(formatSolveLabel(makeSolve({ plus_two: true, time: 12.34 }), { plusSuffix: false })).toBe('14.34'));
  });
  ```

- [ ] **Step 8: Implement**
  Add to `utils/solveLabel.ts`:
  ```typescript
  import { formatTime } from './formatTime';
  import { effectiveTime } from './solveTime';
  import type { Solve } from '../types';

  interface Opts { plusSuffix?: boolean; }
  export const formatSolveLabel = (s: Solve, { plusSuffix = true }: Opts = {}): string => {
    if (s.dnf) return 'DNF';
    const base = formatTime(effectiveTime(s));
    return s.plus_two && plusSuffix ? `${base}+` : base;
  };
  ```

- [ ] **Step 9: Replace call sites**
  `SolveLog.tsx:121-124`, `SolveDetailModal.tsx:21,96`, `ScrambleHistory.tsx:17-18`, `TrainerRecentStrip.tsx:15-20`, `SharedSolve.tsx:58-60`. For TrainerRecentStrip, the entry shape is `RecentEntry` not `Solve` — adapt by either widening the helper or keeping a thin local adapter.

### E.5: Inspection constants

- [ ] **Step 10: Create constants module**
  `frontend/src/utils/inspectionConstants.ts`:
  ```typescript
  export const INSPECTION_LIMIT_MS = 15000;
  export const INSPECTION_PLUS_TWO_MS = 17000;
  export const INSPECTION_8S_WARNING_AT_MS = 8000;
  export const INSPECTION_12S_WARNING_AT_MS = 12000;
  ```

- [ ] **Step 11: Replace magic numbers in Timer.tsx**
  Lines 127, 132, 154, 156, 163 — substitute the imported constants. Run `npx vitest run frontend/src/components/Timer.test.tsx`. Expected: PASS.

### E.6: `localDateKey`

- [ ] **Step 12: Move to its own module**
  Create `frontend/src/utils/localDateKey.ts` with the existing function from `recentTrend.ts:19-25`. Re-export and update both `recentTrend.ts` and `statsBuckets.ts:46-50` (the inline copy).
  Run: `npx vitest run frontend/src/utils`
  Expected: PASS.

### E.19: Drop unused trend fields

- [ ] **Step 13: Remove `recentSessions` / `priorSessions`**
  In `utils/recentTrend.ts`, delete:
  - Line 8-9 from `TrendResult` interface
  - Lines 56-57 (the slice definitions)
  - Lines 81-82 (the field returns)
  Update `recentTrend.test.ts` if it asserts on these fields.

### Wrap-up

- [ ] **Step 14: Final verification**
  Same command as PR 1 step 13.

- [ ] **Step 15: Commit**
  Single commit OR split into 5 commits (one per item) for cleaner review:
  ```
  git commit -m "refactor(audit-E2): single effectiveTime/displayTime helper"
  git commit -m "refactor(audit-E3): single formatSolveLabel helper"
  git commit -m "refactor(audit-E5): inspection timing constants"
  git commit -m "refactor(audit-E6): centralize localDateKey"
  git commit -m "refactor(audit-E19): drop unused trend fields"
  ```

---

## PR 4: Hook factories & shared listeners (E.4, E.17)

### E.4: `createPersistedSettings<T>()` factory

**Files:**
- Create: `frontend/src/hooks/createPersistedSettings.tsx`
- Modify: `frontend/src/hooks/useSettings.tsx`
- Modify: `frontend/src/hooks/useScramblePreviewSettings.tsx`

**Steps:**
- [ ] **Step 1: Design the factory signature**
  ```typescript
  interface PersistedConfig<T> {
    storageKey: string;
    defaults: T;
    parse: (raw: unknown) => Partial<T>;  // per-field guards
  }

  export function createPersistedSettings<T>({ storageKey, defaults, parse }: PersistedConfig<T>) {
    const Context = createContext<{ value: T; update: (patch: Partial<T>) => void } | null>(null);
    const Provider = ({ children }: { children: ReactNode }) => { /* ... */ };
    const useHook = () => { /* ... */ };
    return { Provider, useHook };
  }
  ```

- [ ] **Step 2: Write tests for the factory**
  `frontend/src/hooks/createPersistedSettings.test.tsx` covering:
  - First mount uses defaults when localStorage empty
  - First mount restores valid stored values
  - Invalid stored values fall back to defaults per field
  - `update({ x: y })` writes to localStorage
  - SSR-safe: `typeof window === 'undefined'` returns defaults
  Run: expect FAIL.

- [ ] **Step 3: Implement the factory**
  Extract from `useSettings.tsx:35-54` and `useScramblePreviewSettings.tsx:31-46`.
  Run: tests PASS.

- [ ] **Step 4: Refactor `useSettings.tsx` to use the factory**
  Provide a `parse` function that runs the per-field type guards already present (`theme === 'dark' | 'light' | 'system'`, `typeof inspectionEnabled === 'boolean'`, etc.). Behavior unchanged.
  Run: `npx vitest run frontend/src/hooks/useSettings.test.tsx` — PASS.

- [ ] **Step 5: Refactor `useScramblePreviewSettings.tsx` similarly**
  Run its existing tests — PASS.

- [ ] **Step 6: Verify shared parser doesn't drift**
  Diff before/after; ~80 lines saved, both consumers use identical parse mechanics.

### E.17: `useDismissOnOutsideClick`

**Files:**
- Create: `frontend/src/hooks/useDismissOnOutsideClick.ts`
- Modify: `frontend/src/components/Header.tsx:41-60`
- Modify: `frontend/src/components/HotkeyHelp.tsx:20-26`
- Modify: `frontend/src/components/SolveDetailModal.tsx:41-47`

**Steps:**
- [ ] **Step 7: Write tests**
  `frontend/src/hooks/useDismissOnOutsideClick.test.tsx` — render a div, simulate `pointerdown` outside and inside, simulate Escape, assert callback fires only outside.

- [ ] **Step 8: Implement**
  ```typescript
  export function useDismissOnOutsideClick(
    ref: RefObject<HTMLElement>,
    onClose: () => void,
    enabled = true,
  ): void {
    useEffect(() => {
      if (!enabled) return;
      const handlePointer = (event: PointerEvent) => {
        if (ref.current && !ref.current.contains(event.target as Node)) onClose();
      };
      const handleKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') onClose();
      };
      document.addEventListener('pointerdown', handlePointer);
      document.addEventListener('keydown', handleKey);
      return () => {
        document.removeEventListener('pointerdown', handlePointer);
        document.removeEventListener('keydown', handleKey);
      };
    }, [ref, onClose, enabled]);
  }
  ```
  (Switch from `mousedown` to `pointerdown` so taps work on touch.)

- [ ] **Step 9: Replace all three call sites**
  For each: delete the inline `useEffect`, add the hook call. HotkeyHelp and SolveDetailModal currently only handle Escape — keep that behavior by passing a no-op-bound ref OR add a `keyOnly` mode. Recommend: ref always required, but if `ref.current` is null treat all clicks as "inside" (disabling outside-click). Audit existing tests.

- [ ] **Step 10: Run all three components' tests + suites**
  Expected: PASS.

- [ ] **Step 11: Commit**
  `git commit -m "refactor(audit-E4-E17): hook factories for settings + shared dismiss listener"`

---

## PR 5: Canonical puzzle list (E.18)

**Files:**
- Create: `frontend/src/data/puzzles.ts`
- Modify: `frontend/src/components/Header.tsx:16-28`
- Modify: `frontend/src/components/SolveSession.tsx:19-30`
- Possibly modify: `frontend/src/utils/puzzleIds.ts` if it duplicates the list

**Steps:**
- [ ] **Step 1: Define canonical list**
  ```typescript
  // frontend/src/data/puzzles.ts
  import type { PuzzleType } from '../types';

  export interface PuzzleEntry { value: PuzzleType; label: string; hotkey?: string; }
  export const PUZZLES: PuzzleEntry[] = [
    { value: '222', label: '2x2', hotkey: 'Alt+1' },
    { value: '333', label: '3x3', hotkey: 'Alt+2' },
    { value: '444', label: '4x4', hotkey: 'Alt+3' },
    { value: '555', label: '5x5', hotkey: 'Alt+4' },
    { value: '666', label: '6x6', hotkey: 'Alt+5' },
    { value: '777', label: '7x7', hotkey: 'Alt+6' },
    { value: 'pyram', label: 'Pyraminx', hotkey: 'Alt+7' },
    { value: 'mega', label: 'Megaminx', hotkey: 'Alt+8' },
    { value: 'skewb', label: 'Skewb', hotkey: 'Alt+9' },
    { value: 'sq1', label: 'SQ-1', hotkey: 'Alt+0' },
    { value: 'clock', label: 'Clock' },
  ];

  export const PUZZLE_HOTKEYS: Record<string, PuzzleType> = Object.fromEntries(
    PUZZLES.filter(p => p.hotkey).map(p => [p.hotkey!, p.value]),
  );
  ```

- [ ] **Step 2: Refactor consumers**
  - `Header.tsx`: import `PUZZLES`, drop the local copy, render dropdown options from it.
  - `SolveSession.tsx`: import `PUZZLE_HOTKEYS`, drop the local copy.

- [ ] **Step 3: Add a unit test asserting parity**
  `frontend/src/data/puzzles.test.ts` — assert that every PUZZLES entry with a `hotkey` appears in `PUZZLE_HOTKEYS` and vice versa. (Cheap regression to prevent the two-place drift returning.)

- [ ] **Step 4: Verify + commit**
  Run suites. `git commit -m "refactor(audit-E18): single canonical puzzle list"`

---

## PR 6: Component cleanup batch (E.7, E.8, E.15, E.16, E.21, E.24)

Six small, low-risk component cleanups. Sequence within the PR matters because E.7/E.8/E.15 are linked.

**Files:**
- Create: `frontend/src/components/PBLineChart.tsx` (extracted from SolveHub + PBProgression)
- Create: `frontend/src/components/stats/StatsGrid.tsx`
- Create: `frontend/src/components/stats/MiniLineChart.tsx`
- Create: `frontend/src/components/TimeTooltip.tsx` (replaces CustomTooltip + PBTooltip)
- Modify: `frontend/src/components/SolveHub.tsx`
- Modify: `frontend/src/components/stats/PBProgression.tsx`
- Modify: `frontend/src/hooks/useSolveStore.ts` (E.16)
- Modify: `frontend/src/components/SolveDetailModal.tsx` (E.21 — rename `window` → `solveWindow`)
- Modify all SolveDetailModal callers (whoever passes the `window=` prop)
- Modify: `frontend/src/components/Header.tsx:62-70` (E.24 — drop reload, rely on AuthContext)

**Steps:**

### E.8 first (TimeTooltip — simplest)

- [ ] **Step 1: Build `TimeTooltip`**
  ```typescript
  // frontend/src/components/TimeTooltip.tsx
  import { formatTime } from '../utils/formatTime';

  interface Props {
    active?: boolean;
    payload?: Array<{ value: number; payload?: { date?: string } }>;
    prefix: string;
    showDate?: boolean;
  }
  export const TimeTooltip = ({ active, payload, prefix, showDate = false }: Props) => {
    if (!active || !payload?.length || typeof payload[0].value !== 'number') return null;
    return (
      <div className="custom-tooltip">
        <p>{`${prefix}: ${formatTime(payload[0].value)}`}</p>
        {showDate && <p className="tooltip-date">{payload[0].payload?.date}</p>}
      </div>
    );
  };
  ```

- [ ] **Step 2: Replace `CustomTooltip` and `PBTooltip` in SolveHub.tsx**
  Replace usages:
  ```tsx
  <Tooltip content={<TimeTooltip prefix="Time" />} />
  <Tooltip content={<TimeTooltip prefix="PB" showDate />} />
  ```
  Delete the local definitions at lines 15-36.

### E.7 (PBLineChart)

- [ ] **Step 3: Extract `PBLineChart` with a `compact` prop**
  ```tsx
  // frontend/src/components/PBLineChart.tsx
  interface Props {
    data: Array<{ time: number; date?: string; label?: string | number }>;
    compact?: boolean;  // SolveHub uses compact (height 150, "solve" key, no Y formatter)
  }
  ```
  Cover both shapes: SolveHub feeds `{solve, time}` per-row; PBProgression feeds `{label, time, date}`. Pick one shape and adapt the SolveHub call site.

- [ ] **Step 4: Use it in both places**
  - `SolveHub.tsx:182-201` → `<PBLineChart data={pbChartData} compact />`
  - `PBProgression.tsx` → `<PBLineChart data={data} />`
  Eyeball test in dev (`npm run dev`); compare both views.

### E.15 (Split SolveHub)

- [ ] **Step 5: Extract `<StatsGrid />`**
  Move SolveHub.tsx lines 119-160 (the `stats-grid` div + 6 stat boxes) into `frontend/src/components/stats/StatsGrid.tsx`. Pass it the computed stats object as a prop. Keep CSS class names stable.

- [ ] **Step 6: Extract `<MiniLineChart />`**
  Move SolveHub.tsx lines 163-180 (recent times line chart) into a small component.

### E.16 (Inline `useSolveStore` passthroughs)

- [ ] **Step 7: Decide between inline vs unified adapter**
  Read `useSolveStore.ts:46-55`. The wrappers do nothing (`api.createSolve(payload)` returns directly). Replace consumers' `store.create(...)` with `api.createSolve(...)` directly OR introduce a single tiny adapter shape that both `apiStore` and `guestStore` implement without per-method wrappers. Recommend: keep the `SolveStore` interface so `useSolveSession` doesn't need to branch on auth-state at every call site, but slim `makeApiStore` to:
  ```typescript
  const makeApiStore = (puzzleType: PuzzleType): SolveStore => ({
    fetchPage: cursor => api.getSolves(puzzleType, cursor ?? null),
    create: api.createSolve,
    update: solve => api.updateSolve(solve.id, solve).then(() => undefined),
    remove: id => api.deleteSolve(id).then(() => undefined),
  });
  ```

### E.21 (Rename `window` prop)

- [ ] **Step 8: Rename `window` → `solveWindow`**
  In `SolveDetailModal.tsx`, change interface, props destructure, and JSDoc/comments. Find and update the caller(s).
  Run: `npx vitest run frontend/src/components/SolveDetailModal.test.tsx` — PASS.

### E.24 (Header.handleLogout reload)

- [ ] **Step 9: Drop the `window.location.reload()`**
  ```typescript
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      // AuthContext SIGNED_OUT handler resets session; UI re-renders naturally.
    } catch (error) {
      toast.error('Could not sign out.');
    }
  };
  ```
  Manually verify in dev: sign in, sign out, confirm timer re-renders without reload.
  If state doesn't flow correctly (orphaned solves stuck on screen), the underlying bug is in `AuthContext` — fix that, don't re-add the reload.

- [ ] **Step 10: Final verification**
  Run all suites. Smoke-test in browser: open SolveHub view, sign out, confirm UI behavior.

- [ ] **Step 11: Commit (or split into 6 commits)**
  Single: `git commit -m "refactor(audit-E7-E8-E15-E16-E21-E24): SolveHub split, shared chart/tooltip, store cleanup"`

---

## PR 7: Stats filter hook (E.14)

**Files:**
- Create: `frontend/src/hooks/useStatsFilters.ts`
- Modify: `frontend/src/pages/Stats.tsx:36-57`

**Steps:**
- [ ] **Step 1: Write tests**
  `frontend/src/hooks/useStatsFilters.test.tsx`:
  - Default preset is 'all'
  - Switching to 'custom' uses `customStart`/`customEnd`
  - Bounds derive correctly for known presets (week, month)
  - `filteredSolves` recomputes only when `solves` or bounds change

- [ ] **Step 2: Extract**
  ```typescript
  export function useStatsFilters(solves: Solve[]) {
    const [preset, setPreset] = useState<DateRangePreset>('all');
    const [customStart, setCustomStart] = useState<string | null>(null);
    const [customEnd, setCustomEnd] = useState<string | null>(null);
    const bounds = useMemo(() => { /* same as Stats.tsx:45-53 */ }, [preset, customStart, customEnd]);
    const filteredSolves = useMemo(() => filterSolvesByRange(solves, bounds), [solves, bounds]);
    return { preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd, bounds, filteredSolves };
  }
  ```

- [ ] **Step 3: Update `Stats.tsx`**
  Replace lines 36-57 with `const { preset, setPreset, ..., filteredSolves } = useStatsFilters(solves);`. The page becomes a layout shell.

- [ ] **Step 4: Run + commit**
  `git commit -m "refactor(audit-E14): extract useStatsFilters from Stats page"`

---

## PR 8: Auth mode-config + finish A.1 (E.13)

**Files:**
- Modify: `frontend/src/components/Auth.tsx`
- Modify: `frontend/src/App.tsx` (mount Auth at `/login`)
- Modify: any caller that previously rendered `<Auth onBack={...} />` inline

**Steps:**
- [ ] **Step 1: Replace `alert()` with `toast` (finishes A.1)**
  Auth.tsx lines 32 and 43: change `alert(...)` to `toast.success(...)`. Run existing Auth tests; expect PASS.

- [ ] **Step 2: Build the `MODE_CONFIG` table**
  ```typescript
  type AuthMode = 'login' | 'signup' | 'reset' | 'update';
  interface ModeSpec {
    title: string;
    cta: string;
    submit: (state: { email: string; password: string }) => Promise<{ message?: string; nextMode?: AuthMode }>;
    showEmail: boolean;
    showPassword: boolean;
    passwordPlaceholder?: string;
  }
  const MODE_CONFIG: Record<AuthMode, ModeSpec> = { /* ... */ };
  ```
  Each `submit` calls the matching Supabase function and returns the success message + optional next mode (e.g. reset → login, update → login).

- [ ] **Step 3: Refactor render**
  Form, button label, title, and link buttons all read from `MODE_CONFIG[mode]`. The cascade of ternaries at lines 62-65, 95-99 disappears.

- [ ] **Step 4: Mount at `/login` route**
  In `App.tsx`, add `<Route path="/login" element={<Auth />} />`. Auth gains `useNavigate()` so it can navigate to `/` after sign-in instead of relying on parent onBack callbacks.
  Adjust any caller (probably `Header.tsx`) that opened Auth as a modal — replace with `navigate('/login')`.

- [ ] **Step 5: Add Auth-mode tests**
  `frontend/src/components/Auth.test.tsx` (if it doesn't exist):
  - Each mode renders correct title, button label, fields
  - Successful signup shows toast (mock supabase.auth.signUp)
  - Successful reset shows toast and switches to login mode
  - Successful update shows toast
  - Error in any mode shows error toast

- [ ] **Step 6: Manual smoke test**
  Run dev server, sign up with a real test email, request password reset, update password from a recovery link.

- [ ] **Step 7: Commit**
  `git commit -m "refactor(audit-E13+A1): MODE_CONFIG table, alert->toast, mount Auth at /login"`

---

## PR 9: Backend route-error helper (E.12)

**Files:**
- Modify: `backend/app/routes/solves.py`

**Steps:**
- [ ] **Step 1: Define the helper**
  At module top:
  ```python
  def _internal_error(label: str):
      """Log + 500 response shaped consistently across routes."""
      current_app.logger.exception(f"{label} failed")
      return jsonify({"error": "Internal server error"}), 500
  ```

- [ ] **Step 2: Replace each call site**
  Lines that fit the pattern `current_app.logger.exception(...) ; return jsonify({"error":"Internal server error"}), 500`:
  - Line 130 (get_solves) → `return _internal_error("get_solves")`
  - Line 186 (create_solve) → `return _internal_error("create_solve")`
  - Line 233 (update_solve) → `return _internal_error("update_solve")`
  - Line 268 (delete_solve) → `return _internal_error("delete_solve")`
  - Line 327 (create_solves_batch) → `return _internal_error("create_solves_batch")`
  - Line 443 (get_share_token) → `return _internal_error("get_share_token")`
  - Line 465 (get_shared_solve) → `return _internal_error("get_shared_solve")`
  - Line 488 (get_personal_bests) → `return _internal_error("get_personal_bests")`
  Do **not** touch the inner non-fatal catches at lines 207, 265, 323 (PB materialization/cleanup) — those don't return 500.
  Do **not** touch line 52 (`require_auth` Supabase fallback) — that returns 503 with a different message.

- [ ] **Step 3: Run backend tests**
  `cd backend && pytest -q` — PASS.

- [ ] **Step 4: Commit**
  `git commit -m "refactor(audit-E12): _internal_error helper for shared route catch"`

---

## PR 10: `useSolveSession` split (E.9) — LARGE

**Files:**
- Create: `frontend/src/hooks/useSortedSolveStats.ts`
- Create: `frontend/src/hooks/useReplayState.ts`
- Modify: `frontend/src/hooks/useSolveSession.ts` (308 lines → ~120)
- Create/extend tests for each new hook

**Strategy:**
The current 308-line file does five things: CRUD orchestration, sorted-times maintenance, median tracking, percentile calculation, and one-shot router-replay handling. Split off the two cohesive units, leave CRUD orchestration in place.

**Median rebuild duplication** (3 sites): lines 115-117 (initial fetch), 158-162 (loadMore), 243-245 (delete) all do `medianTracker.reset(); for (s of valid) medianTracker.push(...)`. The new `useSortedSolveStats` hook owns this logic; callers invoke `applySolveAdded(s)`, `applySolveRemoved(s)`, `rebuildFrom(allSolves)`.

**Steps:**
- [ ] **Step 1: Write tests for `useSortedSolveStats`**
  `frontend/src/hooks/useSortedSolveStats.test.tsx`:
  - Initial state has empty sorted-times, null median, null percentile
  - `rebuildFrom([s1, s2, s3])` populates sorted-times and median
  - `applySolveAdded(s4)` updates sorted-times incrementally (no full rebuild)
  - `applySolveRemoved(s2)` removes from sorted-times
  - DNF solves are excluded
  - `lastPercentile` recomputes when the latest solve enters/exits a band
  Run: expect FAIL.

- [ ] **Step 2: Implement `useSortedSolveStats`**
  ```typescript
  // frontend/src/hooks/useSortedSolveStats.ts
  import { useRef, useState, useCallback } from 'react';
  import { useMedianTracker } from './useMedianTracker';
  import { effectiveTime } from '../utils/solveTime';
  import type { Solve } from '../types';

  export function useSortedSolveStats() {
    const sortedTimesRef = useRef<number[]>([]);
    const medianTracker = useMedianTracker();
    const [currentMedian, setCurrentMedian] = useState<number | null>(null);
    const [lastPercentile, setLastPercentile] = useState<number | null>(null);

    const rebuildFrom = useCallback((solves: Solve[]) => { /* ... */ }, []);
    const applySolveAdded = useCallback((s: Solve) => { /* binary insert + median push + percentile recompute */ }, []);
    const applySolveRemoved = useCallback((s: Solve) => { /* binary remove + median rebuild (small N) + percentile */ }, []);

    return { sortedTimesRef, currentMedian, lastPercentile, rebuildFrom, applySolveAdded, applySolveRemoved };
  }
  ```
  Run tests: PASS.

- [ ] **Step 3: Write tests for `useReplayState`**
  `frontend/src/hooks/useReplayState.test.tsx`:
  - Returns initial replay state from router location once
  - Subsequent calls return null after router state cleared
  - Cleanup runs when location.state present (one-shot navigate replace)

- [ ] **Step 4: Implement `useReplayState`**
  ```typescript
  // frontend/src/hooks/useReplayState.ts
  export interface ReplayState {
    scramble?: string;
    puzzle?: PuzzleType;
  }
  export function useReplayState(): ReplayState {
    const location = useLocation();
    const navigate = useNavigate();
    const [initial] = useState<ReplayState>(() => {
      const s = location.state as { replayScramble?: string; replayPuzzle?: PuzzleType } | null;
      return { scramble: s?.replayScramble, puzzle: s?.replayPuzzle };
    });
    useEffect(() => {
      if (location.state) navigate(location.pathname, { replace: true, state: null });
    }, [location.state, location.pathname, navigate]);
    return initial;
  }
  ```

- [ ] **Step 5: Refactor `useSolveSession.ts` to consume both**
  - Replace the inline `useState(() => { ... location.state })` and the cleanup `useEffect` with `const replay = useReplayState()`.
  - Replace `sortedTimesRef`, `lastPercentile`, `currentMedian`, `medianTracker` state with `const stats = useSortedSolveStats()`.
  - Replace each median-rebuild block with `stats.rebuildFrom(...)`.
  - Replace `medianTracker.push(t)` with `stats.applySolveAdded(s)` at insert sites.
  - Replace the delete-handler median rebuild with `stats.applySolveRemoved(deletedSolve)`.

- [ ] **Step 6: Fix the latent stale closure**
  Audit notes `loadMore` lists `puzzleType` in deps but doesn't read it (captured via `store`). After the split, ensure `loadMore` deps are explicit and either (a) drop `puzzleType` if `store` already encodes it, or (b) read `puzzleType` directly. Don't ship the silent capture.

- [ ] **Step 7: Verify all existing tests still pass**
  `npx vitest run frontend/src/hooks/useSolveSession.test.tsx` — PASS.

- [ ] **Step 8: Add new tests for the extracted hooks**
  Already written in steps 1, 3.

- [ ] **Step 9: Browser smoke test**
  Run dev. Open the timer, complete a few solves, navigate to Stats and back, "replay" a solve from Stats, delete a solve. Confirm median and percentile update correctly.

- [ ] **Step 10: Commit**
  Suggest 3 commits: extract `useReplayState`, extract `useSortedSolveStats`, refactor `useSolveSession` to consume both.

---

## PR 11: `Timer` / `useTimerMachine` split (E.10) — LARGE

**Files:**
- Create: `frontend/src/hooks/useTimerMachine.ts`
- Modify: `frontend/src/components/Timer.tsx` (377 lines → ~60)
- Possibly create: `frontend/src/utils/inspectionTick.ts` (extract `tickInspection`)
- Extend: `frontend/src/components/Timer.test.tsx`

**Steps:**
- [ ] **Step 1: Identify the public surface**
  Timer's component currently owns 14 refs, 5 phases, 3 timers (RAF, setInterval, setTimeout), and DOM writes. Public surface for the machine:
  ```typescript
  interface TimerMachine {
    phase: Phase;                      // 'idle' | 'ready' | 'inspection' | 'armed' | 'running'
    inspectionCount: number | null;
    inspectionBadge: '+2' | null;
    onPointerDown: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onKeyDown: (e: KeyboardEvent) => void;
    onKeyUp: (e: KeyboardEvent) => void;
    timerNodeRef: RefObject<HTMLDivElement>;  // for direct DOM writes during running phase
  }
  ```

- [ ] **Step 2: Extract `tickInspection`**
  ```typescript
  // frontend/src/utils/inspectionTick.ts
  import { INSPECTION_LIMIT_MS, INSPECTION_PLUS_TWO_MS, INSPECTION_8S_WARNING_AT_MS, INSPECTION_12S_WARNING_AT_MS } from './inspectionConstants';

  export type TickResult =
    | { kind: 'continue'; remaining: number; warning?: 8 | 12; badge?: '+2' }
    | { kind: 'expired' };

  export function tickInspection(elapsedMs: number, lastShownSecond: number): TickResult { /* ... */ }
  ```
  Test it pure-functionally without timers. Easy unit-test target.

- [ ] **Step 3: Write tests for `useTimerMachine`**
  Lift Timer.test.tsx's existing scenarios into `useTimerMachine.test.tsx` using `renderHook`. Cover:
  - idle → holding (pointerdown) → ready (after holdMs) → inspection (pointerup, when inspection enabled) → running (pointerdown again) → stopped (pointerup)
  - Inspection auto-DNF after 17s
  - +2 badge between 15-17s
  - 8s and 12s warnings fire once each

- [ ] **Step 4: Implement `useTimerMachine`**
  Move every ref and every phase transition into the hook. Component becomes a presentational shell:
  ```tsx
  export function Timer(props: TimerProps) {
    const machine = useTimerMachine(props);
    return (
      <div
        ref={machine.timerNodeRef}
        onPointerDown={machine.onPointerDown}
        onPointerUp={machine.onPointerUp}
        className={timerClass(machine.phase, ...)}
      >
        {machine.phase === 'inspection' ? machine.inspectionCount : '0.00'}
        {machine.inspectionBadge}
      </div>
    );
  }
  ```

- [ ] **Step 5: Verify Timer tests pass**
  `npx vitest run frontend/src/components/Timer.test.tsx` — PASS. (This is the highest-risk part; do not skip this verification.)

- [ ] **Step 6: Manual smoke test**
  Run dev. Time several solves with and without inspection. Verify hold-to-ready feedback, inspection countdown, +2 and DNF flag, post-solve display.

- [ ] **Step 7: Commit**
  Three commits: extract `tickInspection`, extract `useTimerMachine`, slim Timer.tsx to presentational shell.

---

## PR 12: Backend service + repository layers (E.11) — LARGE

**Files:**
- Create: `backend/app/repositories/__init__.py`
- Create: `backend/app/repositories/solves_repo.py`
- Create: `backend/app/repositories/personal_bests_repo.py`
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/solves_service.py`
- Create: `backend/app/services/share_links_service.py`
- Modify: `backend/app/routes/solves.py` (489 lines → ~200, HTTP adapter only)
- Extend: `backend/tests/test_solves.py` and add `backend/tests/test_solves_service.py`

**Strategy:**
Layered architecture. Routes parse HTTP, validate input, call services. Services encode business rules (cap check, PB materialization, share-token signing). Repositories own all Supabase access — the only place `g.supabase` (and the service-role client) is touched.

**Risk:** This is the most invasive refactor in Cluster E. Land it last so other PRs ship on the existing route shape. Run the full backend test suite after **every** step; do not let regressions accumulate.

**Steps:**
- [ ] **Step 1: Sketch the boundaries**
  Inventory `routes/solves.py`:
  - `_decode_solve_cursor`, `_encode_solve_cursor`, `_parse_positive_int` — pure helpers, stay in routes (HTTP-shape concerns).
  - `_maybe_record_pb`, `_sign_solve_id`, `_verify_token` (share-link), `SOLVE_LIFETIME_CAP` — move to services.
  - All `.table('solves').select(...)`, `.insert(...)`, `.update(...)`, `.delete(...)`, `.rpc(...)` — move to repositories.

- [ ] **Step 2: Build `SolvesRepository`**
  ```python
  class SolvesRepository:
      def __init__(self, supabase): self.sb = supabase
      def list_for_user(self, user_id, *, puzzle_type=None, limit, cursor=None) -> list[dict]: ...
      def get_by_id(self, solve_id, user_id) -> Optional[dict]: ...
      def insert(self, solve: dict) -> dict: ...
      def update(self, solve_id, user_id, patch: dict) -> dict: ...
      def soft_delete(self, solve_id, user_id) -> None: ...
      def insert_many(self, solves: list[dict]) -> list[dict]: ...
      def user_solve_count(self, user_id) -> int: ...
  ```
  Implement each method by lifting the corresponding Supabase chain from `routes/solves.py`. Write a test per method using the existing FakeSupabase from `conftest.py`.

- [ ] **Step 3: Build `PersonalBestsRepository`**
  ```python
  class PersonalBestsRepository:
      def __init__(self, supabase): self.sb = supabase
      def record_if_better(self, user_id, puzzle_type, solve_id, time, achieved_at) -> None: ...
      def list_for_user(self, user_id) -> list[dict]: ...
      def cleanup_for_solve(self, solve_id, user_id) -> None: ...
  ```
  `record_if_better` calls the `record_pb_if_better` RPC (D.8 work).

- [ ] **Step 4: Build `SolvesService`**
  Encapsulates business rules:
  ```python
  class SolvesService:
      def __init__(self, solves_repo, pb_repo): ...
      def create(self, user_id, payload) -> dict:
          if self.solves_repo.user_solve_count(user_id) >= SOLVE_LIFETIME_CAP:
              raise SolveLimitReached()
          solve = self.solves_repo.insert({...})
          if not solve.get('dnf'):
              self.pb_repo.record_if_better(...)
          return solve
      def update(self, user_id, solve_id, patch) -> dict: ...
      def delete(self, user_id, solve_id) -> None: ...
      def create_batch(self, user_id, payloads) -> list[dict]: ...
  ```
  Custom exceptions (`SolveLimitReached`, `SolveNotFound`) bubble up; routes translate to HTTP codes.

- [ ] **Step 5: Build `ShareLinksService`**
  Owns `_sign_solve_id`, `_verify_share_token`, share-secret loading. Routes call `service.create_share_token(solve_id)` and `service.resolve(token) -> Optional[Solve]`.

- [ ] **Step 6: Slim `routes/solves.py`**
  Each route becomes:
  ```python
  @solves.route('/solves', methods=['POST'])
  @require_auth
  @limiter.limit("30 per minute")
  def create_solve():
      data = request.get_json(silent=True) or {}
      errors = validate_create_solve(data)
      if errors: return jsonify({"errors": errors}), 400
      try:
          solve = solves_service(g.supabase).create(g.user_id, data)
      except SolveLimitReached:
          return jsonify({"error": f"Lifetime solve limit of {SOLVE_LIFETIME_CAP} reached"}), 429
      except Exception:
          return _internal_error("create_solve")
      return jsonify({"solve": solve}), 201
  ```
  Note: `solves_service(supabase)` is a per-request factory. To avoid construction overhead, cache on `g` (`g.solves_service`).

- [ ] **Step 7: Run backend tests after each route migration**
  Migrate one route at a time. After each: `cd backend && pytest -q`. If anything fails, revert that single migration and dig.

- [ ] **Step 8: Add service-level unit tests**
  `backend/tests/test_solves_service.py` — fake repos via simple stub classes; assert business rules without HTTP.

- [ ] **Step 9: Final integration check**
  Run the full backend suite + manual: hit the local API with the test harness or curl, confirm all 8 endpoints behave identically.

- [ ] **Step 10: Commit**
  Multiple commits — one per repository, one per service, one per migrated route. Bisectability matters here.

---

## Verification (end-to-end)

After all 12 PRs are merged:

```bash
# 1. Type-check + tests
cd /Users/sia/Desktop/Coding\ Projects.nosync/ao5
(cd backend && pytest -q)
(cd frontend && npx vitest run --reporter=dot && npx tsc --noEmit)

# 2. Browser smoke test (manual)
cd frontend && npm run dev
#   - Sign up via /login route
#   - Solve a 3x3 with inspection enabled
#   - Solve a Megaminx (covers A.4 if it landed)
#   - Apply +2 then DNF then delete; verify median + PB update
#   - Open Stats; switch date-range presets; assert filtered counts
#   - Sign out; verify UI re-renders without reload

# 3. Bundle inspection
cd frontend && npm run build
#   Confirm Timer route bundle did not grow; Stats/Trainers/SharedSolve can be split out (deferred to C.12).

# 4. Backend smoke
cd backend && python -m flask run
#   curl localhost:5000/api/solves with a valid token → 200
#   curl localhost:5000/api/solves/batch with 500 solves → 201
#   POST /api/solves over the lifetime cap → 429
```

Run the full audit checklist (`docs/audits/2026-04-25-full-stack-audit.md`) after each PR's commit so completed items get checked off. Status tracker uses the `E.N` IDs verbatim.

---

## Risks & Notes

- **PR 6 (Component cleanup)** is the most "spread out" PR — it touches 6 unrelated areas. Consider splitting into 2-3 commits at minimum so a regression in one area doesn't force reverting the whole PR.
- **PR 10 / PR 11 / PR 12** are the largest. Each carries real regression risk for hot code paths. Do not bundle two L items into one PR.
- **PR 12 (backend layers)** is architectural; the audit notes A.7 (share links), D.4 (user_stats counter), D.8 (atomic PB) all live in `routes/solves.py` today. Migrating them through services will surface the implicit transaction boundaries; add explicit notes in `solves_service.py` about which methods are atomic vs. best-effort.
- **The audit's E.1 list overstated dead code** — explore confirmed only 3 items are truly unreferenced; the other 8 are reachable via tests or interfaces. Per user decision, the aggressive cleanup deletes both production code and corresponding test scaffolding.
- **E.23 is already done.** Do not waste a PR on it.
- **A.1 finishing happens inside PR 8** (E.13 mode-config refactor).
- The audit recommends PR boundaries that align with `audit/EN-short-name` branch naming. Use it.
