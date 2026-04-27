-- Migration: 011_recompute_pbs_for_user
-- Recompute PB rows for a user across one or more puzzle types from scratch
-- by replaying the solves table in chronological order. Used by the batch
-- migration endpoint after a guest's solves are bulk-inserted out of
-- per-record PB-tracking order.

create or replace function recompute_pbs_for_user(
  p_user_id      uuid,
  p_puzzle_types text[]
) returns void
language plpgsql as $$
declare
  v_puzzle text;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  foreach v_puzzle in array p_puzzle_types loop
    delete from personal_bests
    where user_id = p_user_id and puzzle_type = v_puzzle;

    insert into personal_bests (user_id, puzzle_type, time, achieved_at, solve_id)
    select user_id, puzzle_type, time, created_at, id
    from (
      -- Order by (created_at, id) so the running-min window is deterministic
      -- when multiple solves share a microsecond timestamp (common for batch
      -- migration where created_at defaults fire per row in the same
      -- statement).
      select s.*,
             min(time) over (
               order by created_at, id
               rows between unbounded preceding and 1 preceding
             ) as prev_min
      from solves s
      where s.user_id = p_user_id
        and s.puzzle_type = v_puzzle
        and s.deleted_at is null
        and s.dnf = false
    ) ranked
    where prev_min is null or time < prev_min;
  end loop;
end;
$$;

grant execute on function recompute_pbs_for_user(uuid, text[]) to authenticated;
