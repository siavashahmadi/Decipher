-- 009_user_stats.down.sql
drop trigger if exists trg_solves_user_stats on solves;
drop function if exists update_user_solve_count();
drop policy if exists "Users can view own stats" on user_stats;
drop table if exists user_stats;
