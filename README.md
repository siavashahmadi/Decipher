# Decipher (Ao5)

Full-stack speedcubing timer for WCA puzzles with WCA scrambles, full session history, deep stats, and case-by-case algorithm trainers (OLL, PLL, F2L, CMLL).

## Features

- WCA-compliant scrambles for all major puzzles (2x2 through 7x7, Pyraminx, Megaminx, Skewb, Square-1, Clock; 3D preview not available for Clock)
- Spacebar timer with WCA inspection (15s + 2s grace), and touch support for mobile
- DNF and +2 penalty management per solve
- Live stats: Ao5, Ao12, session mean, best single, running median, percentile rank
- Solve history with per-solve rolling Ao5 and a virtualized log (smooth at 10,000+ solves)
- Performance trend chart (last 12 solves) plus full Stats page with date filtering, distribution charts, PB progression, activity heatmap, scramble history, and CSV export
- Per-puzzle personal-best progression
- Trainers for OLL, PLL, F2L, CMLL with case-by-case scramble generation
- Hotkeys: Space (timer), `2` (toggle +2), `d` (toggle DNF), `Shift+D` (delete latest with confirm), `Alt+1..9/0` (puzzle switch), `?` (hotkey help)
- Guest mode (solves saved to localStorage; one-shot batched migration on first sign-in)
- Shareable read-only solve links with 30-day expiry
- User auth with email/password (Supabase Auth)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + Vite 5 + TypeScript (strict) |
| Routing | React Router 6 (App Router shell with lazy-loaded routes) |
| Data layer | TanStack Query (shared cache for solves; cross-page invalidation) |
| Backend framework | Flask 3 (Python 3.11+) |
| API surface | REST mounted at `/api/v1` (legacy `/api` alias kept until 2026-07-01) |
| Scramble generation | cubing.js (client-side, runs offline) |
| Charts | Recharts + @nivo/calendar |
| Backend auth middleware | PyJWT (local JWKS verification with Supabase fallback). See `docs/jwt-verification.md` |
| Auth & database | Supabase (PostgreSQL + Auth + RLS) |
| Share links | HMAC-SHA256 signed tokens, 30-day TTL. See `docs/share-secret-rotation.md` |
| Solve lifetime cap | 100,000 per user, enforced via `user_stats` counter table |
| Rate limiting | flask-limiter (per-user when authenticated, per-IP otherwise) |
| Logging | Structured JSON via stdlib `dictConfig`; `request_id` and `user_id` on every line |
| HTTP client | Axios (parses standardized `{ "error": { "code", "message", "fields" } }` envelope) |
| Toast notifications | sonner |
| Testing (frontend) | React Testing Library, Vitest |
| Testing (backend) | pytest |
| CI | GitHub Actions (`.github/workflows/ci.yml`) runs on every PR and push to main |

## Project Structure

```
ao5/
├── frontend/       React app — see frontend/README.md
├── backend/        Flask API — see backend/README.md
└── docs/           Architecture, engineering notes, runbooks, plans, audits
```

## Local development

Run both servers in parallel terminals.

```bash
# Backend (Flask)
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python run.py                       # → http://localhost:5000

# Frontend (Vite)
cd frontend
npm install
npm run dev                         # → http://localhost:5173
```

Both expect a `.env` with Supabase credentials. See `backend/README.md` and `frontend/README.md`.

## Tests

```bash
cd backend  && pytest -q                                  # 200+ tests
cd frontend && npx vitest run && npx tsc --noEmit         # 460+ tests
```

CI runs both on every PR.

## Documentation

| Doc | Purpose |
|---|---|
| `docs/ARCHITECTURE.html` | High-level system design, request lifecycle, auth flow, frontend/backend layout |
| `docs/ENGINEERING_NOTES.html` | DSA and system-design deep-dives (sliding window, cursor pagination, two-heap median, write-time PB materialization, etc.) |
| `docs/jwt-verification.md` | Fast (local JWKS) vs slow (Supabase fallback) JWT paths, observability |
| `docs/share-secret-rotation.md` | Operator runbook for rotating `SHARE_SECRET` |
| `docs/guest-mode.md` | Guest-vs-authenticated feature matrix |
| `docs/decisions/` | Recorded design decisions (e.g. token storage strategy) |
| `docs/audits/` | Full-stack audit reports |
| `docs/superpowers/plans/` | Implementation plans for shipped audit clusters and feature phases |
| `TODO_manual_edits.md` | Remaining manual checks per cluster (Supabase migration applies, post-deploy verifications, deferred vendor picks) |

## Author

siavash ahmadi
