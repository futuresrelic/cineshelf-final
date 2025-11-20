<?php
/**
 * Fix Corrupted Unresolved Titles - Remove commas from CSV import
 */
require_once __DIR__ . '/../../config/config.php';

// Password protect
$password = 'indeed'; // CHANGE THIS!
if (!isset($_GET['pass']) || $_GET['pass'] !== $password) {
    die('Access denied. Use: fix-corrupted-titles.php?pass=your_password');
}

try {
    $db = getDb();
    
    echo "<style>
        body { font-family: monospace; background: #1a1a1a; color: #fff; padding: 20px; line-height: 1.6; }
        .success { color: #4caf50; }
        .error { color: #f44336; }
        .info { color: #2196f3; }
        .fixed { background: #1b4d1b; padding: 5px; margin: 5px 0; border-left: 3px solid #4caf50; }
            .back-btn { display: inline-block; padding: 8px 16px; background: #4a9eff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .back-btn:hover { background: #6bb0ff; }
    </style>";
    
    echo "<a href='../index.html' class='back-btn'>← Back to Admin Panel</a><h1>🔧 Fix Corrupted Unresolved Titles</h1>";
    echo "<p>Removing commas from unresolved movie titles...</p>";
    echo "<hr>";
    
    // Find all unresolved movies with commas
    $stmt = $db->query("
        SELECT id, title, tmdb_id
        FROM movies
        WHERE tmdb_id LIKE 'unresolved_%'
          AND title LIKE '%,%'
        ORDER BY title
    ");
    
    $movies = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "<h2>Found <strong>" . count($movies) . "</strong> corrupted titles</h2>";
    echo "<hr>";
    
    if (count($movies) === 0) {
        echo "<div class='success'>✅ No corrupted titles found!</div>";
        echo "<p><a href='/'>← Back to CineShelf</a></p>";
        exit;
    }
    
    $fixed = 0;
    
    foreach ($movies as $movie) {
        $oldTitle = $movie['title'];
        
        // Remove all commas and trim whitespace
        $newTitle = trim(str_replace(',', '', $oldTitle));
        
        // If title is now empty, skip it
        if (empty($newTitle)) {
            echo "<div class='error'>⚠️ Skipping empty title (ID: {$movie['id']})</div>";
            continue;
        }
        
        // Update the title
        $updateStmt = $db->prepare("UPDATE movies SET title = ? WHERE id = ?");
        $updateStmt->execute([$newTitle, $movie['id']]);
        
        echo "<div class='fixed success'>";
        echo "✅ Fixed ID {$movie['id']}:<br>";
        echo "   Before: <span style='color: #f44336;'>{$oldTitle}</span><br>";
        echo "   After: <span style='color: #4caf50;'>{$newTitle}</span>";
        echo "</div>";
        
        $fixed++;
    }
    
    echo "<hr>";
    echo "<h2>📊 Summary</h2>";
    echo "<div class='success'>✅ Fixed <strong>{$fixed}</strong> corrupted titles!</div>";
    echo "<hr>";
    echo "<p>Now these movies can be resolved properly in the Resolve tab.</p>";
    echo "<p><a href='/'>← Back to CineShelf</a> | <a href='clean-database.php?pass={$password}&action=view'>→ Clean Database</a></p>";
    
} catch (Exception $e) {
    echo "<pre style='color: red;'>Error: " . htmlspecialchars($e->getMessage()) . "</pre>";
}
?>
