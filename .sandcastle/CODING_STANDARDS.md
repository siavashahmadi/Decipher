# Coding Standards

These standards apply to ao5 (Decipher), a full-stack speedcubing timer. The reviewer agent loads this during code review. Standards mirror what's already in the project's CLAUDE.md.

## Frontend conventions (frontend/)

- **TypeScript strict + `noUncheckedIndexedAccess`.** `arr[0]` is `T | undefined`. Assert or guard explicitly. Tests have the same setting.
- **No React namespace import.** Use `import { type FormEvent, type ChangeEvent } from 'react'` instead of `import React`.
- **No `alert()`.** Use `toast.success` / `toast.error` from sonner. The provider is mounted at the app root via `ThemedToaster`.
- **No CSS-in-JS, no Tailwind.** This project uses plain CSS modules per component (`Component.module.css`). Mobile work means editing existing modules and adding `@media` queries. Do NOT introduce Tailwind utility classes, styled-components, or emotion.
- **Hand-rolled hooks over heavy deps.** `useFocusTrap`, `useDismissOnOutsideClick`, `useMedianTracker`, `useSortedSolveStats` are in-house. Don't add `focus-trap-react`, `react-virtuoso`, or similar without strong justification.
- **TanStack Query for server state.** Solve fetches go through `useAllSolvesQuery` (in `queries/solves.ts`). Mutations call `invalidateSolveCaches(qc, puzzleType)`. UI state stays in `useState` + Context. No Redux/Zustand/Recoil.
- **AuthClient seam.** UI code calls `supabaseAuthClient.*` (from `services/authClient`), never `supabase.*` directly.
- **Routes are lazy.** `Stats`, `Trainers`, `SharedSolve` are `React.lazy` imports in `App.tsx`. `<Suspense>` falls back to a `route-loading` shell with `aria-busy`. Don't break this.
- **Test pattern.** Use `renderWithProviders` from `test-utils/`. Use `makeSolve` for fixture data. Use `data-testid` over brittle CSS selectors. Vitest, not Jest.
- **No em dashes (.) in source.** Use periods or commas instead. Same rule applies to comments and string literals.

## Backend conventions (backend/)

- **`/api/v1` is canonical.** `/api` is a transitional alias with `Deprecation` and `Sunset: 2026-07-01` headers. New tests hit `/api/v1`.
- **Service + repository layers.** `routes/solves.py` is a thin HTTP adapter. Business logic in `services/`. Supabase access in `repositories/`. Service-role client only imported by the share-read route.
- **`flask.g` for request state.** `g.user_id`, `g.supabase`, `g.request_id`. Do not monkey-patch `request`.
- **Standardized error envelope.** Every 4xx/5xx goes through `error_response(code, message, status, fields=None)`. Codes are stable upper-snake-case.
- **Type annotations + `from __future__ import annotations`.** PEP 604 union types (`X | None`, not `Optional[X]`).
- **Boundary validation in `validators.py`.** No Pydantic.
- **Test pattern.** `FakeSupabase` in `conftest.py`. `make_solve(**overrides)` for fixtures. Use `./sia-venv/bin/python -m pytest`, not the global `pytest`.
- **No em dashes in source.**

## Cross-cutting

- **Lifetime cap.** 100,000 solves per user, enforced via the `user_stats` counter. New code must respect this.
- **Soft delete.** `solves.deleted_at` (nullable timestamptz). All read paths filter `deleted_at IS NULL`.
- **Cursor format.** `next_cursor = base64url("<created_at>|<id>")`. The decoder still accepts the legacy timestamp-only shape for one release window.
- **Share tokens.** Stateless HMAC-SHA256, 4 base64url segments. 30-day TTL. `SHARE_SECRET` >= 32 chars.

## What to avoid in code review

- Backwards-compat shims, feature flags, or "removed but kept for now" placeholder code. If something is unused, delete it.
- Comments that describe what code does (well-named identifiers do that). Keep comments only for non-obvious *why*.
- Multi-paragraph docstrings or multi-line comment blocks. One short line max.
- Error handling for cases that can't actually happen.
- Premature abstractions. Three similar lines is better than one wrongly-shaped helper.
- Mock databases in integration tests for behaviour that touches RLS, triggers, or Postgres-specific features (FakeSupabase is fine for unit tests, not for these).

## Testing

**For logic and component-state changes (TS / TSX):** test-first is mandatory. Write a failing test that captures the new behavior, make it pass, refactor. Use `renderWithProviders` from `test-utils/`, `makeSolve` for fixtures, `data-testid` over brittle CSS selectors. Mock `window.matchMedia` when behavior depends on viewport.

**For pure CSS changes:** skip jsdom tests. JSDOM doesn't do layout, so a unit test asserting "the grid has 2 columns at 600px" gives false confidence. Rely on visual verification (headless Chromium screenshots at multiple viewports) instead. The reviewer checks both the diff and visual screenshots.

**Before any commit:**
1. `npm run typecheck` (no TS errors)
2. `npm run test` (no failing tests)
3. Visual verification at phone (393x852), tablet (768x1024), desktop (1440x900) for any visual change

## Mobile / responsive

### Breakpoints

| Token   | Range         | Typical query                    |
|---------|---------------|----------------------------------|
| phone   | <= 600px      | `@media (max-width: 600px)`      |
| tablet  | 601 - 1023px  | `@media (max-width: 1023px)`     |
| desktop | >= 1024px     | `@media (min-width: 1024px)`     |

Use these breakpoints consistently. Do not introduce ad-hoc values (480px, 639px, 768px, etc.) without a documented reason.

### Viewport height

Use `100dvh` (dynamic viewport height) instead of `100vh` for full-height containers. `dvh` accounts for the iOS Safari URL bar and other dynamic browser chrome. No fallback is needed (supported since Safari 15.4).

### Safe-area insets

Full-bleed components that touch the top or bottom edge of the screen must respect the device safe area:

```css
/* Header / top bar */
padding-top: max(<existing-pad>, env(safe-area-inset-top));

/* Bottom of page-level containers */
padding-bottom: env(safe-area-inset-bottom);
```

This ensures content clears the Dynamic Island (top) and home indicator (bottom) on notched iPhones. The `viewport-fit=cover` meta tag in `index.html` enables these environment variables.

### Phone-first triage

Phone is highest priority, tablet "make work," desktop polish-only unless the issue says otherwise. No structural UX changes (no bottom-tab nav, no bottom sheets, no gesture-driven panels). Adapt existing components, don't redesign them.

## Commit convention

`type(scope): subject` lowercase. Examples:

- `feat(stats): add date-range filter to PB chart`
- `fix(timer): inspection countdown skipping seconds at low FPS`
- `style(solve-log): mobile breakpoint at 768px`
- `refactor(auth): inline AuthContext memoization`

Body wraps at 72 chars. No `Co-Authored-By` lines. No mention of AI tooling.
