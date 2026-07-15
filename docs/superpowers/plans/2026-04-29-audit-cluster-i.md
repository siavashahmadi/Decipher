# Audit Cluster I Implementation Plan (documentation and ops polish)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Context

The 2026-04-25 full-stack audit's Cluster I bundles thirteen small documentation, accessibility, and ops items (I.1 through I.13). They are individually trivial but collectively close several real gaps: three READMEs still reference removed dependencies (`python-jose`, `Jest`) and stale numbers ("last 10 solves"), `SHARE_SECRET` rotation has no operator runbook, the JWT fast/slow paths are undocumented and unobservable, the backend ships unstructured logs, two dialogs lack `aria-modal` and a focus trap, and a handful of small frontend bugs remain (URLSearchParams mutation, hardcoded "10,000 solves" text, index-as-key in trainer lists, unicode-escape gear glyph, missing `aria-busy` on loading indicators).

I.10 ("replace alert() with toasts in Auth") was already shipped during Cluster E (2026-04-27); this plan verifies the state in Task 0 rather than treating it as live work.

The plan keeps each audit ID in its own task / PR for tracker hygiene, in line with how Clusters A, B, E, and H were sequenced. Smaller backend code changes (I.5 fallback log, I.6 JSON logging) follow the project's TDD pattern; documentation tasks ship as straightforward edits with a verification command.

**Goal:** Ship every Cluster I item from the 2026-04-25 audit so docs match the current codebase, the modal dialogs meet basic accessibility expectations, the JWT slow path becomes observable, the backend emits structured logs, and the small frontend cleanups (URL search params, derived constants, raw glyphs, `aria-busy`) are done.

**Architecture:**
- **Docs (I.1-I.5):** Update three READMEs in place; add two new docs under `docs/`: `share-secret-rotation.md` (I.4) and `jwt-verification.md` (I.5). The rotation doc explains the current stateless 30-day-TTL token shape and recommends a future dual-secret rolling-window scheme. The JWT doc describes the fast (local JWKS) and slow (Supabase `auth.get_user`) paths, paired with a small structured-log change so operators can grep fallback rate.
- **Backend logging (I.6):** Hand-roll a `JsonFormatter` (no new dependency) and wire it via `logging.dictConfig` from `create_app`. Add `before_request` to attach a per-request `g.request_id` (uuid4) and `after_request` to emit one structured access log line per request including `user_id` (set by `require_auth` after the request body runs). Pin behaviour with `tests/test_logging.py`.
- **Frontend a11y (I.7, I.13):** Add a hand-rolled `useFocusTrap(ref, enabled)` hook (~40 lines) that captures focusables on open, focuses the first, traps Tab / Shift+Tab, and restores focus on close. Apply to `SolveDetailModal` and `HotkeyHelp` along with `aria-modal="true"`. Tag remaining loading indicators (Stats page, `Scramble` component, Auth submit button) with `aria-busy`.
- **Frontend cleanups (I.8, I.9, I.11, I.12):** Composite key for `TrainerRecentStrip`, `new URLSearchParams(prev)` in `Stats.tsx`, derive `MAX_SOLVES = MAX_PAGES * DEFAULT_PAGE_SIZE` in `queries/solves.ts` and consume it in `Stats.tsx`, replace `{'⚙'}` with raw `⚙`.

**Tech Stack:** Flask 3.1, Python 3.11+ stdlib `logging.config.dictConfig` + custom `logging.Formatter`, React 18, TypeScript (strict), Vitest, pytest, sonner (already wired).

**Sequencing logic:**
1. Task 0 pre-flight: green baseline, verify I.10 already done.
2. Documentation tasks first (I.1-I.5). Cheap, no code risk, unblocks reviewers.
3. Backend code changes (I.5 fallback log, I.6 JSON logging) before frontend so the next two test runs hit a stable backend.
4. Frontend a11y (I.7, I.13). Affects shared modal behaviour.
5. Small frontend cleanups (I.8, I.9, I.11, I.12) last - low blast radius, easy to bundle in review.

Each Task ships as a separate PR. Run the relevant test suite at the end of every Task before committing.

---

## Task 0: Pre-flight

**Files:** none modified; reads only.

- [ ] **Step 1: Confirm green baseline**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend" && pytest -q
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend" && npx vitest run --reporter=dot && npx tsc --noEmit
```

Expected: all green. If anything is red, stop and triage before starting Task 1.

- [ ] **Step 2: Verify I.10 (alert → toast in Auth) already shipped**

```bash
grep -nE "\balert\(" "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend/src/components/Auth.tsx"
```

Expected: zero matches. (Cluster E shipped this on 2026-04-27.) If a match appears, replace it with `toast.success(...)` or `toast.error(...)` here as part of pre-flight; do not invent a separate task.

- [ ] **Step 3: Note current Python version**

```bash
"/Users/sia/Desktop/Coding Projects.nosync/ao5/backend/venv/bin/python" --version 2>/dev/null || python3 --version
```

Record what comes back; Task 4 (I.3) will update `backend/README.md` from "Python 3.9+" to match the actual minimum the project currently runs on. (PyJWT 2.10.1 + Flask 3.1 both work on 3.10+; pick the floor that matches what the venv actually uses.)

- [ ] **Step 4: Read the relevant audit section**

Read `docs/audits/2026-04-25-full-stack-audit.md` lines 699-746 (Cluster I).

---

## Task 1 (I.1): Update root `README.md`

**Why:** Root README still references removed dependencies (`python-jose`, `Jest`) and an outdated metric ("last 10 solves" - the actual trend window is 12). The tech-stack table also fails to mention share links, the lifetime cap, PyJWT, or JWKS, all of which shipped in Clusters A, B, and E.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace "last 10 solves"**

In `README.md` change line 12:

```diff
-- Performance trend chart (last 10 solves)
+- Performance trend chart (last 12 solves)
```

(The 12-solve trend window is computed in `frontend/src/utils/recentTrend.ts`; verify with `grep -n "12" frontend/src/utils/recentTrend.ts` if you want a sanity check.)

- [ ] **Step 2: Replace the Tech Stack rows for auth and frontend testing**

Edit lines 24 and 28 of `README.md`:

```diff
-| Backend auth middleware | python-jose, Supabase SDK |
+| Backend auth middleware | PyJWT (local JWKS verification with Supabase fallback) |
...
-| Testing (frontend) | React Testing Library, Jest |
+| Testing (frontend) | React Testing Library, Vitest |
```

- [ ] **Step 3: Add rows for share links and the lifetime cap**

After the "Auth & database" row, add:

```markdown
| Share links | HMAC-SHA256 signed tokens, 30-day TTL (see `docs/share-secret-rotation.md`) |
| Solve lifetime cap | 100,000 per user, enforced via `user_stats` counter table |
```

- [ ] **Step 4: Update the Features list to mention share links and guests**

Edit the Features section (lines 7-14) to reflect the actual current product. Add two bullets after "User auth":

```markdown
- Guest mode (solves saved to localStorage; one-shot migration on first sign-in)
- Shareable read-only solve links with 30-day expiry
```

- [ ] **Step 5: Verify**

```bash
grep -n "python-jose\|Jest\|last 10 solves" "/Users/sia/Desktop/Coding Projects.nosync/ao5/README.md"
```

Expected: zero matches.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs(I.1): refresh root README for current stack and features"
```

---

## Task 2 (I.2): Update `frontend/README.md`

**Why:** Component Overview is missing four shipped components (Trainers, Stats, SharedSolve, ScramblePreview); the Services section still lists `src/services/auth` as the Supabase client surface, but the canonical client is now `src/services/authClient` (added in H.4).

**Files:**
- Modify: `frontend/README.md`

- [ ] **Step 1: Expand the Component Overview table**

Edit `frontend/README.md` lines 61-72. The current table ends with `Auth`; append four rows so it reads:

```markdown
| Component | Role |
|---|---|
| `App` | Auth gate — shows `Auth` or `SolveSession` based on session state |
| `SolveSession` | Main orchestrator; owns solve state and passes handlers to children |
| `Timer` | Spacebar and touch timer; 10ms resolution |
| `Scramble` | Generates and displays WCA scrambles via cubing.js |
| `ScramblePreview` | 3D preview of the current scramble (twisty player) |
| `SolveHub` | Stats grid (Ao5, best, average) + line chart |
| `SolveLog` | Scrollable solve list with DNF/+2 toggles and delete; computes Ao5, Ao12, mean, best |
| `Header` | Puzzle type selector and sign-out |
| `Auth` | Sign in, sign up, password reset, and password update forms |
| `Trainers` | OLL/PLL/F2L/CMLL trainer; per-case scramble generation and recent strip |
| `Stats` | Full-history view with date filtering, distribution charts, PB progression, and CSV export |
| `SharedSolve` | Read-only public view of a solve via `/s/<token>` (no auth required) |
```

- [ ] **Step 2: Fix the Services list**

Edit lines 74-77 to reflect the actual modules:

```markdown
## Services

- `src/services/authClient` — Thin `AuthClient` interface wrapping the Supabase JS SDK (`getAccessToken`, `signInWithPassword`, `signUp`, `signOut`, `resetPasswordForEmail`, `updatePassword`, `onSignIn`). Imported as `supabaseAuthClient`.
- `src/services/auth` — Supabase JS client instance (`supabase`); re-exports `signOut`. Most callers should use `authClient` instead.
- `src/services/api` — Axios wrapper; automatically attaches the current session's Bearer token to every request and parses the standardized `{ "error": { "code", "message", "fields" } }` envelope.
- `src/services/guestStorage` — localStorage-backed solve store used in guest mode.
```

(If `src/services/auth.ts` no longer exists or has been further reduced, drop the second bullet. Run `ls frontend/src/services/` to confirm the actual files before editing.)

- [ ] **Step 3: Verify**

```bash
ls "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend/src/services/"
grep -nE "Trainers|Stats|SharedSolve|ScramblePreview" "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend/README.md"
```

Expected: all four component names present in the README.

- [ ] **Step 4: Commit**

```bash
git add frontend/README.md
git commit -m "docs(I.2): document Trainers, Stats, SharedSolve, ScramblePreview and authClient"
```

---

## Task 3 (I.3): Update `backend/README.md`

**Why:** Backend README claims `python-jose` is the JWT library (it's PyJWT, see `requirements.txt:8`) and pins Python at "3.9+" while the venv runs a more recent interpreter. Also missing: SHARE_SECRET as a required env var.

**Files:**
- Modify: `backend/README.md`

- [ ] **Step 1: Update the Python version floor**

Edit `backend/README.md` line 7 to match the actual floor recorded in Task 0 Step 3. If unsure, use `Python 3.11+` (Flask 3.1 + PyJWT[crypto] both support it; the project does not pin a runtime).

- [ ] **Step 2: Replace the python-jose row**

Edit line 124:

```diff
-- **python-jose** — JWT utilities
+- **PyJWT[crypto]** — JWT verification via the Supabase project's JWKS endpoint (cached, ES256/RS256). See `docs/jwt-verification.md`.
```

- [ ] **Step 3: Add SHARE_SECRET to the required env-var snippet**

Edit the `.env` block (lines 27-32) so it includes the share-link secret:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SHARE_SECRET=at_least_32_random_characters
FLASK_APP=app
FLASK_ENV=development
```

Add a one-line note immediately after the block:

```markdown
`SHARE_SECRET` must be at least 32 characters; `create_app` raises at boot
otherwise. Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
See `docs/share-secret-rotation.md` for the rotation procedure.
```

- [ ] **Step 4: Verify**

```bash
grep -n "python-jose\|3\.9+" "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend/README.md"
```

Expected: zero matches.

- [ ] **Step 5: Commit**

```bash
git add backend/README.md
git commit -m "docs(I.3): correct PyJWT and Python version, add SHARE_SECRET env"
```

---

## Task 4 (I.4): `docs/share-secret-rotation.md`

**Why:** `SHARE_SECRET` is the HMAC key signing every share token; rotating it today silently invalidates every outstanding share link with no operator-facing guidance. The audit asks for a runbook (it does not require implementation of dual-key support, only that the procedure be documented).

The current scheme (read from `routes/solves.py:225-254`): tokens are 4 base64url segments `solve_id.iat.exp.mac` where `mac = HMAC-SHA256(SHARE_SECRET, "solve_id:iat:exp")[:16]`, TTL is 30 days, fully stateless.

**Files:**
- Create: `docs/share-secret-rotation.md`

- [ ] **Step 1: Create the doc**

Write `docs/share-secret-rotation.md` with the following content:

```markdown
# SHARE_SECRET rotation procedure

## What it signs

`SHARE_SECRET` is the HMAC key used to sign share-link tokens
(`backend/app/routes/solves.py:_sign_solve_id`). Each token has the shape

```
b64url(solve_id) . b64url(iat) . b64url(exp) . b64url(HMAC-SHA256(secret, "solve_id:iat:exp")[:16])
```

with a 30-day TTL (`SHARE_TOKEN_TTL_SECONDS`). Tokens are stateless: there
is no DB allowlist or revocation table. Verification recomputes the MAC
with the current `SHARE_SECRET` and rejects mismatches.

## When to rotate

- Suspected secret leak (committed to a repo, exposed in a log dump, etc.).
- Regulatory or scheduled rotation (recommended every 6-12 months).

## Constraints

- The secret must be **at least 32 characters**; `create_app` refuses to
  boot otherwise (`backend/app/__init__.py:55`).
- Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
- The secret is read from the `SHARE_SECRET` environment variable at boot;
  there is no live-reload path. Rotation requires a deploy.

## Procedure (today: hard cutover)

Because the verifier holds only one secret, rotation **invalidates every
outstanding share link the instant the new secret takes effect**. Plan for
this:

1. Generate `NEW_SHARE_SECRET` and store it in your secret manager.
2. Decide on the cutover window. Communicate to any users who depend on
   long-lived share links (max blast radius is the 30-day TTL of existing
   tokens).
3. Deploy with `SHARE_SECRET=<NEW>` set on the Flask process. The old
   value can be removed in the same deploy.
4. Verify on a staging env that a token signed pre-rotation now returns
   `404` from `/api/v1/solves/share/<token>` and a fresh token signed
   post-rotation works.

## Procedure (recommended future: dual-secret rolling window)

Audit A.7 left dual-key support out of scope. Adding it later means:

- Read both `SHARE_SECRET` (primary, used to sign new tokens) and
  `SHARE_SECRET_PREVIOUS` (only used during verification) from env at boot.
- `_verify_share_token` tries primary first, falls back to previous.
- Sign always uses primary.
- Rotation becomes:
  1. Move current `SHARE_SECRET` to `SHARE_SECRET_PREVIOUS`, set new value
     for `SHARE_SECRET`. Deploy.
  2. After the 30-day TTL has elapsed, remove `SHARE_SECRET_PREVIOUS`.
     Deploy.

This is ~30 lines of Python and one config addition; track it as a
follow-up if you anticipate frequent rotation.

## What rotation does NOT do

- It does not revoke individual share links. There is no per-link
  revocation today. Building it requires the DB-backed `share_links`
  table from audit A.7 option 2.
- It does not change the share-link URL format or path; only the MAC is
  invalidated.
```

- [ ] **Step 2: Cross-link from `backend/README.md`**

The reference `See docs/share-secret-rotation.md for the rotation procedure.` was added in Task 3 Step 3. Confirm it resolves:

```bash
ls "/Users/sia/Desktop/Coding Projects.nosync/ao5/docs/share-secret-rotation.md"
```

Expected: file exists.

- [ ] **Step 3: Commit**

```bash
git add docs/share-secret-rotation.md
git commit -m "docs(I.4): add SHARE_SECRET rotation runbook"
```

---

## Task 5 (I.5): JWT verification doc + slow-path fallback log

**Why:** Audit asks for documentation of when each path fires and how to observe fallback rate. The fast path (`auth.py:verify_token_local`) is well-commented but undocumented externally; the slow path (`solves.py:78-87` Supabase `auth.get_user`) currently leaves no breadcrumb when it succeeds (only when it raises). Add one INFO-level structured log line at slow-path entry so operators can grep / aggregate fallback rate, then write the doc that points to it.

**Files:**
- Modify: `backend/app/routes/solves.py:76-100` (the `require_auth` decorator)
- Modify: `backend/tests/test_auth_local.py` (or add `backend/tests/test_auth_fallback.py` if cleaner)
- Create: `docs/jwt-verification.md`

### Subtask 5a: Add the slow-path log (TDD)

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_auth_local.py` (or create `backend/tests/test_auth_fallback.py`):

```python
def test_require_auth_logs_slow_path_when_falling_back(
    monkeypatch, caplog, client, auth_headers, fake_supabase_factory, solves_module
):
    """When verify_token_local returns None, require_auth must emit an
    INFO log with event='auth_slow_path' so operators can track fallback
    rate.
    """
    import logging
    fake_supabase_factory(user_id="user-xyz")
    monkeypatch.setattr(solves_module, "verify_token_local", lambda token: None)

    with caplog.at_level(logging.INFO, logger="app.routes.solves"):
        resp = client.get("/api/v1/solves?puzzle_type=333", headers=auth_headers)

    assert resp.status_code == 200
    matching = [r for r in caplog.records if "auth_slow_path" in r.getMessage()]
    assert matching, f"expected an auth_slow_path log; got {[r.getMessage() for r in caplog.records]}"
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend" && pytest tests/test_auth_local.py::test_require_auth_logs_slow_path_when_falling_back -v
```

Expected: FAIL (no `auth_slow_path` log emitted).

- [ ] **Step 3: Implement**

In `backend/app/routes/solves.py` modify the `require_auth` decorator. Currently:

```python
        user_id = verify_token_local(token)

        if user_id is None:
            try:
                supabase = get_supabase_client(token)
                user = supabase.auth.get_user(jwt=token)
            except Exception:
```

Change to:

```python
        user_id = verify_token_local(token)

        if user_id is None:
            # I.5: fast path could not verify; fell back to a Supabase round-trip.
            # Operators aggregate `event=auth_slow_path` to track fallback rate; a
            # spike means JWKS is unreachable, the project rotated keys, or
            # legacy HS256 tokens are still in the wild.
            current_app.logger.info(
                "auth_slow_path event=auth_slow_path"
            )
            try:
                supabase = get_supabase_client(token)
                user = supabase.auth.get_user(jwt=token)
            except Exception:
```

(Plain INFO string, not JSON yet - Task 6 swaps the formatter to JSON, at which point both this and the readiness logs become structured automatically.)

- [ ] **Step 4: Run the test to confirm pass**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend" && pytest tests/test_auth_local.py::test_require_auth_logs_slow_path_when_falling_back -v
```

Expected: PASS.

- [ ] **Step 5: Run full backend suite**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend" && pytest -q
```

Expected: all green.

### Subtask 5b: Write the JWT verification doc

- [ ] **Step 6: Create `docs/jwt-verification.md`**

```markdown
# JWT verification: fast and slow paths

`require_auth` (`backend/app/routes/solves.py`) attempts two paths in
order. Both produce a verified `user_id`; only the cost differs.

## Fast path: local JWKS

`verify_token_local(token)` (`backend/app/auth.py:46`) verifies the JWT
signature against Supabase's published JWKS using PyJWT.

- The JWKS client is a process-wide singleton, lazily constructed under a
  threading lock (`auth.py:25`). The cache rotates every 5 minutes
  (`lifespan=300`) and bounds memory at 16 keys.
- Decode validates: signature (ES256 or RS256), expiry, audience
  (`authenticated`), issuer (`{SUPABASE_URL}/auth/v1`).
- Token-shaped failures (expired, bad signature, wrong issuer, wrong
  audience, malformed) are logged at DEBUG and return `None` so the caller
  falls through to the slow path. Anything else propagates so it shows up
  in error reporting.

This is the path nearly every authenticated request takes: cost is one
JWT decode (a few hundred microseconds) and zero network calls.

## Slow path: Supabase `auth.get_user`

When `verify_token_local` returns `None`, `require_auth` calls
`supabase.auth.get_user(jwt=token)` (`solves.py:81`). This is a network
round-trip to Supabase.

When it fires:

1. **JWKS unreachable** (transient or sustained outage of Supabase's
   `/.well-known/jwks.json`).
2. **Legacy HS256 tokens** issued by older Supabase projects (PyJWT only
   accepts ES256/RS256 in our config).
3. **Key rotation lag** - the JWKS cache (5-minute TTL) returns stale
   keys; verification fails until the next refresh.
4. **Token from a different Supabase project** - the `iss` check on the
   fast path catches this; slow path will reject too, but with a 503 if
   the network call itself fails.

## Observing fallback rate

Each slow-path entry logs `event=auth_slow_path` at INFO from the
`app.routes.solves` logger.

After Cluster I (Task 6) ships JSON logging, an aggregation query is just
a `jq` filter:

```bash
journalctl -u ao5-backend -o cat | jq -r 'select(.event == "auth_slow_path") | .timestamp'
```

A healthy steady state is < 1% of authenticated requests. Sustained spikes
(> 5%) usually mean JWKS rotation or unreachability; check
`/api/ready` for the JWKS cache state.

## Tuning knobs

- JWKS cache lifespan: `auth.py:40` (`lifespan=300`). Longer means fewer
  refreshes but slower key-rotation pickup; shorter is the opposite.
- Cache size: `auth.py:41` (`max_cached_keys=16`). Bound for unique kids
  observed; 16 covers many rotations without growth.

## Troubleshooting

- All requests are slow: JWKS unreachable. `curl <SUPABASE_URL>/auth/v1/.well-known/jwks.json` from the Flask host.
- Logs show `verify_token_local: token_invalid` at DEBUG: token is
  shape-valid but doesn't pass signature/issuer/audience. Confirm the
  Supabase project that issued the token matches `SUPABASE_URL`.
- 401s with no `auth_slow_path` log: missing or malformed Authorization
  header (caught earlier in `require_auth`).
```

- [ ] **Step 7: Verify cross-references**

```bash
grep -n "jwt-verification" "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend/README.md"
ls "/Users/sia/Desktop/Coding Projects.nosync/ao5/docs/jwt-verification.md"
```

Expected: backend README links to the doc (added in Task 3 Step 2); the file exists.

- [ ] **Step 8: Commit**

```bash
git add backend/app/routes/solves.py backend/tests/test_auth_local.py docs/jwt-verification.md
git commit -m "docs+feat(I.5): document JWT fast/slow paths, log slow-path entry"
```

---

## Task 6 (I.6): Structured (JSON) logging via `dictConfig`

**Why:** Backend currently uses Flask's default human-readable logger. The audit asks for JSON-structured output with `request.id` and `request.user_id` attached. Going hand-rolled (audit-confirmed choice) means no new dependency: a small `JsonFormatter(logging.Formatter)` and a `dictConfig` from `create_app`. `g.user_id` is already populated by `require_auth` (`solves.py:99`); a new `before_request` hook attaches `g.request_id`.

**Files:**
- Create: `backend/app/logging_config.py` (the formatter and dictConfig)
- Modify: `backend/app/__init__.py` (call `configure_logging`, add `before_request` for `g.request_id` and per-request access log via `after_request`)
- Create: `backend/tests/test_logging.py`

### Subtask 6a: Formatter (TDD, pure unit)

- [ ] **Step 1: Write the failing test for the formatter**

Create `backend/tests/test_logging.py`:

```python
"""Tests for JSON logging configuration (I.6).

The formatter must:
- Emit valid JSON.
- Include level, logger, message, timestamp.
- Include request_id and user_id when present on flask.g.
- Include exception info as a single string field.
"""
import json
import logging

import pytest


def _make_record(name="test", level=logging.INFO, msg="hello", args=(), exc=None):
    return logging.LogRecord(
        name=name, level=level, pathname=__file__, lineno=10,
        msg=msg, args=args, exc_info=exc,
    )


def test_formatter_emits_valid_json():
    from app.logging_config import JsonFormatter
    f = JsonFormatter()
    out = f.format(_make_record())
    parsed = json.loads(out)
    assert parsed["level"] == "INFO"
    assert parsed["logger"] == "test"
    assert parsed["message"] == "hello"
    assert "timestamp" in parsed


def test_formatter_includes_request_context_when_app_pushed(monkeypatch):
    from flask import Flask, g
    from app.logging_config import JsonFormatter
    app = Flask(__name__)
    f = JsonFormatter()
    with app.test_request_context("/"):
        g.request_id = "req-abc"
        g.user_id = "user-xyz"
        out = f.format(_make_record())
    parsed = json.loads(out)
    assert parsed["request_id"] == "req-abc"
    assert parsed["user_id"] == "user-xyz"


def test_formatter_omits_request_context_outside_request():
    from app.logging_config import JsonFormatter
    f = JsonFormatter()
    out = f.format(_make_record())
    parsed = json.loads(out)
    assert "request_id" not in parsed
    assert "user_id" not in parsed


def test_formatter_includes_exception_info():
    from app.logging_config import JsonFormatter
    f = JsonFormatter()
    try:
        raise RuntimeError("boom")
    except RuntimeError:
        import sys
        rec = _make_record(level=logging.ERROR, msg="failed", exc=sys.exc_info())
    parsed = json.loads(f.format(rec))
    assert "exception" in parsed
    assert "RuntimeError: boom" in parsed["exception"]
```

- [ ] **Step 2: Run the test - confirm it fails**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend" && pytest tests/test_logging.py -v
```

Expected: FAIL (`app.logging_config` doesn't exist).

- [ ] **Step 3: Create the formatter and dictConfig**

Create `backend/app/logging_config.py`:

```python
"""Structured JSON logging for the Ao5 backend (I.6).

Hand-rolled via stdlib so we avoid pulling in python-json-logger or
structlog. Exposes:
- JsonFormatter: a logging.Formatter subclass emitting one JSON object
  per record.
- configure_logging(level): install the formatter on the root logger via
  logging.config.dictConfig.

The formatter pulls request_id and user_id off flask.g when a request
context is active. Request_id is set by a before_request hook in
app/__init__.py; user_id is set by require_auth.
"""
from __future__ import annotations

import json
import logging
import logging.config
from datetime import datetime, timezone
from typing import Any


class JsonFormatter(logging.Formatter):
    """Emit each log record as a single-line JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Flask request context, if any.
        try:
            from flask import g, has_request_context
            if has_request_context():
                request_id = getattr(g, "request_id", None)
                if request_id is not None:
                    payload["request_id"] = request_id
                user_id = getattr(g, "user_id", None)
                if user_id is not None:
                    payload["user_id"] = user_id
        except RuntimeError:
            # Outside an application context; skip.
            pass

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> None:
    """Install JsonFormatter on the root + Flask + werkzeug loggers."""
    logging.config.dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "json": {
                "()": "app.logging_config.JsonFormatter",
            },
        },
        "handlers": {
            "stdout": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "formatter": "json",
            },
        },
        "root": {
            "level": level,
            "handlers": ["stdout"],
        },
        "loggers": {
            "werkzeug": {"level": "WARNING", "handlers": ["stdout"], "propagate": False},
        },
    })
```

- [ ] **Step 4: Re-run formatter tests**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend" && pytest tests/test_logging.py -v
```

Expected: PASS (all four cases).

### Subtask 6b: Wire request_id and access log

- [ ] **Step 5: Write the failing tests for request middleware**

Append to `backend/tests/test_logging.py`:

```python
def test_create_app_calls_configure_logging(monkeypatch):
    """create_app must install JSON logging at boot."""
    calls = []
    from app import logging_config
    monkeypatch.setattr(logging_config, "configure_logging", lambda level="INFO": calls.append(level))
    from app import create_app
    create_app()
    assert calls, "configure_logging was not called"


def test_each_request_gets_a_request_id_attached_to_g(client, auth_headers, fake_supabase_factory, solves_module, monkeypatch):
    """A before_request hook sets g.request_id (uuid4 string) on every request."""
    fake_supabase_factory()
    monkeypatch.setattr(solves_module, "verify_token_local", lambda token: "user-1")

    captured = {}
    @solves_module.solves.before_request
    def _capture():
        from flask import g
        captured["request_id"] = getattr(g, "request_id", None)

    client.get("/api/v1/solves?puzzle_type=333", headers=auth_headers)
    assert captured["request_id"] is not None
    assert isinstance(captured["request_id"], str)
    assert len(captured["request_id"]) >= 8


def test_request_emits_one_access_log_with_status_and_path(client, auth_headers, fake_supabase_factory, solves_module, monkeypatch, caplog):
    """An after_request hook emits one structured access log per request."""
    import logging
    fake_supabase_factory()
    monkeypatch.setattr(solves_module, "verify_token_local", lambda token: "user-1")

    with caplog.at_level(logging.INFO, logger="app.access"):
        client.get("/api/v1/solves?puzzle_type=333", headers=auth_headers)

    matching = [r for r in caplog.records if "/api/v1/solves" in r.getMessage()]
    assert matching, f"no access log; got {[r.getMessage() for r in caplog.records]}"
    msg = matching[0].getMessage()
    assert "200" in msg
    assert "GET" in msg
```

- [ ] **Step 6: Run - confirm fail**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend" && pytest tests/test_logging.py -v
```

Expected: the three new tests fail.

- [ ] **Step 7: Wire it in `backend/app/__init__.py`**

Add the import near the top:

```python
import uuid
from .logging_config import configure_logging
```

In `create_app`, immediately after `app = Flask(__name__)` and `ProxyFix`, add:

```python
    configure_logging(os.environ.get("LOG_LEVEL", "INFO"))
    access_logger = logging.getLogger("app.access")
```

(You'll need `import logging` at the top too if it isn't already there.)

Add a new `@app.before_request` hook *before* the existing `_legacy_api_deprecation` hook:

```python
    @app.before_request
    def _attach_request_id():
        g.request_id = uuid.uuid4().hex
```

Add a new `@app.after_request` hook (place it next to `_security_headers`):

```python
    @app.after_request
    def _access_log(response):
        access_logger.info(
            f"{request.method} {request.path} {response.status_code}"
        )
        return response
```

- [ ] **Step 8: Re-run logging tests**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend" && pytest tests/test_logging.py -v
```

Expected: PASS.

- [ ] **Step 9: Run full suite**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend" && pytest -q
```

Expected: all green. (No existing tests assert the old text-formatted log lines; if any do, update them to read JSON.)

- [ ] **Step 10: Manual smoke**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/backend" && python -c "
from app import create_app
app = create_app()
with app.test_client() as c:
    c.get('/api/health')
"
```

Expected: a single line of valid JSON on stdout containing `level`, `logger`, `message`, `request_id`, `timestamp`. Pipe through `python -c 'import json,sys; [json.loads(l) for l in sys.stdin]'` to confirm parseability.

- [ ] **Step 11: Commit**

```bash
git add backend/app/logging_config.py backend/app/__init__.py backend/tests/test_logging.py
git commit -m "feat(I.6): structured JSON logging with request_id and user_id"
```

---

## Task 7 (I.7): `aria-modal` and focus trap on dialogs

**Why:** Both `SolveDetailModal` and `HotkeyHelp` render `role="dialog"` but lack `aria-modal="true"` and a focus trap. Without a trap, Tab can move focus into the page behind the modal; without restoration, focus is lost when the modal closes. This is the audited a11y gap.

Hand-rolled hook (audit-confirmed choice): `useFocusTrap(ref, enabled)`. ~40 lines, no dependency, reused in both dialogs.

**Files:**
- Create: `frontend/src/hooks/useFocusTrap.ts`
- Create: `frontend/src/hooks/useFocusTrap.test.tsx`
- Modify: `frontend/src/components/SolveDetailModal.tsx`
- Modify: `frontend/src/components/HotkeyHelp.tsx`

### Subtask 7a: The hook (TDD)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/useFocusTrap.test.tsx`:

```tsx
import { useRef, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { useFocusTrap } from './useFocusTrap';

const TestModal = ({ onClose, enabled = true }: { onClose?: () => void; enabled?: boolean }) => {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, enabled);
  return (
    <div ref={ref} role="dialog" aria-modal="true">
      <button>first</button>
      <button>middle</button>
      <button onClick={onClose}>last</button>
    </div>
  );
};

describe('useFocusTrap', () => {
  it('moves focus to the first focusable on mount', async () => {
    render(<TestModal />);
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('wraps Tab from the last focusable to the first', async () => {
    const user = userEvent.setup();
    render(<TestModal />);
    screen.getByText('last').focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('wraps Shift+Tab from the first focusable to the last', async () => {
    const user = userEvent.setup();
    render(<TestModal />);
    screen.getByText('first').focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByText('last'));
  });

  it('restores focus to the previously-active element on unmount', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'open';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(<TestModal />);
    expect(document.activeElement).not.toBe(trigger);
    unmount();
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });

  it('does nothing when enabled is false', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    render(<TestModal enabled={false} />);
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });
});
```

- [ ] **Step 2: Run the test - confirm it fails**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend" && npx vitest run src/hooks/useFocusTrap.test.tsx
```

Expected: FAIL (`useFocusTrap` doesn't exist).

- [ ] **Step 3: Implement the hook**

Create `frontend/src/hooks/useFocusTrap.ts`:

```typescript
import { useEffect, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const focusables = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    el => !el.hasAttribute('disabled') && el.offsetParent !== null,
  );

/**
 * Trap keyboard focus inside `ref` while `enabled`. Focuses the first
 * focusable on mount; restores focus to the previously-active element on
 * unmount. Tab and Shift+Tab wrap inside the container.
 *
 * Pair with `aria-modal="true"` on the container element.
 */
export const useFocusTrap = (
  ref: RefObject<HTMLElement | null>,
  enabled: boolean = true,
): void => {
  useEffect(() => {
    if (!enabled) return;
    const root = ref.current;
    if (!root) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const items = focusables(root);
    items[0]?.focus();

    const handleKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;
      const current = focusables(root);
      if (current.length === 0) {
        e.preventDefault();
        return;
      }
      const first = current[0]!;
      const last = current[current.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    root.addEventListener('keydown', handleKey);
    return () => {
      root.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus?.();
    };
  }, [ref, enabled]);
};
```

- [ ] **Step 4: Re-run the test**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend" && npx vitest run src/hooks/useFocusTrap.test.tsx
```

Expected: all 5 cases PASS.

### Subtask 7b: Apply to `SolveDetailModal`

- [ ] **Step 5: Modify `SolveDetailModal.tsx`**

In `frontend/src/components/SolveDetailModal.tsx`:

1. Add the import next to the existing hook import:

```typescript
import { useFocusTrap } from '../hooks/useFocusTrap';
```

2. Inside the component, after `useDismissOnOutsideClick(modalRef, onClose);`, add:

```typescript
  useFocusTrap(modalRef);
```

3. Modify the modal `<div>` (around lines 74-79) to add `aria-modal`:

```diff
       <div
         ref={modalRef}
         className="solve-detail-modal"
         role="dialog"
+        aria-modal="true"
         aria-label="Solve details"
       >
```

- [ ] **Step 6: Modify `HotkeyHelp.tsx`** the same way

In `frontend/src/components/HotkeyHelp.tsx`:

1. Add the import:

```typescript
import { useFocusTrap } from '../hooks/useFocusTrap';
```

2. After `useDismissOnOutsideClick(modalRef, onClose);` (line 22):

```typescript
  useFocusTrap(modalRef);
```

3. Add `aria-modal` to the modal div (around lines 26-31):

```diff
       <div
         ref={modalRef}
         className="hotkey-help-modal"
         role="dialog"
+        aria-modal="true"
         aria-label="Keyboard shortcuts"
       >
```

- [ ] **Step 7: Run the full frontend suite**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend" && npx vitest run --reporter=dot && npx tsc --noEmit
```

Expected: all green. If existing modal tests break because the first focusable now grabs focus on mount, update them to expect that.

- [ ] **Step 8: Manual smoke**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend" && npm run dev
```

Open the app, click a solve in the SolveLog to open the modal, Tab around: focus stays inside the modal and wraps. Esc closes (existing dismiss hook). Press `?` to open HotkeyHelp; same.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/hooks/useFocusTrap.ts frontend/src/hooks/useFocusTrap.test.tsx frontend/src/components/SolveDetailModal.tsx frontend/src/components/HotkeyHelp.tsx
git commit -m "feat(I.7): aria-modal + focus trap on SolveDetailModal and HotkeyHelp"
```

---

## Task 8 (I.8): Composite key for `TrainerRecentStrip`

**Why:** `TrainerRecentStrip.tsx:35` uses array index as key. Items prepend on every solve, so React thinks the wrong item changed and re-renders the wrong DOM node. `RecentEntry` has `time`, `plusTwo`, `dnf`; combine for a stable-enough key. (No `id` field exists on `RecentEntry`.)

**Files:**
- Modify: `frontend/src/components/trainers/TrainerRecentStrip.tsx`

The audit also lists `TrainerCasePicker.tsx:91` but that's a `<select>` of algorithm strings (lines 100-104). Static `<option>` lists with stable order do not exhibit the same bug; leave as-is unless the file changes.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/trainers/TrainerRecentStrip.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TrainerRecentStrip from './TrainerRecentStrip';

describe('TrainerRecentStrip', () => {
  it('does not warn about duplicate keys with three identical times', () => {
    // Duplicate-key warnings appear in console.error; spy and assert empty.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <TrainerRecentStrip entries={[
        { time: 12340, plusTwo: false, dnf: false },
        { time: 12340, plusTwo: true, dnf: false },
        { time: 12340, plusTwo: false, dnf: true },
      ]} />
    );
    const keyWarnings = spy.mock.calls.filter(([msg]) =>
      typeof msg === 'string' && msg.includes('unique "key"')
    );
    expect(keyWarnings).toHaveLength(0);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run - confirm it fails (or passes spuriously)**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend" && npx vitest run src/components/trainers/TrainerRecentStrip.test.tsx
```

The current code uses `key={idx}` so React will not complain about duplicates. The test guards against future regression more than catching the current bug; that's acceptable. If the test passes already, **also** add a parallel-render assertion that the component renders the correct number of entries (verify behaviour, not just absence of warnings).

- [ ] **Step 3: Implement composite key**

In `frontend/src/components/trainers/TrainerRecentStrip.tsx`, modify lines 34-38:

```diff
-      entries.map((entry, idx) => (
-        <span key={idx} className="trainer-recent-entry">
+      entries.map((entry, idx) => (
+        <span key={`${idx}-${entry.time}-${entry.plusTwo}-${entry.dnf}`} className="trainer-recent-entry">
           {renderEntry(entry)}
         </span>
       ))
```

(Including `idx` keeps duplicates within the same prepend frame distinct; combining with the entry fields means a prepend-then-shift produces stable identities.)

- [ ] **Step 4: Run the test**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend" && npx vitest run src/components/trainers/TrainerRecentStrip.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/trainers/TrainerRecentStrip.tsx frontend/src/components/trainers/TrainerRecentStrip.test.tsx
git commit -m "fix(I.8): composite key for TrainerRecentStrip entries"
```

---

## Task 9 (I.9): Immutable URLSearchParams update in `Stats.tsx`

**Why:** `Stats.tsx:61` mutates the previous `URLSearchParams` instance and returns it. React Router's `setSearchParams` setter contract treats this as a no-op for re-render purposes in some versions (it relies on identity to detect change). Build a new instance instead.

**Files:**
- Modify: `frontend/src/pages/Stats.tsx`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/pages/Stats.test.tsx` (or create a new behaviour test if the existing file is smoke-only):

```tsx
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
// (existing imports / providers from the file)

it('updates the URL puzzle param when a different puzzle is selected', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/stats?puzzle=333']}>
      {/* Stats with required providers */}
    </MemoryRouter>
  );
  // Pick the puzzle dropdown / button that switches to "222"
  const target = screen.getByRole(/* button or option */, { name: /2x2|222/i });
  await user.click(target);
  // After the click, the URL search param should be puzzle=222
  // Pull the current location through useLocation in a small spy component
  // OR assert via window.location if tests use the browser router shim.
});
```

(If no behavioural Stats test exists yet, add a tiny one focused on the puzzle change. The existing Stats test file is smoke-only per audit G.13; this also closes part of that gap.)

- [ ] **Step 2: Run - confirm fail**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend" && npx vitest run src/pages/Stats.test.tsx
```

Expected: the new test fails because the mutation does not trigger a re-render reliably.

- [ ] **Step 3: Implement immutable update**

In `frontend/src/pages/Stats.tsx` change line 61:

```diff
-    setSearchParams(prev => { prev.set('puzzle', value); return prev; });
+    setSearchParams(prev => {
+      const next = new URLSearchParams(prev);
+      next.set('puzzle', value);
+      return next;
+    });
```

- [ ] **Step 4: Run the test**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend" && npx vitest run src/pages/Stats.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Stats.tsx frontend/src/pages/Stats.test.tsx
git commit -m "fix(I.9): build new URLSearchParams instead of mutating in Stats"
```

---

## Task 10 (I.11): Derive "10,000 solves" text from constants

**Why:** `Stats.tsx:96` hardcodes "10,000 solves" while the actual cap is `MAX_PAGES * default backend page size = 200 * 50 = 10000`. Hoist the page size and an exported `MAX_SOLVES` so the text and the limit cannot drift.

**Files:**
- Modify: `frontend/src/queries/solves.ts` (add `DEFAULT_PAGE_SIZE` and export `MAX_SOLVES`)
- Modify: `frontend/src/pages/Stats.tsx`

- [ ] **Step 1: Add the derived constant**

In `frontend/src/queries/solves.ts`, change the existing `MAX_PAGES` declaration (line 23) to:

```typescript
const DEFAULT_PAGE_SIZE = 50; // matches backend `_parse_positive_int` default in routes/solves.py
const MAX_PAGES = 200;
export const MAX_SOLVES = MAX_PAGES * DEFAULT_PAGE_SIZE;
```

- [ ] **Step 2: Consume in Stats**

In `frontend/src/pages/Stats.tsx`:

1. Add to the imports (next to `useAllSolves`):

```typescript
import { MAX_SOLVES } from '../queries/solves';
```

2. Change line 96 from:

```tsx
                Showing your most recent 10,000 solves. Use the date range filter to see older ranges.
```

to:

```tsx
                Showing your most recent {MAX_SOLVES.toLocaleString()} solves. Use the date range filter to see older ranges.
```

- [ ] **Step 3: Verify**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend" && npx tsc --noEmit && npx vitest run --reporter=dot
grep -n "10,000\|10000" "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend/src/pages/Stats.tsx"
```

Expected: no green failures; no hardcoded `10,000` left in Stats.tsx.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/queries/solves.ts frontend/src/pages/Stats.tsx
git commit -m "refactor(I.11): derive 10,000-solves text from MAX_PAGES * page size"
```

---

## Task 11 (I.12): Replace gear unicode escape with raw character

**Why:** `Header.tsx:66` writes `{'⚙'}` while every other glyph in the codebase uses raw characters. Inconsistent and harder to read.

**Files:**
- Modify: `frontend/src/components/Header.tsx`

- [ ] **Step 1: Replace**

In `frontend/src/components/Header.tsx` line 66:

```diff
-          {'⚙'}
+          ⚙
```

(Confirm the file is UTF-8 with `file frontend/src/components/Header.tsx` if curious.)

- [ ] **Step 2: Sweep for other escapes**

```bash
grep -rn "\\\\u[0-9a-fA-F]\\{4\\}" "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend/src/" | grep -v ".test."
```

The audit said "duplicated unicode escapes"; if other display-text escapes turn up (e.g., `—` em-dash), replace those too. Otherwise this is just the gear glyph.

- [ ] **Step 3: Run frontend tests**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend" && npx vitest run --reporter=dot
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Header.tsx
git commit -m "style(I.12): use raw gear glyph in Header"
```

---

## Task 12 (I.13): `aria-busy` on user-visible loading indicators

**Why:** Only one `aria-busy` exists today (`App.tsx:19` on the route loader). Stats page, the `Scramble` component, and the Auth submit button all have a loading state but expose nothing to assistive tech.

**Files:**
- Modify: `frontend/src/pages/Stats.tsx` (loading section)
- Modify: `frontend/src/components/Scramble.tsx` (the `loading` prop already exists, just unused for a11y)
- Modify: `frontend/src/components/Auth.tsx` (submit button)

- [ ] **Step 1: Stats page**

In `frontend/src/pages/Stats.tsx` lines 90-92, change:

```diff
-        {loading ? (
-          <p className="stats-loading">Loading solves...</p>
+        {loading ? (
+          <p className="stats-loading" role="status" aria-busy="true">Loading solves...</p>
```

- [ ] **Step 2: Scramble component**

Read `frontend/src/components/Scramble.tsx` first to see how `loading` is consumed today. Then add `aria-busy={loading}` to the wrapper element rendering the scramble text and a `role="status"` if not present.

If the file uses a single root `<div>`, add the attribute there:

```diff
-    <div className="scramble">
+    <div className="scramble" aria-busy={loading} aria-live="polite">
```

(Confirm that `aria-live="polite"` is appropriate here - assistive tech will announce scramble changes. If that's noisy, drop it and only set `aria-busy`.)

- [ ] **Step 3: Auth submit button**

In `frontend/src/components/Auth.tsx` lines 151-157, modify the button:

```diff
           <button
             type="submit"
             className="auth-button"
             disabled={loading}
+            aria-busy={loading}
           >
             {loading ? 'Loading...' : config.cta}
           </button>
```

- [ ] **Step 4: Verify**

```bash
cd "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend" && npx vitest run --reporter=dot && npx tsc --noEmit
grep -rn "aria-busy" "/Users/sia/Desktop/Coding Projects.nosync/ao5/frontend/src/" | wc -l
```

Expected: > 4 hits (App.tsx + the three new ones). All tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Stats.tsx frontend/src/components/Scramble.tsx frontend/src/components/Auth.tsx
git commit -m "a11y(I.13): aria-busy on Stats loading, Scramble, and Auth submit"
```

---

## Verification

After all tasks land, do a final cross-check:

- [ ] Backend suite green: `cd backend && pytest -q`
- [ ] Frontend tests green: `cd frontend && npx vitest run --reporter=dot && npx tsc --noEmit`
- [ ] Manual smoke: `cd frontend && npm run dev` and `cd backend && python run.py`
  - Open the app; pick a puzzle; record a solve.
  - Open a solve in `SolveDetailModal`; Tab cycles inside the modal; Esc closes; focus returns to the row.
  - Press `?` to open HotkeyHelp; same.
  - Switch to Stats; URL updates `?puzzle=222`; truncation notice (if visible) reads "Showing your most recent 10,000 solves" derived from constants.
  - Hit `/api/health` from a separate shell; observe one structured JSON line on stdout including `request_id` and `level=INFO`.
  - Touch the slow path: in a Python REPL, `monkeypatch verify_token_local` to return None (or send a deliberately invalid-but-shape-OK token) and confirm an `event=auth_slow_path` log line appears.
- [ ] `git log --oneline -20` shows ~12 commits prefixed `docs(I.1)`, `feat(I.6)`, etc.
- [ ] Re-read `docs/audits/2026-04-25-full-stack-audit.md` Cluster I; every item is either shipped or recorded as deferred.

## Items intentionally deferred

None. Cluster I is small enough that everything ships in this plan. The closest deferred item is the implementation of dual-secret rolling-window support for `SHARE_SECRET` (described in `docs/share-secret-rotation.md` as "recommended future"); that is documented as a follow-up but not scoped here.

## Files touched (summary)

**Created:**
- `docs/share-secret-rotation.md`
- `docs/jwt-verification.md`
- `backend/app/logging_config.py`
- `backend/tests/test_logging.py`
- `frontend/src/hooks/useFocusTrap.ts`
- `frontend/src/hooks/useFocusTrap.test.tsx`
- `frontend/src/components/trainers/TrainerRecentStrip.test.tsx`

**Modified:**
- `README.md`
- `frontend/README.md`
- `backend/README.md`
- `backend/app/__init__.py`
- `backend/app/routes/solves.py`
- `backend/tests/test_auth_local.py` (or sibling)
- `frontend/src/components/SolveDetailModal.tsx`
- `frontend/src/components/HotkeyHelp.tsx`
- `frontend/src/components/trainers/TrainerRecentStrip.tsx`
- `frontend/src/pages/Stats.tsx`
- `frontend/src/pages/Stats.test.tsx`
- `frontend/src/queries/solves.ts`
- `frontend/src/components/Header.tsx`
- `frontend/src/components/Scramble.tsx`
- `frontend/src/components/Auth.tsx`
