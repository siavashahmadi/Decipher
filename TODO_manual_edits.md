# Manual edits required

Actions Claude can't perform. Do these yourself.

## Phase 1

### 1.2 Verify Supabase RLS (dashboard)

The anon key ships in the frontend. If RLS is off, any visitor can read/write every user's data using the anon key directly.

In the Supabase dashboard → Authentication → Policies, confirm:

- **`solves`**: RLS enabled. Separate policies for `SELECT`, `INSERT`, `UPDATE`, `DELETE`, each using `auth.uid() = user_id`.
- **`personal_bests`**: same.

If RLS is off, enable it and add the policies before shipping anything else.

### ProxyFix sanity check (after next deploy)

`ProxyFix(x_for=1, x_proto=1)` is wired in `backend/app/__init__.py`. Only observable in a real deployment.

- After deploying, make requests from two different IPs.
- In your host's logs (Render / Fly / Railway), confirm `request.remote_addr` shows the real client IP, not the proxy's.
- If rate limits still look global rather than per-user, the `x_for` count may need bumping for your hosting stack.

## Phase 7

### 7.5 Shareable solve link — env vars

The share endpoints require two new env vars. Both must be set locally (`backend/.env`) and in your deployed host.

- **`SHARE_SECRET`** — any long random string (e.g. `openssl rand -hex 32`). Used to HMAC-sign solve ids. If this ever changes, all previously-generated share links break. Never commit this.
- **`SUPABASE_SERVICE_ROLE_KEY`** — from Supabase dashboard → Project Settings → API → `service_role` key. Used by the share read path to bypass RLS on a narrow, server-verified endpoint. Treat as a secret equivalent to database credentials; never ship to the frontend.

Without these, `GET /api/solves/:id/share-token` and `GET /api/solves/share/:token` will return 500.

### 7.5 Shareable solve link — end-to-end check (after deploy)

- Sign in, open any solve's detail modal, click **Copy share link**.
- Paste the URL into an incognito window → the shared view should render without a login.
- Tamper with one character in the token portion of the URL → "This link is invalid or the solve was removed."
- Sign in as a different account and hit the same link → still renders (expected: signed token = shareable).

## Phase 8

### 8.1 Local JWT verification — Supabase asymmetric signing keys

`require_auth` now tries `verify_token_local(token)` first (JWKS, local decode) and falls back to `supabase.auth.get_user()` on any failure. The fast path only activates if your Supabase project issues JWTs with an asymmetric algorithm (ES256 or RS256). Legacy HS256 projects will silently stay on the slow fallback with no behavior change.

To actually enable the round-trip removal:

- In Supabase dashboard → Project Settings → JWT Keys, rotate to an asymmetric key (ES256 recommended, fast and short). Users stay signed in through the rotation.
- Keep `SUPABASE_URL` set in both `backend/.env` and your deployed host — the JWKS client fetches from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`.

### 8.1 Local JWT verification — post-deploy check

After deploying on an asymmetric-keys project:

- Sign in, make a handful of authenticated requests (hit the timer, open Stats).
- Tail backend logs. You should see NO `Supabase auth lookup failed` entries on the happy path, and no outbound HTTPS to `*.supabase.co/auth/v1/user` per request (only the initial one-time JWKS fetch).
- If you still see `auth.get_user` chatter per request, the fallback is firing — most likely the JWKS endpoint is unreachable or the project is still on HS256.

## Audit Cluster A (2026-04-25)

### Supabase project is paused

The Supabase project has been paused (no app usage for a couple weeks). All Cluster A items that touch the live DB are gated on unpausing first. Specifically: A.9 (apply migration 005) and any future end-to-end checks. Code-only items (A.4 validator change, A.7 share-link expiry) ship without touching the DB.

To unpause: Supabase dashboard → project picker → "Restore project". Wait for the status to go green before applying A.9.

### A.4 Production puzzle_type audit (no longer required)

The plan originally called for an audit of `solves.puzzle_type` to check for `'minx', '333bf', '333oh', '444bf', '555bf'` rows that would be rejected by the new validator. Verified by codebase grep: those tokens exist ONLY in `backend/app/validators.py` and nowhere else in the application (no UI button, no hotkey, no scramble generator, no display path). Realistically no row in any environment has those values. A.4 ships without a data migration.

### A.9 Apply migration 005 (personal_bests RLS)

Migration file: `backend/migrations/005_personal_bests_delete_policy.sql`

Today the user-scoped Supabase client cannot DELETE rows from `personal_bests` because no DELETE RLS policy exists. The route at `backend/app/routes/solves.py:239` calls `.delete()` and PostgREST returns "0 rows affected" with no exception. Result: every PB-holding solve that gets deleted leaves an orphan PB row.

To fix:

1. In Supabase dashboard → SQL editor, paste the contents of `backend/migrations/005_personal_bests_delete_policy.sql` and run.
2. Verify with:
   ```sql
   SELECT polname FROM pg_policy
   WHERE polrelid = 'public.personal_bests'::regclass
   ORDER BY polname;
   ```
   Expected: at least four policies including the two new ones (DELETE, UPDATE).
3. End-to-end check: in the app, record a fast solve to create a PB, then delete that solve from the UI. Confirm the matching `personal_bests` row is gone.

### A.7 Share-link tokens reissued (breaking change)

The share-link token format changed from 2 segments (`b64(id).b64(mac)`) to 4 segments (`b64(id).b64(iat).b64(exp).b64(mac)`) and now expires 30 days after issue. Any existing share links 404 immediately on deploy. If anyone has externally-pasted share links pointing at this app, they need a new one.

Also: `SHARE_SECRET` must now be at least 32 characters in production. The startup check in `create_app` raises `RuntimeError` if the env var is shorter. Generate a fresh value if needed: `openssl rand -hex 32`.

## Audit Cluster B (2026-04-26)

### B.4 New required env vars

`create_app` now refuses to boot on any missing required env var. In addition to `SHARE_SECRET` (already required), these three must be set in `backend/.env` AND in your deployed host:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

If you were already running the app, all three are presumably set. The only practical risk is a fresh deploy or a CI environment that previously skipped one of them — startup will now crash with `RuntimeError: Required environment variables missing: ...` instead of failing at first request.

### B.7 phase 2: flip CSP from Report-Only to enforcing

CSP currently ships as `Content-Security-Policy-Report-Only`, which means browsers report violations to DevTools console but do NOT block them. Phase 2 flips the header name to `Content-Security-Policy`, at which point any violation actively blocks the resource.

Before flipping:

1. Use the app in production for at least one to two weeks across the major flows: sign in, record a solve, view Stats, view a Trainer, open a share link in incognito.
2. In each session, open DevTools → Console and look for `Refused to ...` or `Content Security Policy` violation messages. There should be **none**. If any appear, the allowlist needs adjustment before enforcement (most likely cause: a new CDN/font/analytics tag added since 2026-04-26).
3. Edit `backend/app/__init__.py`: change `response.headers.setdefault("Content-Security-Policy-Report-Only", csp)` to `response.headers.setdefault("Content-Security-Policy", csp)`. The existing test in `backend/tests/test_security_headers.py` accepts either header name and stays green.
4. Commit, deploy, and re-run the same flow check. Anything blocked now is a real CSP problem and needs investigation, not a quick allowlist add.

### B.8 New flask-cors version

`flask-cors` was bumped from 4.0.0 to 5.0.x. After pulling, run `pip install -r backend/requirements.txt` to upgrade locally. Your deployed host's build step should pick this up automatically on next deploy.

### B.10 Per-user rate limiting (post-deploy check)

Authenticated requests are now rate-limited per JWT subject instead of per source IP. After deploying:

- Open the app in two tabs signed in to the same account, hammer one tab. The OTHER tab should also see 429s once the bucket drains. (Same user, same bucket.)
- Sign out in one tab, hit unauthed endpoints (e.g. a share link). That bucket is per-IP again.

If users behind a corporate NAT report more 429s than expected, the previous per-IP behavior was masking the real per-user limit. Bump `@limiter.limit("30 per minute")` etc. in `backend/app/routes/solves.py` if 30/minute is too tight for your usage shape.

### B.11 Optional: switch limiter to Redis in production

The limiter still defaults to `memory://` (per-process). If you run multiple workers in production, the same user can effectively get N times the documented rate by hitting a different worker. To fix without a code change:

1. Provision a Redis instance (or any flask-limiter-supported store).
2. Set `LIMITER_STORAGE_URI=redis://<host>:<port>/<db>` in your deployed host's env.
3. Restart workers. Verify by hammering one user from two terminals against two workers and confirming the bucket is shared.

Not urgent if you currently run a single backend process.
