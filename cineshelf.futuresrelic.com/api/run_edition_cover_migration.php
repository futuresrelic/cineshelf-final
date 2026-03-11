<?php
/**
 * Migration: Add cover_image_url to media_editions
 * Stores the physical cover art URL from UMDB (e.g. steelbook art, slipbox art).
 * Run this once on existing databases.
 */

require_once __DIR__ . '/../config/config.php';

try {
    $db = getDb();

    echo "Starting migration: Add cover_image_url to media_editions...\n";

    $columns = $db->query("PRAGMA table_info(media_editions)")->fetchAll(PDO::FETCH_ASSOC);
    $columnNames = array_column($columns, 'name');

    if (!in_array('cover_image_url', $columnNames)) {
        echo "Adding column: cover_image_url\n";
        $db->exec("ALTER TABLE media_editions ADD COLUMN cover_image_url TEXT");
        echo "\n✓ Migration complete! cover_image_url added to media_editions.\n";
    } else {
        echo "\n✓ No migration needed - cover_image_url already exists.\n";
    }

} catch (Exception $e) {
    echo "✗ Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
