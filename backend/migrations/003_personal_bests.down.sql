-- 003_personal_bests.down.sql
drop policy if exists "Users can insert own personal bests" on personal_bests;
drop policy if exists "Users can view own personal bests" on personal_bests;
drop index if exists personal_bests_user_puzzle_time_idx;
drop table if exists personal_bests;
