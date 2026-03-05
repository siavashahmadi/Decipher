# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ao5 is a speedcubing timer web app supporting all WCA puzzles. Users authenticate, solve puzzles with a spacebar/touch timer, and their times are saved to a database with stats (Ao5, Ao12, session mean, best single).

## Architecture

Monorepo with two independent services:

- **`frontend/`** — React (Create React App), communicates with the backend over HTTP
- **`backend/`** — Flask (Python), acts as an authenticated proxy to Supabase

**Auth flow:** Supabase handles authentication entirely on the frontend. The frontend passes the Supabase JWT as a `Bearer` token on every API request. The Flask backend validates this token against Supabase on each request via the `require_auth` decorator in `backend/app/routes/solves.py`.

**Data flow:** `SolveSession` is the top-level orchestrator. It owns the `solves` array and passes handlers down to `Timer`, `Scramble`, `SolveLog`, and `SolveHub`. Scrambles are generated client-side using `cubing.js`.

**Database:** Supabase (PostgreSQL). The only table used is `solves`. Row-level security is enforced via `user_id` filtering on every query.

## Commands

### Frontend

```bash
cd frontend
npm start        # dev server on localhost:3000
npm test         # run tests (interactive watch mode)
npm run build    # production build
```

### Backend

```bash
cd backend
source sia-venv/bin/activate
python run.py    # dev server on localhost:5000

# Run tests
pytest
pytest tests/test_solves.py  # single test file
```

## Environment Variables

**`frontend/.env`**
- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`
- `REACT_APP_API_URL` (defaults to `http://localhost:5000/api`)

**`backend/.env`**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `FLASK_APP=app`
- `FLASK_ENV=development`

## Key Files

- `frontend/src/services/auth.js` — Supabase client and auth helpers
- `frontend/src/services/api.js` — Axios wrapper; attaches Bearer token to every request
- `frontend/src/components/SolveSession.js` — Main app component; owns all solve state
- `backend/app/routes/solves.py` — All API endpoints + `require_auth` decorator
- `backend/app/db.py` — Creates authenticated Supabase client per request

## API Endpoints

All endpoints require `Authorization: Bearer <token>` and are scoped to the authenticated user.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/solves` | Fetch solves; accepts `?puzzle_type=` filter |
| POST | `/api/solves` | Create a solve |
| PATCH | `/api/solves/<id>` | Update a solve (DNF, +2) |
| DELETE | `/api/solves/<id>` | Delete a solve |
| GET | `/api/health` | Health check |
