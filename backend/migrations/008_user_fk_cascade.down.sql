-- 008_user_fk_cascade.down.sql
-- Restore non-cascading FKs.
alter table solves
  drop constraint if exists solves_user_id_fkey;
alter table solves
  add constraint solves_user_id_fkey
  foreign key (user_id) references auth.users(id);

alter table personal_bests
  drop constraint if exists personal_bests_user_id_fkey;
alter table personal_bests
  add constraint personal_bests_user_id_fkey
  foreign key (user_id) references auth.users(id);
