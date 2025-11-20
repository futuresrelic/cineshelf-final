<?php
/**
 * CineShelf - Group Invites Migration
 * Adds email-based invite system for groups (OAuth integration)
 *
 * SAFE TO RUN MULTIPLE TIMES - Uses IF NOT EXISTS
 */

require_once __DIR__ . '/../../config/config.php';

echo "<!DOCTYPE html><html><head><title>CineShelf Migration</title>";
echo "<style>body{font-family:monospace;padding:20px;background:#1a1a1a;color:#fff;}";
echo ".success{color:#4caf50;} .error{color:#f44336;} .info{color:#2196f3;}
        .back-btn { display: inline-block; padding: 8px 16px; background: #4a9eff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .back-btn:hover { background: #6bb0ff; }
    </style></head><body>
<a href='../index.html' class='back-btn'>← Back to Admin Panel</a>
";

echo "<h1>🎬 CineShelf - Group Invites Migration</h1>";
echo "<p class='info'>Adding email-based invite system for OAuth users...</p><hr>";

try {
    $db = getDb();

    // ============================================
    // 1. GROUP INVITES TABLE
    // ============================================
    echo "<h3>Creating 'group_invites' table...</h3>";
    $db->exec("
        CREATE TABLE IF NOT EXISTS group_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            invited_email TEXT NOT NULL,
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
    echo "<p class='success'>✓ Group invites table created</p>";

    // Create indexes for performance
    echo "<h3>Creating indexes...</h3>";
    $db->exec("CREATE INDEX IF NOT EXISTS idx_group_invites_token ON group_invites(invite_token)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_group_invites_email ON group_invites(invited_email)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_group_invites_group ON group_invites(group_id)");
    echo "<p class='success'>✓ Indexes created</p>";

    // ============================================
    // 2. VERIFY TABLE
    // ============================================
    echo "<hr><h3>Verifying table...</h3>";

    $stmt = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='group_invites'");
    if ($stmt->fetch()) {
        echo "<p class='success'>✓ Table 'group_invites' exists</p>";

        // Show column structure
        echo "<h4>Table structure:</h4><ul>";
        $stmt = $db->query("PRAGMA table_info(group_invites)");
        while ($col = $stmt->fetch()) {
            echo "<li>{$col['name']} ({$col['type']})</li>";
        }
        echo "</ul>";
    } else {
        echo "<p class='error'>✗ Table 'group_invites' NOT FOUND</p>";
    }

    // ============================================
    // 3. COUNT EXISTING DATA
    // ============================================
    echo "<hr><h3>Current data counts:</h3>";

    $groupCount = $db->query("SELECT COUNT(*) FROM groups")->fetchColumn();
    $memberCount = $db->query("SELECT COUNT(*) FROM group_members")->fetchColumn();
    $inviteCount = $db->query("SELECT COUNT(*) FROM group_invites")->fetchColumn();

    echo "<ul>";
    echo "<li>Groups: <strong>$groupCount</strong></li>";
    echo "<li>Group Members: <strong>$memberCount</strong></li>";
    echo "<li>Pending Invites: <strong>$inviteCount</strong></li>";
    echo "</ul>";

    // ============================================
    // SUCCESS
    // ============================================
    echo "<hr><h2 class='success'>✅ MIGRATION COMPLETE</h2>";
    echo "<p>Database is ready for email-based group invites!</p>";
    echo "<p><strong>Next steps:</strong></p>";
    echo "<ul>";
    echo "<li>Use the updated Group Manager to send invites</li>";
    echo "<li>Share invite links via email, text, or any messaging app</li>";
    echo "<li>Recipients must login with Google OAuth to accept</li>";
    echo "</ul>";
    echo "<p><a href='../group-manager.html' style='color:#4caf50;'>→ Go to Group Manager</a></p>";

} catch (Exception $e) {
    echo "<h2 class='error'>❌ MIGRATION FAILED</h2>";
    echo "<p class='error'>Error: " . htmlspecialchars($e->getMessage()) . "</p>";
}

echo "</body></html>";
?>
