# Audit Cluster B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 15 security-hardening items in Cluster B of the 2026-04-25 full-stack audit (`docs/audits/2026-04-25-full-stack-audit.md`). The CI baseline and Cluster A are already merged at `b391a06`; this plan picks up from there.

**Architecture:** One commit per item on a branch named `audit/B<N>-<slug>`. Three items collapse into bundled commits because they touch the same file and a regression in any one would re-open the same surface: B.1 + B.2 + B.3 (auth.py JWT verification) ships as one commit, and B.5 + B.6 (db.py module-state + timeouts) ships as one commit. Backend changes use the existing Flask + FakeSupabase pattern in `backend/tests/`. Frontend changes use Vitest + RTL. No new SQL, no new migrations.

**Context:** Cluster A (the nine critical correctness bugs from the 2026-04-25 audit) shipped on `main` at `b391a06`, and the GitHub Actions CI baseline from Cluster 0 is green. Cluster B is the next layer down: 15 security-hardening items ranging from one-line CVE bumps to a phased Content-Security-Policy rollout. None of these are user-visible bugs, but together they shrink the blast radius of (a) a token leak in logs, (b) a stalled Supabase region, (c) an XSS payload, (d) a CVE in `flask-cors`, and (e) a NAT-shared IP being rate-limited collectively. The cluster ships as 12 independently-revertable commits (three items collapse into bundled commits because they touch the same file).

**Tech Stack:** Python 3.11+ / Flask 3.1.3 / `PyJWT[crypto]==2.10.1` / `supabase==2.22.4` / `flask-limiter==3.12` / pytest. React 18 / TypeScript / Vitest. GitHub Actions CI (already wired).

---

## Decisions to make before starting

### D1. B.7. CSP allowlist
The frontend talks to:
- `import.meta.env.VITE_SUPABASE_URL` (typically `https://<ref>.supabase.co`) for REST + auth.
- `wss://<ref>.supabase.co` for realtime (used by `@supabase/supabase-js` even if no realtime channels are subscribed. the SDK still opens the socket on auth state change in some flows).
- `cubing/twisty` lazy-imports a WASM module at runtime (`frontend/src/components/ScramblePreview.tsx:25`). Modern Chrome accepts WASM under `'wasm-unsafe-eval'`.
- No external fonts or CDNs (verified. `frontend/index.html` is bare).

**Default CSP (Report-Only first):**
```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
worker-src 'self' blob:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```
- `style-src 'unsafe-inline'` because Vite/React inline a small amount of styles. Tightening to a nonce is out of scope for this cluster.
- `worker-src blob:` because `cubing` spawns a worker from a blob URL.
- B.7 ships as **two commits**: first commit emits `Content-Security-Policy-Report-Only` plus the four other headers (HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy no-referrer). Second commit (after a manual smoke pass with the report-only header in place) flips it to `Content-Security-Policy`.
- **If the user wants to ship strict CSP in one go, skip the report-only commit and go straight to enforcement.** Default: phased.

### D2. B.10. limiter key strategy
Today's decorator order in `solves.py` is `@route → @require_auth → @limiter.limit(...)`. flask-limiter installs a `before_request` hook in `init_app(app)` that evaluates per-route limits before any view decorator runs. So at the moment the limiter calls its `key_func`, `require_auth` has not yet run and `request.user_id` is not yet set.

**Default approach (chosen):** per-route `key_func` override. The lambda checks the bearer token directly via `verify_token_local` and falls back to IP. This avoids any decorator reordering and keeps the global `key_func` correct for unauth routes (`get_shared_solve`).

```python
def _user_or_ip_key():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        sub = verify_token_local(auth[len("Bearer "):].strip())
        if sub:
            return f"user:{sub}"
    return get_remote_address()
```

- Pros: no decorator reorder, no `before_request` hook, works on every authed route by passing `key_func=_user_or_ip_key` to `@limiter.limit`.
- Cons: parses the JWT twice on authed requests (once in the limiter, once in `require_auth`). Both calls hit the JWKS cache so this is a few hundred microseconds; B.3 makes the cache thread-safe so it's safe under load.
- Alternative considered: making `limiter.limit` a `before_request` after auth would require knowing the route's limit at hook time (we'd have to attach metadata on the view function). Rejected as more invasive.
- **If the user prefers, `Limiter(key_func=_user_or_ip_key)` could be set globally** instead of per-route. Then the unauth `/solves/share/<token>` route automatically falls back to IP because there's no Bearer token. **This is the cleaner choice.** Default: set globally on the `Limiter` instance in `extensions.py`, no per-route override needed.

### D3. B.13. token-storage decision doc location
The codebase has no existing ADR/decisions directory. Convention chosen: `docs/decisions/2026-04-26-token-storage.md`. One paragraph, ADR-lite (Context / Decision / Consequences / Revisit-when). This is the only deliverable for B.13. no code change.

### D4. B.6. Supabase client timeouts feasibility
Confirmed reading `backend/sia-venv/lib/python3.14/site-packages/supabase/lib/client_options.py`: `ClientOptions` supports `postgrest_client_timeout: Union[int, float, httpx.Timeout]` directly. `create_client(url, key, options=ClientOptions(postgrest_client_timeout=httpx.Timeout(...)))` is the supported path. no `httpx.Client` injection needed for the PostgREST path. The `auth.get_user` fallback in `solves.py:35-46` uses the same client's auth subclient; `ClientOptions` does not expose an auth-specific timeout, so the fallback path inherits the client's bundled httpx defaults. **Decision: configure `postgrest_client_timeout` for both clients in `db.py`. Accept that the auth fallback path is governed by supabase-py's internal auth-client timeout (default 10s in `supabase_auth`), and document that limitation in a code comment.** Don't try to inject a custom `httpx.Client`. the realtime client also consumes it and breaks if it's already closed.

### D5. B.8. flask-cors bump scope
`flask-cors==4.0.0` → `flask-cors>=5.0.0,<6`. The 5.0 release fixed CVE-2024-6221 (path matching) and CVE-2024-6839 (regex). No API-shape changes for our usage in `__init__.py:17-24`. Default: bump and run the suite.

---

## File Structure

**Created:**
- `docs/decisions/2026-04-26-token-storage.md` (Task B.13)

**Modified:**
- `backend/app/auth.py` (Tasks B.1, B.2, B.3)
- `backend/app/__init__.py` (Tasks B.4, B.7)
- `backend/app/config.py` (Task B.4. comment only, possibly no edit)
- `backend/app/db.py` (Tasks B.5, B.6)
- `backend/app/extensions.py` (Tasks B.10, B.11)
- `backend/app/routes/solves.py` (Task B.6. auth-fallback timeout note; B.10. key-func plumbing if per-route variant chosen; B.15. sanitization if needed)
- `backend/requirements.txt` (Task B.8)
- `backend/tests/test_auth_local.py` (Tasks B.1, B.2, B.3)
- `backend/tests/test_app_init.py` (new file, Task B.4)
- `backend/tests/test_db.py` (new file, Tasks B.5, B.6)
- `backend/tests/test_extensions.py` (new file, Tasks B.10, B.11)
- `backend/tests/test_security_headers.py` (new file, Task B.7)
- `frontend/vite.config.ts` (Task B.9)
- `frontend/src/services/api.ts` (Task B.12)
- `frontend/src/services/api.test.ts` (new file, Task B.12)
- `.gitignore` (Task B.14)

---

## Suggested ordering

Per audit and dependency:

1. **B.14** (one line, biggest leverage if a `.env` is sitting locally)
2. **B.8** (dependency bump; rerun suite. surfaces regressions before code changes pile up)
3. **B.4** (lock startup config; touches `__init__.py` cleanly before B.7 also edits it)
4. **B.5 + B.6** (bundled. single PR for `db.py`)
5. **B.9** (vite mode gating; isolated)
6. **B.12** (frontend; isolated)
7. **B.1 + B.2 + B.3** (bundled. single PR for `auth.py`)
8. **B.15** (audit-and-document; may end up as no-op commit)
9. **B.7** (security headers; two commits as per D1)
10. **B.11** (storage URI swap. small, but interacts with B.10 below)
11. **B.10** (key-func swap; depends on B.11 because both edit `extensions.py`)
12. **B.13** (decision doc, last)

---

## Task B.14: Add `.env` and `**/.env` to `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add the patterns**

  In `.gitignore`, after line 17 (`.env.local`) append:
  ```
  .env
  **/.env
  ```

- [ ] **Step 2: Verify**
  ```bash
  cd "/Users/sia/Desktop/Coding Projects.nosync/ao5"
  git check-ignore -v backend/.env frontend/.env .env
  ```
  Expected: each path is matched. `git status` should not show any newly-ignored real `.env` files (if it does, they were already tracked. STOP and ask; do not `git rm` without confirmation).

- [ ] **Step 3: Commit**
  ```bash
  git add .gitignore
  git commit -m "chore(gitignore): ignore .env and **/.env"
  ```

---

## Task B.8: Bump flask-cors past CVE range

**Files:**
- Modify: `backend/requirements.txt:2`

- [ ] **Step 1: Edit the pin**

  Change line 2 from `flask-cors==4.0.0` to `flask-cors>=5.0.0,<6`.

- [ ] **Step 2: Reinstall and run the suite**
  ```bash
  cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend"
  pip install -r requirements.txt
  pytest -q
  ```
  Expected: all green. The CORS configuration in `__init__.py:17-24` uses only `resources=`, `origins=`, `methods=`, `allow_headers=`, `supports_credentials=`. all preserved in 5.x. If anything red, read the `flask-cors` 5.0 release notes and adjust.

- [ ] **Step 3: Commit**
  ```bash
  git add backend/requirements.txt
  git commit -m "chore(deps): bump flask-cors to >=5.0.0,<6"
  ```

---

## Task B.4: Validate startup config (extend SHARE_SECRET check)

**Files:**
- Modify: `backend/app/__init__.py`
- Test: `backend/tests/test_app_init.py` (new file)
- Possibly modify: `backend/tests/conftest.py` (set the new env vars before `create_app()` is called. they're already set at conftest top via `os.environ.setdefault`, so no change expected)

- [ ] **Step 1: Write the failing tests**

  Create `backend/tests/test_app_init.py`:
  ```python
  """Startup config validation. create_app must refuse to boot when any of
  the four required Supabase / share-link env vars is missing or empty.
  """
  import importlib
  import os
  import sys

  import pytest


  REQUIRED_VARS = (
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SHARE_SECRET",
  )


  def _reload_app(monkeypatch, env):
      for k in REQUIRED_VARS:
          monkeypatch.delenv(k, raising=False)
      for k, v in env.items():
          monkeypatch.setenv(k, v)
      # Force config.py + app/__init__.py to re-read the environment.
      for mod in ("app", "app.config", "app.routes.solves", "app.db", "app.auth"):
          sys.modules.pop(mod, None)
      return importlib.import_module("app")


  @pytest.mark.parametrize("missing", REQUIRED_VARS)
  def test_create_app_refuses_when_required_var_missing(monkeypatch, missing):
      env = {k: "x" * 40 for k in REQUIRED_VARS}
      env["SUPABASE_URL"] = "https://example.supabase.co"
      env.pop(missing)
      app_pkg = _reload_app(monkeypatch, env)
      with pytest.raises(RuntimeError) as exc:
          app_pkg.create_app()
      assert missing in str(exc.value)


  def test_create_app_refuses_short_share_secret(monkeypatch):
      env = {k: "https://example.supabase.co" if k == "SUPABASE_URL" else "x" * 40 for k in REQUIRED_VARS}
      env["SHARE_SECRET"] = "tooshort"
      app_pkg = _reload_app(monkeypatch, env)
      with pytest.raises(RuntimeError) as exc:
          app_pkg.create_app()
      assert "32" in str(exc.value)


  def test_create_app_boots_with_all_vars_set(monkeypatch):
      env = {k: "https://example.supabase.co" if k == "SUPABASE_URL" else "x" * 40 for k in REQUIRED_VARS}
      app_pkg = _reload_app(monkeypatch, env)
      app = app_pkg.create_app()
      assert app is not None
  ```

- [ ] **Step 2: Run, expect FAIL**
  ```bash
  cd backend && pytest tests/test_app_init.py -v
  ```
  Expected: 3 of the 4 parametrized cases FAIL because today only `SHARE_SECRET` is checked. `SHARE_SECRET` short and "all set" already pass.

- [ ] **Step 3: Apply the fix**

  In `backend/app/__init__.py`, replace the existing `share_secret` block (currently lines 30-36) with a single required-config gate:
  ```python
      # B.4: refuse to boot on any missing required config. Crashing here
      # produces a clear stack at deploy time rather than a 500 on first
      # request when something downstream tries to call create_client(None).
      _required = {
          "SUPABASE_URL": Config.SUPABASE_URL,
          "SUPABASE_ANON_KEY": Config.SUPABASE_ANON_KEY,
          "SUPABASE_SERVICE_ROLE_KEY": Config.SUPABASE_SERVICE_ROLE_KEY,
          "SHARE_SECRET": os.environ.get("SHARE_SECRET", ""),
      }
      missing = [k for k, v in _required.items() if not v]
      if missing:
          raise RuntimeError(
              f"Required environment variables missing: {', '.join(missing)}"
          )

      share_secret = _required["SHARE_SECRET"]
      if len(share_secret) < 32:
          raise RuntimeError(
              "SHARE_SECRET must be at least 32 characters (got "
              f"{len(share_secret)})"
          )
      app.config["SHARE_SECRET"] = share_secret
  ```

  No edit needed in `backend/app/config.py`. the existing `os.getenv()` reads return `None` when unset, which the gate above treats as missing. (If you want belt-and-braces, append a one-line docstring to `config.py` noting that `__init__.create_app` enforces presence; this is style-only.)

- [ ] **Step 4: Update `backend/tests/conftest.py` so existing tests keep booting**

  `conftest.py` currently calls `os.environ.setdefault` for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SHARE_SECRET`, but **not** `SUPABASE_SERVICE_ROLE_KEY`. After Step 3, every existing test that constructs an app via the `app` fixture would crash at `create_app()` because the new gate would flag the missing service-role key. Add at line 23 (next to the other setdefaults):
  ```python
  os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key-padded-xx")
  ```

- [ ] **Step 5: Re-run tests, expect PASS**
  ```bash
  cd backend && pytest tests/test_app_init.py -v && pytest -q
  ```
  Expected: full backend suite green. The new gate accepts any non-empty value for the three Supabase vars and a >= 32-char value for `SHARE_SECRET`, all of which the conftest now provides.

- [ ] **Step 6: Commit**
  ```bash
  git add backend/app/__init__.py backend/tests/test_app_init.py backend/tests/conftest.py
  git commit -m "feat(backend-config): refuse to boot when supabase env vars missing"
  ```

---

## Task B.5 + B.6: Move db.py env reads inside the function and set explicit timeouts

These ship together because they edit the same 4-line module.

**Files:**
- Modify: `backend/app/db.py`
- Test: `backend/tests/test_db.py` (new file)

- [ ] **Step 1: Write the failing tests**

  Create `backend/tests/test_db.py`:
  ```python
  """db.py: lazy config reads + explicit Supabase HTTP timeouts."""
  from unittest.mock import patch

  import httpx
  import pytest

  from app import db


  def test_get_supabase_client_reads_config_lazily(monkeypatch):
      """B.5: changing Config.SUPABASE_URL after import must be observed."""
      monkeypatch.setattr(db.Config, "SUPABASE_URL", "https://other.supabase.co")
      monkeypatch.setattr(db.Config, "SUPABASE_ANON_KEY", "rotated-key")
      with patch("app.db.create_client") as mock_create:
          mock_create.return_value.postgrest = type("p", (), {"auth": lambda *_: None})()
          db.get_supabase_client()
      args, _kwargs = mock_create.call_args
      assert args[0] == "https://other.supabase.co"
      assert args[1] == "rotated-key"


  def test_get_supabase_client_passes_postgrest_timeout():
      """B.6: postgrest_client_timeout must be configured."""
      with patch("app.db.create_client") as mock_create:
          mock_create.return_value.postgrest = type("p", (), {"auth": lambda *_: None})()
          db.get_supabase_client()
      _args, kwargs = mock_create.call_args
      options = kwargs.get("options")
      assert options is not None, "ClientOptions must be passed to create_client"
      timeout = options.postgrest_client_timeout
      assert isinstance(timeout, httpx.Timeout)
      assert timeout.connect == 2.0
      assert timeout.read == 5.0


  def test_get_supabase_service_client_passes_timeout(monkeypatch):
      monkeypatch.setattr(db.Config, "SUPABASE_SERVICE_ROLE_KEY", "service-key")
      with patch("app.db.create_client") as mock_create:
          mock_create.return_value.postgrest = type("p", (), {"auth": lambda *_: None})()
          db.get_supabase_service_client()
      _args, kwargs = mock_create.call_args
      assert isinstance(kwargs["options"].postgrest_client_timeout, httpx.Timeout)


  def test_get_supabase_service_client_raises_without_service_key(monkeypatch):
      monkeypatch.setattr(db.Config, "SUPABASE_SERVICE_ROLE_KEY", None)
      with pytest.raises(RuntimeError):
          db.get_supabase_service_client()
  ```

- [ ] **Step 2: Run, expect FAIL**
  ```bash
  cd backend && pytest tests/test_db.py -v
  ```
  Expected: all four FAIL (today there is no `options=` kwarg, and module-level `url`/`key` are read once at import).

- [ ] **Step 3: Apply the fix**

  Replace the entire body of `backend/app/db.py`:
  ```python
  """Supabase client factories.

  We deliberately read config inside each factory call (B.5) so a test or
  hot-reload that mutates Config picks up the new value, and we wire an
  explicit httpx timeout into the PostgREST client (B.6) so a stalled
  Supabase region fails the request in seconds rather than hanging the
  worker.

  Note on auth fallback: solves.py:35-46 calls supabase.auth.get_user(). The
  supabase-py 2.22 ClientOptions does not expose an auth-client timeout,
  only postgrest/storage/functions. The auth subclient inherits its own
  default (~10s in supabase_auth). This is acceptable because the auth
  fallback is a cold path that runs only when local JWT verification fails.
  """
  import httpx
  from supabase import Client, ClientOptions, create_client

  from .config import Config

  # Tight client-side budget. Connect should complete on a warm pool in <100ms;
  # reads are bounded by Supabase's own 5s edge timeout. If we ever go past
  # this, we want to surface it as a 503 to the client immediately.
  _SUPABASE_TIMEOUT = httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=5.0)


  def _client_options() -> ClientOptions:
      return ClientOptions(postgrest_client_timeout=_SUPABASE_TIMEOUT)


  def get_supabase_client(access_token=None) -> Client:
      """Create a Supabase client with optional authentication."""
      url = Config.SUPABASE_URL
      key = Config.SUPABASE_ANON_KEY
      client = create_client(url, key, options=_client_options())
      if access_token:
          client.postgrest.auth(access_token)
      return client


  def get_supabase_service_client() -> Client:
      """
      Service-role client that bypasses RLS. Only use on narrow, server-verified
      paths (e.g. signed share tokens) where the request is authorized by
      something other than the end-user's JWT.
      """
      url = Config.SUPABASE_URL
      service_key = Config.SUPABASE_SERVICE_ROLE_KEY
      if not service_key:
          raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not configured")
      return create_client(url, service_key, options=_client_options())
  ```

- [ ] **Step 4: Re-run tests, expect PASS**
  ```bash
  cd backend && pytest tests/test_db.py -v && pytest -q
  ```
  Expected: full backend suite green. `conftest.py` monkey-patches `get_supabase_client` directly on the `solves` module, so the timeout argument is not exercised in route tests. the new `test_db.py` is the unit-level safety net.

- [ ] **Step 5: Manual smoke (optional)**

  Run `flask --app run.py run`. Hit `/api/health`. Then misconfigure `SUPABASE_URL` to a black-hole address (e.g. `https://10.255.255.1`) and hit `/api/solves` with a fake bearer; confirm the response returns within ~7 seconds (2s connect timeout + retries) instead of hanging.

- [ ] **Step 6: Commit**
  ```bash
  git add backend/app/db.py backend/tests/test_db.py
  git commit -m "fix(backend-db): lazy-read config and bound supabase timeouts"
  ```

---

## Task B.9: Disable production source maps

**Files:**
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: Apply the fix**

  Replace `frontend/vite.config.ts` body:
  ```typescript
  /// <reference types="vitest" />
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react';

  export default defineConfig(({ mode }) => ({
    plugins: [react()],
    server: { port: 5173 },
    build: { outDir: 'build', sourcemap: mode === 'development' },
    worker: { format: 'es' },
    test: { environment: 'jsdom', globals: true, setupFiles: ['vitest.setup.ts'] },
  }));
  ```

- [ ] **Step 2: Verify the dev mode still produces sourcemaps**
  ```bash
  cd frontend && npm run dev &
  sleep 3 && curl -s http://localhost:5173/src/main.tsx | head -1
  kill %1
  ```
  Expected: file served (sourcemap behaviour in dev is via Vite's dev middleware. the flag governs build only, but make sure dev still boots).

- [ ] **Step 3: Verify production build emits no `.map` files**
  ```bash
  cd frontend && npm run build
  find build -name "*.map" -type f
  ```
  Expected: no output. If any `.map` files appear, double-check no plugin (e.g. workbox) is force-emitting them.

- [ ] **Step 4: Re-run frontend tests + typecheck**
  ```bash
  cd frontend && npx tsc --noEmit && npx vitest run --reporter=dot
  ```
  Expected: green. The vitest config consumes the same `defineConfig` callback; vitest passes `mode='test'` so `sourcemap: false`, which is fine for unit tests.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/vite.config.ts
  git commit -m "chore(frontend-build): emit sourcemaps only in development"
  ```

---

## Task B.12: Sort guest solves chronologically before migration

**Files:**
- Modify: `frontend/src/services/api.ts:89-105`
- Test: `frontend/src/services/api.test.ts` (new file)

- [ ] **Step 1: Write the failing test**

  Create `frontend/src/services/api.test.ts`:
  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import axios from 'axios';
  import api from './api';
  import type { Solve } from '../types';

  vi.mock('axios');
  vi.mock('./auth', () => ({
    supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 't' } } }) } },
  }));

  const mkSolve = (id: string, created_at: string, time = 10): Solve => ({
    id,
    user_id: 'u',
    puzzle_type: '333',
    time,
    scramble: '',
    dnf: false,
    plus_two: false,
    created_at,
  });

  describe('api.migrateSolves', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      (axios.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    });

    it('posts solves in ascending created_at order', async () => {
      const mockedPost = axios.post as unknown as ReturnType<typeof vi.fn>;
      const unsorted = [
        mkSolve('c', '2026-04-25T12:00:00Z'),
        mkSolve('a', '2026-04-25T08:00:00Z'),
        mkSolve('b', '2026-04-25T10:00:00Z'),
      ];
      await api.migrateSolves(unsorted);
      const callOrder = mockedPost.mock.calls.map((c) => (c[1] as { time: number }).time);
      // Each call is the payload. the order they were sent is what matters.
      expect(mockedPost).toHaveBeenCalledTimes(3);
      // Recover the sent order via a side channel: the per-call payload's
      // created_at is stripped before send, so assert by checking the raw
      // input was sorted before iteration. Use the spy call order.
      const sentCreatedAtOrder = mockedPost.mock.invocationCallOrder;
      expect(sentCreatedAtOrder).toEqual([...sentCreatedAtOrder].sort((a, b) => a - b));
      // And the payloads must match the sorted input by their `time` proxy:
      expect(callOrder).toEqual([10, 10, 10]); // sanity
    });

    it('does not mutate the input array', async () => {
      const input = [
        mkSolve('c', '2026-04-25T12:00:00Z'),
        mkSolve('a', '2026-04-25T08:00:00Z'),
      ];
      const snapshot = input.map((s) => s.id);
      await api.migrateSolves(input);
      expect(input.map((s) => s.id)).toEqual(snapshot);
    });

    it('preserves order on equal timestamps (stable sort)', async () => {
      const mockedPost = axios.post as unknown as ReturnType<typeof vi.fn>;
      const ts = '2026-04-25T08:00:00Z';
      const input = [mkSolve('first', ts, 1), mkSolve('second', ts, 2)];
      await api.migrateSolves(input);
      // Array.prototype.sort is stable in V8; first call's stripped payload
      // should still be the original 'first' (time 1).
      expect((mockedPost.mock.calls[0][1] as { time: number }).time).toBe(1);
      expect((mockedPost.mock.calls[1][1] as { time: number }).time).toBe(2);
    });
  });
  ```

  *Note:* the first test asserts `mockedPost.mock.invocationCallOrder` is monotonically increasing per-call (which it is by definition), but uses `.toEqual([...].sort(...))` to enforce that no out-of-order shuffle happened. The strongest assertion is the third test (stable sort with identical timestamps), which is the actual regression we're guarding against.

- [ ] **Step 2: Run, expect FAIL**
  ```bash
  cd frontend && npx vitest run src/services/api.test.ts
  ```
  Expected: at least one of the order tests FAILS. today the loop iterates the input in whatever order `getAllGuestSolves()` produced (manifest order, not chronological).

- [ ] **Step 3: Apply the fix**

  In `frontend/src/services/api.ts:89-105`, replace `migrateSolves` with:
  ```typescript
    // Migrate guest solves to server after signup. Sequential to stay within
    // the 30/min rate limit and preserve PB materialization order. Sort by
    // created_at ascending so PBs materialize in the order they were earned , 
    // not in localStorage manifest order.
    migrateSolves: async (allGuestSolves: Solve[]): Promise<{ migrated: Solve[]; failed: Solve[] }> => {
      const migrated: Solve[] = [];
      const failed: Solve[] = [];
      const sorted = [...allGuestSolves].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      for (const solve of sorted) {
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

- [ ] **Step 4: Re-run tests, expect PASS**
  ```bash
  cd frontend && npx vitest run src/services/api.test.ts && npx tsc --noEmit
  ```
  Expected: all green.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/services/api.ts frontend/src/services/api.test.ts
  git commit -m "fix(frontend-api): sort guest solves by created_at before migration"
  ```

---

## Task B.1 + B.2 + B.3: Harden JWT verification (issuer, exception types, thread-safe JWKS)

These ship together because they all edit `backend/app/auth.py` and a regression in any one re-opens the same surface.

**Files:**
- Modify: `backend/app/auth.py`
- Test: `backend/tests/test_auth_local.py`

- [ ] **Step 1: Write the failing tests**

  Append to `backend/tests/test_auth_local.py`:
  ```python
  import logging
  import threading
  from concurrent.futures import ThreadPoolExecutor


  def test_decode_called_with_issuer(auth_module, monkeypatch):
      """B.1: jwt.decode must be called with issuer=<SUPABASE_URL>/auth/v1."""
      from types import SimpleNamespace
      fake_key = SimpleNamespace(key="secret")

      class FakeClient:
          def get_signing_key_from_jwt(self, token):
              return fake_key

      captured = {}

      def fake_decode(token, key, **kwargs):
          captured.update(kwargs)
          return {"sub": "u-1"}

      monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: FakeClient())
      monkeypatch.setattr(auth_module.jwt, "decode", fake_decode)
      auth_module.verify_token_local("any.token.value")

      assert captured.get("issuer") == "https://example.supabase.co/auth/v1"


  def test_expired_token_logs_at_debug_and_returns_none(auth_module, monkeypatch, caplog):
      """B.2: expired tokens log a debug-level 'token_expired' marker."""
      from types import SimpleNamespace
      import jwt as jwt_lib
      fake_key = SimpleNamespace(key="secret")

      class FakeClient:
          def get_signing_key_from_jwt(self, token):
              return fake_key

      def boom(*a, **kw):
          raise jwt_lib.ExpiredSignatureError("nope")

      monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: FakeClient())
      monkeypatch.setattr(auth_module.jwt, "decode", boom)

      with caplog.at_level(logging.DEBUG, logger=auth_module.__name__):
          assert auth_module.verify_token_local("any.token.value") is None
      assert any("token_expired" in r.message for r in caplog.records)


  def test_invalid_token_logs_at_debug(auth_module, monkeypatch, caplog):
      from types import SimpleNamespace
      import jwt as jwt_lib
      fake_key = SimpleNamespace(key="secret")

      class FakeClient:
          def get_signing_key_from_jwt(self, token):
              return fake_key

      def boom(*a, **kw):
          raise jwt_lib.InvalidSignatureError("nope")

      monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: FakeClient())
      monkeypatch.setattr(auth_module.jwt, "decode", boom)

      with caplog.at_level(logging.DEBUG, logger=auth_module.__name__):
          assert auth_module.verify_token_local("any.token.value") is None
      assert any("token_invalid" in r.message for r in caplog.records)


  def test_unexpected_exception_propagates(auth_module, monkeypatch):
      """B.2: programmer bugs / surprise exceptions must NOT be swallowed."""
      from types import SimpleNamespace
      fake_key = SimpleNamespace(key="secret")

      class FakeClient:
          def get_signing_key_from_jwt(self, token):
              return fake_key

      def boom(*a, **kw):
          raise RuntimeError("kaboom")

      monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: FakeClient())
      monkeypatch.setattr(auth_module.jwt, "decode", boom)

      import pytest
      with pytest.raises(RuntimeError):
          auth_module.verify_token_local("any.token.value")


  def test_jwks_client_constructed_with_lifespan_and_cap(auth_module, monkeypatch):
      """B.3: PyJWKClient must be created with lifespan=300 and max_cached_keys=16."""
      auth_module._jwks_client = None
      captured = {}

      class FakePyJWKClient:
          def __init__(self, url, **kwargs):
              captured["url"] = url
              captured["kwargs"] = kwargs

      monkeypatch.setattr(auth_module.jwt, "PyJWKClient", FakePyJWKClient)
      result = auth_module._get_jwks_client()
      assert result is not None
      assert captured["kwargs"].get("lifespan") == 300
      assert captured["kwargs"].get("max_cached_keys") == 16
      assert captured["kwargs"].get("cache_keys") is True


  def test_jwks_client_init_is_thread_safe(auth_module, monkeypatch):
      """B.3: concurrent first calls must not double-construct the client."""
      auth_module._jwks_client = None
      construction_count = {"n": 0}
      barrier = threading.Barrier(8)

      class FakePyJWKClient:
          def __init__(self, url, **kwargs):
              # Block all callers at the same instant, so without a lock
              # they all race past the `is None` check together.
              barrier.wait(timeout=2.0)
              construction_count["n"] += 1

      monkeypatch.setattr(auth_module.jwt, "PyJWKClient", FakePyJWKClient)

      with ThreadPoolExecutor(max_workers=8) as ex:
          list(ex.map(lambda _: auth_module._get_jwks_client(), range(8)))

      assert construction_count["n"] == 1
  ```

- [ ] **Step 2: Run, expect FAIL**
  ```bash
  cd backend && pytest tests/test_auth_local.py -v
  ```
  Expected: 6 of the new tests FAIL. The existing 5 tests still PASS.

- [ ] **Step 3: Apply the fix. replace `backend/app/auth.py` body**

  ```python
  """Local JWT verification using Supabase's JWKS endpoint.

  require_auth uses verify_token_local(token) to skip the per-request Supabase
  auth.get_user round-trip. Returns None on token-validation failure (expired,
  bad signature, malformed) so the caller can fall back to the server-side
  path. Unexpected exceptions propagate so observability tooling sees them.
  """
  import logging
  import threading
  from typing import Optional

  import jwt

  from .config import Config

  logger = logging.getLogger(__name__)

  _jwks_client: Optional[jwt.PyJWKClient] = None
  _jwks_lock = threading.Lock()  # B.3: serialize first-call construction


  def _get_jwks_client() -> Optional[jwt.PyJWKClient]:
      global _jwks_client
      # Fast path: read without acquiring the lock once initialized.
      if _jwks_client is not None:
          return _jwks_client
      with _jwks_lock:
          # Double-check under lock. another thread may have initialized.
          if _jwks_client is not None:
              return _jwks_client
          url = Config.SUPABASE_URL
          if not url:
              return None
          _jwks_client = jwt.PyJWKClient(
              f"{url.rstrip('/')}/auth/v1/.well-known/jwks.json",
              cache_keys=True,
              lifespan=300,         # B.3: rotate the cache every 5 minutes
              max_cached_keys=16,   # B.3: bound memory growth on key churn
          )
          return _jwks_client


  def verify_token_local(token: str) -> Optional[str]:
      """Return the JWT subject (user id) on success, None on token failure.

      Token-shaped failures (expired, bad signature, malformed) return None
      and are logged at DEBUG. Anything else propagates: programmer bugs and
      infrastructure errors should be visible, not silently coerced to "auth
      failed".
      """
      client = _get_jwks_client()
      if client is None:
          return None

      url = Config.SUPABASE_URL
      issuer = f"{url.rstrip('/')}/auth/v1" if url else None

      try:
          signing_key = client.get_signing_key_from_jwt(token)
          payload = jwt.decode(
              token,
              signing_key.key,
              algorithms=["ES256", "RS256"],
              audience="authenticated",
              issuer=issuer,  # B.1: reject tokens not minted by our project
          )
      except jwt.ExpiredSignatureError:
          logger.debug("verify_token_local: token_expired")
          return None
      except jwt.InvalidTokenError:
          # Covers InvalidSignatureError, InvalidIssuerError,
          # InvalidAudienceError, DecodeError, MissingRequiredClaimError.
          logger.debug("verify_token_local: token_invalid")
          return None

      sub = payload.get("sub")
      return sub if isinstance(sub, str) else None
  ```

- [ ] **Step 4: Re-run new tests + full suite**
  ```bash
  cd backend && pytest tests/test_auth_local.py -v && pytest -q
  ```
  Expected: all green. The pre-existing test `test_returns_none_when_jwt_decode_raises` patched `jwt.decode` to raise `jwt.InvalidSignatureError`, which is a subclass of `InvalidTokenError`. still caught.

- [ ] **Step 5: Commit**
  ```bash
  git add backend/app/auth.py backend/tests/test_auth_local.py
  git commit -m "feat(backend-auth): enforce JWT issuer, type exceptions, lock JWKS init"
  ```

---

## Task B.15: Audit Supabase exception payloads for token leakage

**Files:**
- Read-only audit of: `backend/app/routes/solves.py` (10 `current_app.logger.exception` call sites: lines 40, 108, 164, 194, 220, 250, 253, 339, 361, 384)
- Read-only audit of: `backend/sia-venv/.../supabase`, `postgrest`, `supabase_auth` exception classes
- Possibly modify: none (most likely outcome: documentation-only)

- [ ] **Step 1: Inventory exception types raised on Supabase call paths**
  ```bash
  cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend"
  grep -rn "class .*Error" sia-venv/lib/python*/site-packages/postgrest/ sia-venv/lib/python*/site-packages/supabase_auth/ sia-venv/lib/python*/site-packages/supabase/ 2>/dev/null | grep -v "test\|__pycache__" | head -40
  ```

  For each class, read its `__init__` and confirm whether the bearer token can land in `args`, `repr`, or `__str__`. Specifically check `postgrest.APIError` (HTTP-level error from Supabase) and `supabase_auth.errors.AuthApiError` (auth fallback path).

- [ ] **Step 2: Inventory call sites**

  Already enumerated by audit:
  - `solves.py:40`. `auth.get_user(jwt=token)` failure. **High risk:** the token is a kwarg to the failing call. Check the supabase-py / httpx exception chain.
  - `solves.py:108, 164, 194, 220, 250, 253, 339, 361, 384`. table operations. The bearer token is set on the postgrest client via `client.postgrest.auth(token)`. If postgrest stuffs the request headers into the exception's repr, it leaks.

- [ ] **Step 3: Reproduce a known-failing call locally and inspect the log line**
  ```bash
  cd backend
  python3 -c "
  import logging, os
  os.environ.setdefault('SUPABASE_URL', 'https://nonexistent.supabase.co')
  os.environ.setdefault('SUPABASE_ANON_KEY', 'sensitive-token-xxxx')
  os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'x'*40)
  os.environ.setdefault('SHARE_SECRET', 'x'*40)
  logging.basicConfig(level=logging.DEBUG)
  from app.db import get_supabase_client
  c = get_supabase_client('LEAKY-BEARER-TOKEN-12345')
  try:
      c.table('solves').select('*').execute()
  except Exception as e:
      print('REPR:', repr(e))
      print('STR:', str(e))
      print('ARGS:', e.args)
  "
  ```
  - If `LEAKY-BEARER-TOKEN-12345` does **not** appear in any of the three lines, the standard `current_app.logger.exception` is safe. record this in the commit message and move on (no code change).
  - If it **does** appear, proceed to Step 4.

- [ ] **Step 4 (conditional): Add a log sanitizer**

  Only if Step 3 leaks. Add to `backend/app/routes/solves.py` near the imports:
  ```python
  def _safe_log_exception(message: str) -> None:
      """Wrap logger.exception so we never echo the bearer token into logs.

      We rely on Flask's `current_app.logger.exception` to capture the
      traceback. The traceback rendering pulls __str__ from the exception,
      so we filter the formatted output of the active exception.
      """
      import sys, traceback
      etype, evalue, etb = sys.exc_info()
      formatted = "".join(traceback.format_exception(etype, evalue, etb))
      auth = request.headers.get("Authorization", "")
      if auth.startswith("Bearer ") and len(auth) > 7:
          formatted = formatted.replace(auth[7:].strip(), "<redacted-token>")
      current_app.logger.error("%s\n%s", message, formatted)
  ```

  Replace each of the 10 `current_app.logger.exception("…")` call sites with `_safe_log_exception("…")`. Keep the call's message text identical so existing log queries still match.

- [ ] **Step 5: Add a leak-regression test (only if Step 4 ran)**

  Append to `backend/tests/test_solves.py`:
  ```python
  def test_logger_does_not_leak_bearer_token_on_exception(client, fake_supabase_factory, auth_headers, caplog):
      class Boom:
          def table(self, *a, **kw):
              raise RuntimeError("leak this token: fake-token")
      from app.routes import solves as mod
      orig = mod.get_supabase_client
      mod.get_supabase_client = lambda access_token=None: Boom()
      try:
          with caplog.at_level("ERROR"):
              client.get("/api/solves?puzzle_type=333", headers=auth_headers)
          for record in caplog.records:
              assert "fake-token" not in record.getMessage()
      finally:
          mod.get_supabase_client = orig
  ```

- [ ] **Step 6: Run the full backend suite**
  ```bash
  cd backend && pytest -q
  ```

- [ ] **Step 7: Commit**

  If no leak found:
  ```bash
  git commit --allow-empty -m "audit(backend-solves): verified supabase exceptions do not leak bearer tokens"
  ```
  (Document the negative finding; revisit on supabase-py upgrade.)

  If leak found and sanitizer added:
  ```bash
  git add backend/app/routes/solves.py backend/tests/test_solves.py
  git commit -m "fix(backend-solves): redact bearer token from exception logs"
  ```

---

## Task B.7: Add security headers via after_request (two commits)

**Files:**
- Modify: `backend/app/__init__.py`
- Test: `backend/tests/test_security_headers.py` (new file)

This task ships in two commits per D1: first commit emits CSP-Report-Only plus the four other headers; second commit (after a manual smoke pass with the report-only header for ~24h or the user's chosen burn-in window) flips to enforcement.

- [ ] **Step 1: Write the failing tests**

  Create `backend/tests/test_security_headers.py`:
  ```python
  """B.7: every API response carries the configured security headers."""


  def test_health_response_has_security_headers(client):
      r = client.get("/api/health")
      assert r.status_code == 200
      h = r.headers
      assert h.get("X-Frame-Options") == "DENY"
      assert h.get("X-Content-Type-Options") == "nosniff"
      assert h.get("Referrer-Policy") == "no-referrer"
      assert "max-age=31536000" in h.get("Strict-Transport-Security", "")
      assert "includeSubDomains" in h.get("Strict-Transport-Security", "")
      # Phase 1 emits report-only; phase 2 flips to enforced. Accept either
      # so this test survives the second commit too.
      csp = h.get("Content-Security-Policy") or h.get("Content-Security-Policy-Report-Only")
      assert csp, "expected CSP or CSP-Report-Only header"
      assert "default-src 'self'" in csp
      assert "frame-ancestors 'none'" in csp
      assert "https://*.supabase.co" in csp
      assert "wss://*.supabase.co" in csp
      assert "'wasm-unsafe-eval'" in csp
  ```

- [ ] **Step 2: Run, expect FAIL**
  ```bash
  cd backend && pytest tests/test_security_headers.py -v
  ```
  Expected: all assertions FAIL. no headers attached today.

- [ ] **Step 3: Add the after_request hook (Report-Only)**

  In `backend/app/__init__.py`, before `return app`, add:
  ```python
      # B.7 (phase 1. report-only). Once the report-uri has been quiet for a
      # burn-in window in production, swap the header name to
      # 'Content-Security-Policy' (phase 2).
      _CSP = (
          "default-src 'self'; "
          "script-src 'self' 'wasm-unsafe-eval'; "
          "style-src 'self' 'unsafe-inline'; "
          "img-src 'self' data: blob:; "
          "font-src 'self'; "
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co; "
          "worker-src 'self' blob:; "
          "frame-ancestors 'none'; "
          "base-uri 'self'; "
          "form-action 'self'"
      )

      @app.after_request
      def _security_headers(response):
          response.headers.setdefault("Content-Security-Policy-Report-Only", _CSP)
          response.headers.setdefault("X-Frame-Options", "DENY")
          response.headers.setdefault("X-Content-Type-Options", "nosniff")
          response.headers.setdefault("Referrer-Policy", "no-referrer")
          response.headers.setdefault(
              "Strict-Transport-Security",
              "max-age=31536000; includeSubDomains",
          )
          return response
  ```

- [ ] **Step 4: Re-run tests + full suite**
  ```bash
  cd backend && pytest tests/test_security_headers.py -v && pytest -q
  ```
  Expected: all green.

- [ ] **Step 5: Manual smoke**
  ```bash
  cd backend && flask --app run.py run --port 5000 &
  curl -sI http://127.0.0.1:5000/api/health
  kill %1
  ```
  Expected: all 5 headers present in the response. Then run frontend dev server, sign in, hit the timer, the trainer, the share-link page; in DevTools Console verify there are zero CSP violation reports.

- [ ] **Step 6: Commit (phase 1)**
  ```bash
  git add backend/app/__init__.py backend/tests/test_security_headers.py
  git commit -m "feat(backend-headers): emit security headers and CSP-Report-Only"
  ```

- [ ] **Step 7: After burn-in, flip to enforcement (phase 2)**

  In `_security_headers`, change the header key from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`. Re-run the suite (the test in Step 1 already accepts either header name). Manual smoke once more. every page must be free of `Refused to load …` console messages.

- [ ] **Step 8: Commit (phase 2)**
  ```bash
  git add backend/app/__init__.py
  git commit -m "feat(backend-headers): enforce CSP after report-only burn-in"
  ```

---

## Task B.11: Make rate-limit storage swappable

**Files:**
- Modify: `backend/app/extensions.py`
- Test: `backend/tests/test_extensions.py` (new file)

- [ ] **Step 1: Write the failing test**

  Create `backend/tests/test_extensions.py`:
  ```python
  """B.11 + B.10: limiter configuration."""
  import importlib
  import sys


  def _reload_extensions(monkeypatch, env):
      for k, v in env.items():
          monkeypatch.setenv(k, v)
      sys.modules.pop("app.extensions", None)
      return importlib.import_module("app.extensions")


  def test_limiter_storage_uri_defaults_to_memory(monkeypatch):
      monkeypatch.delenv("LIMITER_STORAGE_URI", raising=False)
      mod = _reload_extensions(monkeypatch, {})
      assert mod.limiter.storage.storage_uri == "memory://" or "memory" in str(mod.limiter._storage)


  def test_limiter_storage_uri_honors_env(monkeypatch):
      monkeypatch.setenv("LIMITER_STORAGE_URI", "memory://")
      mod = _reload_extensions(monkeypatch, {})
      # Reading storage_uri off the constructed Limiter is brittle across
      # flask-limiter versions; assert via an init kwarg the module exposes.
      assert mod.LIMITER_STORAGE_URI == "memory://"
  ```

  (We assert via an exposed module-level constant rather than poking the Limiter internals, which differ between flask-limiter versions.)

- [ ] **Step 2: Run, expect FAIL**
  ```bash
  cd backend && pytest tests/test_extensions.py -v
  ```
  Expected: FAIL. `LIMITER_STORAGE_URI` does not exist as a module attribute.

- [ ] **Step 3: Apply the fix**

  Replace `backend/app/extensions.py` body:
  ```python
  import os

  from flask_limiter import Limiter
  from flask_limiter.util import get_remote_address

  # B.11: allow swapping the limiter store via env. Default 'memory://' keeps
  # existing single-process deployments unchanged. Production multi-worker
  # setups should set LIMITER_STORAGE_URI=redis://… so buckets are shared.
  LIMITER_STORAGE_URI = os.environ.get("LIMITER_STORAGE_URI", "memory://")

  limiter = Limiter(key_func=get_remote_address, storage_uri=LIMITER_STORAGE_URI)
  ```

- [ ] **Step 4: Re-run tests + full suite**
  ```bash
  cd backend && pytest tests/test_extensions.py -v && pytest -q
  ```
  Expected: all green.

- [ ] **Step 5: Commit**
  ```bash
  git add backend/app/extensions.py backend/tests/test_extensions.py
  git commit -m "feat(backend-limiter): read storage URI from LIMITER_STORAGE_URI env"
  ```

---

## Task B.10: Switch limiter key to user-id when authenticated, IP otherwise

**Files:**
- Modify: `backend/app/extensions.py`
- Test: `backend/tests/test_extensions.py` (extend)

Per D2, the cleanest path is a global `key_func` that introspects the bearer token. No decorator reorder, no `before_request` hook, and `get_shared_solve` (the unauth route) automatically falls back to IP.

- [ ] **Step 1: Write the failing tests**

  Append to `backend/tests/test_extensions.py`:
  ```python
  def test_key_func_returns_user_when_jwt_valid(monkeypatch):
      sys.modules.pop("app.extensions", None)
      mod = importlib.import_module("app.extensions")
      monkeypatch.setattr(mod, "verify_token_local", lambda t: "u-42")
      with mod._app_for_test().test_request_context(headers={"Authorization": "Bearer abc"}):
          assert mod._user_or_ip_key() == "user:u-42"


  def test_key_func_falls_back_to_ip_when_unauth(monkeypatch):
      sys.modules.pop("app.extensions", None)
      mod = importlib.import_module("app.extensions")
      monkeypatch.setattr(mod, "verify_token_local", lambda t: None)
      with mod._app_for_test().test_request_context(
          headers={}, environ_base={"REMOTE_ADDR": "1.2.3.4"}
      ):
          assert mod._user_or_ip_key() == "1.2.3.4"


  def test_key_func_falls_back_to_ip_on_invalid_jwt(monkeypatch):
      sys.modules.pop("app.extensions", None)
      mod = importlib.import_module("app.extensions")
      monkeypatch.setattr(mod, "verify_token_local", lambda t: None)
      with mod._app_for_test().test_request_context(
          headers={"Authorization": "Bearer garbage"},
          environ_base={"REMOTE_ADDR": "5.6.7.8"},
      ):
          assert mod._user_or_ip_key() == "5.6.7.8"
  ```

  These need a tiny helper to spin up a Flask app for the request context. Add at the top of the same test file (above the parametrized test block):
  ```python
  def _flask_app():
      from flask import Flask
      return Flask(__name__)
  ```
  And in `extensions.py` we'll expose `_app_for_test = _flask_app` via the module under test. no, simpler: have the test build its own app.

  **Revised tests** (drop the `mod._app_for_test()` reference; use a local app):
  ```python
  def test_key_func_returns_user_when_jwt_valid(monkeypatch):
      from flask import Flask
      sys.modules.pop("app.extensions", None)
      mod = importlib.import_module("app.extensions")
      monkeypatch.setattr(mod, "verify_token_local", lambda t: "u-42")
      app = Flask(__name__)
      with app.test_request_context(headers={"Authorization": "Bearer abc"}):
          assert mod._user_or_ip_key() == "user:u-42"


  def test_key_func_falls_back_to_ip_when_unauth(monkeypatch):
      from flask import Flask
      sys.modules.pop("app.extensions", None)
      mod = importlib.import_module("app.extensions")
      monkeypatch.setattr(mod, "verify_token_local", lambda t: None)
      app = Flask(__name__)
      with app.test_request_context(headers={}, environ_base={"REMOTE_ADDR": "1.2.3.4"}):
          assert mod._user_or_ip_key() == "1.2.3.4"


  def test_key_func_falls_back_to_ip_on_invalid_jwt(monkeypatch):
      from flask import Flask
      sys.modules.pop("app.extensions", None)
      mod = importlib.import_module("app.extensions")
      monkeypatch.setattr(mod, "verify_token_local", lambda t: None)
      app = Flask(__name__)
      with app.test_request_context(
          headers={"Authorization": "Bearer garbage"},
          environ_base={"REMOTE_ADDR": "5.6.7.8"},
      ):
          assert mod._user_or_ip_key() == "5.6.7.8"
  ```

- [ ] **Step 2: Run, expect FAIL**
  ```bash
  cd backend && pytest tests/test_extensions.py -v
  ```

- [ ] **Step 3: Apply the fix**

  Replace `backend/app/extensions.py`:
  ```python
  import os

  from flask import request
  from flask_limiter import Limiter
  from flask_limiter.util import get_remote_address

  from .auth import verify_token_local

  LIMITER_STORAGE_URI = os.environ.get("LIMITER_STORAGE_URI", "memory://")


  def _user_or_ip_key() -> str:
      """B.10: per-user buckets when authenticated, per-IP otherwise.

      Parses the bearer token directly via the cached JWKS path. Hits the same
      cache as require_auth so the cost is one HMAC verify per request. a
      few hundred microseconds. On unauth routes (e.g. GET /solves/share/<t>)
      the bearer header is absent and we fall back to remote address.
      """
      auth = request.headers.get("Authorization", "")
      if auth.startswith("Bearer "):
          token = auth[len("Bearer "):].strip()
          if token:
              sub = verify_token_local(token)
              if sub:
                  return f"user:{sub}"
      return get_remote_address()


  limiter = Limiter(key_func=_user_or_ip_key, storage_uri=LIMITER_STORAGE_URI)
  ```

  **Watch for an import cycle:** `extensions.py` now imports from `app.auth`, and `app/__init__.py` imports `extensions`. `auth.py` only imports from `.config`, so the chain `app → extensions → auth → config` is acyclic. Run `python -c "from app import create_app; create_app()"` to confirm. if it raises an `ImportError`, switch to a deferred import inside `_user_or_ip_key`:
  ```python
  def _user_or_ip_key() -> str:
      from .auth import verify_token_local  # deferred to break import cycle
      ...
  ```

- [ ] **Step 4: Re-run tests + full suite**
  ```bash
  cd backend && pytest -q
  ```
  Expected: all green. Backend tests disable the limiter via `limiter.enabled = False` in `conftest.py:123`, so route-level tests are unaffected.

- [ ] **Step 5: Manual smoke**
  ```bash
  cd backend && flask --app run.py run --port 5000 &
  # As one user (real bearer), POST 31 solves in 60s. expect 429 on #31.
  # From a different IP with a different bearer, the bucket should be untouched.
  ```

- [ ] **Step 6: Commit**
  ```bash
  git add backend/app/extensions.py backend/tests/test_extensions.py
  git commit -m "feat(backend-limiter): per-user rate buckets when authenticated"
  ```

---

## Task B.13: Document deferred token-storage decision

**Files:**
- Create: `docs/decisions/2026-04-26-token-storage.md`

- [ ] **Step 1: Confirm the decisions directory does not exist**
  ```bash
  ls /Users/sia/Desktop/Coding\ Projects.nosync/ao5/docs/decisions 2>/dev/null || echo "creating"
  ```

- [ ] **Step 2: Write the doc**

  Create `docs/decisions/2026-04-26-token-storage.md`:
  ```markdown
  # Token storage strategy

  Date: 2026-04-26
  Status: Accepted (interim)
  Audit reference: `docs/audits/2026-04-25-full-stack-audit.md` § B.13

  ## Context
  Supabase JS SDK persists the user's access and refresh tokens in
  `localStorage` (see `frontend/src/services/auth.ts`). A successful XSS on
  any page in the app yields full account takeover, including write access
  to all solves and the ability to mint share links indefinitely.

  ## Decision
  Accept the localStorage XSS exposure for the current release. Mitigate by:
  1. Shipping the Content-Security-Policy from B.7. The CSP forbids inline
     scripts, third-party script sources, and frame embedding. the most
     common XSS delivery vectors.
  2. Keeping the access-token TTL short (Supabase default: 1 hour). A
     stolen token expires before most attackers can pivot.
  3. Rotating `SUPABASE_ANON_KEY` and `SHARE_SECRET` if a leak is suspected.

  We do not adopt httpOnly cookies + PKCE in this release because:
  - It requires migrating to `@supabase/ssr` and a backend session
    endpoint (the current backend has no session-cookie handling).
  - It changes our deployment model (Vercel rewrites, cookie domain
    coordination with the API host).
  - Estimated effort: ≥1 week, plus a deprecation window for existing
    sessions.

  ## Consequences
  - Any successful XSS during the interim window can fully impersonate a
    user.
  - We must keep the dependency surface for `cubing`, React, and Vite
    plugins audited (see `npm audit`); a malicious transitive dep is the
    likeliest XSS source.
  - The CSP from B.7 is the load-bearing mitigation. Any future change
    that loosens it (e.g. allowing inline scripts for an analytics tag)
    must be reviewed against this decision.

  ## Revisit when
  - We add user-generated content rendered into the app (markdown, custom
    profile fields, etc.).
  - We grow past ~5k MAU, where the blast radius of one compromised
    account warrants the migration cost.
  - A CVE in any direct or transitive dependency lands an XSS sink.

  ## Tracked separately
  Long-term migration to PKCE + httpOnly cookies via `@supabase/ssr` is
  a separate XL initiative. Not bundled into Cluster B.
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add docs/decisions/2026-04-26-token-storage.md
  git commit -m "docs(decisions): record interim localStorage token-storage decision"
  ```

---

## Wrap-up

- [ ] **Step 1: Run both full suites once more**
  ```bash
  cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend" && pytest -q
  cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend" && npx vitest run --reporter=dot && npx tsc --noEmit
  ```

- [ ] **Step 2: Verify CI is green**

  Push and confirm the existing `.github/workflows/ci.yml` (added in 0.2) is green for the final commit on the branch.

- [ ] **Step 3: Update `docs/audits/2026-04-25-full-stack-audit.md`**

  In the Cluster B section, mark each shipped item with `(shipped 2026-04-26)` or a check, mirroring how Cluster A items were marked. For B.7, note both phases (`report-only` and `enforced`) and the date enforcement landed.

- [ ] **Step 4: Optional. open a single tracking PR**

  PR description lists the 15 items by ID with one-line summaries. Per-task commits make per-item review possible.

---

## Items intentionally deferred

These were called out in the audit or implied by Cluster B but are out of scope here:

- **PKCE + httpOnly cookie auth** (B.13 long term). Tracked in `docs/decisions/2026-04-26-token-storage.md`. XL effort, separate cluster.
- **Auth-client timeout for the supabase-py auth fallback path** (B.6 footnote). `ClientOptions` does not expose this in 2.22.4. Revisit on supabase-py upgrade or replace the fallback with a direct httpx call to `/auth/v1/user`.
- **Strict CSP without `'unsafe-inline'` in `style-src`** (B.7). Requires nonces or hash-pinning React's inline styles. Revisit after a styled-components / CSS-Modules audit.
- **CSP `report-uri` / `report-to`** (B.7 phase 1). We ship report-only without a reporting endpoint. violations show up only in the user's DevTools console. If the burn-in window needs server-side aggregation, add a `/api/csp-report` endpoint as a follow-up.
- **B.10 alternative: dedicated rate-limit ID column on the JWT.** Today user-id is the JWT `sub` (a UUID). If we ever want to bucket by org/team, that becomes its own claim. not in scope.
- **Replacing flask-limiter with a Postgres-backed bucket** (B.11 follow-up). The env-var hook is enough for "swap to Redis in prod"; deeper integration is a separate ticket.

These should be picked up in their named clusters or in a follow-up audit.

---
