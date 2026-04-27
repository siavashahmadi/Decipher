-- Migration: 003_personal_bests
-- Write-time materialization of personal best records. Idempotent — safe to re-run.
--
-- Design decision (CQRS tradeoff):
--   Option A — compute PB on READ: scan all solves every time → O(n) per request
--   Option B — record PB on WRITE: maintain derived table → O(1) reads, O(1) writes
-- We chose Option B. The cost is a few extra bytes per PB event; the benefit is
-- that GET /personal-bests is an O(1) index scan regardless of solve count.

create table if not exists personal_bests (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users not null,
  puzzle_type text not null,
  time        numeric not null,
  achieved_at timestamptz not null,
  solve_id    uuid references solves(id) on delete set null
);

-- Useful for the progression chart (chronological fetch per user/puzzle)
create index if not exists personal_bests_user_puzzle_time_idx
  on personal_bests (user_id, puzzle_type, achieved_at asc);

-- Enable Row Level Security
alter table personal_bests enable row level security;

drop policy if exists "Users can view own personal bests" on personal_bests;
create policy "Users can view own personal bests"
  on personal_bests for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own personal bests" on personal_bests;
create policy "Users can insert own personal bests"
  on personal_bests for insert
  with check (auth.uid() = user_id);
