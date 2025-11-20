<?php
/**
 * CineShelf Database Migration Runner - SAFE VERSION
 * Run this ONCE to add OAuth support
 * Checks for existing columns before adding
 */

require_once __DIR__ . '/../config/config.php';

echo "CineShelf OAuth Migration (Safe Mode)\n";
echo "======================================\n\n";

try {
    $db = getDb();

    // Check existing columns in users table
    echo "📋 Checking existing schema...\n";

    $existingColumns = [];
    $stmt = $db->query("PRAGMA table_info(users)");
    while ($row = $stmt->fetch()) {
        $existingColumns[] = $row['name'];
    }

    echo "Existing user columns: " . implode(', ', $existingColumns) . "\n\n";

    // Add columns only if they don't exist
    $columnsToAdd = [
        'oauth_provider' => 'TEXT',
        'oauth_provider_id' => 'TEXT',
        'profile_picture' => 'TEXT',
        'updated_at' => 'DATETIME'
    ];

    foreach ($columnsToAdd as $column => $type) {
        if (!in_array($column, $existingColumns)) {
            echo "➕ Adding column: $column\n";
            $db->exec("ALTER TABLE users ADD COLUMN $column $type");
        } else {
            echo "✓ Column already exists: $column\n";
        }
    }

    // Update timestamps for existing users
    echo "\n🔧 Setting timestamps for existing users...\n";
    $db->exec("UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL");

    // Create indexes if they don't exist
    echo "\n📇 Creating indexes...\n";
    $db->exec("CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider_id)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
    echo "✓ Indexes created\n";

    // Check if sessions table exists
    $tables = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")->fetchAll();

    if (count($tables) > 0) {
        echo "\n⚠️  Sessions table already exists. Skipping creation.\n";
    } else {
        echo "\n📦 Creating sessions table...\n";
        $db->exec("
            CREATE TABLE sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT UNIQUE NOT NULL,
                oauth_access_token TEXT,
                oauth_refresh_token TEXT,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ");

        echo "✓ Sessions table created\n";

        echo "\n📇 Creating session indexes...\n";
        $db->exec("CREATE INDEX idx_sessions_token ON sessions(token)");
        $db->exec("CREATE INDEX idx_sessions_user ON sessions(user_id)");
        $db->exec("CREATE INDEX idx_sessions_expires ON sessions(expires_at)");
        echo "✓ Session indexes created\n";
    }

    echo "\n✅ Migration completed successfully!\n\n";
    echo "Next steps:\n";
    echo "1. Set up Google OAuth credentials in config/oauth-config.php\n";
    echo "2. Test login at: https://cineshelf.futuresrelic.com/login.html\n";

} catch (Exception $e) {
    echo "❌ Migration failed: " . $e->getMessage() . "\n";
    error_log('Migration error: ' . $e->getMessage());
    exit(1);
}
