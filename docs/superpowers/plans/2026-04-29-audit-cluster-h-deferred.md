# Audit Cluster H — Deferred (vendor-decision) Items

> **Status: BLOCKED on user decisions.** This plan is a placeholder so the work isn't lost. Each item below requires a vendor or infra choice the user hasn't made yet. Once a decision is logged in the "Decision log" section, the corresponding Task can be executed against the outline below.

**Goal:** Track the three Cluster H items from `docs/audits/2026-04-25-full-stack-audit.md` that the main Cluster H plan (`2026-04-29-audit-cluster-h.md`) intentionally deferred:

- **H.6** Wire Sentry (or equivalent) for error reporting
- **H.10** Decide on a backend host
- **H.11** Add a migration runner

**Sibling plan:** `docs/superpowers/plans/2026-04-29-audit-cluster-h.md` ships H.1–H.5, H.7, H.8, H.9, H.12, H.13. Land that first; this plan layers on top of it.

---

## Decision log

Fill these in as decisions are made. Until they're filled in, the corresponding Task is BLOCKED.

| Item | Decision | Decided on | Notes |
| --- | --- | --- | --- |
| H.6 (error reporting vendor) | _pending_ | _pending_ | _pending_ |
| H.10 (backend host) | _pending_ | _pending_ | _pending_ |
| H.11 (migration runner) | _pending_ | _pending_ | _pending_ |

---

## Task A (H.10): Pick a backend host and document deploy

**Why this is first:** H.6 (error reporting) and H.11 (migration runner) both want a deploy story to plug into. Pick the host first; the other two follow.

### Decision needed

Pick one host. Trade-offs to consider:

| Option        | Cost     | Cold starts | Custom domains | Background jobs | Notes                                                                                            |
| ------------- | -------- | ----------- | -------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| **Render**    | Free → $7/mo | Cold-start on free tier | yes | yes | Easy Flask/Gunicorn deploy; auto SSL; native Postgres if needed; recommended by audit.       |
| **Fly.io**    | Free trial → $1.94/mo+ | None (always-on) | yes | yes | Edge presence; Dockerfile-driven; pricier than Render at small scale.                        |
| **Railway**   | $5/mo+   | None (always-on) | yes | yes | Smooth UX; deploys from GitHub; metered.                                                       |
| **Cloud Run** | Free tier generous | Cold-start | yes | limited (jobs separately) | Container-native; scales to zero; bigger learning curve.                                  |
| **Vercel functions** | Free tier | Cold-start | shared with frontend | no | Convenient if frontend also on Vercel; serverless model is awkward for a stateful Flask app. |

The audit recommends **Render** as the default (`docs/audits/2026-04-25-full-stack-audit.md` line 681-684).

### Files (post-decision)

- Create: `Dockerfile` (or `render.yaml` / `fly.toml` / `railway.json` depending on host)
- Create: `backend/wsgi.py` (Gunicorn entrypoint) if not already present
- Modify: `backend/requirements.txt` (add `gunicorn`)
- Modify: `backend/app/__init__.py` (wire `ProxyFix(x_for=1)` so `request.remote_addr` reflects the real client behind the platform's proxy)
- Modify: `backend/README.md` (add a "Deploying" section)
- Modify: `.github/workflows/ci.yml` (add a deploy job, gated on `main` push)

### Step outline (post-decision)

- [ ] **Step 1: Add the production WSGI server**

```bash
echo "gunicorn==23.0.0" >> backend/requirements.txt
cd backend && pip install gunicorn
```

Create `backend/wsgi.py`:

```python
from app import create_app
app = create_app()
```

- [ ] **Step 2: Add `ProxyFix` middleware**

In `backend/app/__init__.py`, near the top of `create_app`:

```python
from werkzeug.middleware.proxy_fix import ProxyFix

app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
```

This is required for any platform that fronts the app with a proxy (all of them do).

- [ ] **Step 3: Add the host's config file**

Pick the file appropriate to the chosen host. Examples:

**Render** (`render.yaml` at repo root):

```yaml
services:
  - type: web
    name: ao5-backend
    runtime: python
    plan: starter
    rootDir: backend
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn wsgi:app --workers 2 --threads 4 --timeout 30
    envVars:
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_ANON_KEY
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: SHARE_SECRET
        sync: false
      - key: FLASK_ENV
        value: production
```

**Fly.io** (`fly.toml`): pair with a `Dockerfile`. **Railway**: similar but `railway.json`.

- [ ] **Step 4: Update CORS allow-list**

In `backend/app/__init__.py`, swap the dev-only CORS origin for an env-driven list:

```python
from flask_cors import CORS
allowed = os.environ.get('CORS_ORIGINS', 'http://localhost:5173').split(',')
CORS(app, origins=allowed, supports_credentials=True)
```

Add `CORS_ORIGINS` to the host's env-var list.

- [ ] **Step 5: Document the deploy in `backend/README.md`**

Add a "Deploying" section explaining: env vars to set, how to trigger a deploy, where to read logs, how to rollback. Reference the chosen host's docs.

- [ ] **Step 6: Smoke test the live deploy**

After the first deploy: `curl https://<your-app>.<host>.com/api/v1/health` should return `{"status": "healthy"}`. `curl https://.../api/v1/ready` should return 200 with `supabase: ok`. Trigger a real solve via the live frontend (after H.10 frontend env-var is updated) and confirm it persists.

- [ ] **Step 7: Update the frontend `VITE_API_URL`**

Set `VITE_API_URL=https://<your-app>.<host>.com/api/v1` in the frontend's deploy env. Re-deploy the frontend.

- [ ] **Step 8: Commit**

```bash
git add Dockerfile render.yaml backend/wsgi.py backend/requirements.txt backend/app/__init__.py backend/README.md
git commit -m "feat(H.10): deploy backend to <chosen host>

Adds gunicorn entrypoint, ProxyFix for the platform proxy, env-driven
CORS, and the host's deploy config. Documented in backend/README.md."
```

---

## Task B (H.6): Wire error reporting

**Why second:** error reporting is more useful with a live deploy in front of it; without H.10, errors only ever fire from local dev.

### Decision needed

Pick one error-reporting target. Trade-offs:

| Option       | Cost (free tier)           | Source maps | Backend SDK   | Frontend SDK | Notes                                                                |
| ------------ | -------------------------- | ----------- | ------------- | ------------ | -------------------------------------------------------------------- |
| **Sentry**   | 5k errors/mo, 10k perf     | yes         | `sentry-sdk[flask]` | `@sentry/react` | Industry standard; rich SDK; best-in-class source-map UX.    |
| **PostHog**  | 1M events/mo               | yes         | `posthog`     | `posthog-js`  | Bundles product analytics + errors; bigger surface than just errors. |
| **Highlight**| 500 sessions/mo            | yes         | `highlight-io` | `highlight.run` | Session replay built in; smaller community.                       |
| **GlitchTip**| Self-hosted                | yes         | Sentry-compatible | Sentry-compatible | Drop-in Sentry replacement; you run the infra.                |
| **No-op**    | Free                       | n/a         | n/a           | n/a           | Stick with current `console.error` + `toast.error`. Defer indefinitely. |

The audit doesn't pick a vendor; **Sentry** is the safe default if there's no preference.

### Files (post-decision)

- Modify: `backend/requirements.txt`
- Modify: `backend/app/__init__.py` (init the SDK)
- Modify: `backend/app/config.py` (read `SENTRY_DSN` etc.)
- Modify: `frontend/package.json`
- Modify: `frontend/src/main.tsx` (init the SDK)
- Modify: `frontend/src/components/ErrorBoundary.tsx` (call `captureException` in `componentDidCatch`)
- Modify: `frontend/vite.config.ts` (source-map upload, if applicable)
- Modify: README sections in both layers (env vars to set)
- Modify: host's env-var list (Render/Fly/Railway dashboard)

### Step outline (post-decision; example uses Sentry — adapt SDK names if a different vendor is chosen)

- [ ] **Step 1: Add backend SDK**

```bash
echo "sentry-sdk[flask]==2.40.0" >> backend/requirements.txt  # use latest
cd backend && pip install -r requirements.txt
```

- [ ] **Step 2: Init backend SDK**

In `backend/app/__init__.py`, before `create_app` returns:

```python
import os
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

if os.environ.get('SENTRY_DSN'):
    sentry_sdk.init(
        dsn=os.environ['SENTRY_DSN'],
        integrations=[FlaskIntegration()],
        traces_sample_rate=0.1,
        environment=os.environ.get('FLASK_ENV', 'development'),
        release=os.environ.get('GIT_SHA', 'dev'),
    )
```

Guard so local dev without a DSN doesn't ship anything.

- [ ] **Step 3: Add frontend SDK**

```bash
cd frontend && npm install @sentry/react
```

- [ ] **Step 4: Init frontend SDK**

In `frontend/src/main.tsx`, before `<App />` renders:

```tsx
import * as Sentry from '@sentry/react';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}
```

- [ ] **Step 5: Wire ErrorBoundary to capture**

In `frontend/src/components/ErrorBoundary.tsx`, modify `componentDidCatch` to also call `Sentry.captureException(error)` when the SDK is initialized.

- [ ] **Step 6: Source map upload (Sentry-specific)**

Add `@sentry/vite-plugin` and configure in `vite.config.ts` so prod builds upload source maps without leaking them to clients. Set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` in CI.

- [ ] **Step 7: Test**

Trigger a real error in dev (the temporary throw test from `2026-04-29-audit-cluster-h.md` Task 1 Step 7) — confirm it lands in the Sentry dashboard. Trigger a backend exception (e.g. `curl /api/v1/solves -H "Authorization: Bearer broken"` to a path that 500s on a code bug — pick a real path that throws). Confirm it lands too.

- [ ] **Step 8: Document env vars**

Add `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `GIT_SHA` to the relevant READMEs and `.env.example`.

- [ ] **Step 9: Commit**

```bash
git add backend/requirements.txt backend/app/__init__.py frontend/package.json frontend/package-lock.json frontend/src/main.tsx frontend/src/components/ErrorBoundary.tsx frontend/vite.config.ts backend/README.md frontend/README.md
git commit -m "feat(H.6): wire <chosen vendor> for error reporting

Backend Flask integration captures unhandled exceptions; frontend SDK
captures render errors via the existing ErrorBoundary plus unhandled
promise rejections. Source maps upload in prod CI builds. SDK no-ops
when DSN env vars are absent (local dev)."
```

---

## Task C (H.11): Migration runner

**Why third:** the moment there's a deploy pipeline (H.10), running migrations becomes a deploy-time concern. Without H.10 there's no place for the runner to slot in.

### Decision needed

Pick one runner. Trade-offs:

| Option              | Tracks applied | Rollback | Idempotent | Notes                                                                                       |
| ------------------- | -------------- | -------- | ---------- | ------------------------------------------------------------------------------------------- |
| **yoyo-migrations** | yes (`_yoyo_migration` table) | yes (down-scripts) | yes | Python-native; works with any Postgres; small dep; best fit for the existing `migrations/` SQL files. |
| **Supabase CLI**    | yes (their convention) | yes | yes | Tightly integrated with Supabase; requires the CLI on every deploy environment; manages local Supabase as well. |
| **sqitch**          | yes            | yes (revert plans) | yes | Heavy-weight; great for big teams; overkill here.                                          |
| **Hand-rolled**     | needs `schema_migrations` table you write yourself | manual | depends on how you write it | Full control; more code to own.                                                |

The audit's "lighter" suggestion is **yoyo-migrations**; the codebase's `.down.sql` pattern already matches its conventions.

### Files (post-decision; example uses yoyo)

- Create: `backend/migrations/yoyo.ini` (config) — *or* `supabase/config.toml` if Supabase CLI is chosen
- Modify: `backend/requirements.txt` (`yoyo-migrations`)
- Create: `backend/scripts/migrate.py` (thin wrapper)
- Modify: `backend/README.md`
- Modify: deploy workflow (`render.yaml` `preDeployCommand`, or equivalent on the chosen host)

### Step outline (post-decision; yoyo example)

- [ ] **Step 1: Install**

```bash
echo "yoyo-migrations==9.0.0" >> backend/requirements.txt
pip install -r backend/requirements.txt
```

- [ ] **Step 2: Configure**

`backend/migrations/yoyo.ini`:

```ini
[DEFAULT]
sources = .
database = postgres://%(USER)s:%(PASSWORD)s@%(HOST)s:%(PORT)s/%(DBNAME)s
batch_mode = on
```

Set `YOYO_DATABASE_URI` env var in deploy.

- [ ] **Step 3: Rename existing migrations to yoyo's naming convention**

yoyo expects `<NN>__<name>.sql` (double underscore) and pairs with `<NN>__<name>.rollback.sql`. The repo currently uses `<NN>_<name>.sql` and `<NN>_<name>.down.sql`. Decide whether to:
- Rename all 12 files to match yoyo's convention, or
- Configure yoyo's `--prefix` and `--rollback-suffix` settings (check yoyo docs for current support).

If renaming, do it all in one commit and run `yoyo apply --dry-run` against a clean Supabase to verify the order.

- [ ] **Step 4: Wrapper script**

`backend/scripts/migrate.py`:

```python
#!/usr/bin/env python
"""Apply pending Supabase migrations using yoyo."""
import os
import sys
from yoyo import read_migrations, get_backend

def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else 'apply'
    backend = get_backend(os.environ['YOYO_DATABASE_URI'])
    migrations = read_migrations('backend/migrations')
    with backend.lock():
        if cmd == 'apply':
            backend.apply_migrations(backend.to_apply(migrations))
        elif cmd == 'rollback':
            backend.rollback_migrations(backend.to_rollback(migrations))
        else:
            print(f"unknown command: {cmd}", file=sys.stderr)
            return 1
    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv))
```

- [ ] **Step 5: Wire into deploy**

In `render.yaml` (or equivalent):

```yaml
preDeployCommand: python scripts/migrate.py apply
```

For Fly: add a `release_command` in `fly.toml`. For Railway: pre-deploy command in dashboard.

- [ ] **Step 6: Document**

In `backend/README.md`, replace the "apply manually via Supabase dashboard" instruction with:

```bash
YOYO_DATABASE_URI=postgres://... python scripts/migrate.py apply
```

Document: how to roll back (`migrate.py rollback`), what `_yoyo_migration` is (yoyo's tracking table), and the recovery procedure if a migration half-applies.

- [ ] **Step 7: Smoke test against a clean database**

```bash
# Spin up a clean Supabase preview project (or local Postgres)
YOYO_DATABASE_URI=postgres://localhost/ao5_test python backend/scripts/migrate.py apply
# Verify all tables and indexes match production
# Then test rollback of the latest migration
python backend/scripts/migrate.py rollback
```

- [ ] **Step 8: Commit**

```bash
git add backend/requirements.txt backend/migrations/yoyo.ini backend/scripts/migrate.py backend/README.md render.yaml
# (and any renamed migration files from Step 3)
git commit -m "feat(H.11): add yoyo-migrations runner

Migrations now apply via 'python scripts/migrate.py apply' (locally and
in pre-deploy hook). yoyo's _yoyo_migration table tracks state, so
re-running is a no-op. Rollback uses the existing .down.sql files."
```

---

## Verification (after all three Tasks land)

- [ ] A live URL for the backend exists; both `https://.../api/v1/health` and `https://.../api/v1/ready` return 200.
- [ ] A test error in production triggers an event in the chosen error-reporting dashboard within ~1 minute.
- [ ] `python backend/scripts/migrate.py apply` against a clean database brings it to current schema in one shot.
- [ ] CI passes; deploy is automatic on push to `main`.
- [ ] `backend/README.md` and `frontend/README.md` document: how to deploy, how to read logs, how to apply migrations, how to read errors in the dashboard.

---

## Cross-references

- Audit source: `docs/audits/2026-04-25-full-stack-audit.md` (H.6 line ~666, H.10 line ~681, H.11 line ~686)
- Companion plan (executable): `docs/superpowers/plans/2026-04-29-audit-cluster-h.md`
- Token-storage decision (constrains future H.4-related work): `docs/decisions/2026-04-26-token-storage.md`
