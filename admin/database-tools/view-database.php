<?php
require_once __DIR__ . '/../../config/config.php';

// Password protect it
$password = 'indeed'; // CHANGE THIS!

if (!isset($_GET['pass']) || $_GET['pass'] !== $password) {
    die('Access denied. Use: view-database.php?pass=your_password');
}

try {
    $db = getDb();
    
    // Get all tables
    $tables = $db->query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
    
    echo "<style>
        body { font-family: monospace; padding: 20px; background: #1a1a1a; color: #fff; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; background: #2a2a2a; }
        th, td { border: 1px solid #444; padding: 8px; text-align: left; }
        th { background: #333; font-weight: bold; }
        tr:hover { background: #3a3a3a; }
        h2 { color: #ffc107; border-bottom: 2px solid #ffc107; padding-bottom: 5px; }
        .null { color: #999; font-style: italic; }
        .unresolved { background: #4a3000; }
        .back-btn { display: inline-block; padding: 8px 16px; background: #4a9eff; color: white; text-decoration: none; border-radius: 4px; margin-bottom: 20px; }
        .back-btn:hover { background: #6bb0ff; }
    </style>";

    echo "<a href='../index.html' class='back-btn'>← Back to Admin Panel</a>";
    echo "<h1>🎬 CineShelf Database Viewer</h1>";
    
    foreach ($tables as $table) {
        echo "<h2>Table: {$table}</h2>";
        
        // Get row count
        $count = $db->query("SELECT COUNT(*) FROM {$table}")->fetchColumn();
        echo "<p><strong>Total rows:</strong> {$count}</p>";
        
        // Get table info
        $columns = $db->query("PRAGMA table_info({$table})")->fetchAll();
        
        // Show first 10 rows
        $rows = $db->query("SELECT * FROM {$table} LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);
        
        if (empty($rows)) {
            echo "<p>No data in this table.</p>";
            continue;
        }
        
        echo "<table>";
        echo "<tr>";
        foreach (array_keys($rows[0]) as $col) {
            echo "<th>{$col}</th>";
        }
        echo "</tr>";
        
        foreach ($rows as $row) {
            $rowClass = (isset($row['tmdb_id']) && strpos($row['tmdb_id'], 'unresolved_') === 0) ? 'unresolved' : '';
            echo "<tr class='{$rowClass}'>";
            foreach ($row as $val) {
                if ($val === null) {
                    echo "<td class='null'>NULL</td>";
                } else {
                    echo "<td>" . htmlspecialchars(substr($val, 0, 100)) . "</td>";
                }
            }
            echo "</tr>";
        }
        
        echo "</table>";
    }
    
    // Special query: Show unresolved movies
    echo "<h2>🔍 Unresolved Movies (Quick Check)</h2>";
    $stmt = $db->query("
        SELECT id, tmdb_id, title, year, poster_url, media_type 
        FROM movies 
        WHERE tmdb_id LIKE 'unresolved_%' 
        LIMIT 20
    ");
    $unresolved = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "<table>";
    echo "<tr><th>ID</th><th>TMDB ID</th><th>Title</th><th>Year</th><th>Poster</th><th>Type</th></tr>";
    foreach ($unresolved as $row) {
        echo "<tr class='unresolved'>";
        echo "<td>{$row['id']}</td>";
        echo "<td>{$row['tmdb_id']}</td>";
        echo "<td>" . htmlspecialchars($row['title']) . "</td>";
        echo "<td>" . ($row['year'] ?: 'NULL') . "</td>";
        echo "<td>" . ($row['poster_url'] ? '✓' : 'NULL') . "</td>";
        echo "<td>" . ($row['media_type'] ?: 'NULL') . "</td>";
        echo "</tr>";
    }
    echo "</table>";
    
    // Check columns in movies table
    echo "<h2>📋 Movies Table Structure</h2>";
    $columns = $db->query("PRAGMA table_info(movies)")->fetchAll(PDO::FETCH_ASSOC);
    echo "<table>";
    echo "<tr><th>Column</th><th>Type</th><th>Not Null</th><th>Default</th></tr>";
    foreach ($columns as $col) {
        echo "<tr>";
        echo "<td><strong>{$col['name']}</strong></td>";
        echo "<td>{$col['type']}</td>";
        echo "<td>" . ($col['notnull'] ? 'YES' : 'NO') . "</td>";
        echo "<td>" . ($col['dflt_value'] ?: 'NULL') . "</td>";
        echo "</tr>";
    }
    echo "</table>";
    
} catch (Exception $e) {
    echo "<pre style='color: red;'>Error: " . $e->getMessage() . "</pre>";
}
?>