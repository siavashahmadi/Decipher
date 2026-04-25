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
