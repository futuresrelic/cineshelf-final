<?php
/**
 * CineShelf - Trivia Migration Runner
 * Access this file via browser to create trivia tables
 * Example: https://yourdomain.com/api/run_trivia_migration.php
 */

header('Content-Type: text/html; charset=utf-8');

// Security: Only allow from localhost or trusted IPs (optional)
// Uncomment and customize if needed:
// $allowed_ips = ['127.0.0.1', '::1'];
// if (!in_array($_SERVER['REMOTE_ADDR'], $allowed_ips)) {
//     die('Access denied');
// }

require_once __DIR__ . '/../config/config.php';

echo "<!DOCTYPE html>
<html>
<head>
    <title>CineShelf Trivia Migration</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        .success { color: green; background: #e8f5e9; padding: 10px; border-radius: 4px; margin: 10px 0; }
        .error { color: red; background: #ffebee; padding: 10px; border-radius: 4px; margin: 10px 0; }
        .info { color: blue; background: #e3f2fd; padding: 10px; border-radius: 4px; margin: 10px 0; }
        pre { background: #f5f5f5; padding: 10px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>🎬 CineShelf Trivia Migration</h1>
";

try {
    $db = getDb();

    echo "<div class='info'>✓ Database connection successful</div>";

    // Check if tables already exist
    $stmt = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='trivia_games'");
    if ($stmt->fetch()) {
        echo "<div class='success'>✓ Trivia tables already exist. No migration needed!</div>";
        echo "<p><a href='/'>← Back to CineShelf</a></p>";
        echo "</body></html>";
        exit(0);
    }

    echo "<div class='info'>Creating trivia tables...</div>";

    // Read migration SQL
    $sqlFile = __DIR__ . '/trivia_migration.sql';
    if (!file_exists($sqlFile)) {
        throw new Exception("Migration file not found: $sqlFile");
    }

    $sql = file_get_contents($sqlFile);

    // Execute the migration
    $db->exec($sql);

    echo "<div class='success'><strong>✓ Migration completed successfully!</strong></div>";

    // Verify tables were created
    $stmt = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'trivia_%' ORDER BY name");
    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (count($tables) === 3) {
        echo "<div class='success'>✓ All 3 trivia tables created:</div>";
        echo "<ul>";
        foreach ($tables as $table) {
            echo "<li>$table</li>";
        }
        echo "</ul>";

        echo "<div class='success'>
            <strong>🎮 Trivia game is now ready!</strong><br>
            <a href='/'>← Go back to CineShelf and start playing!</a>
        </div>";
    } else {
        throw new Exception("Expected 3 tables but got " . count($tables));
    }

} catch (Exception $e) {
    echo "<div class='error'>";
    echo "<strong>❌ Migration failed:</strong><br>";
    echo htmlspecialchars($e->getMessage());
    echo "</div>";

    echo "<div class='info'>";
    echo "<strong>Troubleshooting:</strong><br>";
    echo "1. Make sure the database file is writable<br>";
    echo "2. Check that /api/trivia_migration.sql exists<br>";
    echo "3. Verify database permissions<br>";
    echo "</div>";
}

echo "
</body>
</html>
";
