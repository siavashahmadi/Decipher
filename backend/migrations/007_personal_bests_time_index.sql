-- Migration: 007_personal_bests_time_index
-- _maybe_record_pb does `ORDER BY time ASC LIMIT 1` to find the current best.
-- The existing index on (user_id, puzzle_type, achieved_at) doesn't help
-- that query — Postgres has to sort. This index makes the lookup a single
-- index seek.
--
-- Note: the existing 003 index is misleadingly named
-- `personal_bests_user_puzzle_time_idx` but actually orders by achieved_at.
-- We deliberately use a different name here rather than renaming during a
-- live migration.

create index if not exists personal_bests_user_puzzle_min_time_idx
  on personal_bests (user_id, puzzle_type, time asc);
