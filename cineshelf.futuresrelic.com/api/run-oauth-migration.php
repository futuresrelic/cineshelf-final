#!/usr/bin/env php
<?php
/**
 * CineShelf OAuth Migration Runner
 * Adds OAuth support to existing database
 *
 * Usage: php run-oauth-migration.php
 */

// Change to script directory
chdir(__DIR__);

// Load config
require_once __DIR__ . '/../config/config.php';

echo "=== CineShelf OAuth Migration ===\n";
echo "This will add OAuth support to your database.\n\n";

try {
    // Connect to database
    echo "[1/4] Connecting to database...\n";
    $db = getDb();
    echo "      ✓ Connected to: " . DB_PATH . "\n\n";

    // Check if migration already run
    echo "[2/4] Checking if migration needed...\n";
    try {
        $stmt = $db->query("SELECT oauth_provider_id FROM users LIMIT 1");
        echo "      ✓ OAuth columns already exist! Migration not needed.\n";
        echo "\n=== Migration Complete ===\n";
        echo "Your database is already up to date.\n";
        exit(0);
    } catch (PDOException $e) {
        echo "      ✓ Migration needed (OAuth columns missing)\n\n";
    }

    // Read migration file
    echo "[3/4] Reading migration SQL...\n";
    $migrationFile = __DIR__ . '/migrate-oauth.sql';

    if (!file_exists($migrationFile)) {
        throw new Exception("Migration file not found: $migrationFile");
    }

    $sql = file_get_contents($migrationFile);
    echo "      ✓ Migration file loaded\n\n";

    // Run migration
    echo "[4/4] Running migration...\n";

    // Split by semicolon and run each statement
    $statements = array_filter(array_map('trim', explode(';', $sql)));

    $db->beginTransaction();

    foreach ($statements as $statement) {
        // Skip empty statements and comments
        if (empty($statement) || strpos($statement, '--') === 0) {
            continue;
        }

        try {
            $db->exec($statement);
            // Show what we're doing (first 60 chars)
            $preview = substr($statement, 0, 60);
            $preview = str_replace("\n", " ", $preview);
            echo "      ✓ " . $preview . "...\n";
        } catch (PDOException $e) {
            // If column already exists, that's OK
            if (strpos($e->getMessage(), 'duplicate column name') !== false) {
                echo "      ⊙ Column already exists (skipping)\n";
                continue;
            }
            throw $e;
        }
    }

    $db->commit();

    echo "\n=== Migration Complete ===\n";
    echo "✓ OAuth support added successfully!\n";
    echo "✓ You can now use Google login.\n\n";

    // Verify migration
    echo "Verifying migration...\n";
    $stmt = $db->query("SELECT COUNT(*) as count FROM users");
    $result = $stmt->fetch();
    echo "✓ Users table OK ({$result['count']} users)\n";

    $stmt = $db->query("SELECT COUNT(*) as count FROM sessions");
    $result = $stmt->fetch();
    echo "✓ Sessions table OK ({$result['count']} sessions)\n";

    echo "\n🎉 All done! Try logging in with Google now.\n";

} catch (Exception $e) {
    if (isset($db) && $db->inTransaction()) {
        $db->rollBack();
    }

    echo "\n❌ Migration failed!\n";
    echo "Error: " . $e->getMessage() . "\n";
    echo "\nPlease report this error.\n";
    exit(1);
}
