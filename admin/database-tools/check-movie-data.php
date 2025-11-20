<?php
// Quick diagnostic: Check what data exists for a movie
require_once __DIR__ . '/api/config/config.php';

$db = getDb();

// Get a sample movie to see what fields exist
$stmt = $db->query("SELECT * FROM movies LIMIT 1");
$sample = $stmt->fetch(PDO::FETCH_ASSOC);

echo "<h2>Database Column Check</h2>";
echo "<pre>";
print_r(array_keys($sample));
echo "</pre>";

echo "<h2>Sample Movie Data</h2>";
echo "<pre>";
print_r($sample);
echo "</pre>";

// Check if these columns exist
$columns_to_check = ['overview', 'director', 'runtime', 'certification'];
$missing = [];

foreach ($columns_to_check as $col) {
    if (!array_key_exists($col, $sample)) {
        $missing[] = $col;
    }
}

if (!empty($missing)) {
    echo "<h2 style='color: red;'>❌ MISSING COLUMNS:</h2>";
    echo "<pre>";
    print_r($missing);
    echo "</pre>";
    
    echo "<h3>To fix, run this SQL:</h3>";
    echo "<pre>";
    foreach ($missing as $col) {
        echo "ALTER TABLE movies ADD COLUMN $col TEXT;\n";
    }
    echo "</pre>";
} else {
    echo "<h2 style='color: green;'>✅ All columns exist!</h2>";
}

// Now check if the columns are actually populated
echo "<h2>Data Population Check (first 5 movies)</h2>";
$stmt = $db->query("SELECT movie_id, title, overview, director, runtime, certification FROM movies LIMIT 5");
$movies = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "<table border='1' style='border-collapse: collapse;'>";
echo "<tr><th>ID</th><th>Title</th><th>Has Overview</th><th>Has Director</th><th>Has Runtime</th><th>Has Cert</th></tr>";
foreach ($movies as $movie) {
    echo "<tr>";
    echo "<td>{$movie['movie_id']}</td>";
    echo "<td>{$movie['title']}</td>";
    echo "<td>" . (!empty($movie['overview']) ? '✅' : '❌') . "</td>";
    echo "<td>" . (!empty($movie['director']) ? '✅' : '❌') . "</td>";
    echo "<td>" . (!empty($movie['runtime']) ? '✅' : '❌') . "</td>";
    echo "<td>" . (!empty($movie['certification']) ? '✅' : '❌') . "</td>";
    echo "</tr>";
}
echo "</table>";
?>
