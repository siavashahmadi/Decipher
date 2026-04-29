-- 012_solves_metadata.down.sql (H.12 rollback)

ALTER TABLE solves DROP COLUMN IF EXISTS metadata;
