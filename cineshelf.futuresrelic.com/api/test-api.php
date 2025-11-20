<?php
/**
 * API Diagnostic Test
 * Tests basic API functionality and database connection
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<h1>CineShelf API Diagnostic Test</h1>";
echo "<pre>";

// Test 1: Config file
echo "=== Test 1: Loading config ===\n";
try {
    require_once __DIR__ . '/../config/config.php';
    echo "✓ Config loaded successfully\n\n";
} catch (Exception $e) {
    echo "✗ Failed to load config: " . $e->getMessage() . "\n\n";
    exit;
}

// Test 2: Database connection
echo "=== Test 2: Database Connection ===\n";
try {
    $db = getDb();
    echo "✓ Database connected successfully\n";
    echo "Database path: " . DB_PATH . "\n";
    echo "Database exists: " . (file_exists(DB_PATH) ? 'Yes' : 'No') . "\n\n";
} catch (Exception $e) {
    echo "✗ Database connection failed: " . $e->getMessage() . "\n\n";
    exit;
}

// Test 3: Check tables
echo "=== Test 3: Check Tables ===\n";
try {
    $tables = $db->query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
    echo "Tables found: " . count($tables) . "\n";
    foreach ($tables as $table) {
        echo "  - $table\n";
    }
    echo "\n";
} catch (Exception $e) {
    echo "✗ Failed to list tables: " . $e->getMessage() . "\n\n";
}

// Test 4: Check movies table structure
echo "=== Test 4: Movies Table Structure ===\n";
try {
    $columns = $db->query("PRAGMA table_info(movies)")->fetchAll(PDO::FETCH_ASSOC);
    echo "Columns in movies table:\n";
    foreach ($columns as $col) {
        echo "  - {$col['name']} ({$col['type']})\n";
    }
    echo "\n";
} catch (Exception $e) {
    echo "✗ Failed to check movies table: " . $e->getMessage() . "\n\n";
}

// Test 5: Get or create user
echo "=== Test 5: Get or Create User ===\n";
try {
    $user = getOrCreateUser($db, 'default');
    echo "✓ User retrieved/created successfully\n";
    echo "User ID: {$user['id']}\n";
    echo "Username: {$user['username']}\n\n";
} catch (Exception $e) {
    echo "✗ Failed to get/create user: " . $e->getMessage() . "\n\n";
}

// Test 6: Test list_collection query
echo "=== Test 6: Test list_collection Query ===\n";
try {
    $stmt = $db->prepare("
        SELECT
            c.id as copy_id,
            c.format,
            c.edition,
            c.region,
            c.condition,
            c.notes,
            c.barcode,
            c.created_at,
            m.id as movie_id,
            m.tmdb_id,
            m.title,
            m.display_title,
            m.year,
            m.poster_url,
            m.rating,
            m.runtime,
            m.genre,
            m.media_type,
            m.overview,
            m.director,
            m.certification,
            COUNT(*) OVER (PARTITION BY m.id) as copy_count
        FROM copies c
        JOIN movies m ON c.movie_id = m.id
        WHERE c.user_id = ?
        ORDER BY COALESCE(m.display_title, m.title) ASC
        LIMIT 5
    ");
    $stmt->execute([$user['id']]);
    $results = $stmt->fetchAll();
    echo "✓ Query executed successfully\n";
    echo "Results found: " . count($results) . "\n\n";
} catch (Exception $e) {
    echo "✗ Query failed: " . $e->getMessage() . "\n";
    echo "Error info: " . print_r($db->errorInfo(), true) . "\n\n";
}

// Test 7: Test list_groups query
echo "=== Test 7: Test list_groups Query ===\n";
try {
    $stmt = $db->prepare("
        SELECT
            g.*,
            (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count,
            (SELECT COUNT(DISTINCT gc.movie_id)
             FROM group_collections gc
             WHERE gc.group_id = g.id) as movie_count
        FROM groups g
        WHERE g.id IN (
            SELECT group_id FROM group_members WHERE user_id = ?
        )
        ORDER BY g.name ASC
    ");
    $stmt->execute([$user['id']]);
    $results = $stmt->fetchAll();
    echo "✓ Query executed successfully\n";
    echo "Results found: " . count($results) . "\n\n";
} catch (Exception $e) {
    echo "✗ Query failed: " . $e->getMessage() . "\n";
    echo "Error info: " . print_r($db->errorInfo(), true) . "\n\n";
}

// Test 8: Test list_wishlist query
echo "=== Test 8: Test list_wishlist Query ===\n";
try {
    $stmt = $db->prepare("
        SELECT
            w.id as wishlist_id,
            w.priority,
            w.notes,
            w.added_at,
            m.id as movie_id,
            m.tmdb_id,
            m.title,
            m.year,
            m.poster_url,
            m.rating,
            m.runtime,
            m.genre,
            m.overview
        FROM wishlist w
        JOIN movies m ON w.movie_id = m.id
        WHERE w.user_id = ?
        ORDER BY m.title ASC
        LIMIT 5
    ");
    $stmt->execute([$user['id']]);
    $results = $stmt->fetchAll();
    echo "✓ Query executed successfully\n";
    echo "Results found: " . count($results) . "\n\n";
} catch (Exception $e) {
    echo "✗ Query failed: " . $e->getMessage() . "\n";
    echo "Error info: " . print_r($db->errorInfo(), true) . "\n\n";
}

echo "=== Diagnostic Complete ===\n";
echo "</pre>";
