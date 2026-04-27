-- 006_solves_active_index.down.sql
create index if not exists solves_user_puzzle_created_idx
  on solves (user_id, puzzle_type, created_at desc);

drop index if exists solves_user_puzzle_created_active_idx;
