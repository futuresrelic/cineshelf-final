<?php
/**
 * Allow NULL invited_email in group_invites table
 * This enables group-wide invite links (not tied to specific email)
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/../../config/config.php';

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html>
<head>
    <title>Fix Group Invites - Allow NULL Email</title>
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
    <h1>🔧 Fix Group Invites Schema</h1>
    <p>This migration allows NULL values in invited_email to support group-wide invite links.</p>

<?php

try {
    $db = getDb();

    echo "<h2>Starting Migration...</h2>";

    // SQLite doesn't support ALTER COLUMN directly, so we need to recreate the table
    echo "<p class='info'>Backing up existing group_invites...</p>";

    // Create new table with nullable invited_email
    $db->exec("
        CREATE TABLE IF NOT EXISTS group_invites_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            invited_email TEXT,
            invite_token TEXT UNIQUE NOT NULL,
            invited_by INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            accepted_at DATETIME,
            accepted_by INTEGER,
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (accepted_by) REFERENCES users(id) ON DELETE SET NULL
        )
    ");
    echo "<p class='success'>✓ Created new table structure</p>";

    // Copy existing data
    $db->exec("
        INSERT INTO group_invites_new
        SELECT * FROM group_invites
    ");

    $copied = $db->query("SELECT COUNT(*) FROM group_invites_new")->fetchColumn();
    echo "<p class='success'>✓ Copied $copied existing invites</p>";

    // Drop old table
    $db->exec("DROP TABLE group_invites");
    echo "<p class='success'>✓ Dropped old table</p>";

    // Rename new table
    $db->exec("ALTER TABLE group_invites_new RENAME TO group_invites");
    echo "<p class='success'>✓ Renamed new table</p>";

    // Show sample invites
    echo "<h2>Sample Invites:</h2>";
    echo "<pre>";
    $stmt = $db->query("
        SELECT
            id,
            group_id,
            invited_email,
            SUBSTR(invite_token, 1, 16) || '...' as token_preview,
            expires_at,
            accepted_at
        FROM group_invites
        ORDER BY created_at DESC
        LIMIT 10
    ");

    echo sprintf("%-4s %-8s %-35s %-20s %-20s %-10s\n",
        "ID", "Group", "Email", "Token", "Expires", "Accepted");
    echo str_repeat("-", 110) . "\n";

    while ($row = $stmt->fetch()) {
        echo sprintf("%-4s %-8s %-35s %-20s %-20s %-10s\n",
            $row['id'],
            $row['group_id'],
            $row['invited_email'] ?: '(group-wide)',
            $row['token_preview'],
            $row['expires_at'],
            $row['accepted_at'] ? 'Yes' : 'No'
        );
    }
    echo "</pre>";

    echo "<h2 class='success'>✅ Migration Complete!</h2>";
    echo "<p>Group invites can now be created without specific email addresses.</p>";
    echo "<p class='info'>You can now create group-wide invite links that anyone can use!</p>";

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