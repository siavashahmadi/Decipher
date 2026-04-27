-- 011_recompute_pbs_for_user.down.sql
revoke execute on function recompute_pbs_for_user(uuid, text[]) from authenticated;
drop function if exists recompute_pbs_for_user(uuid, text[]);
