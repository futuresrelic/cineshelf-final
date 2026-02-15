-- ============================================
-- CineShelf Physical Media Editions System
-- Migration: UMDB edition definitions + user component tracking
-- Version: 4.0.0
-- Date: 2026-02-15
-- ============================================
-- UMDB stores universal edition data (what components an edition SHOULD have).
-- CineShelf stores user-specific data (which components they ACTUALLY have and condition).

-- ============================================
-- UMDB: MEDIA EDITIONS
-- Specific physical releases of a movie
-- Shared across all users (universal reference data)
-- ============================================

CREATE TABLE IF NOT EXISTS media_editions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_id INTEGER NOT NULL,
    name TEXT NOT NULL,                         -- "4K UHD Steelbook (2023)" or "Criterion Collection #123"
    format TEXT,                                -- DVD, Blu-ray, 4K UHD, etc.
    package_type TEXT,                          -- Steelbook, Keep Case, Digibook, etc.
    region TEXT,                                -- Region A, Region 1, etc.
    barcode TEXT,                               -- UPC/EAN barcode
    release_date TEXT,                          -- YYYY-MM-DD
    distributor TEXT,                           -- Studio/label (e.g., Arrow Video, Criterion, Shout Factory)
    country TEXT,                               -- Country of release
    disc_count INTEGER DEFAULT 1,
    notes TEXT,
    created_by INTEGER,                        -- User who added this edition
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_media_editions_movie ON media_editions(movie_id);
CREATE INDEX IF NOT EXISTS idx_media_editions_barcode ON media_editions(barcode);
CREATE INDEX IF NOT EXISTS idx_media_editions_format ON media_editions(format);

-- ============================================
-- UMDB: EDITION COMPONENTS
-- What comes in the box (universal truth)
-- e.g., "This edition includes a booklet, 2 discs, a slipcover"
-- ============================================

CREATE TABLE IF NOT EXISTS edition_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    edition_id INTEGER NOT NULL,
    component_type TEXT NOT NULL,               -- 'disc', 'booklet', 'insert', 'slipcover', 'poster', 'digital_code', 'case', 'outer_case', 'art_cards', 'stickers', 'other'
    component_name TEXT NOT NULL,               -- "Feature Film Disc", "48-page Art Booklet", "Cardboard Slipcover"
    description TEXT,                           -- Optional extra detail
    position INTEGER DEFAULT 0,                 -- Display order within the edition
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (edition_id) REFERENCES media_editions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_edition_components_edition ON edition_components(edition_id);

-- ============================================
-- CINESHELF: COPY COMPONENTS (User-Specific)
-- Tracks what the user actually HAS and its condition
-- "I have the booklet (Good), missing the slipcover, disc is Mint"
-- ============================================

CREATE TABLE IF NOT EXISTS copy_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    copy_id INTEGER NOT NULL,
    edition_component_id INTEGER NOT NULL,
    is_present INTEGER DEFAULT 1,              -- 1 = have it, 0 = missing
    condition TEXT DEFAULT 'Good',             -- Mint, Like New, Good, Fair, Poor
    notes TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (copy_id) REFERENCES copies(id) ON DELETE CASCADE,
    FOREIGN KEY (edition_component_id) REFERENCES edition_components(id) ON DELETE CASCADE,
    UNIQUE(copy_id, edition_component_id)
);

CREATE INDEX IF NOT EXISTS idx_copy_components_copy ON copy_components(copy_id);
CREATE INDEX IF NOT EXISTS idx_copy_components_edition_component ON copy_components(edition_component_id);

-- ============================================
-- Link copies to specific editions (optional)
-- ============================================

ALTER TABLE copies ADD COLUMN edition_id INTEGER REFERENCES media_editions(id) ON DELETE SET NULL;
