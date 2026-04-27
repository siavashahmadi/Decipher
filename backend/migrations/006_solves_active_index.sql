-- Migration: 006_solves_active_index
-- Replace the cursor-pagination index with a partial composite that includes
-- the soft-delete predicate. Every paginated read AND the lifetime-cap count
-- filter on `deleted_at IS NULL`, so the partial index lets Postgres do an
-- index-only scan instead of a recheck on the heap.

create index if not exists solves_user_puzzle_created_active_idx
  on solves (user_id, puzzle_type, created_at desc)
  where deleted_at is null;

drop index if exists solves_user_puzzle_created_idx;
