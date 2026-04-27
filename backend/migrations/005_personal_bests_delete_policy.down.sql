-- 005_personal_bests_delete_policy.down.sql
drop policy if exists "Users can update own personal bests" on personal_bests;
drop policy if exists "Users can delete own personal bests" on personal_bests;
