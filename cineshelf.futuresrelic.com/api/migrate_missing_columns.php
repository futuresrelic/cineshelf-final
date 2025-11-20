<?php
/**
 * Migration: Add missing columns to movies table
 * Adds: display_title, certification, media_type
 */

require_once __DIR__ . '/../config/config.php';

try {
    $db = getDb();

    echo "Starting migration: Add missing columns to movies table...\n";

    // Check if columns exist
    $columns = $db->query("PRAGMA table_info(movies)")->fetchAll(PDO::FETCH_ASSOC);
    $columnNames = array_column($columns, 'name');

    $added = 0;

    // Add display_title if it doesn't exist
    if (!in_array('display_title', $columnNames)) {
        echo "Adding column: display_title\n";
        $db->exec("ALTER TABLE movies ADD COLUMN display_title TEXT");
        $added++;
    } else {
        echo "Column display_title already exists\n";
    }

    // Add certification if it doesn't exist
    if (!in_array('certification', $columnNames)) {
        echo "Adding column: certification\n";
        $db->exec("ALTER TABLE movies ADD COLUMN certification TEXT");
        $added++;
    } else {
        echo "Column certification already exists\n";
    }

    // Add media_type if it doesn't exist
    if (!in_array('media_type', $columnNames)) {
        echo "Adding column: media_type\n";
        $db->exec("ALTER TABLE movies ADD COLUMN media_type TEXT DEFAULT 'movie'");
        // Update existing rows to have media_type = 'movie'
        $db->exec("UPDATE movies SET media_type = 'movie' WHERE media_type IS NULL");
        $added++;
    } else {
        echo "Column media_type already exists\n";
    }

    if ($added > 0) {
        echo "\n✓ Migration complete! Added $added column(s).\n";
    } else {
        echo "\n✓ No migration needed - all columns already exist.\n";
    }

} catch (Exception $e) {
    echo "✗ Migration failed: " . $e->getMessage() . "\n";
    echo "Stack trace:\n" . $e->getTraceAsString() . "\n";
    exit(1);
}
