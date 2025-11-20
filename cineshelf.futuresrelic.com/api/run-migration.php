<?php
/**
 * CineShelf Database Migration Runner
 * Run this ONCE to add OAuth support
 */

require_once __DIR__ . '/../config/config.php';

echo "CineShelf OAuth Migration\n";
echo "=========================\n\n";

try {
    $db = getDb();

    // Check if migration already run
    $tables = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")->fetchAll();

    if (count($tables) > 0) {
        echo "⚠️  Migration already applied. Sessions table exists.\n";
        echo "If you need to re-run, manually drop the sessions table first.\n";
        exit(1);
    }

    echo "📋 Reading migration file...\n";
    $migration = file_get_contents(__DIR__ . '/migrate-oauth.sql');

    if (!$migration) {
        throw new Exception('Failed to read migration file');
    }

    echo "🔧 Applying migration...\n";
    $db->exec($migration);

    echo "✅ Migration completed successfully!\n\n";
    echo "Next steps:\n";
    echo "1. Set up Google OAuth credentials in config/oauth-config.php\n";
    echo "2. Test login at: https://cineshelf.futuresrelic.com/login.html\n";

} catch (Exception $e) {
    echo "❌ Migration failed: " . $e->getMessage() . "\n";
    error_log('Migration error: ' . $e->getMessage());
    exit(1);
}
