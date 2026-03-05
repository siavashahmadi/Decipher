-- Migration: 001_initial_schema
-- Creates the solves table with RLS policies

create table solves (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  puzzle_type text not null,
  time numeric not null,
  dnf boolean default false not null,
  plus_two boolean default false not null,
  scramble text default '' not null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table solves enable row level security;

-- RLS Policies: users can only access their own rows
create policy "Users can view own solves"
  on solves for select
  using (auth.uid() = user_id);

create policy "Users can insert own solves"
  on solves for insert
  with check (auth.uid() = user_id);

create policy "Users can update own solves"
  on solves for update
  using (auth.uid() = user_id);

create policy "Users can delete own solves"
  on solves for delete
  using (auth.uid() = user_id);
