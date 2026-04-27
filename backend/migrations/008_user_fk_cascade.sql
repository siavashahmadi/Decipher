-- Migration: 008_user_fk_cascade
-- Cascade auth.users deletes through to solves and personal_bests.
--
-- Precondition: run the orphan audit first.
--   select count(*) from solves s
--     left join auth.users u on u.id = s.user_id
--   where u.id is null;
--   select count(*) from personal_bests p
--     left join auth.users u on u.id = p.user_id
--   where u.id is null;
-- Both must return 0 before applying. If either is non-zero, clean up the
-- orphans first or the ALTER ... ADD CONSTRAINT step will fail.

-- solves.user_id
alter table solves
  drop constraint if exists solves_user_id_fkey;
alter table solves
  add constraint solves_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- personal_bests.user_id
alter table personal_bests
  drop constraint if exists personal_bests_user_id_fkey;
alter table personal_bests
  add constraint personal_bests_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
