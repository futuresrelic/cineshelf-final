<?php
// Migration: Add missing movie metadata columns
require_once __DIR__ . '/api/config/config.php';

$db = getDb();

echo "<h2>🔧 Adding Missing Movie Metadata Columns</h2>";

// Check and add columns if missing
$columns = [
    'overview' => 'TEXT',
    'director' => 'TEXT', 
    'runtime' => 'INTEGER',
    'certification' => 'TEXT'
];

foreach ($columns as $column => $type) {
    try {
        $db->exec("ALTER TABLE movies ADD COLUMN $column $type");
        echo "✅ Added column: $column<br>";
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'duplicate column name') !== false) {
            echo "⏭️ Column already exists: $column<br>";
        } else {
            echo "❌ Error adding $column: " . $e->getMessage() . "<br>";
        }
    }
}

echo "<br><h3>✅ Database schema updated!</h3>";
echo "<p>Now we need to populate this data for your existing movies.</p>";
echo "<p><strong>Next step:</strong> Go to your Resolve tab and re-resolve movies to fetch full metadata from TMDB.</p>";
echo "<p>Or we can create a script to auto-fetch metadata for all existing movies...</p>";
?>
