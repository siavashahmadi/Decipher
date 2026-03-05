# Ao5 — Speedcubing Timer

Full-stack speedcubing timer for WCA puzzles with WCA scrambles.

## Features

- WCA-compliant scrambles for all major puzzles (2x2–7x7, Pyraminx, Megaminx, Skewb, & Square-1)
- Spacebar timer, and touch support for mobile
- DNF and +2 penalty management per solve
- Live stats: Ao5, Ao12, session mean, best single
- Solve history with per-solve rolling Ao5
- Performance trend chart (last 10 solves)
- Persistent solve history across sessions
- User auth with email/password (Supabase Auth)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React |
| Backend framework | Flask 3 (Python) |
| Scramble generation | cubing.js |
| Charts | Recharts |
| Backend auth middleware | python-jose, Supabase SDK |
| Auth & database | Supabase (PostgreSQL + Auth) |
| CORS | flask-cors |
| HTTP client | Axios |
| Testing (frontend) | React Testing Library, Jest |
| Testing (backend) | pytest |

## Project Structure

```
ao5/
├── frontend/       # React app — see frontend/README.md
└── backend/        # Flask API — see backend/README.md
```

## Author

siavash ahmadi
