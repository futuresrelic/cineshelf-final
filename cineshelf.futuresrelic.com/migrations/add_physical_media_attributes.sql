-- ============================================
-- CineShelf Physical Media Attributes Enhancement
-- Migration: Add detailed physical media tracking fields
-- Version: 3.0.0
-- Date: 2026-02-14
-- ============================================

-- Add aspect ratio tracking to copies (Full Screen vs Widescreen)
ALTER TABLE copies ADD COLUMN aspect_ratio TEXT DEFAULT NULL;
-- Values: 'Widescreen', 'Full Screen', 'Letterbox', 'Pan & Scan', 'IMAX', NULL

-- Add package type to copies (the packaging style)
ALTER TABLE copies ADD COLUMN package_type TEXT DEFAULT NULL;
-- Values: 'Standard', 'Steelbook', 'Digibook', 'Digipack', 'Slipcase', 'Mediabook', 'Amaray', 'Snap Case', 'Eco Case', 'Keep Case', NULL

-- Add feature count to copies (single, double feature, etc.)
ALTER TABLE copies ADD COLUMN feature_count TEXT DEFAULT 'Single';
-- Values: 'Single', 'Single + Bonus', 'Double Feature', 'Triple Feature', 'Quadruple Feature', 'Collection', 'Complete Series', 'Full Saga'

-- Add packaging extras as individual flags
ALTER TABLE copies ADD COLUMN has_slipcover INTEGER DEFAULT 0;
ALTER TABLE copies ADD COLUMN has_booklet INTEGER DEFAULT 0;
ALTER TABLE copies ADD COLUMN has_bonus_disc INTEGER DEFAULT 0;
ALTER TABLE copies ADD COLUMN bonus_disc_count INTEGER DEFAULT 0;
ALTER TABLE copies ADD COLUMN has_digital_copy INTEGER DEFAULT 0;
ALTER TABLE copies ADD COLUMN has_3d INTEGER DEFAULT 0;

-- Same fields for containers (box sets have packaging too)
ALTER TABLE containers ADD COLUMN aspect_ratio TEXT DEFAULT NULL;
ALTER TABLE containers ADD COLUMN package_type TEXT DEFAULT NULL;
ALTER TABLE containers ADD COLUMN feature_count TEXT DEFAULT NULL;
ALTER TABLE containers ADD COLUMN has_slipcover INTEGER DEFAULT 0;
ALTER TABLE containers ADD COLUMN has_booklet INTEGER DEFAULT 0;
ALTER TABLE containers ADD COLUMN has_bonus_disc INTEGER DEFAULT 0;
ALTER TABLE containers ADD COLUMN bonus_disc_count INTEGER DEFAULT 0;
ALTER TABLE containers ADD COLUMN has_digital_copy INTEGER DEFAULT 0;
ALTER TABLE containers ADD COLUMN has_3d INTEGER DEFAULT 0;

-- Add spine_type to containers for 'average_color' option
ALTER TABLE containers ADD COLUMN spine_type TEXT DEFAULT 'color';
-- Values: 'color', 'first_movie', 'custom', 'average_color'

-- Recreate the view to include new fields
DROP VIEW IF EXISTS containers_with_counts;
CREATE VIEW IF NOT EXISTS containers_with_counts AS
SELECT
    c.*,
    COUNT(cc.id) as total_movies,
    SUM(CASE WHEN cc.is_present = 1 THEN 1 ELSE 0 END) as present_movies,
    SUM(CASE WHEN cc.is_present = 0 THEN 1 ELSE 0 END) as missing_movies
FROM containers c
LEFT JOIN container_contents cc ON c.id = cc.container_id
GROUP BY c.id;
