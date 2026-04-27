-- 004_soft_delete.down.sql
DROP INDEX IF EXISTS idx_solves_deleted_at;
ALTER TABLE solves DROP COLUMN IF EXISTS deleted_at;
