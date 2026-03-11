-- ============================================
-- CineShelf Edition Cover Image
-- Migration: Add cover_image_url to media_editions
-- Version: 4.3.0
-- Date: 2026-03-11
-- ============================================
-- Stores the physical cover art URL from UMDB (e.g. steelbook art, slipbox art).
-- Used to show edition-specific cover images on shelves instead of the generic movie poster.

ALTER TABLE media_editions ADD COLUMN cover_image_url TEXT;
