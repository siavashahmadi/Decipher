-- 012_solves_metadata.sql (H.12)
-- Forward-compatible metadata column on solves. Future enrichment fields
-- (device, app version, comp tags, etc.) can be added without another
-- ALTER TABLE that locks a multi-million-row table.

ALTER TABLE solves
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- No GIN index yet. Add one only when query patterns demand it.
