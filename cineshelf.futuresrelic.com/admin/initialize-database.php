<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Initialize Database - CineShelf</title>
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
            max-height: 300px;
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
        <h1>🎬 Initialize CineShelf Database</h1>
        <p>This creates a fresh database with the complete schema (including OAuth support).</p>

        <?php
        require_once __DIR__ . '/../config/config.php';

        try {
            echo '<div class="step">✓ Checking database location...</div>';
            echo '<div class="info">Database path: ' . DB_PATH . '</div>';

            // Check if database already exists
            if (file_exists(DB_PATH)) {
                echo '<div class="step">✓ Checking existing database...</div>';

                try {
                    $db = new PDO('sqlite:' . DB_PATH);
                    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

                    // Check if users table exists
                    $tables = $db->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);

                    if (in_array('users', $tables) && in_array('sessions', $tables)) {
                        echo '<div class="warning">';
                        echo '<strong>⊙ Database already initialized!</strong><br>';
                        echo 'Found tables: ' . implode(', ', $tables) . '<br><br>';
                        echo 'If you need to reset the database, delete the file and refresh this page.';
                        echo '</div>';

                        // Show user count
                        $userCount = $db->query("SELECT COUNT(*) FROM users")->fetchColumn();
                        echo '<div class="info">Users: ' . $userCount . '</div>';

                        echo '<a href="/" class="btn">← Back to CineShelf</a>';
                        exit;
                    } else {
                        echo '<div class="warning">Database exists but is incomplete. Will initialize missing tables.</div>';
                    }
                } catch (Exception $e) {
                    echo '<div class="warning">Database file exists but may be corrupted. Will reinitialize.</div>';
                }
            } else {
                echo '<div class="info">No existing database found. Creating new database...</div>';
            }

            // Read schema file
            echo '<div class="step">✓ Reading database schema...</div>';
            $schemaFile = __DIR__ . '/../api/schema.sql';

            if (!file_exists($schemaFile)) {
                throw new Exception("Schema file not found: $schemaFile");
            }

            $schema = file_get_contents($schemaFile);
            echo '<div class="success">✓ Schema loaded (' . number_format(strlen($schema)) . ' bytes)</div>';

            // Create/update database
            echo '<div class="step">✓ Initializing database...</div>';

            $db = new PDO('sqlite:' . DB_PATH);
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

            // Enable foreign keys
            $db->exec('PRAGMA foreign_keys = ON');

            echo '<pre>';

            // Execute schema (it uses CREATE TABLE IF NOT EXISTS, so safe to run multiple times)
            $db->exec($schema);
            echo "✓ Database schema initialized\n";

            // Verify tables
            $tables = $db->query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
            echo "\n✓ Created " . count($tables) . " tables:\n";
            foreach ($tables as $table) {
                echo "  - $table\n";
            }

            echo '</pre>';

            echo '<div class="success">';
            echo '<strong>🎉 Database Initialized Successfully!</strong><br>';
            echo 'Your CineShelf database is ready to use.<br>';
            echo 'You can now log in with Google!';
            echo '</div>';

            echo '<div class="info">';
            echo '<strong>What was created:</strong><br>';
            echo '✓ Users table (with OAuth support)<br>';
            echo '✓ Sessions table (for login tokens)<br>';
            echo '✓ Movies table (shared movie database)<br>';
            echo '✓ Copies table (your physical collection)<br>';
            echo '✓ Wishlist table<br>';
            echo '✓ Groups, borrowing, trivia tables<br>';
            echo '✓ All indexes and foreign keys';
            echo '</div>';

            echo '<a href="/" class="btn">← Go to CineShelf</a>';

        } catch (Exception $e) {
            echo '<div class="error">';
            echo '<strong>❌ Initialization failed!</strong><br>';
            echo 'Error: ' . htmlspecialchars($e->getMessage());
            echo '</div>';

            echo '<div class="info">';
            echo '<strong>Troubleshooting:</strong><br>';
            echo '1. Make sure the data directory is writable<br>';
            echo '2. Check that SQLite PDO driver is installed<br>';
            echo '3. Verify the database path is correct: ' . DB_PATH . '<br>';
            echo '4. Contact support if problem persists';
            echo '</div>';
        }
        ?>
    </div>
</body>
</html>
