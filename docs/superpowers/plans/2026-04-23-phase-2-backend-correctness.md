# Phase 2: Backend Correctness and Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix PB-orphan-on-delete, tighten the solve-time floor, add missing backend tests, and defang CSV injection in the exporter.

**Architecture:** All four changes are narrow and additive. Two touch the Flask routes + validators (`backend/app/`), one adds tests in `backend/tests/test_solves.py`, and one modifies the frontend CSV export. No schema changes, no new dependencies. Tests use the existing `fake_supabase_factory` fixture and `vitest`.

**Tech Stack:** Flask, pytest, Supabase Python client (faked in tests), TypeScript, vitest.

---

## File Structure

**Modify:**
- `backend/app/routes/solves.py` — add PB delete in `delete_solve` (Task 1)
- `backend/app/validators.py` — raise time floor to 0.1s (Task 2)
- `backend/tests/test_solves.py` — four new tests (Tasks 1, 2, 3)
- `frontend/src/utils/exportCsv.ts` — defang dangerous cell prefixes (Task 4)
- `frontend/src/utils/exportCsv.test.ts` — prefix tests (Task 4)

No new files.

---

## Task 1: PB cleanup on soft-delete

**Files:**
- Modify: `backend/app/routes/solves.py:188-206` (`delete_solve`)
- Test: `backend/tests/test_solves.py`

Design choice locked from spec §2.1: Option A. After the soft-delete `UPDATE`, issue a `DELETE FROM personal_bests WHERE user_id = ? AND solve_id = ?`. The next PB insert after a user beats their remaining fastest will naturally re-extend the chain. This leaves a gap if the deleted solve was the current PB, which is acceptable for a personal tool.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_solves.py` (after `test_delete_solve_404_when_missing`):

```python
def test_delete_solve_removes_matching_pb(fake_supabase_factory, client, auth_headers):
    fake = fake_supabase_factory(scripts={
        "solves": [{"data": [{"id": "abc"}]}],
        "personal_bests": [{"data": [{"id": "pb-1"}]}],
    })
    r = client.delete("/api/solves/abc", headers=auth_headers)
    assert r.status_code == 200

    pb_queries = [q for q in fake.queries if q.table_name == "personal_bests"]
    assert len(pb_queries) == 1
    ops = [c[0] for c in pb_queries[0].calls]
    assert "delete" in ops
    # Scoped by user_id and solve_id
    eq_calls = [c for c in pb_queries[0].calls if c[0] == "eq"]
    eq_args = {c[1][0]: c[1][1] for c in eq_calls}
    assert eq_args.get("user_id") == "user-123"
    assert eq_args.get("solve_id") == "abc"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_solves.py::test_delete_solve_removes_matching_pb -v`
Expected: FAIL — no `personal_bests` queries recorded.

- [ ] **Step 3: Add PB delete after the soft-delete update**

In `backend/app/routes/solves.py`, inside `delete_solve`, after `if not result.data: return ... 404` and before `return jsonify(result.data[0])`:

```python
        # Remove the matching PB row if this solve was a recorded PB. If this
        # was the current best, the next time the user beats their remaining
        # fastest a new PB will be inserted naturally.
        try:
            (request.supabase.table('personal_bests')
             .delete()
             .eq('user_id', request.user_id)
             .eq('solve_id', solve_id)
             .execute())
        except Exception:
            current_app.logger.exception("PB cleanup on delete failed (non-fatal)")
```

Place it inside the outer `try` block, just before `return jsonify(result.data[0])`. The inner try/except keeps the delete response successful even if PB cleanup fails.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_solves.py::test_delete_solve_removes_matching_pb -v`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `cd backend && pytest -v`
Expected: all tests pass (including `test_delete_solve_writes_iso_timestamp`, which now also sees the PB delete query but still asserts on `fake.queries[0]`, which is the solves update).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routes/solves.py backend/tests/test_solves.py
git commit -m "fix(solves): remove matching personal_bests row on soft-delete"
```

---

## Task 2: Raise solve-time floor to 0.1s

**Files:**
- Modify: `backend/app/validators.py:24-25`
- Test: `backend/tests/test_solves.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_solves.py`:

```python
def test_create_solve_rejects_tiny_time(fake_supabase_factory, client, auth_headers):
    fake_supabase_factory()
    r = client.post(
        "/api/solves",
        headers=auth_headers,
        json={"puzzle_type": "333", "time": 0.05},
    )
    assert r.status_code == 422
    body = r.get_json()
    assert "time" in body.get("fields", {})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_solves.py::test_create_solve_rejects_tiny_time -v`
Expected: FAIL — 0.05 currently passes validation (`time > 0`).

- [ ] **Step 3: Update the validator**

In `backend/app/validators.py`, replace:

```python
    elif time <= 0 or time > 3600:
        errors['time'] = "Must be between 0 and 3600 seconds"
```

with:

```python
    elif time < 0.1 or time > 3600:
        errors['time'] = "Must be between 0.1 and 3600 seconds"
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && pytest tests/test_validators.py tests/test_solves.py -v`
Expected: new test passes. If any existing validator test asserts the old message text, update it to the new message.

- [ ] **Step 5: Commit**

```bash
git add backend/app/validators.py backend/tests/test_solves.py
git commit -m "validate: raise solve time floor to 0.1s"
```

---

## Task 3: Missing PATCH tests

**Files:**
- Test: `backend/tests/test_solves.py`

Two cases: PATCH on a missing solve returns 404 (symmetric with delete), and PATCH with an invalid `dnf` type returns 422.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_solves.py`:

```python
def test_patch_solve_404_when_missing(fake_supabase_factory, client, auth_headers):
    fake_supabase_factory(scripts={"solves": [{"data": []}]})
    r = client.patch(
        "/api/solves/nope",
        headers=auth_headers,
        json={"dnf": True},
    )
    assert r.status_code == 404


def test_patch_solve_422_on_invalid_type(fake_supabase_factory, client, auth_headers):
    fake_supabase_factory()
    r = client.patch(
        "/api/solves/abc",
        headers=auth_headers,
        json={"dnf": "yes"},
    )
    assert r.status_code == 422
    body = r.get_json()
    assert "dnf" in body.get("fields", {})
```

- [ ] **Step 2: Run them**

Run: `cd backend && pytest tests/test_solves.py::test_patch_solve_404_when_missing tests/test_solves.py::test_patch_solve_422_on_invalid_type -v`
Expected: both PASS (the route code already handles both paths; these just pin the behavior).

If either fails, investigate — don't change the route to make them pass without reading it first. Likely root cause for a 404 failure is that `update` on a non-existent row returns `data: []`, which the route already handles via `if not result.data: return ... 404`.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_solves.py
git commit -m "test(solves): add PATCH 404 and 422 coverage"
```

---

## Task 4: CSV injection guard

**Files:**
- Modify: `frontend/src/utils/exportCsv.ts:5`
- Test: `frontend/src/utils/exportCsv.test.ts`

Dangerous prefixes per spec §2.4: `=`, `+`, `-`, `@`, `\t`, `\r`. Prefix the cell value with a single quote so spreadsheet apps treat it as a literal string.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/utils/exportCsv.test.ts` inside the existing `describe('buildCsv', ...)` block:

```ts
  it.each([
    ['=HYPERLINK("http://x")', '"\'=HYPERLINK(""http://x"")"'],
    ['+cmd', '"\'+cmd"'],
    ['-cmd', '"\'-cmd"'],
    ['@evil', '"\'@evil"'],
    ['\tlead-tab', '"\'\tlead-tab"'],
    ['\rlead-cr', '"\'\rlead-cr"'],
  ])('defangs dangerous prefix %j', (scramble, expectedCell) => {
    const csv = buildCsv([mk({ scramble })]);
    expect(csv).toContain(expectedCell);
  });

  it('leaves safe scrambles untouched', () => {
    const csv = buildCsv([mk({ scramble: "R U R'" })]);
    expect(csv).toContain(`"R U R'"`);
    expect(csv).not.toContain(`"'R U R'"`);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/utils/exportCsv.test.ts`
Expected: the six defang cases fail; the "safe scrambles" case passes.

- [ ] **Step 3: Update the `quote` helper**

In `frontend/src/utils/exportCsv.ts`, replace:

```ts
const quote = (v: string): string => `"${v.replace(/"/g, '""')}"`;
```

with:

```ts
const DANGEROUS_PREFIXES = /^[=+\-@\t\r]/;
const quote = (v: string): string => {
  const safe = DANGEROUS_PREFIXES.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
};
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/utils/exportCsv.test.ts`
Expected: all tests PASS, including the existing header/clean-solve/+2/DNF/inner-quote cases.

Note: the header cells `"Time"`, `"Comment"`, etc. do not start with any dangerous char, so existing header-row assertions remain valid.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/exportCsv.ts frontend/src/utils/exportCsv.test.ts
git commit -m "security(csv): defang cells starting with =+-@\\t\\r"
```

---

## Final Verification

- [ ] **Backend:** `cd backend && pytest -v` — all tests green, new tests present.
- [ ] **Frontend:** `cd frontend && npx vitest run` — all tests green.
- [ ] **Manual smoke (optional):** start backend + frontend, record a solve, delete it, confirm `/api/personal-bests` no longer lists it; export CSV, open in Excel/Sheets, confirm a scramble like `=HYPERLINK(...)` appears as text.
