# Phase 8: PLL Trainer — Design

> Revamp spec reference: `revamp.md` Phase 8. This design narrows the phase scope to **PLL only**; OLL and F2L are explicitly deferred to a follow-up.

## Goal

Add a case-specific PLL practice mode at `/trainers/pll`. User picks "All" or a specific PLL case, optionally picks which alg variant to train, and gets a scramble that leaves only that case unsolved on an otherwise-solved cube. Timer and 3D preview are reused from the main timer page. No stats, no persistence.

## Scope

### In scope

- Replace placeholder `/trainers` page with a real trainer shell.
- Working `/trainers/pll` route with case selector, alg picker, 3D preview, timer, and a last-5 recent-times strip.
- Hand-curated `pll.json` data file (21 cases, one or more canonical algs per case).
- `trainerScramble` utility: random case (if "All"), random alg-from-list (if "Any"), inverse application with random AUF pre-rotation.
- `/trainers/oll` and `/trainers/f2l`: "Coming soon" placeholder cards.

### Out of scope (deferred)

- OLL trainer (57 cases).
- F2L trainer.
- Trainer solve persistence to Supabase.
- Success/failure tracking, recognition vs execution split, weakness analyzer.
- Per-case statistics panel.

## Architecture

### Files

```
src/
├── pages/
│   └── Trainers.tsx                ← replace placeholder; render nested routes for pll/oll/f2l
├── components/trainers/
│   ├── PllTrainer.tsx              ← trainer shell (state, glue)
│   ├── TrainerCasePicker.tsx       ← case dropdown + alg sub-picker
│   ├── TrainerRecentStrip.tsx      ← last-5 times display
│   └── ComingSoon.tsx              ← OLL / F2L placeholder
├── data/
│   └── pll.json                    ← 21 cases
└── utils/
    ├── trainerScramble.ts
    └── trainerScramble.test.ts
```

`AppNav` already exposes a Trainers tab (added in Phase 6). `Trainers.tsx` adds a sub-nav for PLL / OLL / F2L. Routing uses the existing `react-router-dom` setup; nested routes under `/trainers`.

### Component responsibilities

- **Trainers.tsx**: renders sub-nav and a `<Routes>` block mapping `pll` → `PllTrainer`, `oll` → `ComingSoon`, `f2l` → `ComingSoon`. Default `/trainers` redirects to `/trainers/pll`.
- **PllTrainer.tsx**: owns state (selected case, selected alg, current scramble, recent times). Composes `TrainerCasePicker`, existing `Scramble`, existing `ScramblePreview`, existing `Timer`, and `TrainerRecentStrip`. On solve complete, prepends to recent times and generates a new scramble.
- **TrainerCasePicker.tsx**: two controlled dropdowns. Case dropdown lists "All" plus the 21 PLL cases. Alg dropdown is disabled when case is "All", otherwise lists "Any" plus one entry per alg in the case's `algs` array. Includes a Skip button that calls `onSkip()` to regenerate without changing selection.
- **TrainerRecentStrip.tsx**: presentational, takes `recentTimes: { time, flags }[]`, renders formatted times using `formatTime`. DNF renders as "DNF", +2 appends visual marker.
- **ComingSoon.tsx**: static card with puzzle name passed via prop.

### Data model

`src/data/pll.json`:

```json
[
  {
    "id": "T",
    "name": "T perm",
    "algs": ["R U R' U' R' F R2 U' R' U' R U R' F'"]
  },
  {
    "id": "Ua",
    "name": "Ua perm",
    "algs": ["R U' R U R U R U' R' U' R2", "R2 U' R' U' R U R U R U' R"]
  }
]
```

Case IDs: `Aa, Ab, E, F, Ga, Gb, Gc, Gd, H, Ja, Jb, Na, Nb, Ra, Rb, T, Ua, Ub, V, Y, Z` (21 total). Source: algdb.net + speedsolving.com wiki cross-check. Each case has at least one canonical alg; multi-alg cases (Gs, Rs, Js) may carry 2–3.

### Scramble generation

`generateTrainerScramble(type: 'pll', caseId?: string, algIndex?: number): { scramble: string, caseId: string, algIndex: number }`:

1. If `caseId` omitted or `'all'`, pick uniformly at random from the 21 cases.
2. If `algIndex` omitted or `-1` (meaning "any"), pick uniformly at random from that case's `algs` list.
3. Build inverse: `new Alg(alg).invert().toString()` from the `cubing/alg` package.
4. Pick a random AUF prefix from `["", "U", "U'", "U2"]`.
5. Pick a random y-rotation suffix from `["", "y", "y'", "y2"]` for angle variety.
6. Return `{ scramble: "<AUF> <inverse> <y>", caseId, algIndex }`.

Returning the resolved `caseId` and `algIndex` lets the caller display what was picked when "All" / "Any" mode collapses to a concrete choice.

Rationale: the inverse-of-alg approach is standard for PLL case-specific scrambles. Applied from a solved cube via TwistyPlayer, it yields exactly the permutation that the chosen alg solves.

### State in PllTrainer

```ts
type CaseChoice = 'all' | string;  // case id
type AlgChoice = 'any' | number;   // alg index

const [caseChoice, setCaseChoice] = useState<CaseChoice>('all');
const [algChoice, setAlgChoice] = useState<AlgChoice>('any');
const [scramble, setScramble] = useState<string>(() => initialScramble());
const [recentTimes, setRecentTimes] = useState<RecentEntry[]>([]);
```

`useEffect` regenerates `scramble` whenever `caseChoice` or `algChoice` changes. `onSolveComplete` prepends to `recentTimes` (capped at 5) and regenerates `scramble`. Resetting `algChoice` to `'any'` when `caseChoice` changes prevents stale indices.

### Layout

```
┌─ Sub-nav: PLL | OLL | F2L ────────────────────────┐
│                                                    │
│  Case: [All ▾]    Alg: [Any ▾]    [Skip scramble] │
│                                                    │
│  R U R' U' R' F R2 U' R' U' R U R' F'             │  ← scramble
│                                                    │
│            [    3D preview    ]                    │
│                                                    │
│              [     TIMER      ]                    │
│                                                    │
│  Recent: 12.34   15.02   11.87   13.45   14.10    │
└────────────────────────────────────────────────────┘
```

Uses existing `.scramble-text`, `Timer`, `ScramblePreview` styles. One new `PllTrainer.css` for the trainer shell grid.

## Testing

- `trainerScramble.test.ts`:
  - Specific case + specific alg → deterministic inverse + AUF/y from seeded RNG.
  - "All" selection → produces a valid case id from the 21.
  - "Any" alg selection → produces a valid index within the case's algs array.
  - Output is parseable by `cubing/alg` (`new Alg(result)` does not throw).
- No React component tests required for v1 (trainer UI is thin glue).

## Acceptance criteria

- Navigating to `/trainers/pll` shows a working trainer with case picker, scramble, 3D preview, timer, recent strip.
- `/trainers` (no sub-path) redirects to `/trainers/pll`.
- `/trainers/oll` and `/trainers/f2l` render a "Coming soon" card.
- Selecting "T perm" in the case picker produces a scramble such that the 3D preview shows only a T-perm-style LL pattern (corners swapped, edges cycled).
- Selecting a specific alg from the Alg picker produces a scramble that visually matches that alg's inverse.
- Switching case or alg regenerates scramble within one frame, no network.
- Completing a solve prepends the time to the recent strip (cap 5), regenerates scramble, does NOT create a row in Supabase solves.
- Timer behavior (inspection, hold-to-start, penalties) is identical to the main timer page because `Timer` is reused unchanged.
- `trainerScramble` tests pass.

## Non-goals reiterated

- No OLL, no F2L in this phase. `oll.json` is not created.
- No persistence. Reloading the page clears recent times.
- No per-case statistics.
- No alg editing UI. `pll.json` is static data.
