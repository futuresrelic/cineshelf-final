-- Add UMDB Box Set integration fields to containers table
-- Allows box sets to be pushed to / synced from UMDB

ALTER TABLE containers ADD COLUMN umdb_boxset_id TEXT DEFAULT NULL;
ALTER TABLE containers ADD COLUMN umdb_cover_url TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_containers_umdb_boxset ON containers(umdb_boxset_id);
