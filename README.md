# Decipher (Ao5)

Full-stack speedcubing timer for WCA puzzles with WCA scrambles.

## Features

- WCA-compliant scrambles for all major puzzles (2x2–7x7, Pyraminx, Megaminx, Skewb, Square-1, Clock; 3D preview not available for Clock)
- Spacebar timer, and touch support for mobile
- DNF and +2 penalty management per solve
- Live stats: Ao5, Ao12, session mean, best single
- Solve history with per-solve rolling Ao5
- Performance trend chart (last 12 solves)
- Persistent solve history across sessions
- User auth with email/password (Supabase Auth)
- Guest mode (solves saved to localStorage; one-shot migration on first sign-in)
- Shareable read-only solve links with 30-day expiry

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React |
| Backend framework | Flask 3 (Python) |
| Scramble generation | cubing.js |
| Charts | Recharts |
| Backend auth middleware | PyJWT (local JWKS verification with Supabase fallback) |
| Auth & database | Supabase (PostgreSQL + Auth) |
| Share links | HMAC-SHA256 signed tokens, 30-day TTL (see `docs/share-secret-rotation.md`) |
| Solve lifetime cap | 100,000 per user, enforced via `user_stats` counter table |
| CORS | flask-cors |
| HTTP client | Axios |
| Testing (frontend) | React Testing Library, Vitest |
| Testing (backend) | pytest |

## Project Structure

```
ao5/
├── frontend/       # React app — see frontend/README.md
└── backend/        # Flask API — see backend/README.md
```

## Author

siavash ahmadi
