<?php
// Add display_name field to users table
// This allows users to set a custom display name while email remains the unique identifier

error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/../../config/config.php';

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html>
<head>
    <title>Add Display Name Field</title>
    <style>
        body {
            font-family: monospace;
            background: #1a1a1a;
            color: #00ff00;
            padding: 2rem;
            max-width: 800px;
            margin: 0 auto;
        }
        .success { color: #00ff00; }
        .error { color: #ff0000; }
        .info { color: #00aaff; }
        pre { background: #000; padding: 1rem; border-radius: 4px; overflow-x: auto; }
    </style>
</head>
<body>
    <a href='../' style='display: inline-block; padding: 8px 16px; background: #4a9eff; color: white; text-decoration: none; border-radius: 4px; margin-bottom: 1rem;'>← Back to Admin Panel</a>
    <h1>🔧 Add Display Name Field Migration</h1>
    <p>This migration adds a <code>display_name</code> field to the users table.</p>

<?php

try {
    $db = getDb();

    echo "<h2>Starting Migration...</h2>";

    // Check if column already exists
    echo "<p class='info'>Checking if display_name column exists...</p>";
    $result = $db->query("PRAGMA table_info(users)");
    $columns = $result->fetchAll();
    $hasDisplayName = false;

    foreach ($columns as $col) {
        if ($col['name'] === 'display_name') {
            $hasDisplayName = true;
            break;
        }
    }

    if ($hasDisplayName) {
        echo "<p class='success'>✓ display_name column already exists!</p>";
    } else {
        echo "<p class='info'>Adding display_name column...</p>";
        $db->exec("ALTER TABLE users ADD COLUMN display_name TEXT");
        echo "<p class='success'>✓ display_name column added successfully!</p>";
    }

    // Populate display_name for existing users (use username or email)
    echo "<p class='info'>Populating display_name for existing users...</p>";
    $db->exec("
        UPDATE users
        SET display_name = COALESCE(
            NULLIF(username, ''),
            email,
            'User ' || id
        )
        WHERE display_name IS NULL OR display_name = ''
    ");

    $updated = $db->query("SELECT changes()")->fetchColumn();
    echo "<p class='success'>✓ Updated $updated users with display names</p>";

    // Show sample of updated users
    echo "<h2>Sample Users:</h2>";
    echo "<pre>";
    $stmt = $db->query("
        SELECT id, username, email, display_name, oauth_provider
        FROM users
        ORDER BY id DESC
        LIMIT 10
    ");

    echo sprintf("%-4s %-25s %-35s %-25s %-10s\n",
        "ID", "Username", "Email", "Display Name", "Provider");
    echo str_repeat("-", 110) . "\n";

    while ($row = $stmt->fetch()) {
        echo sprintf("%-4s %-25s %-35s %-25s %-10s\n",
            $row['id'],
            $row['username'] ?: 'N/A',
            $row['email'] ?: 'N/A',
            $row['display_name'] ?: 'N/A',
            $row['oauth_provider'] ?: 'legacy'
        );
    }
    echo "</pre>";

    echo "<h2 class='success'>✅ Migration Complete!</h2>";
    echo "<p>Users can now set custom display names in Settings.</p>";
    echo "<p><a href='/admin/migration-tools/' style='color: #00aaff;'>← Back to Migration Tools</a></p>";

} catch (Exception $e) {
    echo "<h2 class='error'>❌ Migration Failed</h2>";
    echo "<pre class='error'>";
    echo htmlspecialchars($e->getMessage());
    echo "\n\n";
    echo htmlspecialchars($e->getTraceAsString());
    echo "</pre>";
}

?>

</body>
</html>