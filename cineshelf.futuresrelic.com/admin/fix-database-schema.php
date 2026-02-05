<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fix Database Schema - CineShelf</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #333; margin-top: 0; }
        .status {
            padding: 15px;
            border-radius: 5px;
            margin: 15px 0;
        }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        .warning { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
        .step { margin: 10px 0; padding: 10px; background: #f8f9fa; border-left: 3px solid #007bff; }
        pre { background: #f8f9fa; padding: 10px; border-radius: 5px; overflow-x: auto; max-height: 300px; }
        .btn {
            display: inline-block;
            padding: 10px 20px;
            background: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 20px;
            border: none;
            cursor: pointer;
        }
        .btn:hover { background: #0056b3; }
        .btn-danger { background: #dc3545; }
        .btn-danger:hover { background: #c82333; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔧 Fix Database Schema</h1>
        <p>This tool adds missing OAuth columns to your existing database.</p>

        <?php
        require_once __DIR__ . '/../config/config.php';

        try {
            $db = getDb();

            echo '<div class="step">✓ Connected to database</div>';
            echo '<div class="info">Database: ' . DB_PATH . '</div>';

            // Check what's missing
            echo '<div class="step">✓ Checking database schema...</div>';

            $needsFix = false;
            $missingColumns = [];
            $missingTables = [];

            // Check if users table has OAuth columns
            try {
                $stmt = $db->query("PRAGMA table_info(users)");
                $columns = $stmt->fetchAll(PDO::FETCH_COLUMN, 1); // Get column names

                $requiredColumns = ['oauth_provider', 'oauth_provider_id', 'profile_picture', 'display_name', 'updated_at'];
                foreach ($requiredColumns as $col) {
                    if (!in_array($col, $columns)) {
                        $missingColumns[] = $col;
                        $needsFix = true;
                    }
                }
            } catch (PDOException $e) {
                $missingTables[] = 'users';
                $needsFix = true;
            }

            // Check if sessions table exists
            try {
                $stmt = $db->query("SELECT 1 FROM sessions LIMIT 1");
            } catch (PDOException $e) {
                $missingTables[] = 'sessions';
                $needsFix = true;
            }

            if (!$needsFix) {
                echo '<div class="success">';
                echo '<strong>✅ Database is OK!</strong><br>';
                echo 'All required OAuth columns and tables exist.<br>';
                echo 'Your database is ready to use.';
                echo '</div>';
                echo '<a href="/" class="btn">← Back to CineShelf</a>';
                exit;
            }

            // Show what needs fixing
            echo '<div class="warning">';
            echo '<strong>⚠️ Database needs fixing!</strong><br>';
            if (!empty($missingColumns)) {
                echo 'Missing columns in users table: ' . implode(', ', $missingColumns) . '<br>';
            }
            if (!empty($missingTables)) {
                echo 'Missing tables: ' . implode(', ', $missingTables) . '<br>';
            }
            echo '</div>';

            // Apply fixes
            echo '<div class="step">✓ Applying fixes...</div>';
            echo '<pre>';

            $db->beginTransaction();

            // Add missing columns to users table
            if (in_array('oauth_provider', $missingColumns)) {
                $db->exec("ALTER TABLE users ADD COLUMN oauth_provider TEXT DEFAULT 'legacy'");
                echo "✓ Added oauth_provider column\n";
            }
            if (in_array('oauth_provider_id', $missingColumns)) {
                $db->exec("ALTER TABLE users ADD COLUMN oauth_provider_id TEXT");
                echo "✓ Added oauth_provider_id column\n";
            }
            if (in_array('profile_picture', $missingColumns)) {
                $db->exec("ALTER TABLE users ADD COLUMN profile_picture TEXT");
                echo "✓ Added profile_picture column\n";
            }
            if (in_array('display_name', $missingColumns)) {
                $db->exec("ALTER TABLE users ADD COLUMN display_name TEXT");
                echo "✓ Added display_name column\n";
            }
            if (in_array('updated_at', $missingColumns)) {
                // SQLite doesn't allow CURRENT_TIMESTAMP as default in ALTER TABLE
                // Add column without default, then update existing rows
                $db->exec("ALTER TABLE users ADD COLUMN updated_at DATETIME");
                echo "✓ Added updated_at column\n";

                // Set current timestamp for existing users
                $db->exec("UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL");
                echo "✓ Set timestamps for existing users\n";
            }

            // Create indexes on new columns
            try {
                $db->exec("CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider_id)");
                echo "✓ Created index on oauth_provider_id\n";
            } catch (PDOException $e) {
                echo "⊙ Index already exists\n";
            }

            try {
                $db->exec("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
                echo "✓ Created index on email\n";
            } catch (PDOException $e) {
                echo "⊙ Index already exists\n";
            }

            // Create sessions table if missing
            if (in_array('sessions', $missingTables)) {
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
                echo "✓ Created sessions table\n";

                $db->exec("CREATE INDEX idx_sessions_token ON sessions(token)");
                $db->exec("CREATE INDEX idx_sessions_user ON sessions(user_id)");
                $db->exec("CREATE INDEX idx_sessions_expires ON sessions(expires_at)");
                echo "✓ Created sessions table indexes\n";
            }

            $db->commit();

            echo '</pre>';

            echo '<div class="success">';
            echo '<strong>🎉 Database Fixed Successfully!</strong><br>';
            echo 'All missing OAuth columns and tables have been added.<br>';
            echo 'You can now log in with Google!';
            echo '</div>';

            // Verify
            echo '<div class="info">';
            echo '<strong>Verification:</strong><br>';
            $stmt = $db->query("PRAGMA table_info(users)");
            $columns = $stmt->fetchAll(PDO::FETCH_COLUMN, 1);
            echo '✓ Users table now has ' . count($columns) . ' columns<br>';

            $stmt = $db->query("SELECT COUNT(*) FROM users");
            $userCount = $stmt->fetchColumn();
            echo '✓ Users: ' . $userCount . '<br>';

            try {
                $stmt = $db->query("SELECT COUNT(*) FROM sessions");
                $sessionCount = $stmt->fetchColumn();
                echo '✓ Sessions: ' . $sessionCount;
            } catch (PDOException $e) {
                echo '⚠️ Sessions table check failed';
            }
            echo '</div>';

            echo '<a href="/" class="btn">← Go to CineShelf and Login!</a>';

        } catch (Exception $e) {
            if (isset($db) && $db->inTransaction()) {
                $db->rollBack();
            }

            echo '<div class="error">';
            echo '<strong>❌ Fix failed!</strong><br>';
            echo 'Error: ' . htmlspecialchars($e->getMessage()) . '<br><br>';
            echo '<strong>Stack trace:</strong><br>';
            echo '<pre>' . htmlspecialchars($e->getTraceAsString()) . '</pre>';
            echo '</div>';

            echo '<div class="info">';
            echo '<strong>What to try:</strong><br>';
            echo '1. Check Railway logs for detailed errors<br>';
            echo '2. Verify database file is writable<br>';
            echo '3. Contact support with the error above';
            echo '</div>';
        }
        ?>
    </div>
</body>
</html>
