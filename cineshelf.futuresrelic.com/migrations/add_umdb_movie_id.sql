-- Add UMDB movie ID tracking to movies table
-- This allows CineShelf to know which movies have been pushed to UMDB as movie records
ALTER TABLE movies ADD COLUMN IF NOT EXISTS umdb_movie_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_movies_umdb_movie ON movies(umdb_movie_id);
