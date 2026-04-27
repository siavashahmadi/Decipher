-- Migration: 010_record_pb_if_better
-- Atomic read-then-insert for personal best materialization. The function
-- takes a transaction-scoped advisory lock on (user_id, puzzle_type) so
-- concurrent solves for the same user+puzzle serialize. Concurrent solves
-- across different puzzles are unaffected.
--
-- Returns the inserted row (one row), or zero rows if the new time wasn't
-- a PB. SECURITY INVOKER (default) so RLS on personal_bests still enforces
-- auth.uid() = user_id.

create or replace function record_pb_if_better(
  p_user_id     uuid,
  p_puzzle_type text,
  p_solve_id    uuid,
  p_time        numeric,
  p_achieved_at timestamptz
) returns setof personal_bests
language plpgsql as $$
declare
  v_best numeric;
begin
  -- Lock keyed on the (user, puzzle) pair so concurrent inserts queue up.
  -- pg_advisory_xact_lock(int4, int4) accepts two 32-bit keys; hashtext
  -- returns int4 directly so no cast is needed.
  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text),
    hashtext(p_puzzle_type)
  );

  select min(time) into v_best
  from personal_bests
  where user_id = p_user_id and puzzle_type = p_puzzle_type;

  if v_best is null or p_time < v_best then
    return query
    insert into personal_bests (user_id, puzzle_type, time, achieved_at, solve_id)
    values (p_user_id, p_puzzle_type, p_time, p_achieved_at, p_solve_id)
    returning *;
  end if;

  return;
end;
$$;

grant execute on function record_pb_if_better(uuid, text, uuid, numeric, timestamptz) to authenticated;
