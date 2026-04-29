# Audit Cluster H Implementation Plan (vendor-pick items deferred)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the architectural items from the 2026-04-25 audit's Cluster H that do **not** require an outside vendor decision: H.1 versioned API prefix, H.2 standardized error envelope, H.3 TanStack Query for solves cache, H.4 AuthClient interface, H.5 top-level error boundary, H.7 readiness probe, H.8 isolate service-role usage, H.9 guest-mode doc, H.12 `metadata jsonb` column, H.13 verify `Auth` mount.

**Deferred to a follow-up plan:** H.6 (Sentry/error reporting vendor), H.10 (backend host), H.11 (migration runner) — all blocked on vendor decisions the user has not yet made.

**Architecture:**
- Backend: rename single `solves` blueprint registration from `/api` to `/api/v1`, keep `/api` mounted as a transitional alias. Standardize every error response to `{"error": {"code": "...", "message": "...", "fields": {...}}}` driven by a small `errors.py` codes module. Move `get_supabase_service_client` into `backend/app/dangerous_admin.py` so the unsafe import is loud at the call site. Add `/api/ready` that actually pings Supabase + JWKS. Add migration `012_solves_metadata.sql`.
- Frontend: wrap `<Routes>` in a top-level `ErrorBoundary` rendering a sonner-toast plus reload UI. Wrap Supabase calls behind a small `AuthClient { getAccessToken, onSignIn, signOut, signInWithPassword, signUp, resetPasswordForEmail, updateUser }` interface so the rest of the app stops importing `supabase` directly. Migrate solves data layer (`useSolveSession`, `useAllSolves`) to TanStack Query so creating a solve on the timer page invalidates Stats automatically. Update `VITE_API_URL` to point at `/api/v1` and parse the new error envelope in `api.ts`.

**Tech Stack:** Flask 3.1, supabase-py 2.x, PyJWT, Vite 5, React 18, React Router 6, axios, sonner, Vitest, pytest, `@tanstack/react-query` (new dep).

**Sequencing logic (largest blast radius last):**
1. Quick additive items first: H.5, H.7, H.8, H.12, H.13 verify, H.9 doc.
2. Coordinated breaking-shape change: H.2 then H.1 (frontend has to update for both anyway).
3. Architectural refactors with no wire-shape change: H.4, then H.3.

Each Task ships as a separate PR. Run the full test suite at the end of every Task before committing.

---

## Task 0: Pre-flight

**Files:** none modified; reads only.

- [ ] **Step 1: Confirm green baseline**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend" && pytest -q
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend" && npx vitest run --reporter=dot && npx tsc --noEmit
```

Expected: all green. If anything is red, stop and triage before starting Task 1.

- [ ] **Step 2: Read the relevant audit sections**

Read `docs/audits/2026-04-25-full-stack-audit.md` lines 636-697 (Cluster H) and `docs/decisions/2026-04-26-token-storage.md`. The latter is relevant for H.4 (AuthClient must not change the storage decision).

- [ ] **Step 3: Note migration high-water mark**

```bash
ls "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend/migrations" | sort
```

Expected: `011_recompute_pbs_for_user.sql` is the highest number. Task 4 (H.12) will create `012_solves_metadata.sql` and `012_solves_metadata.down.sql`.

---

## Task 1 (H.5): Top-level Error Boundary

**Why:** No `ErrorBoundary` exists anywhere in `frontend/src/`. A render-time throw in any route currently produces a blank screen; lazy-route load failures fall through Suspense with no recovery UI.

**Files:**
- Create: `frontend/src/components/ErrorBoundary.tsx`
- Modify: `frontend/src/App.tsx` (lines 33-46 region)
- Test: `frontend/src/components/ErrorBoundary.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/ErrorBoundary.test.tsx
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

const Boom = () => {
  throw new Error('boom');
};

describe('ErrorBoundary', () => {
  it('renders fallback when child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('renders children when no throw', () => {
    render(
      <ErrorBoundary>
        <div>ok</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `cd frontend && npx vitest run src/components/ErrorBoundary.test.tsx`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement ErrorBoundary**

```tsx
// frontend/src/components/ErrorBoundary.tsx
import { Component, type ReactElement, type ReactNode } from 'react';
import { toast } from 'sonner';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    toast.error('Something went wrong. Please reload.');
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error);
    }
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactElement | ReactNode {
    if (this.state.error) {
      return (
        <div role="alert" className="error-boundary">
          <h1>Something went wrong</h1>
          <p>The page hit an unexpected error. Reloading usually fixes it.</p>
          <button type="button" onClick={this.handleReload}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 4: Add minimal styles**

Append to `frontend/src/styles/global.css` (or wherever the app's base styles live; check `frontend/src/main.tsx` imports first):

```css
.error-boundary {
  max-width: 480px;
  margin: 4rem auto;
  text-align: center;
  padding: 2rem;
  border: 1px solid var(--border, #d0d7de);
  border-radius: 8px;
}
.error-boundary button {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
}
```

- [ ] **Step 5: Wrap the router tree in App.tsx**

In `frontend/src/App.tsx`, change the `AppRoutes` (or equivalent) JSX so the ErrorBoundary wraps `<Routes>` *and* `<Suspense>`:

```tsx
import { ErrorBoundary } from './components/ErrorBoundary';

// ...inside AppRoutes return:
<BrowserRouter>
  <ErrorBoundary>
    <Suspense fallback={<RouteFallback />}>
      <Routes>{/* existing routes */}</Routes>
    </Suspense>
  </ErrorBoundary>
</BrowserRouter>
```

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npx vitest run`
Expected: ErrorBoundary tests PASS, no regressions in existing tests.

- [ ] **Step 7: Manual smoke test**

Run: `cd frontend && npm run dev`. Temporarily insert `throw new Error('test')` at the top of `frontend/src/pages/Stats.tsx` render. Navigate to `/stats`. Confirm fallback renders, Reload button works. Revert the throw.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ErrorBoundary.tsx frontend/src/components/ErrorBoundary.test.tsx frontend/src/App.tsx frontend/src/styles/global.css
git commit -m "feat(H.5): add top-level error boundary

A render error now surfaces a recoverable fallback with a Reload action
instead of producing a blank screen. Suspense remains the loading-state
boundary; ErrorBoundary handles thrown errors during render."
```

---

## Task 2 (H.7): `/api/ready` readiness probe

**Why:** `/api/health` (`backend/app/__init__.py:63-65`) returns `{"status": "healthy"}` unconditionally. It will succeed even if Supabase is unreachable. Adding `/api/ready` gives ops a real signal.

**Files:**
- Modify: `backend/app/__init__.py` (add new route)
- Modify: `backend/app/auth.py` (expose JWKS-cache freshness check)
- Test: `backend/tests/test_health.py` (new file)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_health.py
from unittest.mock import patch

def test_health_returns_200(app_client):
    res = app_client.get('/api/health')
    assert res.status_code == 200
    assert res.get_json() == {"status": "healthy"}


def test_ready_returns_200_when_supabase_ok(app_client):
    with patch('app.db.get_supabase_client') as mock_client:
        mock = mock_client.return_value
        mock.table.return_value.select.return_value.limit.return_value.execute.return_value = (
            type('R', (), {'data': []})
        )
        res = app_client.get('/api/ready')
    assert res.status_code == 200
    body = res.get_json()
    assert body['status'] == 'ready'
    assert body['checks']['supabase'] == 'ok'


def test_ready_returns_503_when_supabase_fails(app_client):
    with patch('app.db.get_supabase_client', side_effect=RuntimeError('down')):
        res = app_client.get('/api/ready')
    assert res.status_code == 503
    body = res.get_json()
    assert body['status'] == 'not_ready'
    assert body['checks']['supabase'] == 'fail'
```

If `app_client` fixture does not exist, look up the existing fixture name in `backend/tests/conftest.py` (likely `client` or `app`).

- [ ] **Step 2: Run the test, confirm it fails**

Run: `cd backend && pytest tests/test_health.py -v`
Expected: 2 of 3 FAIL (the `/api/health` test should pass; the `/api/ready` tests fail with 404).

- [ ] **Step 3: Implement `/api/ready`**

In `backend/app/__init__.py`, alongside the existing `health_check` route:

```python
@app.route('/api/ready')
def readiness_check():
    from app.db import get_supabase_client  # lazy import to avoid boot-time failure
    checks: dict[str, str] = {}
    overall_ok = True

    try:
        client = get_supabase_client()
        client.table('solves').select('id').limit(1).execute()
        checks['supabase'] = 'ok'
    except Exception:
        current_app.logger.exception('readiness_supabase_failed')
        checks['supabase'] = 'fail'
        overall_ok = False

    try:
        from app.auth import jwks_cache_state
        checks['jwks'] = jwks_cache_state()  # 'fresh' | 'cold'
    except Exception:
        current_app.logger.exception('readiness_jwks_failed')
        checks['jwks'] = 'fail'
        overall_ok = False

    status = 'ready' if overall_ok else 'not_ready'
    return jsonify({"status": status, "checks": checks}), (200 if overall_ok else 503)
```

Add `from flask import current_app, jsonify` if not already imported at module top.

- [ ] **Step 4: Implement `jwks_cache_state` in `auth.py`**

Append to `backend/app/auth.py`:

```python
def jwks_cache_state() -> str:
    """Return 'fresh' if a JWKS client has been initialized, 'cold' otherwise."""
    return 'fresh' if _jwks_client is not None else 'cold'
```

(Adjust the global name to whatever the existing JWKS client variable is called in `auth.py:15-29`.)

- [ ] **Step 5: Run tests**

Run: `cd backend && pytest tests/test_health.py -v`
Expected: PASS.

Run full suite: `cd backend && pytest -q`. Expected: green.

- [ ] **Step 6: Commit**

```bash
git add backend/app/__init__.py backend/app/auth.py backend/tests/test_health.py
git commit -m "feat(H.7): add /api/ready probe that actually checks dependencies

/api/health remains a liveness signal. /api/ready performs a SELECT 1
against Supabase and reports the JWKS cache state, returning 503 when
either dependency is unavailable."
```

---

## Task 3 (H.8): Isolate service-role usage

**Why:** `get_supabase_service_client` (`backend/app/db.py:45-56`) bypasses RLS. It is currently sibling to the safe client, so a careless import is silent. Move it to `backend/app/dangerous_admin.py` with a loud docstring and a single audited caller.

**Files:**
- Create: `backend/app/dangerous_admin.py`
- Modify: `backend/app/db.py` (remove the function)
- Modify: `backend/app/routes/solves.py` (line 12 import)
- Test: `backend/tests/test_dangerous_admin.py` (new file)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_dangerous_admin.py
def test_dangerous_admin_module_importable():
    from app.dangerous_admin import get_supabase_service_client
    assert callable(get_supabase_service_client)


def test_db_module_no_longer_exports_service_client():
    import app.db as db
    assert not hasattr(db, 'get_supabase_service_client')
```

- [ ] **Step 2: Run, confirm fail**

Run: `cd backend && pytest tests/test_dangerous_admin.py -v`
Expected: FAIL with `ImportError`.

- [ ] **Step 3: Create `dangerous_admin.py`**

```python
# backend/app/dangerous_admin.py
"""Service-role Supabase access. THIS BYPASSES ROW-LEVEL SECURITY.

Only call from server-verified, narrowly-scoped paths where the request is
authorized by something other than the end-user's JWT (e.g. a cryptographically
signed share token whose signature was verified before reaching this code).

If you find yourself importing this module, ask: 'is the access control here
strictly stronger than the user's JWT would have been?' If you cannot give a
crisp yes, do not use this client.
"""

from supabase import Client, create_client

from app.config import Config
from app.db import _client_options


def get_supabase_service_client() -> Client:
    """Service-role client that bypasses RLS. See module docstring."""
    if not Config.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not configured")
    return create_client(
        Config.SUPABASE_URL,
        Config.SUPABASE_SERVICE_ROLE_KEY,
        options=_client_options(),
    )
```

If `_client_options` is private to `db.py`, either expose it or duplicate the construction here. Verify by reading `backend/app/db.py` first.

- [ ] **Step 4: Remove the function from `db.py`**

Delete the function and its imports from `backend/app/db.py:45-56`.

- [ ] **Step 5: Update the single caller**

In `backend/app/routes/solves.py:12`, change:

```python
from app.db import get_supabase_client, get_supabase_service_client
```

to:

```python
from app.db import get_supabase_client
from app.dangerous_admin import get_supabase_service_client
```

- [ ] **Step 6: Run full test suite**

Run: `cd backend && pytest -q`. Expected: all green, including the new tests.

- [ ] **Step 7: Verify no other call sites snuck in**

```bash
grep -rn "get_supabase_service_client" backend/
```

Expected: imports/uses only in `dangerous_admin.py`, `routes/solves.py`, and the new test file.

- [ ] **Step 8: Commit**

```bash
git add backend/app/dangerous_admin.py backend/app/db.py backend/app/routes/solves.py backend/tests/test_dangerous_admin.py
git commit -m "refactor(H.8): move service-role client to dangerous_admin.py

The service-role client bypasses RLS. Putting it next to the safe client
made the unsafe import easy to miss. The new module's name is loud at
every call site, and the docstring states the contract."
```

---

## Task 4 (H.12): `metadata jsonb` column on `solves`

**Why:** Future enrichment fields (e.g. device, app version, comp tags) can be added without another migration. Cheap to add now, painful to add after a million-row table.

**Files:**
- Create: `backend/migrations/012_solves_metadata.sql`
- Create: `backend/migrations/012_solves_metadata.down.sql`
- Modify: `backend/README.md` (schema section)

- [ ] **Step 1: Write up migration**

```sql
-- backend/migrations/012_solves_metadata.sql
-- Adds a forward-compatible metadata jsonb column to solves.

ALTER TABLE solves
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Optional: GIN index only if/when query patterns demand it. Skip for now.
```

- [ ] **Step 2: Write up rollback**

```sql
-- backend/migrations/012_solves_metadata.down.sql
ALTER TABLE solves DROP COLUMN IF EXISTS metadata;
```

- [ ] **Step 3: Update backend README schema section**

In `backend/README.md`, append `metadata jsonb` to the `solves` schema table.

- [ ] **Step 4: Apply migration locally**

The repo has no migration runner yet (deferred to H.11). Apply via Supabase CLI or dashboard manually:

```bash
# If supabase CLI is wired:
supabase db push backend/migrations/012_solves_metadata.sql
# Otherwise paste into the SQL editor of the local Supabase project.
```

- [ ] **Step 5: Run backend tests against the updated schema**

Run: `cd backend && pytest -q`. Expected: green (no code references `metadata` yet, so nothing should change behaviour).

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/012_solves_metadata.sql backend/migrations/012_solves_metadata.down.sql backend/README.md
git commit -m "feat(H.12): add metadata jsonb column to solves

Defaults to '{}'. Future fields (device, app_version, comp tags) can be
added without a schema migration."
```

---

## Task 5 (H.13): Verify `Auth` mounted at `/login`

**Why:** Phase-1 exploration shows `App.tsx:39` already has `<Route path="/login" element={<Auth />} />`. The audit's "router-bypass" pattern looks resolved as part of E.13 (Auth refactor, Cluster E). Verify and document — most likely a no-op.

**Files:**
- Read: `frontend/src/App.tsx`, `frontend/src/components/Auth.tsx`
- Possibly modify if a render-bypass remains.

- [ ] **Step 1: Read `App.tsx` end-to-end**

Confirm `<Route path="/login" element={<Auth />} />` exists and there is **no** `if (!session) return <Auth />` short-circuit anywhere in `App.tsx` or `AppRoutes`.

- [ ] **Step 2: Read `Auth.tsx`**

Confirm `Auth` calls `useNavigate()` after a successful login (i.e. it routes to `/` on success rather than relying on a prop callback).

- [ ] **Step 3: Decide outcome**

Two outcomes:
- **(a) Already done:** Skip to Step 5.
- **(b) Bypass still present:** Remove the `if (!session) return <Auth />` block; ensure protected routes use a guard (a `<RequireAuth>` wrapper that redirects to `/login`). If you discover this, the work is one of:
  - Add `RequireAuth` wrapper:
    ```tsx
    const RequireAuth = ({ children }: { children: ReactElement }): ReactElement => {
      const { session, isGuest } = useAuth();
      if (!session && !isGuest) return <Navigate to="/login" replace />;
      return children;
    };
    ```
  - Wrap protected routes (e.g. `<Route path="/" element={<RequireAuth><Timer /></RequireAuth>} />`).

- [ ] **Step 4 (only if (b)): Add a regression test**

```tsx
// frontend/src/App.test.tsx (extend or create)
it('redirects unauthenticated user to /login', async () => {
  // mount App with no session, assert location.pathname === '/login'
});
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`.

- [ ] **Step 6: Commit (only if a change happened)**

```bash
git commit -m "chore(H.13): verify Auth mounted at /login (already done in E.13)"
```

If literally nothing changed, skip the commit and note in the task tracker that H.13 was already satisfied by E.13.

---

## Task 6 (H.9): `docs/guest-mode.md` feature matrix

**Why:** Guest and authenticated paths diverge in subtle ways (PB materialization, lifetime cap, pagination, share links). The audit calls this out as the #1 doc gap.

**Files:**
- Create: `docs/guest-mode.md`

- [ ] **Step 1: Read the actual divergence**

Read `frontend/src/services/guestStorage.ts`, `frontend/src/services/api.ts`, `frontend/src/hooks/useSolveStore.ts`, and `backend/app/routes/solves.py` to enumerate every place behaviour forks on `isGuest`. Make notes.

- [ ] **Step 2: Write the doc**

```markdown
# Guest Mode

Ao5 supports an unauthenticated "guest" mode that stores solves in
`localStorage`. Once the user signs in, guest solves are migrated to the
backend. This doc maps the divergence between guest and authenticated paths.

## Feature matrix

| Feature              | Guest                          | Authenticated                              |
| -------------------- | ------------------------------ | ------------------------------------------ |
| Solve storage        | `localStorage`                 | Supabase via `/api/v1/solves`              |
| Personal best        | Computed in-memory per session | Materialized in `personal_bests` table     |
| Lifetime cap         | None                           | 100,000 solves (`SOLVE_LIFETIME_CAP`)      |
| Pagination           | Full local list                | Cursor-based, 100/page                     |
| Share links          | Not available                  | HMAC-signed, expirable                     |
| Soft delete          | Hard delete                    | Soft delete (`deleted_at`), 30-day window  |
| Trainers             | Available                      | Available (parity)                         |
| CSV export           | Available                      | Available                                  |
| Cross-device sync    | None                           | Real-time via Supabase                     |

## Migration on sign-in

When a guest signs in (`AuthContext.tsx`), `migrateSolves` (in
`services/api.ts`) batches the local manifest to `POST /api/v1/solves/batch`.
Solves are sorted chronologically before submission so PB materialization
runs in the correct order. Failed inserts (e.g. validation, rate limit) are
surfaced via toast and dropped from local storage only on success.

## Storage limits

`localStorage` is typically 5–10 MB per origin. At ~200 bytes/solve we cap
out around 25,000–50,000 solves. `guestStorage.ts` catches
`QuotaExceededError` and surfaces a toast.

## Code references

- Storage layer: `frontend/src/services/guestStorage.ts`
- Hook adapter: `frontend/src/hooks/useSolveStore.ts`
- Migration call site: `frontend/src/contexts/AuthContext.tsx`
- Backend batch endpoint: `backend/app/routes/solves.py:333` (`create_solves_batch`)

## Long-term direction

Treating guests as anonymous Supabase users (a single Supabase `auth.signInAnonymously()` session) would collapse the two code paths into one. This is **not** scheduled. See `docs/decisions/2026-04-26-token-storage.md` for the storage decision that constrains this.
```

Replace cell values with whatever you actually find in Step 1 if the matrix above is wrong.

- [ ] **Step 3: Commit**

```bash
git add docs/guest-mode.md
git commit -m "docs(H.9): document guest vs authenticated feature matrix"
```

---

## Task 7 (H.2): Standardize the error envelope

**Why:** Today the backend returns 4 distinct error shapes (`{"error": "..."}`, `{"error": "...", "fields": {...}}`, `{"errors": {"rows": [...]}}`, plus the rare `{"detail": "..."}`). The frontend parses these ad-hoc. Standardize to `{"error": {"code": "...", "message": "...", "fields": {...}}}` so frontend can switch on `error.code` and tests cover each code.

**Files:**
- Create: `backend/app/errors.py` (codes + helper)
- Modify: `backend/app/routes/solves.py` (every error return)
- Modify: `backend/app/__init__.py` (default error handlers)
- Modify: `frontend/src/services/api.ts` (response error parser)
- Modify: `backend/tests/test_solves.py` (assert new shape)
- Modify: `frontend/src/services/api.test.ts` (assert frontend parser)

- [ ] **Step 1: Define error codes module**

```python
# backend/app/errors.py
"""Standardized error envelope.

Wire shape:
  {"error": {"code": "<CODE>", "message": "<msg>", "fields": {<field>: <msg>}}}

Status code is HTTP. `fields` is omitted when empty. `code` is a stable
upper-snake-case identifier. Any new code MUST be added here, not inlined.
"""

from typing import Any
from flask import jsonify

# Auth
AUTH_MISSING_TOKEN = "AUTH_MISSING_TOKEN"
AUTH_INVALID_TOKEN = "AUTH_INVALID_TOKEN"
AUTH_UNAVAILABLE = "AUTH_UNAVAILABLE"

# Validation
VALIDATION_FAILED = "VALIDATION_FAILED"
BODY_REQUIRED = "BODY_REQUIRED"

# Resource
NOT_FOUND = "NOT_FOUND"
SOLVE_LIMIT_REACHED = "SOLVE_LIMIT_REACHED"

# Throttling
RATE_LIMITED = "RATE_LIMITED"

# Server
INTERNAL_ERROR = "INTERNAL_ERROR"


def error_response(code: str, message: str, status: int,
                   fields: dict[str, Any] | None = None):
    body: dict[str, Any] = {"error": {"code": code, "message": message}}
    if fields:
        body["error"]["fields"] = fields
    return jsonify(body), status
```

- [ ] **Step 2: Refactor every error return in `routes/solves.py`**

Walk every `return jsonify({"error": ...}), <status>` site and replace it. Examples (verify exact line numbers in the file before editing):

```python
# OLD: return jsonify({"error": "Missing or invalid Authorization header"}), 401
return error_response(AUTH_MISSING_TOKEN, "Missing or invalid Authorization header", 401)

# OLD: return jsonify({"error": "Validation failed", "fields": errors}), 422
return error_response(VALIDATION_FAILED, "Validation failed", 422, fields=errors)

# OLD: return jsonify({"error": "Lifetime solve cap reached"}), 429
return error_response(SOLVE_LIMIT_REACHED, "Lifetime solve cap reached", 429)

# OLD: return jsonify({"error": "Solve not found"}), 404
return error_response(NOT_FOUND, "Solve not found", 404)
```

For the batch validation shape (`{"errors": {"rows": [...]}}`), pick a code (e.g. `BATCH_VALIDATION_FAILED`) and put the per-row errors under `fields={"rows": [...]}`.

For the rate-limit `429` produced by `flask-limiter`, register a global handler:

```python
# in backend/app/__init__.py
from app.errors import error_response, RATE_LIMITED, INTERNAL_ERROR

@app.errorhandler(429)
def handle_rate_limit(_e):
    return error_response(RATE_LIMITED, "Too many requests, please slow down", 429)

@app.errorhandler(404)
def handle_not_found(_e):
    return error_response(NOT_FOUND, "Resource not found", 404)

@app.errorhandler(500)
def handle_internal(_e):
    return error_response(INTERNAL_ERROR, "Internal server error", 500)
```

(Keep the existing per-route 500s — they pass through this handler when reraised.)

- [ ] **Step 3: Update backend tests**

Every test that asserts `res.get_json()["error"] == "..."` must change to `res.get_json()["error"]["code"] == AUTH_MISSING_TOKEN` (etc.). Audit `backend/tests/test_solves.py`, `test_validators.py`, `test_health.py`, etc.

Add a new test specifically asserting the envelope contract:

```python
def test_error_envelope_shape(app_client):
    res = app_client.post('/api/solves', json={})  # no auth
    assert res.status_code == 401
    body = res.get_json()
    assert set(body['error'].keys()) <= {'code', 'message', 'fields'}
    assert body['error']['code'] == 'AUTH_MISSING_TOKEN'
    assert isinstance(body['error']['message'], str)
```

- [ ] **Step 4: Update frontend `api.ts` error parser**

Today `api.ts` returns `{ error, errorStatus }` from a generic axios catch. Change to read `error.code` and `error.message` from the new envelope. Sketch:

```typescript
// frontend/src/services/api.ts
export interface ApiErrorEnvelope {
  code: string;
  message: string;
  fields?: Record<string, string | string[]>;
}

const parseApiError = (e: unknown): ApiErrorEnvelope => {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: ApiErrorEnvelope } | undefined;
    if (data?.error?.code && data.error.message) {
      return data.error;
    }
    return {
      code: 'NETWORK_ERROR',
      message: e.message || 'Network error',
    };
  }
  return { code: 'UNKNOWN', message: 'Unknown error' };
};
```

Replace ad-hoc `error.response?.data?.error` reads at every catch site with `parseApiError(e)`. Where the surface used to be `{ error: string, errorStatus: number }`, it becomes `{ error: ApiErrorEnvelope, errorStatus: number }`.

- [ ] **Step 5: Update frontend tests**

Every place a test asserts `result.error === "rate limited"` or similar must change to `result.error.code === 'RATE_LIMITED'`. Run `grep -rn "errorStatus" frontend/src` and `grep -rn "result.error" frontend/src` to find all sites.

- [ ] **Step 6: Update frontend consumers (toasts, etc.)**

Where the UI surfaces errors today (e.g. `useSolveSession.ts:67`, `Auth.tsx`), make them switch on `error.code` for branch-specific copy where it matters; else fall back to `error.message`.

- [ ] **Step 7: Run full test suites**

```bash
cd backend && pytest -q
cd frontend && npx vitest run && npx tsc --noEmit
```

Expected: all green.

- [ ] **Step 8: Manual smoke**

`npm run dev` + `python run.py`. Trigger a 401 (sign out, hit timer; or curl `/api/solves` without auth) and confirm the toast / UI shows the right message. Trigger a 422 by submitting an invalid solve.

- [ ] **Step 9: Commit**

```bash
git add backend/app/errors.py backend/app/routes/solves.py backend/app/__init__.py backend/tests frontend/src/services/api.ts frontend/src/services/api.test.ts frontend/src
git commit -m "feat(H.2): standardize error envelope across backend and frontend

Every backend error now returns {error: {code, message, fields?}}.
Frontend api.ts parses one shape into ApiErrorEnvelope. Codes are
defined centrally in backend/app/errors.py so future additions are
greppable."
```

---

## Task 8 (H.1): `/api/v1` versioning

**Why:** Future API changes need a way to coexist with deployed clients. Adding a version prefix now is cheap; later it's a flag day.

Strategy: register the `solves` blueprint at **both** `/api` (transitional) and `/api/v1`. Frontend points at `/api/v1`. Old `/api/*` paths keep working so any in-the-wild share link doesn't break. Schedule the `/api`-only removal in a follow-up.

**Files:**
- Modify: `backend/app/__init__.py`
- Modify: `backend/README.md` (API reference paths)
- Modify: `frontend/src/services/api.ts` (BASE_URL fallback)
- Modify: `frontend/.env.example` (if it exists; create if not)
- Modify: `backend/tests/test_solves.py` (add v1 paths)

- [ ] **Step 1: Register blueprint at both prefixes**

In `backend/app/__init__.py`, change the existing single registration to:

```python
# OLD: app.register_blueprint(solves, url_prefix='/api')
app.register_blueprint(solves, url_prefix='/api/v1')
app.register_blueprint(solves, url_prefix='/api', name='solves_legacy')
```

The `name=` kwarg is required because Flask refuses two registrations of the same blueprint by default name. Add a deprecation header on legacy paths:

```python
@app.before_request
def _legacy_api_deprecation():
    if request.path.startswith('/api/') and not request.path.startswith('/api/v1/') \
       and not request.path.startswith('/api/health') \
       and not request.path.startswith('/api/ready'):
        # Legacy unversioned path. Mark with deprecation header in the response.
        g.legacy_api = True

@app.after_request
def _legacy_api_header(response):
    if getattr(g, 'legacy_api', False):
        response.headers['Deprecation'] = 'true'
        response.headers['Sunset'] = 'Wed, 01 Jul 2026 00:00:00 GMT'
        response.headers['Link'] = '<https://example.invalid/api/v1>; rel="successor-version"'
    return response
```

(Tweak the Sunset date and Link target to whatever fits — placeholder is fine if domain isn't decided.)

- [ ] **Step 2: Update frontend `BASE_URL`**

In `frontend/src/services/api.ts:5`:

```typescript
// OLD: const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
```

Update `.env.example` (create if missing):

```
# frontend/.env.example
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=http://localhost:5000/api/v1
```

- [ ] **Step 3: Update READMEs**

In `backend/README.md` and `README.md` (root), update API paths to `/api/v1/...`.

- [ ] **Step 4: Update tests**

Add a parametrized test that hits both `/api/solves` (legacy) and `/api/v1/solves` and asserts both return the same body. Existing tests should keep using whichever path they used (most likely `/api`); add at least 2-3 v1 spot checks.

```python
@pytest.mark.parametrize('path', ['/api/solves', '/api/v1/solves'])
def test_solves_listed_at_both_prefixes(path, app_client_with_auth):
    res = app_client_with_auth.get(path)
    assert res.status_code == 200
```

- [ ] **Step 5: Run tests**

```bash
cd backend && pytest -q
cd frontend && npx vitest run
```

- [ ] **Step 6: Manual smoke**

`python run.py` + `curl -i http://localhost:5000/api/solves` (expect `Deprecation: true` header) and `curl -i http://localhost:5000/api/v1/solves` (no deprecation header). Run frontend, confirm everything still works.

- [ ] **Step 7: Commit**

```bash
git add backend/app/__init__.py backend/README.md backend/tests README.md frontend/src/services/api.ts frontend/.env.example
git commit -m "feat(H.1): mount API at /api/v1 with /api as transitional alias

Frontend now hits /api/v1. Old /api/* paths still serve the same blueprint
but emit Deprecation/Sunset headers so external clients (share links)
keep working until a flag-day removal."
```

---

## Task 9 (H.4): `AuthClient` interface

**Why:** Eight Supabase auth methods are imported across `AuthContext.tsx`, `Auth.tsx`, `Header.tsx`, `api.ts`. A small adapter shrinks the SDK seam to one file, lets us mock auth cleanly in tests, and prepares the ground for the long-term token-storage migration in `docs/decisions/2026-04-26-token-storage.md`.

**Files:**
- Create: `frontend/src/services/authClient.ts`
- Modify: `frontend/src/contexts/AuthContext.tsx`
- Modify: `frontend/src/components/Auth.tsx`
- Modify: `frontend/src/components/Header.tsx`
- Modify: `frontend/src/services/api.ts` (`getAuthHeader`)
- Test: `frontend/src/services/authClient.test.ts`

- [ ] **Step 1: Define the interface**

```typescript
// frontend/src/services/authClient.ts
import { supabase } from './auth';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

export interface AuthClient {
  getAccessToken(): Promise<string | null>;
  getSession(): Promise<Session | null>;
  onAuthStateChange(cb: (event: AuthChangeEvent, session: Session | null) => void): () => void;
  signInWithPassword(email: string, password: string): Promise<{ error: string | null }>;
  signUp(email: string, password: string): Promise<{ error: string | null }>;
  resetPasswordForEmail(email: string, redirectTo: string): Promise<{ error: string | null }>;
  updatePassword(newPassword: string): Promise<{ error: string | null }>;
  signOut(): Promise<{ error: string | null }>;
}

export const supabaseAuthClient: AuthClient = {
  async getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },
  onAuthStateChange(cb) {
    const { data: subscription } = supabase.auth.onAuthStateChange(cb);
    return () => subscription.subscription.unsubscribe();
  },
  async signInWithPassword(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  },
  async signUp(email, password) {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  },
  async resetPasswordForEmail(email, redirectTo) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return { error: error?.message ?? null };
  },
  async updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  },
  async signOut() {
    const { error } = await supabase.auth.signOut();
    return { error: error?.message ?? null };
  },
};
```

- [ ] **Step 2: Add a test**

```typescript
// frontend/src/services/authClient.test.ts
import { supabaseAuthClient } from './authClient';

describe('supabaseAuthClient', () => {
  it('exposes the AuthClient interface', () => {
    expect(typeof supabaseAuthClient.getAccessToken).toBe('function');
    expect(typeof supabaseAuthClient.signInWithPassword).toBe('function');
    expect(typeof supabaseAuthClient.signUp).toBe('function');
    expect(typeof supabaseAuthClient.resetPasswordForEmail).toBe('function');
    expect(typeof supabaseAuthClient.updatePassword).toBe('function');
    expect(typeof supabaseAuthClient.signOut).toBe('function');
    expect(typeof supabaseAuthClient.onAuthStateChange).toBe('function');
  });
});
```

(Behavior tests for the Supabase fakes can come later; the typecheck + smoke is the value here.)

- [ ] **Step 3: Migrate `AuthContext.tsx`**

Replace `import { supabase } from '...'` and `supabase.auth.getSession()` / `supabase.auth.onAuthStateChange(...)` with calls to `supabaseAuthClient.getSession()` and `supabaseAuthClient.onAuthStateChange(...)`. Confirm the `migratingRef` semantics still work.

- [ ] **Step 4: Migrate `Auth.tsx`**

Replace each `supabase.auth.signInWithPassword(...)`, `supabase.auth.signUp(...)`, `supabase.auth.resetPasswordForEmail(...)`, `supabase.auth.updateUser({ password })` with the corresponding `supabaseAuthClient.*` call. Adjust the surrounding code that reads `error?.message` since the client returns `{ error: string | null }`.

- [ ] **Step 5: Migrate `Header.tsx`**

Replace `supabase.auth.signOut()` with `supabaseAuthClient.signOut()`.

- [ ] **Step 6: Migrate `getAuthHeader` in `api.ts`**

```typescript
// frontend/src/services/api.ts
import { supabaseAuthClient } from './authClient';

const getAuthHeader = async (): Promise<AuthHeader> => {
  const token = await supabaseAuthClient.getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
```

- [ ] **Step 7: Verify no other files import `supabase.auth.*`**

```bash
grep -rn "supabase.auth\." frontend/src
```

Expected: only `frontend/src/services/authClient.ts` references `supabase.auth.*`. Everything else uses `supabaseAuthClient`. (`frontend/src/services/auth.ts` may still create the client itself — that is fine.)

- [ ] **Step 8: Run tests**

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

- [ ] **Step 9: Manual smoke**

Sign up, sign in, sign out, request password reset, complete recovery flow. Each should still work.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/services/authClient.ts frontend/src/services/authClient.test.ts frontend/src/contexts/AuthContext.tsx frontend/src/components/Auth.tsx frontend/src/components/Header.tsx frontend/src/services/api.ts
git commit -m "refactor(H.4): wrap Supabase auth behind AuthClient interface

Every consumer of supabase.auth.* now goes through supabaseAuthClient.
The SDK seam is one file; mocking auth in tests is one fake. This is
prep for the eventual PKCE/cookie migration tracked in
docs/decisions/2026-04-26-token-storage.md but does not change storage."
```

---

## Task 10 (H.3): TanStack Query for solves cache

**Why:** Today, creating a solve on Timer does not invalidate Stats — each page owns its own copy. Manual optimistic updates in `useSolveSession` (snapshot + rollback) are duplicated three times. TanStack Query gives a shared cache, automatic invalidation, and removes the rollback boilerplate.

**Files:**
- Modify: `frontend/package.json` (new dep)
- Modify: `frontend/src/main.tsx` (mount `QueryClientProvider`)
- Create: `frontend/src/queries/solves.ts` (query keys + hooks)
- Modify: `frontend/src/hooks/useSolveSession.ts` (consume new hooks)
- Modify: `frontend/src/hooks/useAllSolves.ts` (replace with `useInfiniteQuery`)
- Modify: `frontend/src/services/api.ts` (no major change; just ensure functions return clean shapes)
- Test: extend existing hook tests

This is the largest task. Plan to ship this as a single PR but in two reviewable commits: (a) infrastructure + key surface; (b) consumer migration.

- [ ] **Step 1: Add the dependency**

```bash
cd frontend && npm install @tanstack/react-query
```

Confirm the version added is current (5.x as of writing). Run `npx tsc --noEmit` to ensure types come through.

- [ ] **Step 2: Mount `QueryClientProvider`**

In `frontend/src/main.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// wrap <App />:
<QueryClientProvider client={queryClient}>
  <App />
</QueryClientProvider>
```

- [ ] **Step 3: Define query keys + hooks**

```typescript
// frontend/src/queries/solves.ts
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '../services/api';
import type { Solve, SolvePayload } from '../types';

export const solvesKey = {
  all: ['solves'] as const,
  byPuzzle: (puzzleType: string) => ['solves', puzzleType] as const,
  page: (puzzleType: string, cursor: string | null) =>
    ['solves', puzzleType, 'page', cursor] as const,
};

export const personalBestsKey = {
  all: ['personalBests'] as const,
  byPuzzle: (puzzleType: string) => ['personalBests', puzzleType] as const,
};

export const useSolvesInfinite = (puzzleType: string) =>
  useInfiniteQuery({
    queryKey: solvesKey.byPuzzle(puzzleType),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.getSolves(puzzleType, pageParam ?? undefined, signal),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

export const usePersonalBests = (puzzleType: string) =>
  useQuery({
    queryKey: personalBestsKey.byPuzzle(puzzleType),
    queryFn: () => api.getPersonalBests(puzzleType),
  });

export const useCreateSolve = (puzzleType: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SolvePayload) => api.createSolve(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: solvesKey.byPuzzle(puzzleType) });
      qc.invalidateQueries({ queryKey: personalBestsKey.byPuzzle(puzzleType) });
    },
  });
};

export const useUpdateSolve = (puzzleType: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Solve> }) =>
      api.updateSolve(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: solvesKey.byPuzzle(puzzleType) });
      qc.invalidateQueries({ queryKey: personalBestsKey.byPuzzle(puzzleType) });
    },
  });
};

export const useDeleteSolve = (puzzleType: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSolve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: solvesKey.byPuzzle(puzzleType) });
      qc.invalidateQueries({ queryKey: personalBestsKey.byPuzzle(puzzleType) });
    },
  });
};
```

- [ ] **Step 4: Migrate `useSolveSession.ts`**

`useSolveSession` is large (~290 lines). Replace its internal solve fetch + mutation orchestration with:
- Read solves via `useSolvesInfinite(puzzleType)` and flatten pages.
- Replace `handleSolveComplete`/`Update`/`Delete` with calls to the mutation hooks above.
- Keep the median tracker / replay-state logic in `useSolveSession`; only the data layer moves.

Strategy: write a transitional wrapper that consumes the new hooks but exposes the existing public surface, so `SolveSession.tsx` (the consumer) does not need to change. Then delete the now-dead inline state.

Be ready to delete: `solves` `useState`, `nextCursor` state, manual optimistic snapshot/rollback in update/delete handlers, the `loadMore` wrapper (replace with `fetchNextPage`).

Keep: `sortedTimesRef`, `lastPercentile`, `currentMedian` recomputation. Drive recomputation off the flattened list returned by `useSolvesInfinite`. Use `useMemo` keyed on the data array reference + length.

- [ ] **Step 5: Migrate `useAllSolves.ts`**

Replace its manual paginated loop with `useInfiniteQuery`-based loading until `hasNextPage === false`. Or, simpler: keep `useAllSolves` and have it call `useSolvesInfinite` internally, then loop `await fetchNextPage()` until done. The AbortController concern is handled by react-query's `signal` parameter.

- [ ] **Step 6: Add a regression test**

```tsx
// frontend/src/queries/solves.test.tsx (new)
// Test: createSolve mutation invalidates personalBests query.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCreateSolve, usePersonalBests, personalBestsKey } from './solves';
import { api } from '../services/api';

vi.mock('../services/api');

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

it('invalidates personal bests after creating a solve', async () => {
  // arrange api mocks
  // call useCreateSolve, mutate, assert personalBests is refetched
  // (sketch — fill in based on existing mocking patterns in api.test.ts)
});
```

- [ ] **Step 7: Cross-page invalidation acceptance check**

Manual: open two tabs (or simulate by switching routes). Create a solve. Switch to Stats. New solve should appear without an explicit reload. (TanStack Query handles this through the shared cache.)

- [ ] **Step 8: Run tests**

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

- [ ] **Step 9: Bundle-size sanity check**

```bash
cd frontend && npm run build
```

Confirm `@tanstack/react-query` chunk is reasonable (~25 KB gzipped). If the Timer-route bundle grew significantly, file as a follow-up to investigate code-splitting.

- [ ] **Step 10: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/main.tsx frontend/src/queries frontend/src/hooks/useSolveSession.ts frontend/src/hooks/useAllSolves.ts frontend/src/services/api.ts
git commit -m "refactor(H.3): adopt TanStack Query for solves cache

Solves and personal bests are now keyed in a shared query cache.
Mutations invalidate both keys, so creating a solve on the timer
page propagates to Stats without a reload. Manual optimistic
snapshot/rollback in useSolveSession is removed in favor of
react-query's built-in mutation lifecycle."
```

---

## Verification (end-to-end)

After all 10 tasks ship:

- [ ] `cd backend && pytest -q` — green
- [ ] `cd frontend && npx vitest run --reporter=dot && npx tsc --noEmit` — green
- [ ] `cd frontend && npm run build` — succeeds; no source maps in production output
- [ ] CI on a final integration PR is green
- [ ] Manual click-through:
  1. Sign up; confirm migration toast.
  2. Record a solve on Timer.
  3. Switch to Stats and confirm the new solve is reflected (cross-page cache invalidation works — H.3).
  4. Hit `/api/v1/health` and `/api/v1/ready` via curl; confirm `/api/health` still works with `Deprecation` header (H.1, H.7).
  5. Trigger an error in dev (e.g. a temporary throw in Stats render); confirm ErrorBoundary fallback (H.5).
  6. Trigger a 422 by submitting an invalid solve; confirm toast reads from `error.code` (H.2).
  7. Create a share link; open it; confirm it works via the service-role path (H.8 sanity).
  8. Read `docs/guest-mode.md`; confirm the matrix matches what the code does (H.9).
  9. `psql` (or Supabase SQL editor): `SELECT metadata FROM solves LIMIT 1;` returns `{}` (H.12).
- [ ] Confirm `grep -rn "supabase.auth\." frontend/src` returns only `authClient.ts` (H.4 enforcement).
- [ ] Confirm `grep -rn "get_supabase_service_client" backend/app/routes` returns only the import line in `solves.py` (H.8 enforcement).

---

## Followups not in this plan

These three audit items are deferred to a separate plan because each requires a vendor decision the user has not yet made:

- **H.6** Sentry (or alternative) for error reporting. Pick: Sentry / PostHog / Highlight / GlitchTip / no-op.
- **H.10** Backend hosting target. Pick: Render / Fly / Railway / Cloud Run / Vercel functions.
- **H.11** Migration runner. Pick: yoyo-migrations / Supabase CLI managed / sqitch / hand-rolled Python script.

Once those decisions are made, write a follow-up plan at `docs/superpowers/plans/<date>-cluster-h-deferred.md` that wires each in.

---

## Plan-file location note

This plan was authored at `/Users/sia/.claude/plans/async-roaming-lighthouse.md` per the harness contract. After approval, copy it to the repo's plan directory:

```bash
cp /Users/sia/.claude/plans/async-roaming-lighthouse.md \
   "docs/superpowers/plans/2026-04-29-audit-cluster-h.md"
```

so it lives next to the other cluster plans.
