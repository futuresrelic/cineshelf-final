<?php
/**
 * CineShelf v3.0 - Groups Feature Migration
 * Adds tables for family/group collections and borrowing system
 * 
 * SAFE TO RUN MULTIPLE TIMES - Uses IF NOT EXISTS
 */

require_once __DIR__ . '/../../config/config.php';

echo "<!DOCTYPE html><html><head><title>CineShelf Migration</title>";
echo "<style>body{font-family:monospace;padding:20px;background:#1a1a1a;color:#fff;}";
echo ".success{color:#4caf50;} .error{color:#f44336;} .info{color:#2196f3;}        .back-btn { display: inline-block; padding: 8px 16px; background: #4a9eff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .back-btn:hover { background: #6bb0ff; }
    </style></head><body>
<a href='../index.html' class='back-btn'>← Back to Admin Panel</a>
";

echo "<h1>🎬 CineShelf v3.0 - Groups Migration</h1>";
echo "<p class='info'>Adding tables for family collections and borrowing system...</p><hr>";

try {
    $db = getDb();
    
    // ============================================
    // 1. GROUPS TABLE
    // ============================================
    echo "<h3>Creating 'groups' table...</h3>";
    $db->exec("
        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            created_by INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
        )
    ");
    echo "<p class='success'>✓ Groups table ready</p>";
    
    // ============================================
    // 2. GROUP MEMBERS TABLE
    // ============================================
    echo "<h3>Creating 'group_members' table...</h3>";
    $db->exec("
        CREATE TABLE IF NOT EXISTS group_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(group_id, user_id)
        )
    ");
    echo "<p class='success'>✓ Group members table ready</p>";
    
    // Create indexes for performance
    $db->exec("CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id)");
    
    // ============================================
    // 3. BORROWS TABLE
    // ============================================
    echo "<h3>Creating 'borrows' table...</h3>";
    $db->exec("
        CREATE TABLE IF NOT EXISTS borrows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            copy_id INTEGER NOT NULL,
            owner_id INTEGER NOT NULL,
            borrower_id INTEGER NOT NULL,
            borrowed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            due_date DATETIME,
            returned_at DATETIME,
            notes TEXT,
            FOREIGN KEY (copy_id) REFERENCES copies(id) ON DELETE CASCADE,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (borrower_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ");
    echo "<p class='success'>✓ Borrows table ready</p>";
    
    // Create indexes
    $db->exec("CREATE INDEX IF NOT EXISTS idx_borrows_copy ON borrows(copy_id)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_borrows_owner ON borrows(owner_id)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_borrows_borrower ON borrows(borrower_id)");
    
    // ============================================
    // 4. VERIFY TABLES
    // ============================================
    echo "<hr><h3>Verifying tables...</h3>";
    
    $tables = ['groups', 'group_members', 'borrows'];
    foreach ($tables as $table) {
        $stmt = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='$table'");
        if ($stmt->fetch()) {
            echo "<p class='success'>✓ Table '$table' exists</p>";
        } else {
            echo "<p class='error'>✗ Table '$table' NOT FOUND</p>";
        }
    }
    
    // ============================================
    // 5. COUNT EXISTING DATA
    // ============================================
    echo "<hr><h3>Current data counts:</h3>";
    
    $userCount = $db->query("SELECT COUNT(*) FROM users")->fetchColumn();
    $movieCount = $db->query("SELECT COUNT(*) FROM movies")->fetchColumn();
    $copyCount = $db->query("SELECT COUNT(*) FROM copies")->fetchColumn();
    $groupCount = $db->query("SELECT COUNT(*) FROM groups")->fetchColumn();
    
    echo "<ul>";
    echo "<li>Users: <strong>$userCount</strong></li>";
    echo "<li>Movies: <strong>$movieCount</strong></li>";
    echo "<li>Physical Copies: <strong>$copyCount</strong></li>";
    echo "<li>Groups: <strong>$groupCount</strong></li>";
    echo "</ul>";
    
    // ============================================
    // SUCCESS
    // ============================================
    echo "<hr><h2 class='success'>✅ MIGRATION COMPLETE</h2>";
    echo "<p>Database is ready for Groups v3.0 features!</p>";
    echo "<p><a href='index.html' style='color:#4caf50;'>← Back to CineShelf</a></p>";
    
} catch (Exception $e) {
    echo "<h2 class='error'>❌ MIGRATION FAILED</h2>";
    echo "<p class='error'>Error: " . htmlspecialchars($e->getMessage()) . "</p>";
    echo "<p>Database changes have been rolled back.</p>";
}

echo "</body></html>";
?>
