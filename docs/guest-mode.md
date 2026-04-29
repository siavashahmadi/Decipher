# Guest Mode

Ao5 supports an unauthenticated "guest" mode that stores solves in
`localStorage`. When a guest signs in, their local solves are migrated to the
backend in one atomic batch. This document maps the divergence between the
guest and authenticated paths so anyone touching either side knows where the
forks are.

## Feature matrix

| Feature              | Guest                                | Authenticated                                       |
| -------------------- | ------------------------------------ | --------------------------------------------------- |
| Solve storage        | `localStorage` (per-puzzle key)      | Supabase `solves` table via `/api/solves`           |
| Personal best        | Computed in-memory from local solves | Materialized in `personal_bests` table on write     |
| PB progression chart | Derived live from local solves       | Read from `personal_bests` (one row per PB event)   |
| Lifetime cap         | None (bounded by `localStorage` size)| 100,000 solves per user (`SOLVE_LIFETIME_CAP`)      |
| Pagination           | Full local list, no cursor           | Cursor-based, default page size 100                 |
| Share links          | Not available                        | HMAC-signed, 30-day expiry                          |
| Soft delete          | Hard delete                          | Soft delete (`deleted_at`); not yet user-restorable |
| Trainers             | Available                            | Available (full parity)                             |
| CSV export           | Available                            | Available                                           |
| Cross-device sync    | None                                 | Real-time via Supabase                              |
| Multi-tab safety     | Last-write-wins on full array        | Per-row writes; no collision on independent solves  |

## How the unified API surface works

`useSolveStore(isGuest, puzzleType)` (`frontend/src/hooks/useSolveStore.ts`)
returns a single `SolveStore` shape with `fetchPage`, `create`, `update`,
`remove`. The hook picks the implementation based on `isGuest`:

- `makeGuestStore` calls into `services/guestStorage.ts` synchronously and
  wraps the result in a resolved promise so the consumer signature is
  identical.
- `makeApiStore` forwards each call to the corresponding `services/api.ts`
  function.

Consumers (`useSolveSession`, `useAllSolves`, etc.) do not branch on auth
state. The auth fork is contained to this one factory.

## Migration on sign-in

When a guest signs in, `AuthContext.tsx` calls `api.migrateSolves(allGuestSolves)`.
The implementation lives in `frontend/src/services/api.ts`:

1. Sort solves chronologically by `created_at` ascending. The backend's PB
   recompute orders by `created_at` too, but sending pre-sorted makes the
   wire payload deterministic and helps debugging.
2. Strip server-managed fields (`id`, `user_id`, `created_at`) from each row.
3. POST the array to `/api/solves/batch` (capped at 1000 rows; below the
   atomic-insert ceiling).
4. On success, the backend returns the inserted rows with their new server
   IDs. `AuthContext.tsx` removes the migrated solves from `localStorage`
   and surfaces a toast.
5. On failure (any HTTP status), the call returns `{ migrated: [], failed: <all sorted> }`
   plus an `errorStatus`. The batch is all-or-nothing; nothing is deleted
   from `localStorage` on partial failure.

Code references:

- Storage layer: `frontend/src/services/guestStorage.ts`
- Hook adapter: `frontend/src/hooks/useSolveStore.ts`
- Migration call site: `frontend/src/contexts/AuthContext.tsx`
- Backend batch endpoint: `backend/app/routes/solves.py` (`create_solves_batch`)
- Lifetime cap constant: `backend/app/services/solves_service.py` (`SOLVE_LIFETIME_CAP`)

## Storage limits

`localStorage` is typically 5–10 MB per origin. At ~200 bytes per solve we
cap out around 25,000–50,000 solves before quota errors. `guestStorage.ts`
catches `QuotaExceededError` and throws `GuestStorageQuotaError`; consumers
surface a toast and stop persisting until space is freed.

A guest hitting their effective storage limit cannot keep recording. The
remediation is to sign in, which migrates everything to the backend and
clears the local copy. The 100,000-solve backend cap is well above the
effective `localStorage` ceiling.

## Long-term direction

Treating guests as anonymous Supabase sessions (`supabase.auth.signInAnonymously()`)
would collapse the guest and authenticated paths into one. The current
two-path design predates that Supabase feature and remains the chosen
shape; migrating is non-trivial (data residency, anonymous-to-permanent
upgrade flow, RLS policy changes) and is **not** scheduled.

The token-storage decision in `docs/decisions/2026-04-26-token-storage.md`
is independent of this question; either guest model is compatible with
either token-storage choice.
