-- ============================================
-- CineShelf Container Components System
-- Migration: Add container-level component checklist tables
-- Version: 2.9.0
-- Date: 2026-03-14
-- ============================================
-- Stores what components UMDB says come in a box set
-- (auto-generated from UMDB metadata flags or manually added)

CREATE TABLE IF NOT EXISTS container_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    container_id INTEGER NOT NULL,
    component_type TEXT NOT NULL,   -- 'disc', 'booklet', 'slipcover', 'poster', 'art_cards',
                                    --   'digital_code', 'case', 'outer_case', 'insert', 'other'
    component_name TEXT NOT NULL,   -- "Booklet", "Slipcover", "Bonus Disc", etc.
    description TEXT,
    required INTEGER DEFAULT 1,     -- 1 = expected component, 0 = optional
    position INTEGER DEFAULT 0,
    umdb_source INTEGER DEFAULT 0,  -- 1 = imported from UMDB, 0 = manually added
    umdb_component_id INTEGER,      -- ID on the UMDB side (if synced)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_container_components_container ON container_components(container_id);

-- Tracks which container components each user actually has (and their condition)
CREATE TABLE IF NOT EXISTS copy_container_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    container_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    container_component_id INTEGER NOT NULL,
    is_present INTEGER DEFAULT 1,   -- 1 = have it, 0 = missing
    condition TEXT DEFAULT 'Good',  -- Mint / Like New / Good / Fair / Poor
    notes TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (container_component_id) REFERENCES container_components(id) ON DELETE CASCADE,
    UNIQUE(user_id, container_component_id)
);

CREATE INDEX IF NOT EXISTS idx_copy_container_components_container ON copy_container_components(container_id, user_id);
CREATE INDEX IF NOT EXISTS idx_copy_container_components_component ON copy_container_components(container_component_id);
