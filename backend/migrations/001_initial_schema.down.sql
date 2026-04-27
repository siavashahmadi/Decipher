-- 001_initial_schema.down.sql
drop policy if exists "Users can delete own solves" on solves;
drop policy if exists "Users can update own solves" on solves;
drop policy if exists "Users can insert own solves" on solves;
drop policy if exists "Users can view own solves" on solves;
drop table if exists solves;
