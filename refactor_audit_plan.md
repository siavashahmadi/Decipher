# Ao5 Audit Remediation Plan

Source: full-stack audit by 10 specialist agents (backend-developer, python-pro, security-auditor, react-specialist, typescript-pro, refactoring-specialist, database-optimizer, architect-reviewer, qa-expert, code-reviewer) on 2026-04-25.

This plan covers **all** findings, grouped by cluster, ordered by leverage. Every item lists: the file(s), what to change, why, the approach, an acceptance check, and a rough effort estimate (S = under 30 min, M = 30 min to 2 hrs, L = half-day, XL = full day or more).

---

## Cluster 0. Pre-work (do this first so the rest is safe)

The audit found zero CI enforcement. Before changing anything, get a green-build baseline.

### 0.1 [S] Establish a green baseline locally
- `cd backend && pytest -q` and `cd frontend && npx vitest run --reporter=dot && npx tsc --noEmit`. Confirm clean.
- If anything is red today, fix-or-skip with a reason before starting Cluster A.

### 0.2 [M] Add a minimal GitHub Actions CI workflow
- New file: `.github/workflows/ci.yml`.
- Two jobs: backend (`pip install -r backend/requirements.txt && pytest`) and frontend (`npm ci && npx vitest run && npx tsc --noEmit`).
- Trigger on PR + push to `main`.
- Acceptance: a no-op PR shows both checks green.

### 0.3 [S] Add a `make` or `npm run` umbrella for "run everything"
- Optional: `package.json` script `"test:all": "..."`. Lets you regress-check after every cluster.

---

## Cluster A. Critical correctness bugs (fix immediately)

These are real bugs visible to users today.

### A.1 [S] Implement password reset properly
- File: `frontend/src/components/Auth.tsx:33-35`.
- The `'reset'` branch shows a fake success alert and never calls Supabase.
- Approach: replace the alert block with `const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })`. Surface `error.message` like the other branches do; replace the success `alert(...)` with `toast.success(...)`.
- Acceptance: requesting a reset for a real account triggers a Supabase email; bad email surfaces an error toast; existing tests still pass.

### A.2 [S] Fix off-by-one in lifetime solve cap
- File: `backend/app/routes/solves.py:138`.
- `if existing > SOLVE_LIFETIME_CAP` allows solve #100,001. Change to `>=`.
- Add a regression test: count exactly at cap, expect 429.
- Acceptance: new test passes; `test_create_solve` happy path still passes.

### A.3 [S] Block PATCH from resurrecting soft-deleted solves
- File: `backend/app/routes/solves.py:207-212`.
- Add `.is_('deleted_at', None)` to the PATCH query chain (mirror the DELETE filter).
- Add a regression test: soft-delete then PATCH the same id, expect 404.
- Acceptance: new test passes.

### A.4 [M] Reconcile cross-stack puzzle-type vocabulary (Megaminx is broken today)
- Files: `backend/app/validators.py:1-5`, `frontend/src/types/index.ts:1-12`, `frontend/src/utils/puzzleIds.ts`, `frontend/src/components/Header.tsx`, `frontend/src/components/SolveSession.tsx`, any tests pinning the union.
- Today: backend allows `'minx'` (and `'333bf', '333oh', '444bf', '555bf'` that the FE cannot pick); frontend declares `'mega'`. Picking Megaminx returns 422.
- Approach: pick `'mega'` as the canonical app-internal name. Update backend `VALID_PUZZLE_TYPES` to use `'mega'`. Drop the unused BLD/OH entries unless they are roadmap (ask before deleting). Keep `puzzleIds.ts` as the single boundary that maps `'mega' to 'megaminx'` for cubing.js.
- Migration risk: if any production rows have `puzzle_type = 'minx'`, write a one-shot SQL migration to rename them. Check Supabase first.
- Acceptance: end-to-end smoke test of "create Megaminx solve, see it on Stats" works; all tests green.

### A.5 [S] Add rate limits to PATCH and DELETE
- File: `backend/app/routes/solves.py:195` (update_solve), `:220` (delete_solve).
- Add `@limiter.limit("60 per minute")` to both. Match the existing decorator order.
- Acceptance: hitting either route 70 times in a minute returns 429.

### A.6 [S] Reject empty PATCH bodies (close the existence-oracle)
- File: `backend/app/validators.py:44-57`.
- Today, `validate_update_solve({"time": 999})` returns no error and the route runs an empty UPDATE that confirms the row exists.
- Approach: require at least one of `dnf` or `plus_two` to be present in the body; return `{"body": "must include dnf or plus_two"}` otherwise. Alternatively assert `len(allowed) > 0` in the route and 400.
- Acceptance: PATCH `{"time": 999}` returns 400; valid PATCHes still work.

### A.7 [L] Make share-link tokens expirable and revocable
- File: `backend/app/routes/solves.py:272-329`. Possibly a new migration.
- Current scheme: HMAC-only, no `iat`/`exp`/nonce, no DB allowlist; uses service-role key (bypasses RLS).
- Two options:
  - **Option 1 (lighter):** embed `iat` and `exp` in the signed payload. Token becomes `b64(solve_id) . b64(iat) . b64(exp) . b64(MAC)`. Verify within window. No revocation, but expiry caps blast radius. Approx 2 hrs.
  - **Option 2 (stronger, recommended):** new `share_links` table with `token_hash, solve_id, user_id, created_at, expires_at, revoked_at`. Generate `secrets.token_urlsafe(32)`, store `sha256(token)`. Owner can revoke. Approx half-day including migration + tests.
- Either way, add minimum `SHARE_SECRET` length validation (>= 32 bytes) at startup; refuse to boot otherwise.
- Acceptance: expired/revoked tokens 404; tests cover both happy and revoked paths.

### A.8 [S] Memoize `useMedianTracker` return value
- File: `frontend/src/hooks/useMedianTracker.ts:123`.
- Current: returns `{ push, getMedian, reset, getSize }` fresh every render. Cascades into `useSolveSession.ts:117` which re-runs the initial fetch effect every render.
- Approach: wrap the returned object in `useMemo(() => ({ push, getMedian, reset, getSize }), [push, getMedian, reset, getSize])`. The inner callbacks already memoize via refs; the wrapper just stabilizes identity.
- Acceptance: add a test that mounts `useSolveSession` and asserts the fetch is called exactly once for a given puzzle.

### A.9 [M] Add DELETE RLS policy on `personal_bests`
- File: new migration `backend/migrations/005_personal_bests_delete_policy.sql`.
- Current: only SELECT and INSERT policies; the user-scoped DELETE in `solves.py:239` silently deletes 0 rows. PB rows orphan on every PB-holding solve delete.
- SQL: `CREATE POLICY "Users can delete own personal bests" ON personal_bests FOR DELETE USING (auth.uid() = user_id);`
- Also add a defensive UPDATE policy now to avoid the same trap if future code updates PBs.
- Acceptance: deleting a PB-holding solve removes the matching `personal_bests` row (verify with a backend integration test against a real Supabase or an RLS-aware fake).

---

## Cluster B. Security hardening

Order roughly by likelihood of exploitation.

### B.1 [S] Add JWT `issuer` check
- File: `backend/app/auth.py:39-44`.
- Pass `issuer=f"{Config.SUPABASE_URL}/auth/v1"` to `jwt.decode`.
- Acceptance: a token with the wrong `iss` is rejected; valid tokens still pass.

### B.2 [S] Tighten `verify_token_local` exception handling
- File: `backend/app/auth.py:45-46`.
- Today: bare `except Exception` collapses expired tokens, signature errors, and programmer bugs into one silent `None`.
- Approach: catch `jwt.ExpiredSignatureError` and `jwt.InvalidTokenError` explicitly, log at DEBUG with category, return None. Let other exceptions propagate so they get logged and observed.
- Acceptance: an expired token logs `token_expired`; a signature mismatch logs `signature_invalid`.

### B.3 [S] Make JWKS client thread-safe and add rotation
- File: `backend/app/auth.py:15-29`.
- Approach: wrap lazy init in a `threading.Lock`; pass `lifespan=300, max_cached_keys=16` to `PyJWKClient`.
- Acceptance: JWKS rotation tests (mock the client) still pass; concurrent unit test does not double-construct.

### B.4 [S] Validate startup config and `SHARE_SECRET` length
- File: `backend/app/__init__.py` (in `create_app`), `backend/app/config.py`.
- Approach: at the top of `create_app`, raise `RuntimeError` if any of `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SHARE_SECRET` is falsy. Additionally require `len(SHARE_SECRET) >= 32`.
- Acceptance: missing env var crashes at boot with a clear message, not at first request.

### B.5 [S] Move `db.py` env reads inside the function
- File: `backend/app/db.py:4-5`.
- Approach: delete the module-level `url`/`key` assignments; read `Config.SUPABASE_URL`/`Config.SUPABASE_ANON_KEY` inside `get_supabase_client()` (already the pattern).
- Acceptance: tests still pass; no behaviour change for normal callers.

### B.6 [S] Set explicit timeouts on Supabase HTTP calls
- File: `backend/app/db.py` (or a helper).
- Approach: configure the underlying `httpx.Client` with `timeout=httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=5.0)`. Same for the Supabase auth fallback in `solves.py:35-46`.
- Acceptance: a slow stub Supabase causes the request to fail fast (5s) rather than hang.

### B.7 [M] Add security headers via `after_request`
- File: `backend/app/__init__.py`.
- Approach: register `@app.after_request` adding:
  - `Content-Security-Policy` (start with a permissive policy that allows your fonts/Supabase; tighten iteratively).
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
- Acceptance: response headers visible via `curl -I`; existing tests still pass.

### B.8 [S] Bump `flask-cors` past CVE range
- File: `backend/requirements.txt`.
- Approach: pin `flask-cors>=5.0.0`. Reinstall, run tests.
- Acceptance: `pip-audit` (or equivalent) clean for `flask-cors`.

### B.9 [S] Disable production source maps
- File: `frontend/vite.config.ts:8`.
- Approach: gate on `mode`: `sourcemap: mode === 'development'`. Or strip `*.js.map` on deploy.
- Acceptance: `npm run build` outputs no `*.map` in production.

### B.10 [M] Switch rate-limit key to user-id-when-authenticated, IP otherwise
- File: `backend/app/extensions.py:7`, `backend/app/routes/solves.py` (auth ordering).
- Today: per-IP rate limit penalizes NAT users, evaded by IP rotation.
- Approach: `Limiter(key_func=lambda: getattr(g, 'user_id', None) or get_remote_address())`. This requires `require_auth` to set `g.user_id` **before** the rate-limit decorator runs, which Flask currently doesn't allow with the standard decorator order. Fix by either: (a) making rate-limit a `before_request` hook that runs after `require_auth`, or (b) using flask-limiter's `key_func` per-route override.
- Acceptance: an authenticated user's rate is per-user; an anonymous endpoint (auth, share read) is per-IP.

### B.11 [M] Make rate-limit storage swappable
- File: `backend/app/extensions.py:7`.
- Approach: read `LIMITER_STORAGE_URI` from env, default `"memory://"`. Lets prod swap to Redis without code change.
- Acceptance: setting the env var changes the storage; default behaviour unchanged.

### B.12 [M] Sort guest solves chronologically before migration
- File: `frontend/src/services/api.ts:89-105` (and/or `frontend/src/services/guestStorage.ts`).
- Today: manifest order, not chronological. PB materialization runs out of order, so PB rows are wrong.
- Approach: in `migrateSolves`, sort `solves` by `created_at` ascending before the loop.
- Acceptance: unit test verifies the loop sees sorted input.

### B.13 [M] Decide on token storage strategy (deferred decision, document)
- File: `frontend/src/services/auth.ts:23` plus design doc.
- Today: tokens in localStorage; XSS surface is full account takeover.
- Approach: short-term, ship the CSP from B.7 and accept the risk explicitly. Long-term, migrate to PKCE + httpOnly cookie via `@supabase/ssr`. This is XL and architectural; do not bundle into this audit pass.
- Acceptance: decision recorded in `docs/`. Implementation tracked separately.

### B.14 [S] Add `.env` and `**/.env` to `.gitignore`
- File: `.gitignore`.
- Today: covers `*.env.local` etc. but not `.env`.
- Acceptance: `git check-ignore backend/.env` returns the path.

### B.15 [S] Audit Supabase exception payloads for token leakage
- File: `backend/app/routes/solves.py` (every `current_app.logger.exception`).
- Approach: read the supabase-py 2.22.4 source for what `auth.get_user` raises; if exception repr includes the bearer token, sanitize before logging. Document the finding either way.
- Acceptance: a known-failing token call does not write the token into logs.

---

## Cluster C. Performance and re-render storm

These overlap with A.8 (already covered). Tackle this cluster after A is merged so the perf wins land on a correct base.

### C.1 [M] Drop Timer to direct DOM writes during running phase
- File: `frontend/src/components/Timer.tsx:178-185, 311-319`.
- Today: `setTime(rounded)` 60x/sec re-renders Timer subtree.
- Approach: add a `timerNodeRef = useRef<HTMLDivElement>(null)`. During running phase, write `timerNodeRef.current!.textContent = formatTime(elapsed/1000)` directly from the RAF callback. Keep `setPhase` for state transitions; only `setState` once when phase changes. Memoize `timerClass` with `useMemo` keyed on `[phase, isHoldReady, isWarning, flashYellow]`.
- Acceptance: React DevTools Profiler shows zero Timer renders during a running solve.

### C.2 [S] Drop inspection interval to 250ms or RAF-gated
- File: `frontend/src/components/Timer.tsx:114-155`.
- Approach: option A: `setInterval(... , 250)` and only call `setInspectionCount` when the displayed integer second changes. Option B: RAF loop with `lastSecondRef` comparison.
- Acceptance: profiler shows about 4 renders/sec during inspection.

### C.3 [M] Wire `AbortController` into `useAllSolves`
- File: `frontend/src/hooks/useAllSolves.ts:38-67`, `frontend/src/services/api.ts`.
- Approach: thread an optional `AbortSignal` through `api.getSolves`; on cleanup of the effect, call `controller.abort()`. Update axios call to pass `signal`.
- Acceptance: switching puzzles mid-fetch cancels in-flight requests (verify via network tab).

### C.4 [M] Replace full re-sort in `loadMore` with a 2-array merge
- File: `frontend/src/hooks/useSolveSession.ts:148-149`.
- Approach: sort only `newTimes`, then merge two sorted arrays into the existing `sortedTimesRef.current`. Standard linear merge.
- Acceptance: unit test verifies merge correctness on overlapping ranges.

### C.5 [L] Virtualize SolveLog and precompute per-row Ao5
- File: `frontend/src/components/SolveLog.tsx:46-49`.
- Today: O(N) per render with N up to 10k.
- Approach: install `@tanstack/react-virtual`. Precompute `perSolveAo5: number[]` once when `solves` changes (incrementally on prepend). Render rows lazily.
- Acceptance: scrolling 10k solves stays at 60fps in the profiler.

### C.6 [S] Memoize `useScramblePreviewSettings` provider value
- File: `frontend/src/hooks/useScramblePreviewSettings.tsx:79-88`.
- Approach: wrap the `value` object in `useMemo`.
- Acceptance: consumers do not re-render on unrelated state changes (manual profiler check).

### C.7 [S] Hoist `PUZZLE_HOTKEYS` to module scope and memoize the hotkey map
- File: `frontend/src/components/SolveSession.tsx:40-79`.
- Approach: move the constant out of the component; wrap the merged map in `useMemo`.
- Acceptance: `useHotkeys` map identity stable across renders.

### C.8 [S] Memoize derived chart data
- Files: `frontend/src/components/stats/ActivityHeatmap.tsx:22-28`, `Histogram.tsx:13`, `DotPlot.tsx:43`, `PBProgression.tsx:14`. Memoize `chartColors(theme)` results.
- Approach: wrap derivations in `useMemo`; either memoize at call sites or memoize inside `themeColors.ts`.
- Acceptance: recharts components do not re-render on parent re-render unless data changed.

### C.9 [S] Memoize `handleSolveUpdate` and `handleSolveDelete`
- File: `frontend/src/hooks/useSolveSession.ts:206-246`.
- Approach: wrap with `useCallback` matching `handleSolveComplete`'s pattern.
- Acceptance: identity stable across renders.

### C.10 [S] Fix `useMatchMedia` redundant set
- File: `frontend/src/hooks/useMatchMedia.ts:13`.
- Approach: drop the `setMatches(mq.matches)` line in the effect; the `useState` initializer already ran.
- Acceptance: existing tests still pass.

### C.11 [S] Stop double-fire of scramble generation in TrainerSession
- File: `frontend/src/components/trainers/TrainerSession.tsx:64-77`.
- Approach: replace the multi-effect approach with derived `useMemo([type, caseChoice, algChoice])` + a manual `bump` counter for "skip / after-solve regenerate".
- Acceptance: `generateTrainerScramble` is called once per logical change.

### C.12 [S] Lazy-load Stats, Trainers, and SharedSolve
- File: `frontend/src/App.tsx`.
- Approach: convert routes to `React.lazy` + `<Suspense fallback={...}>`. Keeps `recharts` and `@nivo/calendar` out of the timer-route bundle.
- Acceptance: bundle analyzer shows separate chunks; Timer route bundle drops.

### C.13 [S] Drop `webkitAudioContext` fallback
- File: `frontend/src/utils/sound.ts:16`.
- Approach: just use `new AudioContext()`.
- Acceptance: tests still pass.

---

## Cluster D. Database integrity and indexing

### D.1 [M] Add composite index covering `deleted_at IS NULL`
- File: new migration `backend/migrations/006_solves_active_index.sql`.
- Today: `solves_user_puzzle_created_idx` on `(user_id, puzzle_type, created_at)` does not include `deleted_at`, so every paginated query needs a recheck.
- SQL: `CREATE INDEX solves_user_puzzle_created_active_idx ON solves (user_id, puzzle_type, created_at DESC) WHERE deleted_at IS NULL; DROP INDEX solves_user_puzzle_created_idx;`
- Acceptance: `EXPLAIN` on a paginated solves query shows index-only scan.

### D.2 [M] Add PB time-ordered index
- File: new migration `backend/migrations/007_personal_bests_time_index.sql`.
- Today: `_maybe_record_pb` orders by `time` but the only PB index orders by `achieved_at`.
- SQL: `CREATE INDEX personal_bests_user_puzzle_time_idx ON personal_bests (user_id, puzzle_type, time ASC);`
- Acceptance: `EXPLAIN` of the PB lookup query uses the new index.

### D.3 [M] Add `ON DELETE CASCADE` to user_id FKs
- File: new migration `backend/migrations/008_user_fk_cascade.sql`.
- Approach: `ALTER TABLE solves DROP CONSTRAINT solves_user_id_fkey, ADD CONSTRAINT solves_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;` and same for `personal_bests`.
- Risk: if any production rows have orphan user_ids, this will fail. Audit first with `SELECT count(*) FROM solves s LEFT JOIN auth.users u ON u.id = s.user_id WHERE u.id IS NULL`.
- Acceptance: deleting a Supabase auth user cleans up their solves and PBs.

### D.4 [M] Add per-user counter table to replace `count='exact'` on every write
- Files: new migration `009_user_stats.sql`, `backend/app/routes/solves.py:132-138, 144`.
- Today: `count(*)` query before every solve insert. Slow at scale; also the source of the TOCTOU race in A.2.
- Approach: create `user_stats(user_id PK, solve_count int default 0)`. Use a Postgres trigger to increment on solve insert and decrement on soft delete. Backend's cap check becomes a single read of `user_stats`. Atomic.
- Migration: backfill counts from existing data.
- Acceptance: integration test confirms cap is enforced atomically under concurrent inserts.

### D.5 [S] Make migrations idempotent and reversible
- Files: existing `001`, `003`, `004` migrations; new `down.sql` files alongside each.
- Approach: add `IF NOT EXISTS` guards. Author down-scripts.
- Acceptance: re-running migrations is a no-op; rollback scripts exist.

### D.6 [S] Narrow `SELECT *` projections
- Files: `backend/app/routes/solves.py:93` (get_solves), `:343` (get_personal_bests).
- Approach: enumerate columns. Drop `user_id` (redundant) and `deleted_at` (always None for visible rows) from the wire shape.
- Acceptance: response payload smaller; tests still pass.

### D.7 [M] Add backend batch endpoint for guest migration
- Files: `backend/app/routes/solves.py` (new route), `frontend/src/services/api.ts:89-105`.
- Today: 30/min rate limit + 1 solve/request means migrations >= 31 solves silently fail.
- Approach: `POST /api/solves/batch` accepts an array (capped at, say, 1000), validates each, inserts in a single transaction. Separate rate-limit bucket. Frontend `migrateSolves` calls it once instead of looping.
- Acceptance: migrating 500 guest solves succeeds in one round-trip; new tests for batch endpoint.

### D.8 [M] Wrap PB read+insert atomically
- File: `backend/app/routes/solves.py:166-192`.
- Today: two round-trips, no transaction; concurrent solves can race.
- Approach: write a Postgres function (`record_pb_if_better(user_id, puzzle_type, solve_id, time)`) callable via `.rpc()`, doing the comparison + insert atomically. Or use an advisory lock.
- Acceptance: stress test with concurrent identical-time solves results in exactly the right number of PB rows.

### D.9 [S] Add cursor tiebreaker by `id`
- File: `backend/app/routes/solves.py:105`.
- Today: cursor is `created_at` only; identical timestamps drop a row across pages.
- Approach: cursor becomes `(created_at, id)` tuple, encoded; `lt(created_at, X) OR (created_at = X AND id < Y)`.
- Acceptance: regression test with two solves at identical microsecond timestamps paginates without skipping.

### D.10 [M] Cache Supabase client per request, not per call
- File: `backend/app/db.py:7-13`, `backend/app/routes/solves.py` (`require_auth`).
- Approach: build the client once in `require_auth`, reuse via `g.supabase`. Frontend code in routes already uses `request.supabase`. Migrate to `flask.g`.
- Acceptance: client construction count per request drops to 1.

### D.11 [S] Stop calling PB cleanup on DNF deletes
- File: `backend/app/routes/solves.py:233-245`.
- Approach: gate the cleanup `delete()` on `not solveToDelete.dnf`. Or change the comment to acknowledge the unconditional behaviour.
- Acceptance: DNF delete still works; PB cleanup runs only when needed.

### D.12 [S] Rename `current_pb` to `best_pb_time`
- File: `backend/app/routes/solves.py:177-179`.
- Approach: `order('time')` returns the fastest-ever PB; the variable name implies "current" which is misleading.
- Acceptance: rename only; behaviour unchanged.

---

## Cluster E. Refactors, dead code, duplication

These are pure cleanup; expect zero behaviour change. Run the full test suite after each.

### E.1 [S] Delete confirmed dead code
- All of these have been verified by the refactoring agent as zero non-self/non-test references:
  - `frontend/src/components/trainers/ComingSoon.tsx` (entire file plus its CSS).
  - `frontend/src/utils/trainerScramble.ts:124-128` `generatePllScramble` Phase-8 shim and its test block.
  - `frontend/src/utils/trainerScramble.ts:43-45` unexport `PLL_CASE_MAP` / `OLL_CASE_MAP` / `F2L_CASE_MAP` (only `CASE_MAP_BY_TYPE` consumes them internally).
  - `frontend/src/services/guestStorage.ts:83-87` `clearAllGuestSolves` (no production callers).
  - `frontend/src/utils/sound.ts:29` `isSoundEnabled` export.
  - `frontend/src/hooks/useScrambleQueue.ts` `override` callback and `nextScramble` (no consumers; remove from interface and snapshot).
  - `frontend/src/lib/scrambleQueue.ts:29` `setPuzzleType` second arg `initialScramble?: string` and the unreachable branches at lines 31, 35-40.
  - `frontend/src/hooks/useMedianTracker.ts:78, 121, 123` `getSize` (interface and return).
  - `frontend/src/hooks/useAllSolves.ts:11, 24, 69` `refetch` and the `tick` state.
  - `frontend/src/types/index.ts:27` `PersonalBest.category` field.
  - `backend/app/routes/__init__.py:3` empty `__all__`.
- Acceptance: tests still green.

### E.2 [M] Extract a single `effectiveTime(solve)` helper
- New: `frontend/src/utils/solveTime.ts` exporting `effectiveTime(solve): number` (DNF-aware, returns `Infinity`) and `displayTime(solve): number | null` (DNF returns null).
- Replace duplicated definitions in: `utils/averages.ts:5`, `utils/recentTrend.ts:17`, `utils/statsBuckets.ts:12`, `components/stats/Histogram.tsx:9`, `components/stats/DotPlot.tsx:12`.
- Replace inline expressions in: `useSolveSession.ts:104, 146, 225`, `SolveHub.tsx:69, 96`, `SolveLog.tsx:87`, `SolveDetailModal.tsx:21, 96`, `SharedSolve.tsx:60`, `ScrambleHistory.tsx:18`, `TrainerRecentStrip.tsx:17`.
- Acceptance: tests green; only one definition of "effective time" exists.

### E.3 [M] Extract `formatSolveLabel(solve, opts)` helper
- New: in `frontend/src/utils/formatTime.ts` or `utils/solveTime.ts`.
- Returns `'DNF'` | `'12.34'` | `'12.34+'`. Optional `plusSuffix` flag.
- Replace duplicates in: `SolveLog.tsx:84-88`, `SolveDetailModal.tsx:21, 96`, `ScrambleHistory.tsx:17-18`, `TrainerRecentStrip.tsx:15-20`, `SharedSolve.tsx:58-60`.
- Acceptance: tests green; "+ suffix" policy aligned across the app.

### E.4 [M] Build `createPersistedSettings<T>()` factory
- New: `frontend/src/hooks/createPersistedSettings.tsx`.
- Refactor `useSettings.tsx` and `useScramblePreviewSettings.tsx` to use it.
- Saves about 80 lines and removes drift between the two parsers.
- Acceptance: existing tests for both still pass.

### E.5 [S] Extract inspection timing constants
- New: `frontend/src/utils/inspectionConstants.ts` exporting `INSPECTION_LIMIT_MS = 15000`, `INSPECTION_PLUS_TWO_MS = 17000`, `INSPECTION_8S_WARNING_AT_MS = 8000`, `INSPECTION_12S_WARNING_AT_MS = 12000`.
- Update `Timer.tsx` references at lines 118, 120, 142, 144, 151, 168, 170.
- Acceptance: tests green.

### E.6 [M] Centralize `localDateKey` and other small utilities
- Move `localDateKey` from `utils/recentTrend.ts:19-25` into `utils/localDateKey.ts`. Replace the inline copy in `utils/statsBuckets.ts:46-50`.
- Acceptance: tests green.

### E.7 [M] Share `PBLineChart` between SolveHub and PBProgression
- Files: `frontend/src/components/SolveHub.tsx:182-201`, `frontend/src/components/stats/PBProgression.tsx`.
- Approach: extract a `PBLineChart` component with a `compact` prop. Or refactor SolveHub's section to reuse `PBProgression` directly.
- Acceptance: visual parity (eyeball check); tests green.

### E.8 [S] Parameterize `CustomTooltip` and `PBTooltip`
- File: `frontend/src/components/SolveHub.tsx:15-36`.
- Approach: one `<TimeTooltip prefix="Time" showDate={false} />` component.
- Acceptance: tests green.

### E.9 [L] Split `useSolveSession` (294 lines) into focused hooks
- File: `frontend/src/hooks/useSolveSession.ts`.
- Approach:
  - Extract `useSortedSolveStats` owning `sortedTimesRef`, `lastPercentile`, `currentMedian`, with `applySolveAdded`, `applySolveRemoved`, `rebuildFrom`. Eliminates the median-rebuild duplication.
  - Extract `useReplayState` for the `useLocation`/`navigate` replay-state read and one-shot clear (lines 56-84).
  - The original hook becomes about 120 lines focused on CRUD orchestration.
- Side effect: also closes the latent stale-closure where `loadMore` lists `puzzleType` in deps but does not read it.
- Acceptance: existing tests still pass; new tests for each extracted hook.

### E.10 [L] Split Timer with `useTimerMachine()`
- File: `frontend/src/components/Timer.tsx` (349 lines).
- Approach: move all refs, phase transitions, and timing logic into `useTimerMachine()` returning the public state and callbacks. Component becomes a presentational shell of about 60 lines. Extract the `setInterval` callback in `startInspection` (lines 114-155) into a `tickInspection(elapsed) -> 'continue' | 'expired'` helper.
- Acceptance: existing Timer tests still pass; new tests for the state machine in isolation.

### E.11 [L] Add backend service and repository layers
- Files: new `backend/app/services/solves.py`, `backend/app/repositories/solves.py`. Slim `backend/app/routes/solves.py` to HTTP adapter only.
- Approach: PB materialization, share-token signing, count check, and Supabase queries move out of the route file. Routes call services; services call repositories; repositories own Supabase access.
- Acceptance: existing tests still pass; new unit tests possible against services without HTTP setup.

### E.12 [M] Extract `_internal_error("label")` helper
- File: `backend/app/routes/solves.py`.
- Today: 7 routes share the same try/except wrapper. Extract a `_internal_error(label, exc)` helper or a `@route_safe('label')` decorator.
- Acceptance: cuts about 20 lines; behaviour unchanged.

### E.13 [M] Refactor `Auth.tsx` mode branches
- File: `frontend/src/components/Auth.tsx`.
- Approach: replace the 4 separate `mode === ...` JSX branches with a `MODE_CONFIG: Record<AuthMode, {...}>` table. Replace `alert(...)` calls with `toast.success/error`. Mount Auth at `/login` so it can use `useNavigate`.
- Bundles A.1.
- Acceptance: each auth mode renders correctly; toast appears on success.

### E.14 [M] Extract `useStatsFilters`
- File: `frontend/src/pages/Stats.tsx:36-57`.
- Approach: move preset/custom date-range state, bounds derivation, and filtering memo into a hook. Page becomes a layout shell.
- Acceptance: filter behaviour unchanged.

### E.15 [S] Split SolveHub
- File: `frontend/src/components/SolveHub.tsx`.
- Approach: extract `<StatsGrid stats={...} />` and `<MiniLineChart ...>` (shared with PB chart).
- Acceptance: visual parity.

### E.16 [S] Inline or remove `useSolveStore` passthrough wrappers
- File: `frontend/src/hooks/useSolveStore.ts`.
- Approach: `makeApiStore.create/update/remove` are pure passthroughs to `api.*`. Either inline the api calls or unify both stores around a smaller adapter that does not need wrappers.
- Acceptance: tests green.

### E.17 [S] Extract `useDismissOnOutsideClick(ref, onClose, enabled)`
- New: `frontend/src/hooks/useDismissOnOutsideClick.ts`.
- Replace the duplicated outside-click + Escape pattern in `Header.tsx:41-60`, `HotkeyHelp.tsx`, `SolveDetailModal.tsx`. Add `pointerdown` instead of `mousedown` for mobile.
- Acceptance: dismiss works on click and tap.

### E.18 [S] Promote `PUZZLES` and `PUZZLE_HOTKEYS` into one canonical list
- New: `frontend/src/data/puzzles.ts` exporting `[{value, label, hotkey?}]`.
- Update `Header.tsx` and `SolveSession.tsx` to consume it. Eliminates the two-place ordering duplication.
- Acceptance: tests green.

### E.19 [S] Drop `recentSessions` and `priorSessions` counts
- File: `frontend/src/utils/recentTrend.ts:8-9, 81-82`.
- Today: returned but never displayed.
- Acceptance: tests updated; consumers unchanged.

### E.20 [S] Clean up stale planning comments
- File: `frontend/src/components/ScramblePreview.tsx:46-47` ("the separate effects in Task 5"). Replace with what the effects actually do.

### E.21 [S] Replace `window` prop name in SolveDetailModal
- File: `frontend/src/components/SolveDetailModal.tsx`.
- Rename the prop to `solveWindow` or `contextSolves`. Removes the global-shadowing footgun.
- Acceptance: tests green.

### E.22 [S] Consolidate `effective`-style computations in tests
- New: `frontend/src/test-utils/makeSolve.ts` exporting `makeSolve(overrides?: Partial<Solve>)`.
- Replace per-test `mk` / `mkSolve` definitions in `averages.test.ts`, `recentTrend.test.ts`, `statsBuckets.test.ts`, `dateRanges.test.ts`, `exportCsv.test.ts`, `SolveDetailModal.test.tsx`.
- Backend equivalent: a `make_solve(**overrides)` fixture in `conftest.py`.
- Acceptance: tests green.

### E.23 [S] Replace dynamic `request` attributes with `flask.g`
- File: `backend/app/routes/solves.py:47, 49, 51`.
- Approach: store `g.user_id` and `g.supabase` instead of monkey-patching `request`. Update read sites.
- Acceptance: tests green.

### E.24 [S] Replace `Header.handleLogout` reload with proper state reset
- File: `frontend/src/components/Header.tsx:65`.
- Approach: rely on `AuthProvider`'s `SIGNED_OUT` handler. If state is not flowing properly, fix that instead of reloading.
- Acceptance: signing out clears UI without a full reload.

---

## Cluster F. Type safety

### F.1 [S] Enable `noUncheckedIndexedAccess`
- File: `frontend/tsconfig.json`.
- Expect a wave of errors on `arr[0]`, `Map.get(...)`. Fix each (most are real latent bugs):
  - `frontend/src/utils/trainerScramble.ts:76` (`pick()` returns `T` for possibly empty array).
  - `frontend/src/components/trainers/TrainerCasePicker.tsx:34, 36` (`Map.get(label)!` becomes safe with a real guard).
- Acceptance: build clean.

### F.2 [S] Validate `JSON.parse(localStorage.getItem(...))` results
- Files: `frontend/src/services/guestStorage.ts:14, 33`, `frontend/src/hooks/useSettings.tsx:40`, `frontend/src/hooks/useScramblePreviewSettings.tsx:36`.
- Approach: parse to `unknown`, then `Array.isArray` / per-field guards. Throw a typed error or fall back to defaults on failure.
- Acceptance: tests covering corrupt-localStorage path pass.

### F.3 [S] Add `isPuzzleType` predicate
- New: in `frontend/src/types/index.ts` or `utils/puzzleIds.ts`.
- Replace the unsafe cast in `frontend/src/pages/Stats.tsx:37` and the union-event-handler casts in `useSolveSession.ts:248-253`.
- Acceptance: invalid `?puzzle=foo` falls back to `DEFAULT_PUZZLE` instead of leaking.

### F.4 [S] Type the TwistyPlayer interface
- File: `frontend/src/components/ScramblePreview.tsx`.
- Approach: declare a local `TwistyPlayer` interface (or use `InstanceType<typeof TwistyPlayer>`); type `playerRef` once. Removes the four `as unknown as ...` casts.
- Acceptance: tests green; no `as unknown` in the file.

### F.5 [S] Centralize duplicated and orphan types
- File: `frontend/src/types/index.ts`.
- Move `PenaltyFlags` (currently in 3 files) to the central types file. Express `PublicSolve` as `Omit<Solve, 'user_id'>`. Move `SolvesPage`, `SolvePayload`, `TrendResult`, `StatsSummary` either here or to colocated types per the audit's recommendation.
- Acceptance: tests green; no duplicate `PenaltyFlags` definition exists.

### F.6 [S] Drop `import React` namespace import where only types are used
- Files: `Auth.tsx:1`, `Timer.tsx:1`, `Header.tsx:1`, `Stats.tsx:1`, `useSolveSession.ts:1`.
- Approach: `import { type FormEvent, type ChangeEvent, ... } from 'react'`.
- Acceptance: build clean.

### F.7 [S] Rework `CaseChoice = 'all' | string`
- File: `frontend/src/components/trainers/TrainerCasePicker.tsx:5`.
- Approach: `type CaseChoice = { kind: 'all' } | { kind: 'id'; id: string }` for real discrimination.
- Acceptance: type narrows properly at use sites.

### F.8 [S] Drop unused `error` field from `useAllSolves`
- File: `frontend/src/hooks/useAllSolves.ts:10`.
- Approach: remove from `UseAllSolvesResult` since no consumer reads it.
- Acceptance: tests green.

### F.9 [S] Type backend public functions
- File: `backend/app/validators.py`, `backend/app/routes/solves.py`.
- Approach: add return type annotations to `validate_create_solve`, `validate_update_solve`, `_parse_positive_int`, `_verify_token`. Use `from __future__ import annotations` to enable PEP 604 union types throughout.
- Replace `Optional[X]` with `X | None`.
- Acceptance: tests green; mypy/pyright clean if configured.

### F.10 [S] Rename `_verify_token` to `_verify_share_token`
- File: `backend/app/routes/solves.py:277`.
- Reason: name clashes conceptually with `verify_token_local` in `auth.py`.
- Acceptance: tests green.

### F.11 [S] Replace `'Bearer '` magic string with constant + `removeprefix`
- File: `backend/app/routes/solves.py:24`.
- Approach: `BEARER = "Bearer "`; `auth_header.removeprefix(BEARER)`.
- Acceptance: tests green.

### F.12 [S] Cache the encoded `SHARE_SECRET` bytes
- File: `backend/app/routes/solves.py` (`_require_share_secret`).
- Approach: hash the secret once at startup; store the encoded bytes in app config. Eliminates re-encode on every sign and verify.
- Acceptance: tests green.

### F.13 [S] Move `SOLVE_LIFETIME_CAP` constant to top of module
- File: `backend/app/routes/solves.py:112`.
- Approach: hoist with the other module-level constants.

---

## Cluster G. Test coverage gaps

Ranked by the QA agent's risk assessment.

### G.1 [L] Tests for AuthContext guest-to-auth migration
- Files: new `frontend/src/contexts/AuthContext.test.tsx`.
- Cover: happy path, partial failure (some 429s), `SIGNED_OUT` arriving mid-migration, double-mount under StrictMode.
- Acceptance: at least 4 cases pass; `migratingRef` semantics covered.

### G.2 [M] Tests for `guestStorage` quota errors and manifest corruption
- Files: new `frontend/src/services/guestStorage.test.ts`.
- Mock `localStorage.setItem` to throw `QuotaExceededError`. Cover write-then-manifest crash partial state.
- Acceptance: `GuestStorageQuotaError` surfaces; manifest is repaired or made derived (see also: switch to deriving manifest from key prefix scan).

### G.3 [M] Tests for `api.migrateSolves` partial-failure partitioning
- Files: extend `frontend/src/services/api.test.ts` (new file).
- Cover: 429 on solve N continues with N+1; returned `{ migrated, failed }` arrays partition correctly.
- Acceptance: tests pass.

### G.4 [M] Expand `useSolveSession` tests
- File: `frontend/src/hooks/useSolveSession.test.tsx`.
- Add: optimistic-update rollback for delete and update; percentile bisect; loadMore cursor flow; median rebuild after delete.
- Acceptance: all five new cases pass.

### G.5 [M] Pure unit tests for `MedianTracker` (BinaryHeap)
- Files: new `frontend/src/hooks/useMedianTracker.test.ts`.
- Cover: push sequences, even/odd-size median, reset followed by re-insertion, large random inputs vs naive median.
- Acceptance: property-based test ideally; otherwise 5+ cases.

### G.6 [M] Tests for `pages/SharedSolve` error and cancel paths
- Files: new `frontend/src/pages/SharedSolve.test.tsx`.
- Cover: API rejects, loading state, cancel-on-unmount, copy clipboard failure path.
- Acceptance: 4 cases pass.

### G.7 [M] Backend tests for `get_solves` with filters and cursor
- File: `backend/tests/test_solves.py`.
- Cover: `puzzle_type` filter; `cursor` filter; combined; deleted-rows excluded.
- Acceptance: 4 new cases pass.

### G.8 [M] Backend tests for PB tie/insert-failure isolation
- File: `backend/tests/test_solves.py`.
- Cover: tie does not insert duplicate PB; PB insert failure does not 500 the solve insert.
- Acceptance: 2 new cases pass.

### G.9 [M] Backend test for PATCH on soft-deleted solve (regression for A.3)
- File: `backend/tests/test_solves.py`.
- Acceptance: covered.

### G.10 [L] One Playwright e2e for the happy path
- New: `e2e/auth-and-solve.spec.ts`.
- Flow: sign up, see migration toast, record a solve, see it on Stats.
- Run weekly in CI against a Supabase preview project.
- Acceptance: spec runs locally and in CI.

### G.11 [M] Test infrastructure improvements
- `frontend/src/test-utils/makeSolve.ts` (covered in E.22).
- `frontend/src/test-utils/renderWithProviders.tsx` wrapping `MemoryRouter`, `AuthProvider`, `SettingsProvider`, `ScramblePreviewSettingsProvider`.
- Backend `conftest.py` `make_solve(**overrides)` fixture.
- Backend `SHARE_SECRET` set via env in `conftest.py` instead of `app.config` patching per test.
- Acceptance: existing tests refactored to use the new helpers.

### G.12 [S] Replace brittle `#timer` selector tests
- File: `frontend/src/components/Timer.test.tsx`.
- Approach: switch to `data-testid="timer-display"` and `data-state` attribute assertions.
- Acceptance: tests still pass; no `not.toContain` against possibly-empty strings.

### G.13 [S] Improve `Stats.test.tsx` from smoke to behavior
- File: `frontend/src/pages/Stats.test.tsx`.
- Approach: assert specific stat values render, not just headings.
- Acceptance: tests fail when stats are wrong.

### G.14 [S] Drop `importlib.import_module` repetition in backend tests
- File: `backend/tests/test_solves.py:27, 42, 55`.
- Approach: hoist to a module-level constant or session-scoped fixture.
- Acceptance: tests still pass.

### G.15 [S] Convert assertion lists to `pytest.mark.parametrize` where appropriate
- File: `backend/tests/test_validators.py`.

### G.16 [S] Optional: introduce MSW for `api.ts` tests
- Lets the real axios layer execute in tests instead of being entirely mocked.
- Effort and benefit are moderate; not urgent.

---

## Cluster H. Architecture

These are larger structural changes; do them after Clusters A through D have settled.

### H.1 [M] Add `/api/v1` prefix
- Files: `backend/app/routes/__init__.py`, `backend/app/__init__.py`, all frontend `api.ts` calls.
- Approach: register the blueprint under `/api/v1`. Update frontend `BASE_URL`.
- Acceptance: all routes respond at `/api/v1/...`; old paths are gone or redirect.

### H.2 [M] Standardize the error envelope
- Files: every `jsonify({"error": ...})` in `backend/app/routes/solves.py`.
- Approach: `{ "error": { "code": "SOLVE_LIMIT_REACHED", "message": "...", "fields": {...} } }`. Distinct codes for cap, rate-limit, validation, auth.
- Frontend: update `api.ts` error handling to read `error.code`.
- Acceptance: error contract documented; tests cover each code.

### H.3 [L] Introduce TanStack Query (or SWR) for solves cache
- Files: `frontend/src/services/api.ts`, `useSolveSession`, `useAllSolves`.
- Today: solves fetched independently per page; no cross-page invalidation.
- Approach: cache solves under a query key; invalidate on create/update/delete.
- Acceptance: creating a solve on the timer page makes it appear on Stats without manual refetch.

### H.4 [L] Wrap the auth provider in a small `AuthClient` interface
- Files: `frontend/src/services/auth.ts`, `frontend/src/contexts/AuthContext.tsx`, `frontend/src/services/api.ts:getAuthHeader`.
- Approach: wrap Supabase JS in `AuthClient { getAccessToken(), onSignIn(cb), signOut() }`. Three-method seam decouples the rest of the app from Supabase SDK.
- Acceptance: replacing the underlying SDK touches only `auth.ts`.

### H.5 [S] Add a top-level error boundary
- File: `frontend/src/App.tsx`.
- Approach: implement `<ErrorBoundary>` (or `react-error-boundary`) wrapping `<Routes>`. Show a "Reload" button and a toast.
- Acceptance: throwing in a child component shows the boundary fallback.

### H.6 [M] Wire Sentry (or equivalent) for error reporting
- Acceptance: a thrown error in dev surfaces in the dashboard.

### H.7 [S] Expand `/api/health` to a real readiness probe at `/api/ready`
- Approach: `/api/ready` does a `SELECT 1` against Supabase and reports JWKS cache freshness.
- Acceptance: returns 503 when DB is unreachable.

### H.8 [S] Move service-role usage into a clearly-named module
- File: `backend/app/db.py`. Move `get_supabase_service_client` into `backend/app/dangerous_admin.py` with a docstring contract: "Bypasses RLS. Only call with explicit, audited authorization."
- Acceptance: only the share-link route imports it.

### H.9 [M] Document the guest-vs-auth feature matrix
- New: `docs/guest-mode.md`.
- Cover: which features differ (PB materialization, lifetime cap, pagination behaviour). Long-term: consider treating guests as anonymous Supabase users so a single code path serves both.

### H.10 [S] Decide on a backend host
- File: `backend/README.md` (and possibly a `Dockerfile` / `Procfile`).
- Approach: pick Render/Fly/Railway; document the proxy assumption (`ProxyFix(x_for=1)`).
- Acceptance: README documents how to deploy.

### H.11 [M] Add a migration runner
- Files: pick `supabase db push` or `yoyo-migrations`. Add a `schema_migrations` table.
- Acceptance: new migrations apply via a single command; rollbacks possible.

### H.12 [S] Add `metadata jsonb default '{}'` to `solves` for forward-compat
- New migration `010_solves_metadata.sql`.
- Acceptance: future enrichment fields can be added without a migration.

### H.13 [S] Mount `Auth` at `/login` instead of as a router-bypass
- Bundles E.13.

---

## Cluster I. Documentation and ops polish

### I.1 [S] Update `README.md`
- Fix: "last 10 solves" -> 12; Jest -> Vitest; remove `python-jose` reference.
- Update tech stack table to reflect PyJWT, JWKS, share links, lifetime cap.

### I.2 [S] Update `frontend/README.md` Component Overview
- Add: Trainers, Stats, SharedSolve, ScramblePreview. Fix the auth services list.

### I.3 [S] Update `backend/README.md`
- Fix: PyJWT not python-jose; min Python version (venv shows 3.14).

### I.4 [S] Document `SHARE_SECRET` rotation procedure
- New section in `docs/`: rotating breaks all existing share links; explain mitigation (issue grace period, dual-key support).

### I.5 [S] Document JWT verification fast/slow paths
- New section in `docs/`: when each fires, how to observe fallback rate.

### I.6 [S] Configure structured (JSON) logging
- File: `backend/app/__init__.py`.
- Approach: `logging.dictConfig` with JSON formatter; attach `request.user_id` and `request.id` via `before_request`.

### I.7 [S] Add `aria-modal` and focus trap to dialogs
- Files: `SolveDetailModal.tsx`, `HotkeyHelp.tsx`.
- Approach: `aria-modal="true"`, focus first interactive on open, return focus on close. Use a focus-trap library or hand-roll.

### I.8 [S] Replace index-as-key in trainer lists
- Files: `TrainerRecentStrip.tsx:31`, `TrainerCasePicker.tsx:91`.
- Approach: use `${time}-${createdAt}` or a generated id.

### I.9 [S] Fix `Stats.tsx` URLSearchParams mutation
- File: `frontend/src/pages/Stats.tsx:73`.
- Approach: build a new `URLSearchParams(prev)` instead of mutating in place.

### I.10 [S] Replace `alert()` in Auth with toasts
- Bundles E.13.

### I.11 [S] Compute "10,000 solves" text from constants
- File: `frontend/src/pages/Stats.tsx:108`.
- Approach: derive from `MAX_PAGES * PAGE_SIZE` instead of hardcoding.

### I.12 [S] Kill duplicated unicode escapes
- File: `Header.tsx` (gear glyph).
- Approach: use the raw character like the rest of the app.

### I.13 [S] Tag `loading` state with `aria-busy`
- Trivial polish.

---

## Suggested execution order (weeks)

- **Week 1:** Cluster 0 (CI), then Cluster A (critical bugs).
- **Week 2:** Cluster B (security) and Cluster D (DB integrity), in parallel branches.
- **Week 3:** Cluster C (perf) and start Cluster F (types).
- **Week 4:** Cluster E (refactors) in small batches per file, with tests added from G as you go.
- **Beyond:** Cluster H (architecture) and Cluster I (docs/ops) interleaved with feature work.

Each cluster's items are independent enough that they can ship as separate PRs. Dependencies worth noting:
- A.1 should bundle E.13 (Auth refactor).
- A.2 will be effectively obsolete once D.4 lands (counter-table replaces count query); land A.2 first as a quick fix.
- A.7 (share-link expiry) is the only A item with non-trivial design. Pick option 1 or 2 before starting.
- B.10 (per-user rate limit) requires reordering decorators; do not bundle into a tiny PR.

---

## Status tracker

Use the IDs (A.1, B.3, etc.) when committing. Suggested branch naming: `audit/A1-auth-reset`, `audit/D2-pb-time-index`, etc.

Each agent that produced findings is still alive and can be re-engaged for depth via SendMessage:

- backend-developer: `aaf41825b8bafc092`
- python-pro: `a9ea106035f82ffc0`
- security-auditor: `aff944373ddb5b2ae`
- react-specialist: `aac787cce054c1a47`
- typescript-pro: `aad49c5ab28969287`
- refactoring-specialist: `a29c2aba8bbd56c5c`
- database-optimizer: `a27265b4200e55664`
- architect-reviewer: `a2ca1be3d51f3fcbf`
- qa-expert: `a2cbade7ab4657113`
- code-reviewer: `a1cb9e3ba0fc58b40`
