-- 004_soft_delete.sql
-- Soft-delete column for solves. Existing rows get NULL (active).
-- Partial index keeps the active-row scan small even when many rows
-- have been soft-deleted, which is the only path that matters at read time.

ALTER TABLE solves ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX idx_solves_deleted_at ON solves (deleted_at) WHERE deleted_at IS NULL;
