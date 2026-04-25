# Audit Cluster 0 + A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a CI baseline, then fix the nine critical correctness bugs surfaced by the 2026-04-25 full-stack audit (Cluster 0 + Cluster A in `refactor_audit_plan.md`).

**Architecture:** Each item ships as its own commit (and ideally its own PR) so that any single fix can be reverted independently. Backend changes use the existing Flask + FakeSupabase test pattern in `backend/tests/`. Frontend changes use the existing Vitest + RTL pattern in `frontend/src/**/*.test.{ts,tsx}`. One new SQL migration is added (DELETE policy on `personal_bests`).

**Tech Stack:** Python 3.11+ / Flask 3.1 / pytest. React 18 / TypeScript / Vitest / React Testing Library. Supabase Postgres + RLS. GitHub Actions for CI.

---

## Decisions to make before starting

### D1. A.4 — production data audit
Before changing the puzzle-type vocabulary, run this query in the Supabase SQL editor:

```sql
SELECT puzzle_type, count(*) FROM solves GROUP BY puzzle_type ORDER BY 2 DESC;
```

If any rows have `puzzle_type IN ('minx', '333bf', '333oh', '444bf', '555bf')`, Task A.4 must include a one-shot rename migration. **Action:** record the result here before starting Task A.4.

| puzzle_type | count |
|---|---|
| (fill in) | (fill in) |

### D2. A.4 — drop unused puzzle types?
Backend's `VALID_PUZZLE_TYPES` includes `'333bf', '333oh', '444bf', '555bf'` that the frontend cannot pick. Decision: **drop them** (current plan). If they are roadmap, change the plan. Default: drop.

### D3. A.7 — share-link expiry strategy
Two options from the audit. **Default for this plan: Option 1 (signed `iat`/`exp`, no DB).** Reasons:
- No new table, no migration coordination, no UI for revocation.
- Caps blast radius from "forever" to a configurable window (default: 30 days).
- Option 2 (DB allowlist + revocation) can be added later as a feature on top, without throwing away the new token format.

**If the user wants Option 2 instead, stop after Task A.7 step 1 and switch.**

### D4. A.7 — token format
Chosen format (Option 1):
```
b64url(solve_id) "." b64url(iat_int_be8) "." b64url(exp_int_be8) "." b64url(MAC)
```
Where `MAC = HMAC-SHA256(SHARE_SECRET, solve_id || ":" || iat || ":" || exp)[:16]`. 8-byte big-endian unix seconds. Backwards-incompatible with current 2-segment tokens; existing share links will return 404 after deploy. Communicate this to users (or accept it; the feature is new).

---

## File Structure

**Created:**
- `.github/workflows/ci.yml` (Task 0.2)
- `backend/migrations/005_personal_bests_delete_policy.sql` (Task A.9)

**Modified:**
- `backend/app/routes/solves.py` (Tasks A.2, A.3, A.5, A.6, A.7)
- `backend/app/validators.py` (Tasks A.4, A.6)
- `backend/tests/test_solves.py` (Tasks A.2, A.3, A.5, A.6, A.7)
- `backend/tests/test_validators.py` (Task A.6)
- `frontend/src/components/Auth.tsx` (Task A.1)
- `frontend/src/hooks/useMedianTracker.ts` (Task A.8)
- `frontend/src/hooks/useMedianTracker.test.ts` (new file, Task A.8)
- `frontend/src/types/index.ts` (Task A.4)
- `frontend/src/utils/puzzleIds.ts` (Task A.4 — verify only)
- `frontend/src/components/Header.tsx` (Task A.4 — verify only)
- `frontend/src/components/SolveSession.tsx` (Task A.4 — verify only)
- `TODO_manual_edits.md` (Task A.9 — append migration step)

---

## Task 0.1: Verify green baseline

**Files:** none (verification only)

- [ ] **Step 1: Run backend tests**

  ```bash
  cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend"
  pytest -q
  ```
  Expected: PASS. If anything is RED, stop and fix before proceeding.

- [ ] **Step 2: Run frontend tests and type-check**

  ```bash
  cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend"
  npx vitest run --reporter=dot
  npx tsc --noEmit
  ```
  Expected: PASS for both. If RED, stop and fix.

- [ ] **Step 3: Note current commit**

  ```bash
  cd "/Users/sia/Desktop/Coding Projects.nosync/ao5"
  git log -1 --format="%H %s"
  ```
  Record the SHA so we can compare diffs later. No commit needed.

---

## Task 0.2: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow file**

  ```yaml
  name: CI

  on:
    pull_request:
    push:
      branches: [main]

  jobs:
    backend:
      runs-on: ubuntu-latest
      defaults:
        run:
          working-directory: backend
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-python@v5
          with:
            python-version: "3.11"
            cache: pip
            cache-dependency-path: backend/requirements.txt
        - run: pip install -r requirements.txt
        - run: pytest -q

    frontend:
      runs-on: ubuntu-latest
      defaults:
        run:
          working-directory: frontend
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: "20"
            cache: npm
            cache-dependency-path: frontend/package-lock.json
        - run: npm ci
        - run: npx tsc --noEmit
        - run: npx vitest run --reporter=dot
  ```

- [ ] **Step 2: Verify the YAML parses**

  ```bash
  python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
  ```
  Expected: no output, no error.

- [ ] **Step 3: Commit**

  ```bash
  git add .github/workflows/ci.yml
  git commit -m "ci: add github actions workflow for backend and frontend"
  ```

- [ ] **Step 4: Push and verify**

  Push the branch. Open a PR (or push to main if working directly there). Confirm both jobs go green in the Actions tab. If RED, debug before proceeding to Cluster A.

---

## Task A.2: Fix off-by-one in lifetime solve cap

**Files:**
- Modify: `backend/app/routes/solves.py:138`
- Test: `backend/tests/test_solves.py`

- [ ] **Step 1: Write the failing test**

  Append to `backend/tests/test_solves.py`:

  ```python
  def test_create_solve_rejects_when_at_lifetime_cap(fake_supabase_factory, client, auth_headers):
      from app.routes.solves import SOLVE_LIFETIME_CAP
      fake_supabase_factory(scripts={
          "solves": [{"data": [], "count": SOLVE_LIFETIME_CAP}],
      })
      r = client.post(
          "/api/solves",
          headers=auth_headers,
          json={"puzzle_type": "333", "time": 12.34, "scramble": ""},
      )
      assert r.status_code == 429
      assert "limit" in r.get_json()["error"].lower()


  def test_create_solve_allows_one_under_cap(fake_supabase_factory, client, auth_headers):
      from app.routes.solves import SOLVE_LIFETIME_CAP
      fake_supabase_factory(scripts={
          "solves": [
              {"data": [], "count": SOLVE_LIFETIME_CAP - 1},
              {"data": [{
                  "id": "s1", "time": 12.34, "puzzle_type": "333",
                  "scramble": "", "dnf": False, "plus_two": False,
                  "created_at": "2026-04-25T00:00:00Z",
              }]},
          ],
      })
      r = client.post(
          "/api/solves",
          headers=auth_headers,
          json={"puzzle_type": "333", "time": 12.34, "scramble": "", "dnf": True},
      )
      assert r.status_code == 200
  ```

- [ ] **Step 2: Run the new test, expect FAIL**

  ```bash
  cd backend && pytest tests/test_solves.py::test_create_solve_rejects_when_at_lifetime_cap -v
  ```
  Expected: FAIL (current code uses `>`, so 100,000 passes through and the response is 200, not 429).

- [ ] **Step 3: Apply the fix**

  In `backend/app/routes/solves.py:138`, change:
  ```python
  if existing > SOLVE_LIFETIME_CAP:
  ```
  to:
  ```python
  if existing >= SOLVE_LIFETIME_CAP:
  ```

- [ ] **Step 4: Re-run both new tests, expect PASS**

  ```bash
  cd backend && pytest tests/test_solves.py -k "lifetime_cap or one_under_cap" -v
  ```
  Expected: both PASS.

- [ ] **Step 5: Run the full backend suite**

  ```bash
  cd backend && pytest -q
  ```
  Expected: all green.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/app/routes/solves.py backend/tests/test_solves.py
  git commit -m "fix(backend-solves): close off-by-one on 100k lifetime cap"
  ```

---

## Task A.3 + A.6: Block PATCH on soft-deleted solves and reject empty PATCH bodies

These two are bundled because they touch the same handler and the same test file, and a regression in either would re-open the same probe surface.

**Files:**
- Modify: `backend/app/routes/solves.py:195-217`
- Modify: `backend/app/validators.py:44-57`
- Test: `backend/tests/test_solves.py`, `backend/tests/test_validators.py`

- [ ] **Step 1: Write the failing tests**

  Append to `backend/tests/test_solves.py`:

  ```python
  def test_patch_returns_404_for_soft_deleted_solve(fake_supabase_factory, client, auth_headers):
      # Soft-deleted rows should not be reachable via PATCH.
      fake_supabase_factory(scripts={
          "solves": [{"data": []}],  # filter excludes soft-deleted, so empty
      })
      r = client.patch(
          "/api/solves/abc-123",
          headers=auth_headers,
          json={"dnf": True},
      )
      assert r.status_code == 404


  def test_patch_rejects_empty_allowed_body(fake_supabase_factory, client, auth_headers):
      # Body with no recognized fields should 400 before hitting Supabase.
      fake_supabase_factory()
      r = client.patch(
          "/api/solves/abc-123",
          headers=auth_headers,
          json={"time": 999},
      )
      assert r.status_code == 422
      assert "fields" in r.get_json()
  ```

  Append to `backend/tests/test_validators.py`:

  ```python
  def test_update_requires_at_least_one_known_field():
      from app.validators import validate_update_solve
      assert validate_update_solve({"time": 999}) == {
          "body": "must include dnf or plus_two"
      }


  def test_update_accepts_dnf_only():
      from app.validators import validate_update_solve
      assert validate_update_solve({"dnf": True}) is None


  def test_update_accepts_plus_two_only():
      from app.validators import validate_update_solve
      assert validate_update_solve({"plus_two": True}) is None
  ```

- [ ] **Step 2: Run the new tests, expect FAIL**

  ```bash
  cd backend && pytest tests/test_solves.py::test_patch_returns_404_for_soft_deleted_solve tests/test_solves.py::test_patch_rejects_empty_allowed_body tests/test_validators.py -k "update_requires or update_accepts" -v
  ```
  Expected: 3 FAIL, 2 PASS (the "accepts" ones may already pass — verify both fail/pass states match expectations).

- [ ] **Step 3: Apply the validator fix**

  In `backend/app/validators.py`, replace `validate_update_solve` with:

  ```python
  def validate_update_solve(data):
      """Validate PATCH /solves/<id> payload. Returns dict of field errors or None."""
      if not data:
          return {"body": "Request body is required"}

      if not any(k in data for k in ('dnf', 'plus_two')):
          return {"body": "must include dnf or plus_two"}

      errors = {}

      if 'dnf' in data and not isinstance(data['dnf'], bool):
          errors['dnf'] = "Must be a boolean"

      if 'plus_two' in data and not isinstance(data['plus_two'], bool):
          errors['plus_two'] = "Must be a boolean"

      return errors if errors else None
  ```

- [ ] **Step 4: Apply the soft-delete filter on PATCH**

  In `backend/app/routes/solves.py:207-211`, change the query chain from:

  ```python
      result = (request.supabase.table('solves')
                .update(allowed)
                .eq('id', solve_id)
                .eq('user_id', request.user_id)
                .execute())
  ```

  to:

  ```python
      result = (request.supabase.table('solves')
                .update(allowed)
                .eq('id', solve_id)
                .eq('user_id', request.user_id)
                .is_('deleted_at', None)
                .execute())
  ```

- [ ] **Step 5: Re-run the new tests, expect PASS**

  ```bash
  cd backend && pytest tests/test_solves.py::test_patch_returns_404_for_soft_deleted_solve tests/test_solves.py::test_patch_rejects_empty_allowed_body tests/test_validators.py -v
  ```
  Expected: all PASS.

- [ ] **Step 6: Run the full backend suite**

  ```bash
  cd backend && pytest -q
  ```
  Expected: all green. If existing PATCH tests fail because they sent only `{"time": ...}`, update them to send a real payload.

- [ ] **Step 7: Commit**

  ```bash
  git add backend/app/routes/solves.py backend/app/validators.py backend/tests/test_solves.py backend/tests/test_validators.py
  git commit -m "fix(backend-solves): require known field on PATCH and exclude soft-deleted rows"
  ```

---

## Task A.5: Add rate limits to PATCH and DELETE

**Files:**
- Modify: `backend/app/routes/solves.py:195` and `:220`

- [ ] **Step 1: Apply the decorator**

  In `backend/app/routes/solves.py`, add the limiter decorator to both routes. Decorator order matters: `@solves.route` outermost, then auth, then limiter (matches the existing pattern at line 119-121).

  At line 195:
  ```python
  @solves.route('/solves/<solve_id>', methods=['PATCH'])
  @require_auth
  @limiter.limit("60 per minute")
  def update_solve(solve_id):
  ```

  At line 220:
  ```python
  @solves.route('/solves/<solve_id>', methods=['DELETE'])
  @require_auth
  @limiter.limit("60 per minute")
  def delete_solve(solve_id):
  ```

- [ ] **Step 2: Run the full backend suite**

  ```bash
  cd backend && pytest -q
  ```
  Expected: all green. The `app` fixture in `conftest.py:111` disables the limiter in tests, so existing tests are unaffected.

- [ ] **Step 3: Manual smoke test against a running app (optional but recommended)**

  In one terminal:
  ```bash
  cd backend && flask --app run.py run --port 5000
  ```
  In another:
  ```bash
  for i in $(seq 1 70); do curl -s -o /dev/null -w "%{http_code}\n" -X PATCH http://127.0.0.1:5000/api/solves/x -H "Authorization: Bearer fake" -H "Content-Type: application/json" -d '{"dnf":true}'; done | sort | uniq -c
  ```
  Expected: a mix of 401 (unauthenticated, since fake token) and eventually 429 once the bucket drains. The point is the 429 appears.

- [ ] **Step 4: Commit**

  ```bash
  git add backend/app/routes/solves.py
  git commit -m "feat(backend-solves): add 60/min rate limits to PATCH and DELETE"
  ```

---

## Task A.9: Add DELETE RLS policy on personal_bests

**Files:**
- Create: `backend/migrations/005_personal_bests_delete_policy.sql`
- Modify: `TODO_manual_edits.md` (record the manual apply step)

This task involves a SQL change applied directly to Supabase via the dashboard. There is no automated migration runner today (see Cluster H.11).

- [ ] **Step 1: Write the migration file**

  Create `backend/migrations/005_personal_bests_delete_policy.sql`:

  ```sql
  -- Migration 005: Add DELETE and UPDATE RLS policies on personal_bests.
  --
  -- Phase 2 added a soft-delete cleanup in delete_solve() that runs
  -- DELETE on personal_bests via the user-scoped Supabase client. With no
  -- DELETE policy, RLS silently blocks the operation (PostgREST returns
  -- "0 rows" without raising), leaving orphan PB rows whenever a
  -- PB-holding solve is deleted.
  --
  -- The UPDATE policy is added now as defense-in-depth so future code
  -- that updates PBs does not hit the same silent-failure trap.

  CREATE POLICY "Users can delete own personal bests"
      ON personal_bests
      FOR DELETE
      USING (auth.uid() = user_id);

  CREATE POLICY "Users can update own personal bests"
      ON personal_bests
      FOR UPDATE
      USING (auth.uid() = user_id);
  ```

- [ ] **Step 2: Apply the migration in the Supabase dashboard**

  In the Supabase project SQL editor, paste the contents of the new migration and run it. Confirm no error. Then run:

  ```sql
  SELECT polname FROM pg_policy
  WHERE polrelid = 'public.personal_bests'::regclass
  ORDER BY polname;
  ```

  Expected: at least four policies including the two new ones.

- [ ] **Step 3: Verify the cleanup works end-to-end**

  Sign in to the app as a real test user. Record a fast solve to create a PB (verify a row appears in `personal_bests`). Delete that solve from the UI. Confirm via SQL:

  ```sql
  SELECT count(*) FROM personal_bests WHERE solve_id = '<the deleted solve id>';
  ```
  Expected: 0. Before this fix the count would have been 1.

- [ ] **Step 4: Update TODO_manual_edits.md**

  Append a new section noting that migration 005 was applied on 2026-04-25 (or whatever date). Use the format already used in that file. This keeps the manual-step log current.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/migrations/005_personal_bests_delete_policy.sql TODO_manual_edits.md
  git commit -m "feat(db): add DELETE and UPDATE RLS policies on personal_bests"
  ```

---

## Task A.8: Memoize useMedianTracker return value

**Files:**
- Modify: `frontend/src/hooks/useMedianTracker.ts:123`
- Test: `frontend/src/hooks/useMedianTracker.test.ts` (new file)

- [ ] **Step 1: Write the failing test**

  Create `frontend/src/hooks/useMedianTracker.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { renderHook } from '@testing-library/react';
  import useMedianTracker from './useMedianTracker';

  describe('useMedianTracker', () => {
    it('returns a stable identity across re-renders', () => {
      const { result, rerender } = renderHook(() => useMedianTracker());
      const first = result.current;
      rerender();
      const second = result.current;
      expect(second).toBe(first);
    });

    it('computes median correctly across pushes', () => {
      const { result } = renderHook(() => useMedianTracker());
      expect(result.current.getMedian()).toBeNull();
      result.current.push(5);
      expect(result.current.getMedian()).toBe(5);
      result.current.push(1);
      expect(result.current.getMedian()).toBe(3);
      result.current.push(3);
      expect(result.current.getMedian()).toBe(3);
      result.current.push(9);
      expect(result.current.getMedian()).toBe(4);
    });

    it('reset clears state', () => {
      const { result } = renderHook(() => useMedianTracker());
      result.current.push(1);
      result.current.push(2);
      result.current.reset();
      expect(result.current.getMedian()).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run, expect the identity test to FAIL**

  ```bash
  cd frontend && npx vitest run src/hooks/useMedianTracker.test.ts
  ```
  Expected: "returns a stable identity across re-renders" FAILS, the other two PASS. (Today the hook returns a fresh object each render.)

- [ ] **Step 3: Apply the fix**

  In `frontend/src/hooks/useMedianTracker.ts`, add `useMemo` to the imports and wrap the return:

  Change line 1:
  ```typescript
  import { useCallback, useMemo, useRef } from 'react';
  ```

  Change lines 121-123 (replace the final `getSize` and `return` block) with:
  ```typescript
    const getSize = useCallback((): number => lo.current.size + hi.current.size, []);

    return useMemo(
      () => ({ push, getMedian, reset, getSize }),
      [push, getMedian, reset, getSize],
    );
  ```

- [ ] **Step 4: Re-run the test, expect PASS**

  ```bash
  cd frontend && npx vitest run src/hooks/useMedianTracker.test.ts
  ```
  Expected: all 3 PASS.

- [ ] **Step 5: Run the full frontend suite and type-check**

  ```bash
  cd frontend && npx vitest run --reporter=dot && npx tsc --noEmit
  ```
  Expected: all green. If any consuming hook (e.g. `useSolveSession`) had a test that depended on the unstable identity (unlikely but possible), update it.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/hooks/useMedianTracker.ts frontend/src/hooks/useMedianTracker.test.ts
  git commit -m "fix(frontend-hooks): stabilize useMedianTracker return identity"
  ```

---

## Task A.1: Implement password reset (and stop pretending it works)

**Files:**
- Modify: `frontend/src/components/Auth.tsx:33-35`

This task does not bundle the larger E.13 refactor; it just plugs the missing API call.

- [ ] **Step 1: Apply the fix**

  In `frontend/src/components/Auth.tsx`, replace the `'reset'` branch (currently lines 33-35):

  ```typescript
        } else if (mode === 'reset') {
          alert('Check your email for the password reset link!');
          setMode('login');
        }
  ```

  with:

  ```typescript
        } else if (mode === 'reset') {
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
          });
          if (error) throw error;
          toast.success('Check your email for the password reset link.');
          setMode('login');
        }
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: clean.

- [ ] **Step 3: Run the frontend suite**

  ```bash
  cd frontend && npx vitest run --reporter=dot
  ```
  Expected: all green. There is no existing test for this path; manual verification covers it.

- [ ] **Step 4: Manual verification**

  Run the dev server (`npm run dev` in `frontend/`). Click "Forgot your password?" Submit a real email. Confirm a reset email arrives. Confirm bad input (e.g. malformed email) shows a `toast.error`.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/components/Auth.tsx
  git commit -m "fix(frontend-auth): actually send the password reset email"
  ```

---

## Task A.4: Reconcile cross-stack puzzle-type vocabulary

This task is split into 4 sub-steps because it touches both stacks plus the database. **Do not start until decisions D1 and D2 are recorded.**

**Files:**
- Modify: `backend/app/validators.py:1-5`
- Modify: `frontend/src/types/index.ts:1-12`
- Verify (no edit expected): `frontend/src/utils/puzzleIds.ts`, `frontend/src/components/Header.tsx`, `frontend/src/components/SolveSession.tsx`
- Possibly create: a one-shot SQL rename if D1 found `'minx'` rows.

- [ ] **Step 1: Update the backend validator**

  In `backend/app/validators.py:1-5`, replace `VALID_PUZZLE_TYPES` with the canonical app-internal list. Drop `'333bf', '333oh', '444bf', '555bf'` per D2. Replace `'minx'` with `'mega'` per D1 (the frontend already uses `'mega'`):

  ```python
  VALID_PUZZLE_TYPES = {
      '333', '222', '444', '555', '666', '777',
      'clock', 'mega', 'pyram', 'skewb', 'sq1',
  }
  ```

- [ ] **Step 2: Verify the frontend already aligns**

  Read `frontend/src/types/index.ts:1-12`, `frontend/src/utils/puzzleIds.ts`, `frontend/src/components/Header.tsx`, `frontend/src/components/SolveSession.tsx`. Confirm the frontend `PuzzleType` union matches the new backend set exactly. The frontend is the source of truth for "what users can pick"; the backend enforces it.

  If the frontend has any extra entries (e.g. a stray `'minx'`), remove them. If it has no `'mega'` already, add it. Expected: frontend already declares `'mega'` per the audit, so likely no edit is needed here. Record any deltas in this checkbox before checking it off.

- [ ] **Step 3: Run the data rename if D1 found offending rows**

  Only do this step if D1's audit query showed any `puzzle_type` values that the new validator rejects (most likely `'minx'`). In the Supabase SQL editor:

  ```sql
  BEGIN;
  UPDATE solves SET puzzle_type = 'mega' WHERE puzzle_type = 'minx';
  UPDATE personal_bests SET puzzle_type = 'mega' WHERE puzzle_type = 'minx';
  -- Repeat for any other dropped values, mapping to nearest valid type.
  COMMIT;
  ```

  Verify with the same audit query from D1 that all `puzzle_type` values are in the new whitelist. Record the row counts touched in `TODO_manual_edits.md`.

- [ ] **Step 4: Add a backend test that asserts the validator accepts 'mega'**

  Append to `backend/tests/test_validators.py`:

  ```python
  def test_create_accepts_mega():
      from app.validators import validate_create_solve
      assert validate_create_solve({
          "puzzle_type": "mega",
          "time": 60.0,
          "scramble": "",
      }) is None


  def test_create_rejects_minx():
      from app.validators import validate_create_solve
      result = validate_create_solve({
          "puzzle_type": "minx",
          "time": 60.0,
          "scramble": "",
      })
      assert result is not None and "puzzle_type" in result
  ```

- [ ] **Step 5: Run both suites**

  ```bash
  cd backend && pytest -q
  cd ../frontend && npx tsc --noEmit && npx vitest run --reporter=dot
  ```
  Expected: all green.

- [ ] **Step 6: Manual smoke test**

  Run frontend + backend dev servers. Sign in. Pick Megaminx. Record a solve. Confirm 200, not 422. Confirm it appears in the log and on Stats.

- [ ] **Step 7: Commit**

  ```bash
  git add backend/app/validators.py backend/tests/test_validators.py
  # Add frontend/types only if Step 2 found a delta
  git commit -m "fix(backend-validators): align puzzle-type vocabulary with frontend"
  ```

  If Step 3 ran a data rename, also commit a note to `TODO_manual_edits.md`:
  ```bash
  git add TODO_manual_edits.md
  git commit -m "docs(manual-edits): record minx-to-mega data rename"
  ```

---

## Task A.7: Make share-link tokens expirable

**This is the largest task in the cluster.** Allow ~half a day. Confirm decisions D3 (Option 1) and D4 (token format) before starting.

**Files:**
- Modify: `backend/app/routes/solves.py:256-329`
- Test: `backend/tests/test_solves.py`
- Modify: `backend/app/__init__.py` (add SHARE_SECRET length check, also covered by B.4 later)

- [ ] **Step 1: Add a constant for token TTL**

  In `backend/app/routes/solves.py`, near the existing `SOLVE_LIFETIME_CAP` constant at line 112:

  ```python
  SHARE_TOKEN_TTL_SECONDS = 30 * 24 * 3600  # 30 days
  MAC_LENGTH = 16  # truncated SHA-256 output, 128-bit MAC
  ```

  Replace existing `[:16]` slices in `_sign_solve_id` and `_verify_token` with `MAC_LENGTH`.

- [ ] **Step 2: Write the failing tests**

  Append to `backend/tests/test_solves.py`. Note: the existing share tests set `app.config["SHARE_SECRET"]` per test; mirror that pattern.

  ```python
  def test_share_token_has_four_segments(app, fake_supabase_factory, client, auth_headers):
      app.config["SHARE_SECRET"] = "x" * 32
      fake_supabase_factory(scripts={
          "solves": [{"data": [{"id": "abc-123"}]}],
      })
      r = client.get("/api/solves/abc-123/share-token", headers=auth_headers)
      assert r.status_code == 200
      token = r.get_json()["token"]
      # New token format: id . iat . exp . mac
      assert token.count(".") == 3


  def test_share_token_expired_returns_404(app, monkeypatch, fake_service_supabase_factory, client):
      from app.routes.solves import _sign_solve_id
      app.config["SHARE_SECRET"] = "x" * 32
      # Sign a token, then jump the clock past the TTL
      import app.routes.solves as solves_module
      real_now = solves_module._now_seconds
      monkeypatch.setattr(solves_module, "_now_seconds", lambda: real_now() - solves_module.SHARE_TOKEN_TTL_SECONDS - 1)
      token = _sign_solve_id("abc-123")
      monkeypatch.setattr(solves_module, "_now_seconds", real_now)
      fake_service_supabase_factory(scripts={"solves": [{"data": [{"id": "abc-123"}]}]})
      r = client.get(f"/api/solves/share/{token}")
      assert r.status_code == 404


  def test_share_token_tampered_mac_returns_404(app, fake_service_supabase_factory, client):
      from app.routes.solves import _sign_solve_id
      app.config["SHARE_SECRET"] = "x" * 32
      token = _sign_solve_id("abc-123")
      # Flip the last char of the MAC segment
      parts = token.split(".")
      parts[-1] = parts[-1][:-1] + ("A" if parts[-1][-1] != "A" else "B")
      bad_token = ".".join(parts)
      r = client.get(f"/api/solves/share/{bad_token}")
      assert r.status_code == 404
  ```

  Also: any existing share-token test that asserts on the wire format will break because token format changed from 2 segments to 4. Search `backend/tests/test_solves.py` for `count(".")` and `split(".")` and update the expected counts accordingly. If a test asserts the exact token string (unlikely), regenerate the expected value.

- [ ] **Step 3: Run, expect FAIL**

  ```bash
  cd backend && pytest tests/test_solves.py -k "share_token" -v
  ```
  Expected: the new tests FAIL because the format change has not landed yet. Existing share tests probably FAIL too (format change).

- [ ] **Step 4: Update the token signing and verification**

  In `backend/app/routes/solves.py`, replace `_sign_solve_id` and `_verify_token` (current lines 272-287):

  ```python
  def _now_seconds() -> int:
      return int(datetime.now(timezone.utc).timestamp())


  def _pack_int(n: int) -> bytes:
      return n.to_bytes(8, "big", signed=False)


  def _unpack_int(b: bytes) -> int:
      if len(b) != 8:
          raise ValueError("expected 8 bytes")
      return int.from_bytes(b, "big", signed=False)


  def _sign_solve_id(solve_id: str) -> str:
      iat = _now_seconds()
      exp = iat + SHARE_TOKEN_TTL_SECONDS
      msg = f"{solve_id}:{iat}:{exp}".encode()
      mac = hmac.new(_require_share_secret(), msg, hashlib.sha256).digest()[:MAC_LENGTH]
      return ".".join((
          _b64url(solve_id.encode()),
          _b64url(_pack_int(iat)),
          _b64url(_pack_int(exp)),
          _b64url(mac),
      ))


  def _verify_token(token: str):
      try:
          id_part, iat_part, exp_part, mac_part = token.split(".", 3)
          solve_id = _b64url_decode(id_part).decode("utf-8")
          iat = _unpack_int(_b64url_decode(iat_part))
          exp = _unpack_int(_b64url_decode(exp_part))
          provided_mac = _b64url_decode(mac_part)
      except (ValueError, UnicodeDecodeError):
          return None

      msg = f"{solve_id}:{iat}:{exp}".encode()
      expected_mac = hmac.new(_require_share_secret(), msg, hashlib.sha256).digest()[:MAC_LENGTH]
      if not hmac.compare_digest(provided_mac, expected_mac):
          return None
      if _now_seconds() > exp:
          return None
      return solve_id
  ```

  This requires `from datetime import datetime, timezone` already imported (it is, used by `delete_solve`).

- [ ] **Step 5: Add SHARE_SECRET length validation at startup**

  In `backend/app/__init__.py`, inside `create_app` before `limiter.init_app(app)`, add:

  ```python
      share_secret = os.environ.get("SHARE_SECRET", "")
      if app.config.get("TESTING") is not True and len(share_secret) < 32:
          raise RuntimeError(
              "SHARE_SECRET must be set and at least 32 characters in production"
          )
      app.config["SHARE_SECRET"] = share_secret
  ```

  (The `TESTING` escape hatch lets the existing tests opt out by setting `app.config["SHARE_SECRET"]` directly, as they already do.)

- [ ] **Step 6: Run the new tests, expect PASS**

  ```bash
  cd backend && pytest tests/test_solves.py -k "share" -v
  ```
  Expected: all PASS.

- [ ] **Step 7: Run the full backend suite**

  ```bash
  cd backend && pytest -q
  ```
  Expected: all green. If anything else fails (e.g. test that asserted the old 2-segment format), update it.

- [ ] **Step 8: Communicate the breaking change**

  In `TODO_manual_edits.md`, add a note that all existing share links are invalidated by this deploy. If users have shared links externally, they must regenerate.

- [ ] **Step 9: Commit**

  ```bash
  git add backend/app/routes/solves.py backend/app/__init__.py backend/tests/test_solves.py TODO_manual_edits.md
  git commit -m "feat(backend-solves): expire share-link tokens after 30 days"
  ```

---

## Wrap-up

- [ ] **Step 1: Run both full suites once more**

  ```bash
  cd backend && pytest -q
  cd ../frontend && npx vitest run --reporter=dot && npx tsc --noEmit
  ```

- [ ] **Step 2: Verify CI is green**

  Push and confirm the CI workflow added in Task 0.2 is green for the final commit.

- [ ] **Step 3: Update refactor_audit_plan.md**

  Mark each completed item in the master plan with a check (or a "shipped 2026-04-25" note) so the next session has a fresh starting point.

- [ ] **Step 4: Optional — open a single tracking PR**

  If you have been working on a branch, open the PR. PR description should list the 9 items shipped (Task IDs A.1 through A.9). One reviewer can scan the diff range per item via the per-task commits.

---

## Items intentionally deferred

These were called out in the audit but pushed to later clusters:

- **B.4 full startup config validation** for all four env vars: only `SHARE_SECRET` is checked in this plan (because A.7 needs it). The full check belongs in Cluster B.
- **D.4 atomic counter table** would obsolete A.2's count-then-insert pattern, but is half-day work with a backfill. A.2 ships as the cheap fix.
- **E.13 Auth.tsx mode-config refactor** is the larger restructure; A.1 fixes the bug without it.
- **G.10 Playwright e2e** for the auth flow is mentioned but not built here.

These should be picked up in their named clusters.
