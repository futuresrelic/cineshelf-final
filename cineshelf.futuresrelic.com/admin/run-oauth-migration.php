<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OAuth Migration - CineShelf</title>
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
        h1 {
            color: #333;
            margin-top: 0;
        }
        .status {
            padding: 15px;
            border-radius: 5px;
            margin: 15px 0;
        }
        .success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        .warning {
            background: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }
        .step {
            margin: 10px 0;
            padding: 10px;
            background: #f8f9fa;
            border-left: 3px solid #007bff;
        }
        pre {
            background: #f8f9fa;
            padding: 10px;
            border-radius: 5px;
            overflow-x: auto;
        }
        .btn {
            display: inline-block;
            padding: 10px 20px;
            background: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 20px;
        }
        .btn:hover {
            background: #0056b3;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 OAuth Migration</h1>
        <p>This tool adds OAuth (Google login) support to your CineShelf database.</p>

        <?php
        require_once __DIR__ . '/../config/config.php';

        try {
            // Connect to database
            echo '<div class="step">✓ Connecting to database...</div>';
            $db = getDb();
            echo '<div class="success">✓ Connected to database: ' . DB_PATH . '</div>';

            // Check if migration already run
            echo '<div class="step">✓ Checking if migration needed...</div>';
            try {
                $stmt = $db->query("SELECT oauth_provider_id FROM users LIMIT 1");
                echo '<div class="warning">';
                echo '<strong>⊙ OAuth columns already exist!</strong><br>';
                echo 'Migration has already been run. Your database is up to date.';
                echo '</div>';

                // Show current state
                $stmt = $db->query("SELECT COUNT(*) as count FROM users");
                $result = $stmt->fetch();
                echo '<div class="info">';
                echo 'Users table: ' . $result['count'] . ' users<br>';

                $stmt = $db->query("SELECT COUNT(*) as count FROM sessions");
                $result = $stmt->fetch();
                echo 'Sessions table: ' . $result['count'] . ' sessions';
                echo '</div>';

                echo '<a href="/" class="btn">← Back to CineShelf</a>';
                exit;
            } catch (PDOException $e) {
                echo '<div class="info">✓ Migration needed (OAuth columns missing)</div>';
            }

            // Read migration file
            echo '<div class="step">✓ Reading migration SQL...</div>';
            $migrationFile = __DIR__ . '/../api/migrate-oauth.sql';

            if (!file_exists($migrationFile)) {
                throw new Exception("Migration file not found: $migrationFile");
            }

            $sql = file_get_contents($migrationFile);
            echo '<div class="success">✓ Migration file loaded</div>';

            // Run migration
            echo '<div class="step">✓ Running migration...</div>';
            echo '<pre>';

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
                    // Show what we're doing (first 80 chars)
                    $preview = substr($statement, 0, 80);
                    $preview = str_replace("\n", " ", $preview);
                    echo "✓ " . htmlspecialchars($preview) . "...\n";
                } catch (PDOException $e) {
                    // If column already exists, that's OK
                    if (strpos($e->getMessage(), 'duplicate column name') !== false) {
                        echo "⊙ Column already exists (skipping)\n";
                        continue;
                    }
                    throw $e;
                }
            }

            $db->commit();

            echo '</pre>';

            echo '<div class="success">';
            echo '<strong>🎉 Migration Complete!</strong><br>';
            echo 'OAuth support added successfully!<br>';
            echo 'You can now use Google login.';
            echo '</div>';

            // Verify migration
            echo '<div class="info">';
            echo '<strong>Verification:</strong><br>';

            $stmt = $db->query("SELECT COUNT(*) as count FROM users");
            $result = $stmt->fetch();
            echo '✓ Users table OK (' . $result['count'] . ' users)<br>';

            $stmt = $db->query("SELECT COUNT(*) as count FROM sessions");
            $result = $stmt->fetch();
            echo '✓ Sessions table OK (' . $result['count'] . ' sessions)';
            echo '</div>';

            echo '<a href="/" class="btn">← Back to CineShelf</a>';

        } catch (Exception $e) {
            if (isset($db) && $db->inTransaction()) {
                $db->rollBack();
            }

            echo '<div class="error">';
            echo '<strong>❌ Migration failed!</strong><br>';
            echo 'Error: ' . htmlspecialchars($e->getMessage());
            echo '</div>';

            echo '<div class="info">';
            echo '<strong>Troubleshooting:</strong><br>';
            echo '1. Make sure the database file is writable<br>';
            echo '2. Check that SQLite PDO driver is installed<br>';
            echo '3. Verify the database path is correct<br>';
            echo '4. Contact support if problem persists';
            echo '</div>';
        }
        ?>
    </div>
</body>
</html>
