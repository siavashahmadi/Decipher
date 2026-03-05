# Ao5 — Frontend

React app for the Ao5 speedcubing timer. Handles the UI, timer logic, scramble generation, and communicates with the Flask backend.

## Prerequisites

- Node.js 16+
- npm

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in this directory:

```env
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
REACT_APP_API_URL=http://localhost:5000/api
```

You can find your Supabase URL and anon key in your Supabase project under **Settings → API**.

## Running

```bash
npm start
```

Opens at `http://localhost:3000`. The backend must also be running for solves to save.

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

- **React 18** — UI framework
- **cubing.js** — WCA-compliant scramble generation (runs entirely client-side)
- **Recharts** — Performance trend line chart
- **Axios** — HTTP requests to the Flask backend
- **@supabase/supabase-js** — Auth session management

## Component Overview

| Component | Role |
|---|---|
| `App.js` | Auth gate — shows `Auth` or `SolveSession` based on session state |
| `SolveSession.js` | Main orchestrator; owns solve state and passes handlers to children |
| `Timer.js` | Spacebar and touch timer; 10ms resolution |
| `Scramble.js` | Generates and displays WCA scrambles via cubing.js |
| `SolveHub.js` | Stats grid (Ao5, best, average) + line chart |
| `SolveLog.js` | Scrollable solve list with DNF/+2 toggles and delete; computes Ao5, Ao12, mean, best |
| `Header.js` | Puzzle type selector and sign-out |
| `Auth.js` | Sign in, sign up, and password reset forms |

## Services

- `src/services/auth.js` — Supabase client instance and auth helpers (signIn, signUp, signOut, resetPassword)
- `src/services/api.js` — Axios wrapper; automatically attaches the current session's Bearer token to every request
