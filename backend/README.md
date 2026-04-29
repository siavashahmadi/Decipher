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
| `deleted_at` | timestamptz | Null for active rows; set on soft delete |
| `metadata` | jsonb | Forward-compat for enrichment fields. Default `{}` |

Enable Row Level Security (RLS) on the `solves` table and add policies so users can only read/write their own rows.

### Migrations

The `migrations/` directory contains numbered SQL files (`NNN_<name>.sql`) plus matching `*.down.sql` rollbacks. Apply via the Supabase CLI (`supabase db push <file>`) or paste into the SQL editor in the Supabase dashboard. A managed migration runner is tracked in the deferred Cluster H plan.

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

The canonical API is mounted at `/api/v1`. The unversioned `/api` alias
remains as a transitional path for in-the-wild clients (notably saved
share links); responses on the legacy mount include a `Deprecation: true`
header and an RFC 8594 `Sunset` header. New work should target `/api/v1`.

All endpoints except `/api/health` and `/api/ready` require:

```
Authorization: Bearer <supabase_access_token>
```

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Liveness probe (always 200; not versioned) |
| GET | `/api/ready` | Readiness probe; checks Supabase + JWKS, 503 on failure (not versioned) |
| GET | `/api/v1/solves` | Get solves for the authenticated user (cursor-paginated). Query: `?puzzle_type=333&cursor=<token>&limit=<n>` |
| POST | `/api/v1/solves` | Create a solve. `user_id` is set server-side from the token. |
| POST | `/api/v1/solves/batch` | Bulk-insert up to 1000 validated solves in one transaction (used by guest-to-auth migration) |
| PATCH | `/api/v1/solves/<id>` | Update a solve (whitelist: `dnf`, `plus_two`) |
| DELETE | `/api/v1/solves/<id>` | Soft-delete a solve |
| GET | `/api/v1/solves/<id>/share-token` | Mint a signed share token for the solve |
| GET | `/api/v1/solves/share/<token>` | Public share endpoint; no auth |
| GET | `/api/v1/personal-bests` | List PB rows for the authenticated user. Query: `?puzzle_type=333` |

### Error envelope

Every 4xx/5xx response uses the same shape:

```json
{ "error": { "code": "AUTH_MISSING_TOKEN", "message": "...", "fields": { "...": "..." } } }
```

`code` is a stable upper-snake-case identifier; switch on `code` for
branching. `message` is human-readable; surface it in the UI on unknown
codes. `fields` is omitted when empty. Codes are catalogued in
`backend/app/errors.py`.

## Tech

- **Flask 3** — Web framework
- **flask-cors** — CORS support for the React frontend at `localhost:3000`
- **supabase-py** — Database client; an authenticated client is created per request using the user's JWT
- **python-jose** — JWT utilities
- **python-dotenv** — Loads `.env` into environment variables
- **pytest** — Test runner
