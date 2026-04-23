# Decipher Audit Followup (Round 2)

Everything flagged in the round-2 audit, organized into phases for Claude Code. Each phase is self-contained so you can `/clear` between them. Each task has a fixed location, a concrete fix direction, and acceptance criteria.

Tags used:
- `[BUG]` visible incorrect behavior
- `[SECURITY]` hardening, not necessarily exploitable
- `[REFACTOR]` code health, no behavior change
- `[CLEANUP]` dead code, cruft, file organization
- `[IDEA]` new feature worth doing

Tasks are ordered inside each phase. Don't skip ahead within a phase without a reason. Phases themselves are ordered by priority.

---

## Phase 1: Critical correctness + security hygiene

Smallest-touch, highest-value batch. Nothing here should take more than a few minutes each, but skipping them lets real bugs live.

### 1.1 [BUG] Fix visible `\u00b12` literal in solve detail modal

**Location:** `frontend/src/components/SolveDetailModal.tsx` line 119.

**Problem:** The label reads the literal string `\u00b12 ao5 context` in the UI because `\u00b1` inside JSX text is not parsed as an escape. It renders as 22 raw characters.

**Fix:** Replace with `±2 ao5 context` directly, or wrap in braces: `{'\u00b12 ao5 context'}`.

**Acceptance:** Open the modal on any solve. The label reads "±2 ao5 context".

### 1.2 [SECURITY] Verify Supabase RLS is on

**Location:** Supabase dashboard (not code).

**Problem:** The anon key ships with the frontend by design. If Row Level Security is off on `solves` or `personal_bests`, any visitor can read/write every user's data using the anon key directly.

**Fix:** In Supabase dashboard → Authentication → Policies, confirm:
- `solves`: RLS enabled. Policies for select/insert/update/delete all use `auth.uid() = user_id`.
- `personal_bests`: same.

If RLS is off, enable it and add the policies before touching anything else in this phase.

**Acceptance:** Both tables show "RLS enabled" in the dashboard, and the policies use `auth.uid()` for every operation.

### 1.3 [BUG] Data loss during guest-to-auth migration

**Location:** `frontend/src/services/api.ts` lines 63-72 and `frontend/src/contexts/AuthContext.tsx` lines 23-35.

**Problem:** `migrateSolves` runs creates sequentially under a 30/min backend rate limit. A guest with 40+ solves hits 429 on the 31st call. The error is logged to console and swallowed. AuthContext then calls `clearAllGuestSolves()` unconditionally, deleting the unsaved tail.

**Fix:**
1. Have `migrateSolves` return `{ migrated: Solve[]; failed: Solve[] }` instead of `void`.
2. In `AuthContext`, only remove successfully migrated solves from localStorage (by id), not all of them.
3. If `failed.length > 0`, surface a user-visible error via `window.alert` for now (Phase 6 introduces a toast system; swap to that later).

```ts
// services/api.ts
migrateSolves: async (allGuestSolves: Solve[]): Promise<{ migrated: Solve[]; failed: Solve[] }> => {
  const migrated: Solve[] = [];
  const failed: Solve[] = [];
  for (const solve of allGuestSolves) {
    const { id: _localId, user_id: _uid, created_at: _createdAt, ...payload } = solve;
    try {
      await api.createSolve(payload);
      migrated.push(solve);
    } catch (err) {
      failed.push(solve);
      console.error('Failed to migrate guest solve:', solve.id, err);
    }
  }
  return { migrated, failed };
},
```

4. In `guestStorage.ts`, add `removeGuestSolves(solves: Solve[])` that removes by id (grouped by puzzle_type). `clearAllGuestSolves` becomes the "everything worked" path only.

**Acceptance:** With a guest having 35 fake solves and the backend rate limiter fixed at 30/min (do not lower for the test), sign-in results in 30 solves server-side and 5 still in localStorage with an error shown to the user.

### 1.4 [SECURITY] Add `ProxyFix` to the Flask app

**Location:** `backend/app/__init__.py`.

**Problem:** `flask-limiter` uses `get_remote_address` which reads the socket's peer IP unless told otherwise. Behind any managed host (Render, Fly, Railway, Vercel), that's always the proxy's IP. Rate limits become global instead of per-user.

**Fix:**
```python
from werkzeug.middleware.proxy_fix import ProxyFix

def create_app(config_class=Config):
    app = Flask(__name__)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
    # ...existing code
```

**Acceptance:** Deploy, make requests from two different IPs, check logs or a debug endpoint that prints `request.remote_addr`. Each shows its real IP, not the proxy's.

### 1.5 [SECURITY] Cap request body size

**Location:** `backend/app/__init__.py`.

**Problem:** No `MAX_CONTENT_LENGTH`. An attacker can POST arbitrarily large bodies.

**Fix:** Add to `create_app`:
```python
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024  # 16KB
```

A real solve payload is well under 1KB (scramble maxes at 500 chars). 16KB is generous.

**Acceptance:** `curl -X POST .../api/solves -H "Content-Type: application/json" -d "$(python -c 'print("x"*20000)')"` returns 413 Payload Too Large.

### 1.6 [SECURITY] Guard against accidental `FLASK_DEBUG=true` in prod

**Location:** `backend/run.py`.

**Problem:** If `FLASK_DEBUG=true` ever leaks into production env, the Werkzeug debugger allows arbitrary remote code execution.

**Fix:**
```python
import os
from app import create_app

app = create_app()

if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    env = os.environ.get('FLASK_ENV', 'development').lower()
    if debug and env == 'production':
        raise RuntimeError("Refusing to start with debug=True in production")
    app.run(debug=debug, port=5000)
```

**Acceptance:** Starting with `FLASK_ENV=production FLASK_DEBUG=true python run.py` exits with the runtime error. Without `FLASK_DEBUG=true` it starts normally.

### 1.7 [BUG] StrictMode double-fires guest migration

**Location:** `frontend/src/contexts/AuthContext.tsx` lines 21-35.

**Problem:** React StrictMode intentionally double-invokes effects in dev. If `onAuthStateChange` fires `SIGNED_IN` twice before `migrateSolves` completes, both runs see the same unmigrated solves and try to import them twice.

**Fix:** Add a ref guard:
```ts
const migratingRef = useRef(false);

useEffect(() => {
  supabase.auth.getSession().then(({ data }) => setSession(data.session));
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, next) => {
    if (event === 'SIGNED_IN' && !migratingRef.current) {
      migratingRef.current = true;
      try {
        const guestSolves = getAllGuestSolves();
        if (guestSolves.length > 0) {
          const { migrated, failed } = await api.migrateSolves(guestSolves);
          removeGuestSolves(migrated);
          if (failed.length > 0) {
            window.alert(`${failed.length} solve(s) could not be synced and remain in local storage.`);
          }
        }
      } finally {
        migratingRef.current = false;
      }
    }
    setSession(next);
    setSignInVisible(false);
  });
  return () => subscription.unsubscribe();
}, []);
```

Note the combined fix with task 1.3: `migrateSolves` now returns a result object and `removeGuestSolves` (new helper) replaces `clearAllGuestSolves`.

**Acceptance:** In dev with StrictMode, signing in with 3 guest solves produces exactly 3 server-side rows, not 6.

### 1.8 [BUG] Scramble advances after awaited API create

**Location:** `frontend/src/components/SolveSession.tsx` lines 188-207.

**Problem:** `handleSolveComplete` awaits `store.create(...)` before calling `advanceScramble()`. The prefetch queue's point is to make the next scramble appear instantly, but this serializes it behind a network write.

**Fix:** Advance the scramble optimistically. Move `advanceScramble()` to right after the percentile/median updates, before the try/catch around the create call, or in parallel with it:

```ts
const handleSolveComplete = useCallback(async (time: number, flags: { plusTwo: boolean; dnf: boolean }) => {
  const { plusTwo, dnf } = flags;
  const effectiveTime = plusTwo ? time + 2 : time;
  const prev = sortedTimesRef.current;
  const pos = bisectLeft(prev, effectiveTime);

  const payload = { puzzle_type: puzzleType, time, dnf, plus_two: plusTwo, scramble: currentScramble ?? '' };

  // Advance scramble first so the UI updates immediately.
  advanceScramble();

  try {
    const savedSolve = await store.create(puzzleType, payload);
    if (!savedSolve) return;
    setSolves(prevSolves => [savedSolve, ...prevSolves]);
    if (!dnf) {
      if (prev.length > 0) {
        setLastPercentile(Math.round(((prev.length - pos) / prev.length) * 100));
      }
      sortedTimesRef.current = [...prev.slice(0, pos), effectiveTime, ...prev.slice(pos)];
      medianTracker.push(effectiveTime);
      setCurrentMedian(medianTracker.getMedian());
    }
  } catch (err) {
    console.error('Error creating solve:', err);
    if (err instanceof Error && err.name === 'GuestStorageQuotaError') {
      window.alert('Local storage is full, your recent solve was not saved. Sign in to keep your history.');
    }
  }
}, [puzzleType, currentScramble, advanceScramble, store]);
```

**Acceptance:** Throttle the network to Slow 3G in devtools. Finish a solve. The new scramble appears in under 100ms instead of waiting for the write.

---

## Phase 2: Backend correctness and tests

### 2.1 [BUG] PB rows orphan on soft-delete

**Location:** `backend/app/routes/solves.py` `get_personal_bests` and `delete_solve`.

**Problem:** Soft-deleting a solve leaves its `personal_bests` row untouched. The stats page shows a PB with no backing solve.

**Fix:** Two options, pick one:

**Option A (recommended, simpler):** On delete, remove the matching PB row. The materialization will re-add it if a later insert beats the current top solve's time naturally.
```python
# in delete_solve, after the UPDATE:
(request.supabase.table('personal_bests')
 .delete()
 .eq('user_id', request.user_id)
 .eq('solve_id', solve_id)
 .execute())
```

This is close to correct, but if the deleted solve was the current PB, the _next_ fastest solve doesn't automatically get promoted. For a personal tool this is fine: the next time the user beats their remaining fastest, the PB chain resumes. Document this behavior.

**Option B (proper):** After delete, recompute the PB chain for that puzzle_type by scanning remaining non-deleted solves. More correct, more code, does a full scan. Not worth it for a pet app.

Go with Option A. Add a test: `test_delete_solve_removes_matching_pb`.

**Acceptance:** Record a PB, soft-delete its solve, fetch `/api/personal-bests`, the PB is gone.

### 2.2 [BUG] Backend validator allows trivially small times

**Location:** `backend/app/validators.py` lines 23-25.

**Problem:** `time > 0` accepts `0.001`. Not exploitable, just nonsensical data.

**Fix:** Raise the floor:
```python
elif time < 0.1 or time > 3600:
    errors['time'] = "Must be between 0.1 and 3600 seconds"
```

**Acceptance:** `POST /api/solves` with `time: 0.05` returns 422.

### 2.3 [REFACTOR] Add missing backend tests

**Location:** `backend/tests/test_solves.py`.

**Problem:** `test_delete_solve_404_when_missing` exists but no PATCH equivalent, and no test for PB orphan cleanup (from 2.1).

**Fix:** Add:
- `test_patch_solve_404_when_missing` (symmetric with delete)
- `test_patch_solve_422_on_invalid_type`
- `test_delete_solve_removes_matching_pb` (covers 2.1)
- `test_create_solve_rejects_tiny_time` (covers 2.2)

**Acceptance:** `pytest` passes with the new tests, coverage of update_solve and PB cleanup verified.

### 2.4 [SECURITY] Preemptive CSV injection guard

**Location:** `frontend/src/utils/exportCsv.ts`.

**Problem:** Scramble strings are not user-typed today, but a future public-sharing feature could expose this path. A scramble cell that starts with `=`, `+`, `-`, `@`, `\t`, or `\r` triggers formula evaluation in Excel/Sheets on open.

**Fix:** Defang dangerous cell prefixes in the `quote` helper:
```ts
const DANGEROUS_PREFIXES = /^[=+\-@\t\r]/;
const quote = (v: string): string => {
  const safe = DANGEROUS_PREFIXES.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
};
```

Add a test in `exportCsv.test.ts` covering each prefix.

**Acceptance:** Given a solve whose scramble is `=HYPERLINK(...)`, the CSV cell reads `"'=HYPERLINK(...)"` not `"=HYPERLINK(...)"`.

---

## Phase 3: Timer polish and tests

The Timer is the most complex piece of logic in the app with zero test coverage. Lock it down.

### 3.1 [BUG] Rounding inconsistency at solve end

**Location:** `frontend/src/components/Timer.tsx` lines 143-168.

**Problem:** The running timer's `tick` rounds to 10ms (`Math.floor(elapsed / 10) * 10`). `finishSolve` reads an unrounded `performance.now() - timerStartRef.current` and both displays and submits it. The user sees `9.1347` for one frame; the solve saved to DB has sub-10ms precision that conflicts with the rest of the UI's convention.

**Fix:** Round at the source:
```ts
const finishSolve = useCallback(() => {
  if (timerRafRef.current !== null) {
    cancelAnimationFrame(timerRafRef.current);
    timerRafRef.current = null;
  }
  const finalMs = performance.now() - timerStartRef.current;
  const rounded = Math.floor(finalMs / 10) * 10;
  timeRef.current = rounded;
  setTime(rounded);
  phaseRef.current = 'idle';
  setPhase('idle');
  onSolveComplete(rounded / 1000, penaltyFlagsRef.current);
  penaltyFlagsRef.current = { plusTwo: false, dnf: false };
}, [onSolveComplete]);
```

**Acceptance:** Every saved solve's time is a multiple of 0.01 seconds. No `9.1347` in the database.

### 3.2 [BUG] Timer badge computes `Date.now()` inside render

**Location:** `frontend/src/components/Timer.tsx` lines 296-304.

**Problem:** The IIFE re-reads `Date.now()` on every render. The only thing that causes the re-render is the 100ms interval. It's not broken, but it's a React code smell (render should be pure).

**Fix:** Derive `badgeState` in the same interval tick that updates `inspectionCount`, store it in state, read it in render.

```ts
const [inspectionBadge, setInspectionBadge] = useState<'+2' | 'DNF' | null>(null);

// inside the interval tick in startInspection:
if (elapsed > 17000) setInspectionBadge('DNF');
else if (elapsed > 15000) setInspectionBadge('+2');
else setInspectionBadge(null);

// reset to null in startInspection and cancelToIdle
```

Then in render:
```tsx
{inspectionBadge && <span className="timer-badge">{inspectionBadge}</span>}
```

**Acceptance:** No `Date.now()` calls happen during Timer render. Behavior unchanged.

### 3.3 [BUG] Escape does not cancel the `running` phase

**Location:** `frontend/src/components/Timer.tsx` line 236.

**Problem:** If a user starts a solve and wants to bail, there's no escape hatch. They have to let the timer run and then delete the solve.

**Fix:** Add `running` to the escape-handling phase set. On escape from `running`, call `cancelToIdle()` without calling `onSolveComplete`.

```ts
if (p === 'ready' || p === 'inspection' || p === 'armed' || p === 'running') {
  event.preventDefault();
  cancelToIdle();
}
```

Design question: real stackmat doesn't have this either, so this is a UX call. I think it's the right one. If you disagree, skip this task.

**Acceptance:** Mid-solve, pressing Escape returns to idle with no saved solve.

### 3.4 [BUG] 17-second inspection does not auto-finalize

**Location:** `frontend/src/components/Timer.tsx` `startInspection` interval body.

**Problem:** Per WCA, 17s+ inspection is an automatic DNF. Your code only detects this at the inspection-to-running transition. If the user sits in inspection past 17s and never presses space, nothing happens.

**Fix:** When `elapsed > 17000`, auto-advance to a finalized DNF solve:

```ts
if (elapsed > 17000) {
  clearInterval(inspectionIntervalRef.current!);
  inspectionIntervalRef.current = null;
  penaltyFlagsRef.current = { plusTwo: false, dnf: true };
  phaseRef.current = 'idle';
  setPhase('idle');
  setInspectionBadge(null);
  onSolveComplete(0, { plusTwo: false, dnf: true });
  return;
}
```

Design note: `time: 0` for an auto-DNF might feel weird. Alternative is to not save anything and just reset. Sia's call. My vote is to save with `time: 0, dnf: true, plus_two: false` so the user sees the DNF in their log and knows what happened.

**Acceptance:** Sit in inspection for 18 seconds, the timer auto-resets and a DNF entry appears in the log.

### 3.5 [REFACTOR] Add Timer tests

**Location:** `frontend/src/components/Timer.test.tsx` (new file).

**Problem:** The most complex state machine in the app has no tests. Refactors are unsafe.

**Fix:** Mock `performance.now` and `Date.now`, fire synthetic keyboard events, assert phase transitions. Cover at minimum:

- idle → ready on keydown
- ready → idle on keyup before hold delay
- ready → inspection on keyup after hold delay
- ready → idle on escape
- inspection → armed on keydown
- armed → running on keyup after hold delay (solve recorded)
- inspection elapsed > 15000 but < 17000 sets `plusTwo: true`
- inspection elapsed > 17000 sets `dnf: true`
- running → idle on keydown with solve recorded
- Escape from running cancels without recording (task 3.3)
- Auto-DNF at 17s (task 3.4)
- `inspectionEnabled: false` skips inspection: idle → ready → running

Use `@testing-library/react` and `vitest` fake timers. This is the test file with the most value in the whole suite.

**Acceptance:** 12+ passing tests covering the full transition table.

### 3.6 [CLEANUP] Sound constants

**Location:** `frontend/src/components/Timer.tsx` lines 111, 118 and `frontend/src/utils/sound.ts`.

**Problem:** `beep(440, 100)` and `beep(660, 150)` are magic numbers in Timer with no comment.

**Fix:** Either move the constants to `sound.ts` as named exports, or add a block comment above the first one in Timer documenting what each tone means (the 8s warning, the 12s warning). Minor hygiene.

**Acceptance:** A new reader can tell which beep is which without running the code.

---

## Phase 4: Architecture and refactors

Pure code-health pass. No behavior change. The goal is to make the codebase easier to extend in future phases without regressing.

### 4.1 [REFACTOR] Consolidate ao5/trimmed-mean implementations

**Location:** Create `frontend/src/utils/averages.ts`.

**Problem:** The trimmed-mean average of N is computed in five places with subtly different behavior:
- `SolveLog.tsx` `calculateAverage` (DNF threshold: `> size/2`)
- `SolveHub.tsx` inline `ao5` (no DNF handling at all)
- `SolveDetailModal.tsx` `computeAo5` (DNF threshold: `> 1`)
- `DotPlot.tsx` `ao5Line` (no DNF handling)
- `statsBuckets.ts` `trimmedMean` (no DNF handling)

Five copies, four different DNF behaviors. Divergence risk is real.

**Fix:** Create `frontend/src/utils/averages.ts`:

```ts
import type { Solve } from '../types';

export type AverageResult = number | 'DNF' | null;

const effective = (s: Solve): number =>
  s.dnf ? Number.POSITIVE_INFINITY : s.plus_two ? s.time + 2 : s.time;

/**
 * WCA-style trimmed mean: drop the best and worst, average the rest.
 *
 * Returns:
 *   - null if fewer than `size` solves in the window
 *   - 'DNF' if more than one solve is DNF (WCA: 1 DNF counts as worst and is trimmed; 2+ = DNF average)
 *   - number otherwise
 */
export function trimmedMean(solves: Solve[], size: number): AverageResult {
  if (solves.length < size) return null;
  const window = solves.slice(0, size).map(effective);
  const dnfCount = window.filter(t => t === Number.POSITIVE_INFINITY).length;
  if (dnfCount > 1) return 'DNF';
  const sorted = [...window].sort((a, b) => a - b);
  const inner = sorted.slice(1, -1);
  if (inner.some(t => t === Number.POSITIVE_INFINITY)) return 'DNF';
  return inner.reduce((a, b) => a + b, 0) / inner.length;
}

export const ao5 = (solves: Solve[]): AverageResult => trimmedMean(solves, 5);
export const ao12 = (solves: Solve[]): AverageResult => trimmedMean(solves, 12);
```

Replace all five call sites. Expected changes:

- `SolveLog.calculateAverage` becomes `ao5(solves)` / `ao12(solves)` directly.
- `SolveHub.tsx` stats.ao5 uses `ao5(solves)`.
- `SolveDetailModal.computeAo5` becomes `ao5(solveWindow)`.
- `DotPlot.tsx` ao5Line: loop calling `ao5(chronological.slice(i - 4, i + 1))` (but since this consumes raw numbers not Solves, either change the loop to work with Solves or keep a separate number-based `trimmedMeanNumbers` helper).
- `statsBuckets.ts` `trimmedMean` can be deprecated or thinly re-exported.

Add tests for `averages.ts` covering:
- Empty array returns null
- 4 solves returns null for ao5
- 5 non-DNF solves returns trimmed mean
- 5 solves with 1 DNF: trimmed (DNF is the worst, gets dropped)
- 5 solves with 2 DNFs returns 'DNF'
- 5 solves with 4 of 5 DNFs returns 'DNF'
- `+2` is applied to the effective time

**Acceptance:** All ao5/ao12 displays in the app produce identical values before and after the refactor, verified by snapshotting a session log manually. No references to the old implementations remain. New unit tests pass.

### 4.2 [REFACTOR] Extract `useSolveSession` hook

**Location:** `frontend/src/components/SolveSession.tsx` (388 lines) becomes `frontend/src/hooks/useSolveSession.ts` + a thinner `SolveSession.tsx`.

**Problem:** `SolveSession` does six things: data fetch, derived stats, solve CRUD, hotkeys, layout, modal state. It's testable only by rendering the full tree.

**Fix:** Move everything that is not JSX into `useSolveSession`:

```ts
// hooks/useSolveSession.ts
export interface UseSolveSessionResult {
  puzzleType: PuzzleType;
  setPuzzleType: (p: PuzzleType) => void;
  solves: Solve[];
  mostRecent: Solve | null;
  recentSolves: Solve[];
  pbHistory: PersonalBest[];
  lastPercentile: number | null;
  currentMedian: number | null;
  nextCursor: string | null;
  isLoadingMore: boolean;
  currentScramble: string | null;
  scrambleLoading: boolean;
  handleSolveComplete: (time: number, flags: PenaltyFlags) => Promise<void>;
  handleSolveUpdate: (solve: Solve) => Promise<void>;
  handleSolveDelete: (solve: Solve) => Promise<void>;
  handleTypeChange: (e: TypeChangeEvent) => void;
  loadMore: () => Promise<void>;
  clearView: () => void;
}

export default function useSolveSession(): UseSolveSessionResult { /* ... */ }
```

`SolveSession.tsx` becomes ~100 lines of JSX + hotkey wiring + modal state, consuming the hook.

This is a pure reorganization; careful test-first may be needed. Do this AFTER phase 3's Timer tests are in place so there's at least some safety net.

**Acceptance:** `SolveSession.tsx` is under 150 lines. `useSolveSession` has at least one unit test (cover the create happy path).

### 4.3 [REFACTOR] Eliminate `eslint-disable react-hooks/exhaustive-deps`

**Location:** `frontend/src/components/SolveSession.tsx` lines 76, 121, 165, 207 (four sites).

**Problem:** Each disable is a signal that the code and the lint rule disagree. Usually means the dep structure is wrong.

**Fix after 4.2:** Inside `useSolveSession`, restructure so that:
- The memoized `store` is created once per `isGuest` flip (already does this).
- Effects that depend on `store.fetchPage` etc. put `store` in deps. Because `store` is referentially stable between `isGuest` flips, the effects run only when they should.
- The `overrideScramble` replay effect becomes its own small effect, and `useScrambleQueue` is refactored to accept an `initialScramble` parameter so the queue knows about the replay at construction (see 5.3).

Goal: zero `eslint-disable` comments in `SolveSession.tsx` and `useSolveSession.ts`.

**Acceptance:** No `eslint-disable-next-line react-hooks/exhaustive-deps` in the refactored files.

### 4.4 [REFACTOR] Make `useSolveStore` take `puzzleType`

**Location:** `frontend/src/hooks/useSolveStore.ts`.

**Problem:** Guest implementations take `puzzleType` at every call site; API implementations ignore it (parameters named `_puzzleType`). The abstraction leaks the split.

**Fix:** Bind puzzle type into the store:
```ts
const useSolveStore = (isGuest: boolean, puzzleType: PuzzleType): SolveStore => {
  return useMemo(
    () => (isGuest ? makeGuestStore(puzzleType) : makeApiStore(puzzleType)),
    [isGuest, puzzleType]
  );
};
```

Update all call sites to drop the redundant `puzzleType` argument to methods.

**Acceptance:** `store.create(payload)`, `store.update(solve)`, `store.remove(solveId)`, `store.fetchPage(cursor)` all work without a puzzle parameter.

### 4.5 [CLEANUP] Delete unused `twistyToScrambleEvent`

**Location:** `frontend/src/utils/puzzleIds.ts` lines 29-42.

**Problem:** `TWISTY_TO_EVENT` map and its accessor are exported but unused anywhere in the codebase.

**Fix:** Grep-check (`grep -r twistyToScrambleEvent frontend/src`). If truly unused, delete. If there's a comment planning to use it, leave with a `// TODO` note.

**Acceptance:** Either the function is deleted or a comment explains its intended use.

### 4.6 [CLEANUP] Validate trainer JSON at build time

**Location:** `frontend/src/data/pll.json`, `oll.json`, `f2l.json` + `frontend/src/utils/trainerScramble.ts`.

**Problem:** `trainerScramble.ts` casts the JSON imports as `TrainerCase[]` without validation. A typo in a JSON file ships a broken app.

**Fix:** Two options:

**Option A (lightest):** Add a runtime check at module-import time that throws a clear error if any case is missing `id`, `name`, or has empty `algs`:
```ts
const validate = (cases: unknown, label: string): TrainerCase[] => {
  if (!Array.isArray(cases)) throw new Error(`${label}: not an array`);
  for (const c of cases) {
    if (!c || typeof c !== 'object') throw new Error(`${label}: non-object entry`);
    if (typeof (c as TrainerCase).id !== 'string') throw new Error(`${label}: missing id`);
    if (typeof (c as TrainerCase).name !== 'string') throw new Error(`${label}: missing name`);
    const algs = (c as TrainerCase).algs;
    if (!Array.isArray(algs) || algs.length === 0) throw new Error(`${label}: empty algs for ${(c as TrainerCase).id}`);
  }
  return cases as TrainerCase[];
};

export const PLL_CASES = validate(pllData, 'pll.json');
export const OLL_CASES = validate(ollData, 'oll.json');
export const F2L_CASES = validate(f2lData, 'f2l.json');
```

**Option B (heavier):** Add `zod` as a dep and schema-parse the JSON. Cleaner and composable but new dependency.

Go with Option A.

**Acceptance:** Mangling one case in `pll.json` (drop its `algs` array) fails fast at app boot with a clear error, not silently at trainer use time.

---

## Phase 5: Data integrity and scramble queue

### 5.1 [BUG] `useAllSolves` silently caps at 10k

**Location:** `frontend/src/hooks/useAllSolves.ts` lines 35-42.

**Problem:** `MAX_PAGES = 200 * limit = 10_000` hard cap. Past that, oldest solves silently disappear from stats.

**Fix:** Surface the truncation:
```ts
interface UseAllSolvesResult {
  solves: Solve[];
  loading: boolean;
  error: unknown;
  truncated: boolean; // new
  refetch: () => void;
}

// in the loop, track truncated = true if we hit MAX_PAGES && cursor still non-null
```

In `Stats.tsx`, if `truncated`, render a small notice above the charts: "Showing your most recent 10,000 solves. Use the date range filter to see older ranges."

**Acceptance:** With 10,001 fake solves, stats shows the notice. With 9,999, it doesn't.

### 5.2 [BUG] Heatmap buckets by UTC, not local

**Location:** `frontend/src/utils/statsBuckets.ts` line 45.

**Problem:** `created_at.slice(0, 10)` grabs the UTC date. A US-Pacific user solving at 8pm local time has that solve attributed to the next day in the heatmap.

**Fix:**
```ts
export function buildHeatmapData(solves: Solve[]): HeatmapCell[] {
  const counts = new Map<string, number>();
  for (const s of solves) {
    if (s.dnf) continue;
    const d = new Date(s.created_at);
    // Format in user's local timezone as YYYY-MM-DD
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `${year}-${month}-${day}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([day, value]) => ({ day, value }));
}
```

Update `statsBuckets.test.ts` to cover this: a solve at midnight UTC with the user in UTC-5 should show up on the previous day.

**Acceptance:** Solves created at 11pm local time appear on the correct local-date cell in the heatmap.

### 5.3 [REFACTOR] `useScrambleQueue` takes `initialScramble`

**Location:** `frontend/src/hooks/useScrambleQueue.ts` and `frontend/src/components/SolveSession.tsx` lines 53-76.

**Problem:** The "replay a scramble" flow uses a microtask-scheduled `overrideScramble` after setState. The 10-line comment block in `SolveSession.tsx` documenting the race is the real signal that this needs a cleaner API.

**Fix:** Pass the replay scramble as an option to the queue hook:

```ts
interface UseScrambleQueueOptions {
  initialScramble?: string;
}

const useScrambleQueue = (
  puzzleType: PuzzleType,
  options?: UseScrambleQueueOptions,
): UseScrambleQueueResult => { /* ... */ };
```

Inside the hook, pass `initialScramble` to `new ScrambleQueue(puzzleType, initialScramble)`. The queue constructor sets `this.current = initialScramble` if provided (skipping the first `refill()` gen), then still fills `this.next` in the background.

`SolveSession.tsx`'s replay useEffect now reads `location.state` and drives setState for puzzleType + a local `initialScramble` state, then passes both to `useScrambleQueue`. No microtask hack.

Actually, because React re-runs the hook on `puzzleType` change, you need to be careful: you only want `initialScramble` to apply on the FIRST render after the replay, not on subsequent puzzleType changes. Handle this by storing the replay scramble in a ref inside `useSolveSession` and consuming-and-clearing it on use.

**Acceptance:** The "Use this scramble" flow from the detail modal works. The eslint-disable comment from `SolveSession.tsx` line 76 is gone. No microtask hack.

### 5.4 [BUG] Cross-tab localStorage race

**Location:** `frontend/src/services/guestStorage.ts` line 65-71.

**Problem:** If a user has two Decipher tabs open and deletes different solves in each, whichever write lands second overwrites the first.

**Fix (optional, low priority):** Listen for `storage` events and merge, OR just accept the limitation (guests rarely have two tabs). If you want to fix: wrap saves in a try/retry loop that reads fresh, applies the mutation, and writes, retrying on version mismatch. Overkill for pet-app guests; note and move on.

**Decision for this phase:** Document the limitation in a comment in `guestStorage.ts` and skip the fix. Revisit if any user ever complains.

**Acceptance:** A comment explains the cross-tab limitation.

---

## Phase 6: UX polish and hygiene

### 6.1 [IDEA] Toast notifications

**Location:** New dependency + `frontend/src/components/Toasts.tsx` or similar + wiring.

**Problem:** 9 `console.error` calls and 1 `window.alert` means users mostly never know when things fail.

**Fix:**
1. Add `sonner` (tiny, ~1KB, hookless): `npm i sonner`.
2. In `main.tsx`, render `<Toaster position="bottom-right" theme="dark" />` once at the root.
3. Replace:
   - All `console.error('Error ...', err)` → keep the console.error for diagnostics AND add `toast.error('...')` with a human message.
   - The `window.alert('Local storage is full...')` → `toast.error(...)` with a longer timeout.
   - The migration failure case from task 1.3 → `toast.error('${failed.length} solves could not sync')`.

Toast theme should respect `effectiveTheme` from settings.

**Acceptance:** Cut the network, delete a solve, see a toast. Turn the network back on, the toast disappears after 5s.

### 6.2 [IDEA] Puzzle switch hotkeys

**Location:** `frontend/src/hooks/useSolveSession.ts` (after 4.2) or `SolveSession.tsx`.

**Problem:** Switching puzzles requires a mouse. Speedcubers live on keyboard.

**Fix:** Add hotkeys `1-9` mapped to the first nine puzzle types (in the same order as the Header array). Drop in the existing `useHotkeys` map:

```ts
'1': () => setPuzzleType('222'),
'2': () => setPuzzleType('333'),
// wait, '2' is already +2 toggle
```

Conflict. Options:
- Use a different modifier, e.g. `Alt+1`, `Alt+2`, ...
- Or drop this hotkey idea for puzzle switching and use it for something else

Recommend: `Alt+1` through `Alt+9`. Also add `Alt+0` for the 10th puzzle if it exists.

Update `HotkeyHelp` to document them.

**Acceptance:** `Alt+2` switches to 3x3, `Alt+3` switches to 4x4, etc. `Alt+1` is 2x2.

### 6.3 [IDEA] Inspection start beep

**Location:** `frontend/src/components/Timer.tsx` `startInspection`.

**Problem:** No audible feedback when inspection begins. Some solvers would appreciate it.

**Fix:** Call `beep(880, 80)` (higher and shorter than the warning beeps) at the top of `startInspection`. Gated by `soundEnabled` like the others.

**Acceptance:** With sound on, starting inspection plays a short high beep.

### 6.4 [IDEA] Distinguish `+2` from `DNF` badge visually

**Location:** `frontend/src/components/Timer.tsx` and `Timer.css`.

**Problem:** Both badges use the same `.timer-badge` class. At a glance they look identical.

**Fix:** Add `.timer-badge.plus-two` (orange) and `.timer-badge.dnf` (red) variants. In the Timer, when rendering the badge, add the class based on state.

**Acceptance:** `+2` and `DNF` badges have distinct, puzzle-obvious colors.

### 6.5 [IDEA] Best-of panel on solve hub

**Location:** `frontend/src/components/SolveHub.tsx`.

**Problem:** SolveHub shows session stats only. Lifetime bests live on the Stats page, not the main timer page.

**Fix:** Add a small "lifetime" row below current stats, reading from `pbHistory`:
- Best single: first entry in `pbHistory` sorted by time
- Best ao5/ao12: NOT currently materialized server-side. Two options: compute from all solves on the client (needs `useAllSolves`, heavy), or materialize server-side later.

Simpler scope: just add best-single (lifetime PB). ao5/ao12 bests can wait.

**Acceptance:** SolveHub shows both session-best and lifetime-PB single times, clearly labeled.

### 6.6 [IDEA] Keybinding customization (deferred)

**Location:** Would be `useSettings.tsx` + `SettingsPanel.tsx`.

**Problem:** Some users want non-spacebar keys.

**Fix:** Skip for this phase. Note for future work: adds a `spaceKey: string` setting, Timer listens for the custom key, SettingsPanel has a "press a key" capture UI.

**Acceptance:** Not implemented in this phase, just noted.

### 6.7 [CLEANUP] Move root docs into `docs/`

**Location:** Repo root.

**Problem:** `TASKS.txt` (18K), `ARCHITECTURE.html` (69K), `ENGINEERING_NOTES.html` (69K), `revamp.md` (38K) are all at repo root. That's ~244KB of planning artifacts cluttering what should be the "face" of the repo.

**Fix:**
- Move `ARCHITECTURE.html` and `ENGINEERING_NOTES.html` to `docs/` or delete if they're stale auto-generated pages.
- Move `revamp.md` (the original spec) to `docs/specs/2026-04-decipher-revamp-phase-1-8.md`.
- Move `TASKS.txt` to `docs/TASKS.txt` or delete if no longer current.
- This followup spec goes to `docs/specs/2026-04-decipher-audit-round-2.md`.

Update README if needed to link to these.

**Acceptance:** Repo root is lean: README, backend/, frontend/, docs/, and standard config files. Planning artifacts live in `docs/`.

### 6.8 [CLEANUP] Remove CRA leftovers

**Location:** `frontend/public/`.

**Problem:** `logo192.png` and `logo512.png` are the default CRA React logos. After the Vite migration, verify they're referenced by `manifest.json` and `index.html`. If not, delete.

**Fix:** Check `frontend/public/manifest.json` and `frontend/index.html`. If unreferenced, delete the images.

**Acceptance:** `frontend/public/` contains only files actually shipped.

### 6.9 [CLEANUP] `docs/superpowers` audit

**Location:** `docs/superpowers/`.

**Problem:** 186KB of what looks like Claude Code-specific planning artifacts in the repo.

**Fix:** Verify this is intentional. If Sia wants to track his Claude Code plans in-repo, keep and maybe add a short README in `docs/superpowers/README.md` explaining what it is. If not, move to `.gitignore`'d local folder.

**Acceptance:** Either contents are documented or moved out of the repo.

### 6.10 [CLEANUP] Clean up the 5 `React` imports where they're not needed

**Location:** Most `.tsx` files.

**Problem:** `"jsx": "react-jsx"` in tsconfig means `import React from 'react'` is unnecessary. Harmless but noise.

**Fix:** Low priority. Either leave as-is (harmless) or do a mass find-and-replace to remove the unused import. Not worth a full pass, but if you're in a file for another reason, clean it up opportunistically.

**Acceptance:** Not strictly required. If done, `tsc --noEmit` still passes.

### 6.11 [CLEANUP] Double-render of tab buttons + select in Header

**Location:** `frontend/src/components/Header.tsx` lines 74-87 and `Header.css` responsive blocks.

**Problem:** Both the button list AND the `<select>` render into the DOM, with one hidden via CSS media queries. Screen readers may announce both, and DOM has two copies of the puzzle list.

**Fix:** Use a JS media query hook (or match media API) to render one or the other, not both:
```ts
const useMatchMedia = (query: string): boolean => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
};

// in Header:
const isMobile = useMatchMedia('(max-width: 639px)');
return isMobile ? <select>...</select> : <div className="puzzle-buttons">...</div>;
```

**Acceptance:** DOM inspector shows one puzzle selector, not both. Resizing the viewport across the breakpoint swaps which one renders.

### 6.12 [CLEANUP] Rewrite `Stats.tsx` heatmap date fallback

**Location:** `frontend/src/pages/Stats.tsx` lines 51-54.

**Problem:** The `heatmapFrom` ternary-inside-useMemo is dense and hard to scan.

**Fix:** Extract into a named helper:
```ts
const computeHeatmapFrom = (
  boundsStart: Date | null,
  solves: Solve[]
): Date => {
  if (boundsStart) return boundsStart;
  if (solves.length > 0) return new Date(solves[solves.length - 1].created_at);
  return new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
};
```

**Acceptance:** Stats.tsx reads more clearly.

---

## Phase 7: Fresh feature ideas

Pick and choose. None are required. Ordered roughly by my read of effort-to-value ratio.

### 7.1 [IDEA] Recent-best spark stat

**Effort:** Small.

**Description:** Above the dot plot on Stats, show: "Your last 5 sessions avg: 18.43. Previous 5: 21.02. ↓ 2.59s (13%)." Scans at a glance whether trend is improving.

**Implementation:** Compute from `filteredSolves` in `Stats.tsx`. A "session" is a day where `>= X` solves happened (say X = 10). Take the last 5 such days, average the daily means. Same for the previous 5. Subtract.

### 7.2 [IDEA] Colored dots by speed vs rolling ao5

**Effort:** Small.

**Description:** In `DotPlot`, color each dot by deviation from the rolling ao5. Fast (green) if >10% below, slow (red) if >10% above, neutral otherwise. More informative than just PB/worst.

**Implementation:** `DotPlot.tsx` already computes ao5Line. For each point, compute `(time - ao5) / ao5` and map to a color. Replace the existing PB/worst logic or layer on top.

### 7.3 [IDEA] Practice mode toggle

**Effort:** Small-medium.

**Description:** A "Don't save this solve" toggle in the main timer page for warmups or freestyle. The trainer pages already work this way.

**Implementation:** Add a boolean state to `useSolveSession`. Render a checkbox/toggle next to the Timer labeled "Practice mode (don't save)". When on, `handleSolveComplete` skips `store.create` and only updates in-memory stats.

### 7.4 [IDEA] Clock puzzle preview placeholder

**Effort:** Small.

**Description:** Clock is the only puzzle without a `TwistyPlayer` preview. Right now it shows an empty box with "Preview not available" (per `ScramblePreview.tsx` line 75). Do something nicer: a simple SVG clock face.

**Implementation:** In `ScramblePreview.tsx`, when `puzzleType === 'clock'`, render an inline SVG of two clock faces with the scramble parsed into positions. The scramble format is like `UR2- DR4+ ...`. Parse into 18 clock positions and render. Nontrivial but self-contained.

Alternative: just render a cleaner placeholder with a friendlier message.

### 7.5 [IDEA] Shareable solve URL

**Effort:** Medium.

**Description:** `/solve/:id` renders the solve detail modal as a standalone page, so Sia can share a specific scramble+time with John.

**Implementation:**
1. Backend: add `GET /api/solves/:id/public` that returns a solve only if it's tagged `public` (new DB column). Alternative: just let the owner view it by id, no sharing.
2. Frontend: route `/solve/:id`, fetch, render the detail modal fullscreen.
3. Detail modal gains a "copy share link" button.

For a personal tool, simplest version: just let the owner paste the URL, no public flag. If it's sent to someone else, they get a 401 (not exploitable).

### 7.6 [IDEA] Hide-and-solve (blindfold memo training)

**Effort:** Medium.

**Description:** Niche but distinctive. For BLD practice. Add a "memo mode" to the timer: scramble is shown, then user presses a key to "start memo," scramble hides, then user starts the timer. Two-phase timing (memo + execution) logged.

**Implementation:** New phase in the Timer state machine: `memo`. Plus split time tracking. Plus a BLD-specific UI toggle in settings. This is a whole feature, skip unless Sia wants to go there.

### 7.7 [IDEA] Trainer session persistence

**Effort:** Small.

**Description:** If the user reloads the trainer, the recent strip (last 5 trainer times) is lost.

**Implementation:** Persist `recent` from `TrainerSession.tsx` to sessionStorage keyed by trainer type. Rehydrate on mount. Clear when user changes trainer type.

---

## Phase 8: Followup security and optimization (optional, not urgent)

### 8.1 [SECURITY] Local JWT verification

**Effort:** Medium.

**Description:** Currently every authenticated request does a Supabase round-trip in `require_auth`. Under load this doubles latency per request. Verify JWT signature locally using Supabase's JWKS endpoint.

**Implementation:** Add `pyjwt[crypto]` dep. Fetch and cache the Supabase public JWKS on startup. In `require_auth`, decode+verify locally, extract `sub` (user id) from the payload. Fall back to server-side `get_user` only on verification failure.

### 8.2 [SECURITY] Per-user lifetime solve cap

**Effort:** Small.

**Description:** Cheap insurance against a malicious sign-up + mass-post spree. Count solves for the user in `create_solve`; if > 100,000, reject.

**Implementation:** Add a count query or maintain a `user_stats.solve_count` table that's incremented on each create. Add a 429-with-explanation response when exceeded.

### 8.3 [REFACTOR] Toasts wrap all silent errors

**Effort:** Small (if Phase 6.1 is done).

**Description:** Double-check no silent `catch (err) { console.error(...) }` remains after Phase 6.1. Every catch should either re-throw, toast the user, or have a comment explaining why silent is correct.

---

## Global acceptance (whole audit complete)

- `SolveDetailModal` label reads "±2 ao5 context" correctly.
- Supabase dashboard confirms RLS on `solves` and `personal_bests`.
- Guest migration with 40+ solves and a strict rate limit does not lose data; user sees a toast if some failed.
- Flask app has `ProxyFix`, 16KB max body size, and refuses to start in production with debug on.
- StrictMode no longer causes double-migration in dev.
- After finishing a solve, the next scramble is visible immediately even on a slow network.
- Deleting a PB's underlying solve also removes the PB record.
- Backend validator rejects `time < 0.1`.
- CSV export cells starting with `=`, `+`, `-`, `@`, `\t`, `\r` are prefixed with `'`.
- Timer saves solves rounded to 10ms. No sub-10ms precision in the DB.
- Escape cancels a running solve without saving it.
- 17s+ inspection auto-finalizes as DNF.
- Timer has 12+ unit tests.
- One canonical `averages.ts` powers every ao5/ao12 display.
- `SolveSession.tsx` is under 150 lines; the logic lives in `useSolveSession`.
- Zero `eslint-disable react-hooks/exhaustive-deps` in `useSolveSession`.
- `useAllSolves` surfaces `truncated: true` past 10k and Stats shows a notice.
- Heatmap buckets by local date, not UTC.
- `useScrambleQueue(puzzleType, { initialScramble })` makes the replay flow clean.
- Toast notifications visible for every user-facing error.
- Alt+1 through Alt+9 switch puzzles.
- Optional inspection-start beep available via sound setting.
- `+2` and `DNF` badges are visually distinct.
- Repo root contains only essentials; planning artifacts moved to `docs/`.
- Unused `twistyToScrambleEvent` is deleted or explained.
- Trainer JSON files fail fast at boot on schema mismatch.

Skip anything that no longer applies; this is a menu, not a checklist to march through verbatim.
