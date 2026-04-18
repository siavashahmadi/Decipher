-- Migration: 002_cursor_pagination_index
-- Adds a composite index to support efficient cursor-based pagination.
--
-- Cursor pagination query pattern:
--   WHERE user_id = $1 AND puzzle_type = $2 AND created_at < $cursor
--   ORDER BY created_at DESC LIMIT $limit
--
-- This index lets Postgres use a B-tree scan that reads only the rows
-- needed, rather than re-scanning offset rows on every page.
-- Compare: OFFSET 100 rescans 100 rows every time and breaks when rows
-- are deleted between pages. The cursor uses the index directly.

create index if not exists solves_user_puzzle_created_idx
  on solves (user_id, puzzle_type, created_at desc);
