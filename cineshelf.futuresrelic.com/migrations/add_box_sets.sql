-- ============================================
-- CineShelf Box Set / Multi-Movie Container System
-- Migration: Add containers and container_contents tables
-- Version: 2.3.0
-- Date: 2026-02-08
-- ============================================

-- Table: containers (Box Sets, Multi-Feature DVDs, etc.)
CREATE TABLE IF NOT EXISTS containers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,                    -- "The Matrix Trilogy"
    spine_label TEXT,                      -- "THE MATRIX TRILOGY" (for shelf spine)
    spine_image_type TEXT DEFAULT 'color', -- 'custom', 'first_movie', 'color'
    spine_image_url TEXT,                  -- Custom uploaded spine image
    spine_color TEXT DEFAULT '#667eea',    -- Color for plain spine
    format TEXT,                           -- "Blu-ray Box Set", "DVD Double Feature"
    edition TEXT,                          -- "Ultimate Collection", "Special Edition"
    region TEXT,                           -- Region A, Region 1, etc.
    condition TEXT CHECK(condition IN ('Mint', 'Like New', 'Good', 'Fair', 'Poor')),
    purchase_date TEXT,
    purchase_price REAL,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table: container_contents (Movies within containers)
CREATE TABLE IF NOT EXISTS container_contents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    container_id INTEGER NOT NULL,
    copy_id INTEGER NOT NULL,              -- Links to existing copies table
    disc_number INTEGER DEFAULT 1,         -- Disc 1, 2, 3, etc. within container
    disc_label TEXT,                       -- "Disc 1: The Matrix", "Side A"
    is_present BOOLEAN DEFAULT 1,          -- 1 = have it, 0 = missing disc
    missing_since TEXT,                    -- Date when marked as missing
    missing_notes TEXT,                    -- "Lost", "Lent to friend", "Damaged"
    position_in_container INTEGER DEFAULT 0, -- Order within the box set
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE,
    FOREIGN KEY (copy_id) REFERENCES copies(id) ON DELETE CASCADE,
    UNIQUE(container_id, copy_id)          -- Each copy can only be in container once
);

-- Update shelf_assignments to support containers
-- Add container_id column (either copy_id OR container_id is set, not both)
ALTER TABLE shelf_assignments ADD COLUMN container_id INTEGER
    REFERENCES containers(id) ON DELETE CASCADE;

-- Add is_container flag to shelf_assignments for easier querying
ALTER TABLE shelf_assignments ADD COLUMN is_container BOOLEAN DEFAULT 0;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_containers_user ON containers(user_id);
CREATE INDEX IF NOT EXISTS idx_container_contents_container ON container_contents(container_id);
CREATE INDEX IF NOT EXISTS idx_container_contents_copy ON container_contents(copy_id);
CREATE INDEX IF NOT EXISTS idx_container_contents_missing ON container_contents(is_present);
CREATE INDEX IF NOT EXISTS idx_shelf_assignments_container ON shelf_assignments(container_id);

-- Create view for easy container queries with movie counts
CREATE VIEW IF NOT EXISTS containers_with_counts AS
SELECT
    c.*,
    COUNT(cc.id) as total_movies,
    SUM(CASE WHEN cc.is_present = 1 THEN 1 ELSE 0 END) as present_movies,
    SUM(CASE WHEN cc.is_present = 0 THEN 1 ELSE 0 END) as missing_movies
FROM containers c
LEFT JOIN container_contents cc ON c.id = cc.container_id
GROUP BY c.id;

-- ============================================
-- Example Data (for reference)
-- ============================================
-- INSERT INTO containers (user_id, name, spine_label, format, edition, condition) VALUES
-- (1, 'The Matrix Trilogy', 'THE MATRIX TRILOGY', 'Blu-ray Box Set', 'Ultimate Collection', 'Mint');
--
-- INSERT INTO container_contents (container_id, copy_id, disc_number, disc_label, is_present) VALUES
-- (1, 42, 1, 'Disc 1: The Matrix', 1),
-- (1, 43, 2, 'Disc 2: The Matrix Reloaded', 1),
-- (1, 44, 3, 'Disc 3: The Matrix Revolutions', 0);  -- Missing!
