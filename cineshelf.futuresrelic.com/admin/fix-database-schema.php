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
        <p>This tool adds missing columns and tables to your existing database (OAuth, Groups, Borrowing, Shelf Layout).</p>

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

            $missingMovieColumns = [];

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

            // Check if movies table has new columns
            try {
                $stmt = $db->query("PRAGMA table_info(movies)");
                $movieColumns = $stmt->fetchAll(PDO::FETCH_COLUMN, 1);

                $requiredMovieColumns = ['actors', 'studio'];
                foreach ($requiredMovieColumns as $col) {
                    if (!in_array($col, $movieColumns)) {
                        $missingMovieColumns[] = $col;
                        $needsFix = true;
                    }
                }
            } catch (PDOException $e) {
                // Movies table doesn't exist - shouldn't happen
            }

            // Check if sessions table exists
            try {
                $stmt = $db->query("SELECT 1 FROM sessions LIMIT 1");
            } catch (PDOException $e) {
                $missingTables[] = 'sessions';
                $needsFix = true;
            }

            // Check if groups table exists
            try {
                $stmt = $db->query("SELECT 1 FROM groups LIMIT 1");
            } catch (PDOException $e) {
                $missingTables[] = 'groups';
                $needsFix = true;
            }

            // Check if group_members table exists
            try {
                $stmt = $db->query("SELECT 1 FROM group_members LIMIT 1");
            } catch (PDOException $e) {
                $missingTables[] = 'group_members';
                $needsFix = true;
            }

            // Check if group_invites table exists
            try {
                $stmt = $db->query("SELECT 1 FROM group_invites LIMIT 1");
            } catch (PDOException $e) {
                $missingTables[] = 'group_invites';
                $needsFix = true;
            }

            // Check if borrows table exists
            try {
                $stmt = $db->query("SELECT 1 FROM borrows LIMIT 1");
            } catch (PDOException $e) {
                $missingTables[] = 'borrows';
                $needsFix = true;
            }

            // Check if shelves table exists
            try {
                $stmt = $db->query("SELECT 1 FROM shelves LIMIT 1");
            } catch (PDOException $e) {
                $missingTables[] = 'shelves';
                $needsFix = true;
            }

            // Check if shelf_assignments table exists
            try {
                $stmt = $db->query("SELECT 1 FROM shelf_assignments LIMIT 1");
            } catch (PDOException $e) {
                $missingTables[] = 'shelf_assignments';
                $needsFix = true;
            }

            if (!$needsFix) {
                echo '<div class="success">';
                echo '<strong>✅ Database is OK!</strong><br>';
                echo 'All required columns and tables exist (OAuth, Groups, Borrowing, Shelf Layout).<br>';
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
            if (!empty($missingMovieColumns)) {
                echo 'Missing columns in movies table: ' . implode(', ', $missingMovieColumns) . '<br>';
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

            // Create groups table if missing
            if (in_array('groups', $missingTables)) {
                $db->exec("
                    CREATE TABLE groups (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        description TEXT,
                        created_by INTEGER NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
                    )
                ");
                echo "✓ Created groups table\n";
            }

            // Create group_members table if missing
            if (in_array('group_members', $missingTables)) {
                $db->exec("
                    CREATE TABLE group_members (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        group_id INTEGER NOT NULL,
                        user_id INTEGER NOT NULL,
                        role TEXT NOT NULL DEFAULT 'member',
                        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        UNIQUE(group_id, user_id)
                    )
                ");
                $db->exec("CREATE INDEX idx_group_members_group ON group_members(group_id)");
                $db->exec("CREATE INDEX idx_group_members_user ON group_members(user_id)");
                echo "✓ Created group_members table\n";
            }

            // Create group_invites table if missing
            if (in_array('group_invites', $missingTables)) {
                $db->exec("
                    CREATE TABLE group_invites (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        group_id INTEGER NOT NULL,
                        invited_email TEXT,
                        invite_token TEXT UNIQUE NOT NULL,
                        invited_by INTEGER NOT NULL,
                        expires_at DATETIME NOT NULL,
                        accepted_at DATETIME,
                        accepted_by INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
                        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (accepted_by) REFERENCES users(id) ON DELETE SET NULL
                    )
                ");
                $db->exec("CREATE INDEX idx_group_invites_token ON group_invites(invite_token)");
                $db->exec("CREATE INDEX idx_group_invites_group ON group_invites(group_id)");
                echo "✓ Created group_invites table\n";
            }

            // Create borrows table if missing
            if (in_array('borrows', $missingTables)) {
                $db->exec("
                    CREATE TABLE borrows (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        copy_id INTEGER NOT NULL,
                        owner_id INTEGER NOT NULL,
                        borrower_id INTEGER NOT NULL,
                        borrowed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        due_date DATE,
                        returned_at DATETIME,
                        notes TEXT,
                        FOREIGN KEY (copy_id) REFERENCES copies(id) ON DELETE CASCADE,
                        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (borrower_id) REFERENCES users(id) ON DELETE CASCADE
                    )
                ");
                $db->exec("CREATE INDEX idx_borrows_copy ON borrows(copy_id)");
                $db->exec("CREATE INDEX idx_borrows_owner ON borrows(owner_id)");
                $db->exec("CREATE INDEX idx_borrows_borrower ON borrows(borrower_id)");
                echo "✓ Created borrows table\n";
            }

            // Add actors column to movies table if missing
            if (in_array('actors', $missingMovieColumns)) {
                $db->exec("ALTER TABLE movies ADD COLUMN actors TEXT");
                echo "✓ Added actors column to movies table\n";
            }

            // Add studio column to movies table if missing
            if (in_array('studio', $missingMovieColumns)) {
                $db->exec("ALTER TABLE movies ADD COLUMN studio TEXT");
                echo "✓ Added studio column to movies table\n";
            }

            // Create shelves table if missing
            if (in_array('shelves', $missingTables)) {
                $db->exec("
                    CREATE TABLE shelves (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        name TEXT NOT NULL,
                        position INTEGER NOT NULL DEFAULT 0,
                        capacity INTEGER,
                        description TEXT,
                        theme TEXT,
                        color TEXT DEFAULT '#667eea',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    )
                ");
                $db->exec("CREATE INDEX idx_shelves_user ON shelves(user_id)");
                $db->exec("CREATE INDEX idx_shelves_position ON shelves(user_id, position)");
                echo "✓ Created shelves table\n";
            }

            // Create shelf_assignments table if missing
            if (in_array('shelf_assignments', $missingTables)) {
                $db->exec("
                    CREATE TABLE shelf_assignments (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        shelf_id INTEGER NOT NULL,
                        copy_id INTEGER NOT NULL,
                        position_in_shelf INTEGER NOT NULL DEFAULT 0,
                        notes TEXT,
                        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE,
                        FOREIGN KEY (copy_id) REFERENCES copies(id) ON DELETE CASCADE,
                        UNIQUE(copy_id)
                    )
                ");
                $db->exec("CREATE INDEX idx_shelf_assignments_shelf ON shelf_assignments(shelf_id)");
                $db->exec("CREATE INDEX idx_shelf_assignments_copy ON shelf_assignments(copy_id)");
                $db->exec("CREATE INDEX idx_shelf_assignments_position ON shelf_assignments(shelf_id, position_in_shelf)");
                echo "✓ Created shelf_assignments table\n";
            }

            $db->commit();

            echo '</pre>';

            echo '<div class="success">';
            echo '<strong>🎉 Database Fixed Successfully!</strong><br>';
            echo 'All missing columns and tables have been added.<br>';
            echo 'OAuth login, Groups, Borrowing, and Shelf Layout features are now ready!';
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
