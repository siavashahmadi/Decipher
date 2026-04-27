-- 004_soft_delete.sql
-- Soft-delete column for solves. Idempotent — safe to re-run.

ALTER TABLE solves ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_solves_deleted_at
  ON solves (deleted_at) WHERE deleted_at IS NULL;
