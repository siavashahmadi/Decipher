# Ao5 — Speedcubing Timer

A full-stack speedcubing timer for WCA puzzles. Users authenticate, solve with a spacebar or touch-based timer, and their times are saved to a cloud database with real-time stats and a performance chart.

## Features

- WCA-compliant scrambles for all major puzzles (2x2–7x7, Pyraminx, Megaminx, Skewb, Square-1)
- Spacebar timer (hold to ready, release to start, press again to stop)
- Touch support for mobile
- DNF and +2 penalty management per solve
- Live stats: Ao5, Ao12, session mean, best single
- Solve history with per-solve rolling Ao5
- Performance trend chart (last 10 solves)
- User authentication with email/password (Supabase Auth)
- Persistent solve history across sessions

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 (Create React App) |
| Scramble generation | cubing.js |
| Charts | Recharts |
| HTTP client | Axios |
| Auth & database | Supabase (PostgreSQL + Auth) |
| Backend framework | Flask 3 (Python) |
| Backend auth middleware | python-jose, Supabase SDK |
| CORS | flask-cors |
| Testing (frontend) | React Testing Library, Jest |
| Testing (backend) | pytest |

## Project Structure

```
ao5/
├── frontend/       # React app — see frontend/README.md
└── backend/        # Flask API — see backend/README.md
```

The app runs as two separate servers:

- **Frontend** → `http://localhost:3000`
- **Backend** → `http://localhost:5000`

See the individual READMEs in each directory for setup and run instructions.

## How It Works

1. The user signs in via Supabase Auth on the frontend.
2. Each API request from the frontend includes the Supabase JWT as a `Bearer` token.
3. The Flask backend validates the JWT against Supabase on every request and scopes all database queries to the authenticated user.
4. Scrambles are generated entirely client-side using `cubing.js` — no backend involvement.

## Author

Siavash Ahmadi
