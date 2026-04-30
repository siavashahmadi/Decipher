# CLAUDE.md — Project guide for Claude Code

This file gives Claude Code session-level context about the Ao5 (Decipher) project. It complements the global `~/.claude/CLAUDE.md`.

## What this project is

A full-stack speedcubing timer. React + TypeScript frontend, Flask + Supabase backend. The interesting parts are: a high-precision timer, full WCA-compliant scrambles client-side via cubing.js, JWT auth with local JWKS verification, row-level security at the database layer, cursor-based pagination, write-time materialized personal bests, two-heap running median, virtualized solve log, OLL/PLL/F2L/CMLL trainers, share-link tokens, and a Stats page with date-range filtering.

The codebase has been through a 13-cluster audit (April 25 to April 29, 2026). Everything from that audit has shipped; remaining work is tracked in `TODO_manual_edits.md` (manual SQL applies, post-deploy verifications, three deferred vendor picks).

## Layout

```
ao5/
├── frontend/                       Vite + React 18 + TS strict
│   ├── src/
│   │   ├── App.tsx                 Routing shell + ErrorBoundary
│   │   ├── main.tsx                QueryClientProvider + ThemedToaster + AuthProvider mount
│   │   ├── pages/                  Route-level pages (Stats, SharedSolve, Trainers, Auth)
│   │   ├── components/             Component library (Timer, Scramble, SolveLog, SolveHub, Header, modals, trainer UI, stats UI)
│   │   ├── hooks/                  useSolveSession, useTimerMachine, useFocusTrap, useMedianTracker, useSortedSolveStats, etc.
│   │   ├── contexts/               AuthContext (single global)
│   │   ├── services/               authClient, api (axios), guestStorage, auth (Supabase JS client instance)
│   │   ├── queries/                TanStack Query keys, fetchers, invalidation helpers
│   │   ├── data/                   Static data (PUZZLES, hotkey maps)
│   │   ├── utils/                  Pure functions (averages, statsBuckets, formatTime, solveLabel, exportCsv, puzzleIds)
│   │   ├── types/                  Shared TS types + isPuzzleType predicate
│   │   ├── test-utils/             renderWithProviders, mockSupabaseAuth, makeSolve
│   │   └── lib/                    Lower-level helpers (scrambleQueue, themeColors)
│   ├── vite.config.ts              Source maps off in production
│   └── tsconfig.json               strict + noUncheckedIndexedAccess
├── backend/                        Flask 3 + supabase-py
│   ├── app/
│   │   ├── __init__.py             create_app: configure_logging, ProxyFix, CORS, blueprint at /api/v1, before/after_request hooks
│   │   ├── routes/solves.py        HTTP adapter (require_auth decorator, route handlers); thin
│   │   ├── services/               SolvesService, ShareLinksService, custom exceptions
│   │   ├── repositories/           SolvesRepository, PersonalBestsRepository (Supabase access lives here)
│   │   ├── auth.py                 verify_token_local (PyJWT + JWKS, thread-safe singleton)
│   │   ├── dangerous_admin.py      Service-role Supabase client (RLS bypass; only the share-read route imports this)
│   │   ├── db.py                   User-scoped Supabase client factory
│   │   ├── extensions.py           flask-limiter instance with user-or-IP key function
│   │   ├── errors.py               Standardized error envelope codes + error_response helper
│   │   ├── logging_config.py       Hand-rolled JsonFormatter + dictConfig
│   │   ├── validators.py           Boundary validation (allowlists, no Pydantic)
│   │   └── config.py               Env-loaded constants
│   ├── migrations/                 Numbered up + paired down SQL files (001 through 012)
│   └── tests/                      pytest with FakeSupabase + filter-aware FakeQuery
└── docs/
    ├── ARCHITECTURE.html           High-level system design study guide
    ├── ENGINEERING_NOTES.html      DSA + system design deep-dives
    ├── audits/                     Full-stack audit reports
    ├── decisions/                  Recorded design decisions
    ├── superpowers/plans/          Implementation plans (one per phase or audit cluster)
    └── *.md                        Topical runbooks (jwt-verification, share-secret-rotation, guest-mode)
```

## Conventions

### Frontend
- **TypeScript strict + `noUncheckedIndexedAccess`.** `arr[0]` is `T | undefined`; assert or guard explicitly. Tests have the same setting.
- **No React namespace import.** Use `import { type FormEvent, type ChangeEvent } from 'react'` instead of `import React`.
- **No `alert()`.** Use `toast.success` / `toast.error` from sonner. The provider is mounted at the app root via `ThemedToaster`.
- **AuthClient seam.** UI code calls `supabaseAuthClient.*` (from `services/authClient`), never `supabase.*` directly. The auth service lives in `services/auth.ts` as a lazy Supabase JS client; `authClient` wraps it.
- **TanStack Query for solves.** Solve fetches go through `useAllSolvesQuery` (in `queries/solves.ts`). Mutations call `invalidateSolveCaches(qc, puzzleType)` so the timer page and Stats stay in sync.
- **Hand-rolled hooks over heavy deps.** `useFocusTrap`, `useDismissOnOutsideClick`, `useMedianTracker`, `useSortedSolveStats` are all in-house. No focus-trap-react, no react-virtuoso (we use @tanstack/react-virtual where needed).
- **Test pattern.** Use `renderWithProviders` from `test-utils/`. Use `makeSolve` for fixture data. Use `data-testid` over brittle CSS selectors. Vitest, not Jest.
- **Routes are lazy.** `Stats`, `Trainers`, `SharedSolve` are `React.lazy` imports in `App.tsx` so the timer route bundle stays small. `<Suspense>` falls back to a `route-loading` shell with `aria-busy`.
- **Error envelope parsing.** `services/api.ts` reads `{ error: { code, message, fields } }` from non-2xx responses and surfaces `code` in throws so call sites can branch on it.
- **No em dashes (`—`) in source.** Use periods or commas instead.

### Backend
- **`/api/v1` is the canonical mount.** `/api` is mounted as a transitional alias with `Deprecation` and `Sunset: 2026-07-01` headers. New tests should hit `/api/v1`.
- **Service + repository layers (E.11).** `routes/solves.py` is a thin HTTP adapter. Business logic lives in `services/solves_service.py` and `services/share_links_service.py`. Supabase access lives in `repositories/`. Service-role client lives in `dangerous_admin.py` and is only imported by the share-read route.
- **JWT verification is two-path.** Fast: local JWKS via PyJWT (cached singleton, 5-minute TTL, ES256/RS256 only). Slow: `supabase.auth.get_user(jwt=token)`. Slow path logs `event=auth_slow_path` at INFO from `app.routes.solves`. See `docs/jwt-verification.md`.
- **Standardized error envelope.** Every 4xx/5xx response goes through `error_response(code, message, status, fields=None)` from `app/errors.py`. Codes are stable upper-snake-case identifiers; switch on `code` for branching.
- **Structured JSON logging.** `app/logging_config.py` hand-rolls a `JsonFormatter` wired via `dictConfig` from `create_app`. Every log line includes `timestamp`, `level`, `logger`, `message`. When inside a request, also `request_id` (uuid hex set by a `before_request` hook) and `user_id` (set by `require_auth`).
- **`flask.g` for request-scoped state.** `g.user_id`, `g.supabase`, `g.request_id`. Do not monkey-patch `request`.
- **Boot-time config validation.** `create_app` raises `RuntimeError` if `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `SHARE_SECRET` is missing or `SHARE_SECRET` is shorter than 32 characters.
- **Per-user rate limit (B.10).** `extensions.limiter` keys on `g.user_id` when authenticated, falls back to `get_remote_address()` for unauthenticated routes (auth, share read).
- **Timeouts on Supabase HTTP.** `httpx` timeouts of 2s connect, 5s read/write/pool.
- **Type annotations + `from __future__ import annotations`.** PEP 604 union types (`X | None`, not `Optional[X]`).
- **Test pattern.** `FakeSupabase` in `conftest.py`. The `FakeQuery` can apply `.eq()`, `.is_()`, `.lt()`, `.gt()`, `.or_()`, `.order()`, `.limit()` to scripted data when a fixture passes `filtered=True`. Use `make_solve(**overrides)` for solve fixtures. `SHARE_SECRET` is set via env in `conftest.py`.

### Cross-cutting
- **Lifetime cap.** 100,000 solves per user, enforced via the `user_stats` counter table updated by trigger. The route reads the counter and returns 429 with code `SOLVE_LIMIT_REACHED` if the cap is hit. See migration `009_user_stats.sql`.
- **Soft delete.** `solves.deleted_at` (nullable timestamptz). All read paths filter `deleted_at IS NULL`. The partial index `solves_user_puzzle_created_active_idx` covers this.
- **Cursor format.** `next_cursor = base64url("<created_at>|<id>")`. Tiebreaker on `id` for identical microsecond timestamps. The decoder still accepts the legacy timestamp-only shape for one release window.
- **Share tokens.** Stateless HMAC-SHA256, 4 base64url segments (`solve_id . iat . exp . mac`), 30-day TTL. `SHARE_SECRET` rotation is documented in `docs/share-secret-rotation.md`.

## Running things

```bash
# Backend
cd backend
./sia-venv/bin/python -m pytest -q                    # tests
./sia-venv/bin/python run.py                          # dev server :5000

# Frontend
cd frontend
npx vitest run --reporter=dot                         # tests
npx tsc --noEmit                                      # type check
npm run dev                                           # dev server :5173

# CI runs both on every PR via .github/workflows/ci.yml
```

The backend venv is `backend/sia-venv` (not `backend/venv`). Use `./sia-venv/bin/python -m pytest` rather than the global `pytest`.

## Audit clusters (shipped)

| Cluster | Theme | Plan |
|---|---|---|
| 0 | CI baseline | `2026-04-25-audit-cluster-0-and-a.md` (Cluster 0 inline) |
| A | Critical correctness bugs | `2026-04-25-audit-cluster-0-and-a.md` |
| B | Security hardening | `2026-04-26-audit-cluster-b.md` |
| C | Performance, re-render storm | (no plan file; shipped per audit doc) |
| D | DB integrity, indexing | (no plan file; shipped per audit doc) |
| E | Refactors, dead code, duplication | `2026-04-27-audit-cluster-e.md` |
| F | Type safety | (no plan file; shipped per audit doc) |
| G | Test coverage | (no plan file; shipped per audit doc) |
| H | Architecture | `2026-04-29-audit-cluster-h.md` (+ deferred file) |
| I | Documentation, ops polish | `2026-04-29-audit-cluster-i.md` |

The audit source of truth is `docs/audits/2026-04-25-full-stack-audit.md`.

## Things that are NOT here (and why)

- **No CSS-in-JS, no Tailwind.** Plain CSS modules per component.
- **No Redux / Zustand / Recoil.** TanStack Query handles server state; React `useState` + Context handles UI state.
- **No Pydantic.** Hand-rolled `validators.py` (Pydantic adds a C compile step that bit us on this machine).
- **No focus-trap-react, no react-virtuoso.** Hand-rolled `useFocusTrap`; `@tanstack/react-virtual` for SolveLog.
- **No `python-json-logger` / `structlog`.** Hand-rolled `JsonFormatter` via stdlib `dictConfig`.
- **No migration runner yet.** Migrations applied manually via Supabase SQL editor; runner choice deferred (H.11).
- **No error-reporting vendor wired.** Error boundary is in place; vendor pick deferred (H.6).

## Working style for this repo

- Prefer `Edit` over `Write` for existing files.
- Match the existing file's import style (single-line `import { type ... }`).
- Tests first when adding behavior. The TDD cluster (G) added a strong test base; new code should fit it.
- Commit messages follow `type(scope): subject`. Audit work uses the audit ID as scope: `feat(I.6): structured JSON logging with request_id and user_id`.
- Run the full suites before committing on the backend; for frontend changes also run `npx tsc --noEmit`.
- Use the existing service/repository seams when adding backend behavior; do not add new direct-Supabase calls in `routes/`.
- Use `flask.g` for request-scoped state; do not monkey-patch `request`.
- Use TanStack Query's `invalidateSolveCaches` after any mutation that changes solves.
