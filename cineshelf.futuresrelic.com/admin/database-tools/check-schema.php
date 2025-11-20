<?php
require_once __DIR__ . '/../../config/config.php';
$db = getDb();

echo "<a href='../index.html' class='back-btn'>← Back to Admin Panel</a><h1>Database Schema Check</h1>";
echo "<pre>";

echo "=== MOVIES TABLE STRUCTURE ===\n\n";

// Get table info
$stmt = $db->query("PRAGMA table_info(movies)");
$columns = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "Column Name          | Type      | Null? | Default\n";
echo "---------------------------------------------------\n";
foreach ($columns as $col) {
    printf("%-20s | %-9s | %-5s | %s\n", 
        $col['name'], 
        $col['type'], 
        $col['notnull'] ? 'NO' : 'YES',
        $col['dflt_value'] ?? 'NULL'
    );
}

echo "\n=== SAMPLE ROW (first movie) ===\n\n";
$sample = $db->query("SELECT * FROM movies LIMIT 1")->fetch(PDO::FETCH_ASSOC);
foreach ($sample as $key => $value) {
    $display = is_null($value) ? 'NULL' : (strlen($value) > 50 ? substr($value, 0, 50) . '...' : $value);
    echo "$key = $display\n";
}

echo "\n=== COPIES TABLE STRUCTURE ===\n\n";
$stmt = $db->query("PRAGMA table_info(copies)");
$copyCols = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "Column Name          | Type      | Null? | Default\n";
echo "---------------------------------------------------\n";
foreach ($copyCols as $col) {
    printf("%-20s | %-9s | %-5s | %s\n", 
        $col['name'], 
        $col['type'], 
        $col['notnull'] ? 'NO' : 'YES',
        $col['dflt_value'] ?? 'NULL'
    );
}

echo "</pre>";

echo "<h2>Key Findings</h2>";
echo "<ul>";
echo "<li><strong>Primary key column name:</strong> Look for 'id' or 'movie_id' above</li>";
echo "<li><strong>TMDB reference:</strong> Look for 'tmdb_id' column</li>";
echo "<li><strong>Metadata columns:</strong> overview, director, runtime, certification should be present</li>";
echo "</ul>";
?>
