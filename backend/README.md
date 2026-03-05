# Ao5 — Backend

Flask REST API for the Ao5 speedcubing timer. Validates Supabase JWTs and proxies authenticated database operations to Supabase.

## Prerequisites

- Python 3.9+
- A Supabase project with a `solves` table

## Setup

1. Create and activate a virtual environment:

```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Create a `.env` file in this directory:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
FLASK_APP=app
FLASK_ENV=development
```

You can find your Supabase URL and anon key in your Supabase project under **Settings → API**.

## Database

The backend expects a `solves` table in your Supabase project with the following columns:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key, auto-generated |
| `user_id` | uuid | Foreign key to `auth.users` |
| `puzzle_type` | text | e.g. `333`, `222`, `444` |
| `time` | float | Solve time in seconds |
| `dnf` | boolean | |
| `plus_two` | boolean | |
| `scramble` | text | |
| `created_at` | timestamptz | Auto-generated |

Enable Row Level Security (RLS) on the `solves` table and add policies so users can only read/write their own rows.

## Running

```bash
source venv/bin/activate
python run.py
```

Server runs at `http://localhost:5000`.

## Testing

```bash
pytest
```

Run a specific file:

```bash
pytest tests/test_solves.py
```

## API Reference

All endpoints (except `/api/health`) require:

```
Authorization: Bearer <supabase_access_token>
```

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/solves` | Get all solves for the authenticated user. Optional query param: `?puzzle_type=333` |
| POST | `/api/solves` | Create a solve. `user_id` is set server-side from the token. |
| PATCH | `/api/solves/<id>` | Update a solve (e.g. toggle DNF or +2) |
| DELETE | `/api/solves/<id>` | Delete a solve |

## Tech

- **Flask 3** — Web framework
- **flask-cors** — CORS support for the React frontend at `localhost:3000`
- **supabase-py** — Database client; an authenticated client is created per request using the user's JWT
- **python-jose** — JWT utilities
- **python-dotenv** — Loads `.env` into environment variables
- **pytest** — Test runner
