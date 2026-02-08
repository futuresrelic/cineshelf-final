<?php
/**
 * CineShelf Migration Runner
 * Run this script to apply database migrations
 *
 * Usage: php run_migration.php add_box_sets.sql
 */

// Get database path
$dbPath = __DIR__ . '/../data/cineshelf.db';

if (!file_exists($dbPath)) {
    die("ERROR: Database not found at: $dbPath\n");
}

// Get migration file from command line
$migrationFile = $argv[1] ?? null;

if (!$migrationFile) {
    die("Usage: php run_migration.php <migration_file.sql>\n");
}

$migrationPath = __DIR__ . '/' . $migrationFile;

if (!file_exists($migrationPath)) {
    die("ERROR: Migration file not found: $migrationPath\n");
}

echo "===========================================\n";
echo "CineShelf Migration Runner\n";
echo "===========================================\n";
echo "Database: $dbPath\n";
echo "Migration: $migrationFile\n";
echo "===========================================\n\n";

// Read migration SQL
$sql = file_get_contents($migrationPath);

try {
    // Connect to database
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    echo "✓ Connected to database\n";

    // Begin transaction
    $db->beginTransaction();

    // Split SQL into individual statements
    $statements = array_filter(
        array_map('trim', explode(';', $sql)),
        function($stmt) {
            // Remove empty statements and comments
            return !empty($stmt) &&
                   !str_starts_with($stmt, '--') &&
                   !str_starts_with($stmt, '/*');
        }
    );

    echo "✓ Found " . count($statements) . " SQL statements\n\n";

    // Execute each statement
    $successCount = 0;
    foreach ($statements as $index => $statement) {
        $statement = trim($statement);
        if (empty($statement)) continue;

        try {
            // Get statement type for logging
            $type = strtoupper(explode(' ', $statement)[0]);
            echo "Executing " . ($index + 1) . ": $type...";

            $db->exec($statement . ';');
            echo " ✓\n";
            $successCount++;
        } catch (PDOException $e) {
            // Check if error is "already exists" - this is OK
            if (str_contains($e->getMessage(), 'already exists') ||
                str_contains($e->getMessage(), 'duplicate column name')) {
                echo " ⚠ (already exists, skipping)\n";
                $successCount++;
            } else {
                throw $e;
            }
        }
    }

    // Commit transaction
    $db->commit();

    echo "\n===========================================\n";
    echo "✓ Migration completed successfully!\n";
    echo "✓ Executed $successCount statements\n";
    echo "===========================================\n";

} catch (PDOException $e) {
    if (isset($db) && $db->inTransaction()) {
        $db->rollBack();
    }
    echo "\n✗ ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
