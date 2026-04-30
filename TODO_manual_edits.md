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

## Audit Cluster C (2026-04-26)

All 13 items shipped as 21 commits between `965bb22` and `eda6eb1`. Type checks and 290/290 vitest cases pass. The remaining work is **observation-only**: the perf claims in the commit messages need eyes on a real browser to confirm. None of these change behavior, so a regression here means the optimization didn't land cleanly, not that the app is broken.

For all of the React DevTools steps below, install **React Developer Tools** for Chrome or Firefox, open DevTools, and switch to the "Profiler" tab. Click the round record button, perform the action, click the stop button, then read the flame graph.

### C.1 Timer running-phase Profiler check

Claim: zero Timer re-renders during a running solve. The RAF loop now writes to `div.textContent` directly instead of calling `setTime`, so React should not commit between phase transitions.

1. Run the dev server (`npm run dev` in `frontend/`).
2. Open the app, open DevTools → Profiler.
3. Start recording, do a single solve (space-down, hold, space-up, wait ~5–10 s, space-down to stop).
4. Stop recording.
5. In the flame graph, find the rendered `Timer` component. Between the "phase = ready" / "phase = running" commit and the final "phase = idle" commit there should be zero intermediate Timer commits.
6. If you see a wall of identical 60-Hz Timer commits, RAF is still calling `setTime` somewhere. File this as a regression rather than ignoring it; the whole point of the change is gone.

### C.2 Inspection-tick Profiler check

Claim: inspection now produces about 1 Timer render per displayed second (down from 10/s).

1. Profiler recording on, enter inspection (hold space ~400 ms, release).
2. Watch the visible countdown go 15 → 14 → 13 for ~3 seconds.
3. Stop recording.
4. Expect ~3 Timer commits, one per visible second change. If you see ~30, the second-change gate (`lastShownSecondRef`) regressed.

### C.3 Network-cancellation check

Claim: switching puzzles on `/stats` mid-fetch cancels the in-flight `/api/solves` requests.

1. Open `/stats` in the running app. DevTools → Network tab. Filter for `solves`.
2. Throttle to "Slow 3G" so requests take long enough to interrupt.
3. Click into a different puzzle (e.g. 2x2) before the current page's pagination loop finishes.
4. Look at the Network panel: the in-flight requests for the previous puzzle should show as **cancelled** (red status, "(canceled)"). Without C.3, they would complete normally in the background.

### C.5 Virtualized SolveLog browser check

Claim: scrolling a multi-thousand-solve session stays at 60 fps. JSDOM has no layout, so the unit tests only verify the component mounts; visual correctness needs a real browser.

1. Sign in to an account with at least 1,000 solves on one puzzle (or seed dev data via the timer).
2. Open the timer page, scroll the right-hand SolveLog rapidly with the scroll wheel.
3. DevTools → Performance tab. Record a few seconds of scrolling. Look at the FPS row at the top of the recording: it should hold near 60 (green bars) even with 5,000+ solves loaded. If it drops to 20–30 under heavy scrolling, the virtualizer is not engaging — most likely the scroll container `.solves-list-scroll` is not getting an actual sized parent, so all items mount at once. Inspect the DOM: only the visible window's `<li>` nodes should be present; if you see thousands of `<li>` siblings the virtualization regressed.

### C.12 Lazy-load route nav

Claim: each non-timer route loads as a separate JS chunk; the home/timer route stays eager.

1. After deploying (or `npm run build && npm run preview`), open the app fresh. Network tab open, filter for `.js`.
2. Land on `/`. The `Stats-*.js`, `Trainers-*.js`, and `SharedSolve-*.js` chunks should NOT appear in the network log.
3. Click "Stats" in the header. The `Stats-*.js` chunk loads now, briefly showing the empty `.route-loading` shell, then the page renders.
4. Hard-reload `/`. Confirm the timer renders with no fallback flicker (the home route is intentionally not lazy).
5. If you see all three chunks loaded on the home route, the `lazy()` wrapping in `App.tsx` regressed.

### C.13 Safari audio check

Claim: dropping the `webkitAudioContext` fallback is safe because Safari ships unprefixed `AudioContext` since 14.1 (March 2021).

1. Open the deployed (or preview) build in Safari on macOS or iOS.
2. Settings → Sound on. Start a solve with inspection. You should hear the start beep, the 8-second warning, and the 12-second warning.
3. If audio is silent on Safari but works on Chrome/Firefox, you are running on a Safari version older than 14.1 and the fallback removal needs to be reverted. (Realistically: Safari < 14.1 is a 2020-or-earlier build; this is a vanishingly small risk.)

## Audit Cluster D (2026-04-27)

All 12 items shipped as 16 commits between `6b25694` and `c295dde`. Backend pytest 98/98, frontend vitest 293/293, tsc clean. The remaining work is the SQL apply (six new migrations) and three observation-only checks. Until the migrations are applied, the new routes will fail at first call because `user_stats`, `record_pb_if_better`, and `recompute_pbs_for_user` do not yet exist in the live DB.

### D.1 to D.4, D.7, D.8: apply migrations 006 through 011

The Supabase project may still be paused (see Cluster A note). Unpause first. Then in Supabase dashboard → SQL editor, run the up-migrations in order. Each has a paired `*.down.sql` if you need to roll back.

1. `006_solves_active_index.sql` replaces the cursor-pagination index with a partial composite that includes `WHERE deleted_at IS NULL`. Verify the new index is being used:
   ```sql
   EXPLAIN
   SELECT id, puzzle_type, time, dnf, plus_two, scramble, created_at
   FROM solves
   WHERE user_id = '<some uuid>' AND puzzle_type = '333' AND deleted_at IS NULL
   ORDER BY created_at DESC LIMIT 50;
   ```
   Expected: `Index Scan using solves_user_puzzle_created_active_idx`. No `Filter: (deleted_at IS NULL)` recheck row.

2. `007_personal_bests_time_index.sql` adds a time-ordered PB lookup index. Verify:
   ```sql
   EXPLAIN SELECT time FROM personal_bests
   WHERE user_id = '<uuid>' AND puzzle_type = '333'
   ORDER BY time ASC LIMIT 1;
   ```
   Expected: `Index Scan using personal_bests_user_puzzle_min_time_idx`.

3. `008_user_fk_cascade.sql` adds `ON DELETE CASCADE` to `solves.user_id` and `personal_bests.user_id` foreign keys. **Run the orphan audit FIRST**:
   ```sql
   SELECT count(*) FROM solves s LEFT JOIN auth.users u ON u.id = s.user_id WHERE u.id IS NULL;
   SELECT count(*) FROM personal_bests p LEFT JOIN auth.users u ON u.id = p.user_id WHERE u.id IS NULL;
   ```
   Both must return 0. If either is non-zero, delete the orphans before applying or the migration fails on the new constraint.

4. `009_user_stats.sql` creates the `user_stats` counter table, the `update_user_solve_count` trigger, and backfills counts in one transaction. After applying, sanity-check the backfill:
   ```sql
   SELECT u.user_id, u.solve_count, c.actual
   FROM user_stats u
   JOIN (SELECT user_id, count(*) AS actual FROM solves WHERE deleted_at IS NULL GROUP BY user_id) c
     ON c.user_id = u.user_id
   WHERE u.solve_count <> c.actual;
   ```
   Expected: zero rows.

5. `010_record_pb_if_better.sql` adds the atomic PB write RPC used by `create_solve`. No verification SQL needed; the route starts using it on next deploy.

6. `011_recompute_pbs_for_user.sql` adds the batch-migration PB recompute RPC used by `POST /api/solves/batch`.

### D.7 batch endpoint: end-to-end check

After deploying the backend and frontend together:

1. Sign out (guest mode), record at least 35 solves on `333` (more than the per-solve 30/min rate limit).
2. Sign up. The migration toast should appear.
3. Confirm all 35 solves appear on the Stats page.
4. DevTools Network tab: confirm exactly ONE `POST /api/solves/batch` request, not 35 individual posts.
5. Confirm the PB chart shows the chronologically correct PB progression. The server recomputes PBs from `(created_at, id)` so the rendered chart should match what you would expect from solve order.
6. Tamper test: sign up with 1001 guest solves. The migration should return 422 with a "must contain at most 1000 rows" error rather than silently dropping the tail.

### D.4 user_stats trigger sanity (after some app usage)

After the cluster has been deployed and the app has been used for a few hours:

```sql
-- Pick any active user, compare denormalized count vs ground truth.
SELECT u.solve_count AS denorm,
       (SELECT count(*) FROM solves
        WHERE user_id = u.user_id AND deleted_at IS NULL) AS ground_truth
FROM user_stats u
WHERE u.user_id = '<uuid>';
```

The two numbers must match. If they ever drift, the trigger has a bug. The most likely failure mode is an UPDATE branch that increments or decrements when it should not.

### D.10 flask.g sanity (no manual action; just context)

`require_auth` now sets `g.user_id` and `g.supabase` instead of monkey-patching the `request` object. The limiter in `extensions.py:_user_or_ip_key` is unaffected because it parses the JWT independently. If any future route stops working with "AttributeError: '_AppCtxGlobals' object has no attribute 'user_id'", it forgot the `@require_auth` decorator.

### D.9 cursor format change (one-release legacy fallback)

`GET /api/solves` now returns `next_cursor` as `base64url(<created_at>|<solve_id>)` instead of a bare ISO timestamp. The route accepts both shapes for one release so cached frontend cursors keep working. After the next release ships and stale cursors have rotated out (about 30 days of normal use), open a follow-up to delete the legacy branch in `_decode_solve_cursor` and reject any cursor that doesn't decode to the new shape.

### Deferred follow-ups (open tickets when convenient)

These were flagged by the cluster review but deliberately not done in this round:

- **Per-route MAX_CONTENT_LENGTH cap.** The global limit was bumped from 16KB to 256KB to fit a 1000-row batch payload. Every other POST and PATCH route now allows 16x more body than necessary. A custom `@max_body(16 * 1024)` decorator applied to non-batch routes would restore the tighter limit. Not a security regression today but worth tightening when you have time.
- **SQL-level integration tests for the trigger and RPCs.** All cluster D backend tests use the FakeSupabase mock. The trigger logic in `update_user_solve_count` and the function bodies of `record_pb_if_better` and `recompute_pbs_for_user` have no direct test coverage. A Postgres-backed integration test (Docker Compose Supabase or testcontainers) would catch trigger drift before deploy.
- **Drop the legacy timestamp-only cursor fallback.** See D.9 note above.
- **`MAX_CONTENT_LENGTH` per-route override** is also tracked in `backend/app/__init__.py`. The current 256KB only matters because the batch endpoint exists.

## Audit Cluster H (2026-04-29)

10 of the 13 Cluster H items shipped as 10 commits between `ecd68ca` and `4e801ec`, plus a docs commit `2c3962b`. Tests pass: backend 192/192, frontend 457/457, tsc clean. The remaining work is one SQL apply and three deferred vendor picks.

### H.12 Apply migration 012 (solves.metadata)

Migration file: `backend/migrations/012_solves_metadata.sql`

Adds a `metadata jsonb NOT NULL DEFAULT '{}'` column to `solves`. Forward-compat for future enrichment fields (device, app version, comp tags). No code reads the column today, so there is no rush, but apply the migration before any feature that depends on it ships.

To apply:

1. If the Supabase project is paused (see Cluster A note), unpause first.
2. Supabase dashboard, SQL editor: paste the contents of `backend/migrations/012_solves_metadata.sql` and run.
3. Verify:
   ```sql
   SELECT column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_name = 'solves' AND column_name = 'metadata';
   ```
   Expected: one row, `jsonb`, default `'{}'::jsonb`.

### H.1 /api/v1 versioning, post-deploy check

The frontend now hits `/api/v1`. The legacy `/api` mount remains as a transitional alias so saved share links keep working. After deploying:

1. Hit `https://<your-host>/api/v1/health` and `https://<your-host>/api/v1/ready`. The `ready` endpoint should return 200 with `supabase: ok` plus a JWKS state (`fresh` or `cold`).
2. Hit a legacy `https://<your-host>/api/solves/...` path. Confirm the response carries `Deprecation: true`, `Sunset`, and `Link: </api/v1>; rel="successor-version"` headers.
3. The Sunset header advertises 2026-07-01. Plan to drop the un-versioned `/api` mount after external clients have migrated past that date (see Deferred follow-ups below).

### H.13 Auth route already at /login (verified, no action)

The audit called for mounting Auth at `/login`. Confirmed during Cluster H execution that this already shipped as part of Cluster E (E.13 Auth refactor). No further action.

### H.6, H.10, H.11 deferred (vendor picks required)

Three Cluster H items are blocked on vendor decisions:

- **H.6** error reporting: Sentry vs PostHog vs Highlight vs GlitchTip vs no-op.
- **H.10** backend host: Render vs Fly vs Railway vs Cloud Run vs Vercel functions.
- **H.11** migration runner: yoyo-migrations vs Supabase CLI vs sqitch vs hand-rolled.

A placeholder plan with full step outlines per item lives at `docs/superpowers/plans/2026-04-29-audit-cluster-h-deferred.md`. Fill in the "Decision log" section at the top of that file when you pick vendors, then ask Claude to execute the matching task.

### H.3 cross-page invalidation, post-deploy check

Claim: creating a solve on the timer page makes Stats see the new solve without a manual reload, because both pages share a TanStack Query cache.

1. Open the deployed app in two tabs at the same account: tab A on `/`, tab B on `/stats`.
2. In tab A, record one solve.
3. Switch to tab B (no reload). Within a second the new solve should appear in the Stats summary, scramble history, and charts. If it does not, the `invalidateSolveCaches` call in `useSolveSession` regressed or the `QueryClientProvider` in `main.tsx` is missing.

### Deferred follow-ups (open tickets when convenient)

These were considered during Cluster H but intentionally not done:

- **Drop the un-versioned `/api` legacy mount.** Currently advertised for removal on 2026-07-01 via the `Sunset` header. After that date, the second `app.register_blueprint(solves, url_prefix='/api', name='solves_legacy')` line in `backend/app/__init__.py` plus the `_legacy_api_deprecation` and `_legacy_api_headers` hooks can be deleted. Existing share links will 404 if regenerated under the legacy path; mint new ones from `/api/v1/solves/<id>/share-token`.
- **Lift optimistic-update boilerplate into react-query mutations.** `useSolveSession`'s manual snapshot/rollback pattern was preserved in H.3 to keep the timer hot path stable. Future work can replace it with react-query's `onMutate` and `onError` lifecycle. Not urgent: behavior is correct, code is just a bit longer than necessary.
- **Migrate personal_bests reads to react-query.** `useSolveSession` still fetches PBs via a `useEffect`. Putting it in the shared cache (key `['personalBests', puzzleType]`) plus invalidation on mutations would close the same cross-page consistency gap H.3 closed for solves.

## Audit Cluster I (2026-04-29)

All 13 Cluster I items shipped as 12 commits between `0614562` and `4e482ac`. Tests pass: backend 201/201, frontend 465/465, tsc clean. I.10 was verified-already-shipped during Cluster E (no commit needed). Remaining work is observation-only after deploy, plus one manual keyboard a11y check.

### I.5 + I.6 JSON logging and slow-path observability (post-deploy check)

Backend now emits one structured JSON object per log line. The JSON formatter folds `request_id` (uuid hex set by a new `before_request` hook) and `user_id` (set by `require_auth`) onto every record. JWT fast/slow paths and operator commands are documented at `docs/jwt-verification.md`.

After deploying:

1. Tail your host's stdout (Render / Fly / Railway log stream). Every line should be valid JSON. Pipe through `jq .` to confirm:
   ```bash
   <log stream> | jq -r '.timestamp + " " + .level + " " + .message'
   ```
2. Hit any authenticated endpoint. The corresponding `app.access` log line should include both `request_id` (uuid hex) and `user_id` (the JWT subject).
3. Force the slow path: hit an authenticated endpoint with a token signed by a different Supabase project, or revert `verify_token_local` to always return `None` in a pre-prod env. You should see `event=auth_slow_path` at INFO from logger `app.routes.solves`. In normal traffic this should fire on under 1% of authenticated requests; sustained spikes above 5% mean JWKS unreachability or recent key rotation.
4. To change log verbosity in production, set `LOG_LEVEL=DEBUG` (or WARNING) on the host. Default is INFO.

### I.7 Focus trap on dialogs (manual a11y check)

`SolveDetailModal` and `HotkeyHelp` now render `aria-modal="true"` and use a hand-rolled `useFocusTrap` hook. To verify in a real browser (jsdom in the test suite cannot fully exercise focus and tab cycles):

1. Open the timer page. Click any solve in the SolveLog to open the detail modal.
2. Press Tab repeatedly. Focus should cycle through the buttons inside the modal (Close, Copy scramble, Use this scramble, Copy share link, +2, DNF, Delete) and wrap back to the first when it reaches the last.
3. Press Shift+Tab from the first focusable. Focus should jump to the last.
4. Press Esc (or click outside). Modal closes; focus returns to the row you clicked.
5. Repeat for HotkeyHelp: open with `?`, Tab cycles inside the help panel, Esc returns focus to the prior element.

If focus escapes to the page underneath, `useFocusTrap` is not engaging. Most likely cause: a child component portals out of the modal root, so the focusables query in `frontend/src/hooks/useFocusTrap.ts` cannot see them.

### I.13 aria-busy (optional screen-reader sanity)

`aria-busy` was added to the Stats loading paragraph, the `Scramble` container, and the Auth submit button. Optional check with VoiceOver (Cmd+F5 on macOS) or NVDA on Windows: while Stats is loading, the screen reader should announce "busy"; same for the Auth submit button while a sign-in is in flight; same for the Scramble panel while a new scramble generates.

### I.4 SHARE_SECRET rotation (reference doc, no immediate action)

`docs/share-secret-rotation.md` now documents the rotation procedure. Two key operational reminders:

- Rotation is a hard cutover today. Every outstanding share link breaks the instant the new secret takes effect (max blast radius is the 30-day token TTL). Communicate to anyone depending on long-lived links before deploying a new secret.
- The doc includes a recommended future "dual-secret rolling window" pattern (~30 lines of Python) if you anticipate frequent rotation. Not implemented; track separately when needed.

## Audit complete (Clusters 0 through I, 2026-04-29)

All 13 audit clusters have shipped. Snapshot:

| Cluster | Status | Manual notes section |
|---|---|---|
| 0 (CI baseline) | shipped | none — `.github/workflows/ci.yml` runs backend pytest + frontend tsc/vitest on every PR and push to main |
| A (critical bugs) | shipped | above |
| B (security) | shipped | above |
| C (perf) | shipped | above |
| D (DB integrity) | shipped | above |
| E (refactors) | shipped | none — pure code restructure, behavior unchanged, covered by existing tests |
| F (type safety) | shipped | none — compile-time only (noUncheckedIndexedAccess, predicate types, BEARER_PREFIX constant, etc.) |
| G (test coverage) | shipped | none — adds tests, no behavior change |
| H (architecture) | shipped (3 vendor picks deferred) | above |
| I (docs and ops polish) | shipped | above |

The remaining audit-tracked work items are:

- **Deferred vendor picks** in `docs/superpowers/plans/2026-04-29-audit-cluster-h-deferred.md`: H.6 error reporting (Sentry / PostHog / Highlight / GlitchTip / no-op), H.10 backend host (Render / Fly / Railway / Cloud Run / Vercel functions), H.11 migration runner (yoyo-migrations / Supabase CLI / sqitch / hand-rolled).
- **Deferred follow-ups** listed under individual cluster sections above: CSP Report-Only → enforcing flip (B.7 phase 2), drop legacy `/api` mount post-Sunset (2026-07-01), per-route MAX_CONTENT_LENGTH cap, drop legacy timestamp-only cursor branch (D.9), migrate PB reads to react-query, replace `useSolveSession` snapshot/rollback with react-query `onMutate`, dual-secret SHARE_SECRET rotation support, SQL-level integration tests for triggers and RPCs.
- **Pending Supabase SQL applies** (gated on the project being unpaused): migration 005 (Cluster A), migrations 006-011 (Cluster D), migration 012 (Cluster H).
- **Long-term token storage migration** from localStorage to PKCE + httpOnly cookie via `@supabase/ssr` (B.13). Decision recorded at `docs/decisions/2026-04-26-token-storage.md`; implementation is XL and architectural, intentionally not bundled into this audit pass.

If a new audit pass is run, start a fresh `Audit Cluster J` section below this summary so the historical structure stays readable.
