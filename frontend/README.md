# Ao5 — Frontend

React + TypeScript app for the Ao5 speedcubing timer. Handles the UI, timer logic, scramble generation, and communicates with the Flask backend.

## Prerequisites

- Node.js 18+
- npm

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in this directory:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=http://localhost:5000/api
```

You can find your Supabase URL and anon key in your Supabase project under **Settings → API**.

## Running

```bash
npm run dev
```

Opens at `http://localhost:5173`. The backend must also be running for solves to save.

## Testing

```bash
npm test
```

## Building for Production

```bash
npm run build
```

Output goes to the `build/` directory.

## Tech

- **Vite 5** — Build tool and dev server
- **React 18** — UI framework
- **TypeScript (strict)** — Type-safe codebase
- **cubing.js** — WCA-compliant scramble generation (runs entirely client-side)
- **Recharts** — Performance trend line chart
- **Axios** — HTTP requests to the Flask backend
- **@supabase/supabase-js** — Auth session management
- **Vitest** — Unit tests

## Component Overview

| Component | Role |
|---|---|
| `App` | Auth gate — shows `Auth` or `SolveSession` based on session state |
| `SolveSession` | Main orchestrator; owns solve state and passes handlers to children |
| `Timer` | Spacebar and touch timer; 10ms resolution |
| `Scramble` | Generates and displays WCA scrambles via cubing.js |
| `SolveHub` | Stats grid (Ao5, best, average) + line chart |
| `SolveLog` | Scrollable solve list with DNF/+2 toggles and delete; computes Ao5, Ao12, mean, best |
| `Header` | Puzzle type selector and sign-out |
| `Auth` | Sign in, sign up, and password reset forms |

## Services

- `src/services/auth` — Supabase client instance and auth helpers (signIn, signUp, signOut, resetPassword)
- `src/services/api` — Axios wrapper; automatically attaches the current session's Bearer token to every request
