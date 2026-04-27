-- Migration: 009_user_stats
-- Per-user denormalized solve counter, maintained by trigger so the
-- lifetime-cap check on POST /solves becomes O(1) and atomic.

create table if not exists user_stats (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  solve_count integer not null default 0
);

alter table user_stats enable row level security;

drop policy if exists "Users can view own stats" on user_stats;
create policy "Users can view own stats"
  on user_stats for select
  using (auth.uid() = user_id);

-- Trigger function: maintain solve_count on insert / soft-delete / hard-delete.
create or replace function update_user_solve_count() returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    insert into user_stats (user_id, solve_count)
    values (new.user_id, 1)
    on conflict (user_id) do update
    set solve_count = user_stats.solve_count + 1;
    return new;
  elsif (tg_op = 'UPDATE') then
    if (old.deleted_at is null and new.deleted_at is not null) then
      -- soft delete: decrement. Use old.user_id so the trigger does not
      -- depend on the application invariant that user_id is immutable.
      update user_stats set solve_count = solve_count - 1 where user_id = old.user_id;
    elsif (old.deleted_at is not null and new.deleted_at is null) then
      -- undelete: increment (defensive — app does not currently support undelete)
      update user_stats set solve_count = solve_count + 1 where user_id = new.user_id;
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    -- hard delete: decrement only if the row was active. If it was already
    -- soft-deleted, the count was already decremented at soft-delete time.
    if (old.deleted_at is null) then
      update user_stats set solve_count = solve_count - 1 where user_id = old.user_id;
    end if;
    return old;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_solves_user_stats on solves;
create trigger trg_solves_user_stats
  after insert or update or delete on solves
  for each row execute function update_user_solve_count();

-- Backfill existing data atomically.
insert into user_stats (user_id, solve_count)
select user_id, count(*)::integer
from solves
where deleted_at is null
group by user_id
on conflict (user_id) do update
set solve_count = excluded.solve_count;
