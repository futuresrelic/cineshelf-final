<?php
/**
 * Quick Remove Duplicates
 */
require_once __DIR__ . '/../../config/config.php';

// Password protect
$password = 'indeed'; // CHANGE THIS!
if (!isset($_GET['pass']) || $_GET['pass'] !== $password) {
    die('Access denied. Use: remove-duplicates.php?pass=your_password&confirm=yes');
}

$confirm = $_GET['confirm'] ?? 'no';

echo "<style>
    body { font-family: monospace; background: #1a1a1a; color: #fff; padding: 20px; }
    .success { color: #4caf50; }
    .warning { color: #ff9800; }
    button { padding: 15px 30px; font-size: 16px; cursor: pointer; background: #f44336; color: white; border: none; border-radius: 4px; }
        .back-btn { display: inline-block; padding: 8px 16px; background: #4a9eff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .back-btn:hover { background: #6bb0ff; }
    </style>";

echo "<a href='../index.html' class='back-btn'>← Back to Admin Panel</a><h1>🗑️ Remove Duplicate Copies</h1>";

try {
    $db = getDb();
    
    if ($confirm !== 'yes') {
        // Show preview
        $stmt = $db->query("
            SELECT 
                movie_id,
                user_id,
                format,
                edition,
                COUNT(*) as count,
                GROUP_CONCAT(id) as ids
            FROM copies
            GROUP BY user_id, movie_id, format, edition, region, condition
            HAVING COUNT(*) > 1
        ");
        
        $dupes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo "<h2>Found <strong>" . count($dupes) . "</strong> sets of duplicates</h2>";
        
        if (count($dupes) === 0) {
            echo "<div class='success'>✅ No duplicates found!</div>";
            echo "<p><a href='/'>← Back to CineShelf</a></p>";
            exit;
        }
        
        $totalToRemove = 0;
        foreach ($dupes as $dupe) {
            $totalToRemove += ($dupe['count'] - 1); // Keep one, remove rest
        }
        
        echo "<div class='warning'>";
        echo "<p><strong>⚠️ This will remove {$totalToRemove} duplicate copies</strong></p>";
        echo "<p>Strategy: Keep the newest copy (highest ID), remove older duplicates</p>";
        echo "</div>";
        
        echo "<table border='1' cellpadding='10' style='margin: 20px 0; border-collapse: collapse;'>";
        echo "<tr><th>Movie ID</th><th>User ID</th><th>Format</th><th>Count</th><th>IDs to Delete</th></tr>";
        
        foreach ($dupes as $dupe) {
            $ids = explode(',', $dupe['ids']);
            sort($ids);
            array_pop($ids); // Remove highest (newest) - this one we keep
            
            echo "<tr>";
            echo "<td>{$dupe['movie_id']}</td>";
            echo "<td>{$dupe['user_id']}</td>";
            echo "<td>{$dupe['format']}</td>";
            echo "<td>{$dupe['count']}</td>";
            echo "<td style='color: #f44336;'>" . implode(', ', $ids) . "</td>";
            echo "</tr>";
        }
        echo "</table>";
        
        echo "<form method='GET'>";
        echo "<input type='hidden' name='pass' value='{$password}'>";
        echo "<input type='hidden' name='confirm' value='yes'>";
        echo "<button type='submit'>🗑️ CONFIRM - Remove {$totalToRemove} Duplicates</button>";
        echo "</form>";
        
    } else {
        // Actually remove duplicates
        echo "<h2>🗑️ Removing Duplicates...</h2>";
        
        // Use a more reliable method: delete all except the MAX(id) for each group
        $removed = $db->exec("
            DELETE FROM copies
            WHERE id NOT IN (
                SELECT MAX(id)
                FROM copies
                GROUP BY user_id, movie_id, format, COALESCE(edition, ''), COALESCE(region, ''), COALESCE(condition, 'Good')
            )
        ");
        
        echo "<div class='success'>";
        echo "<h3>✅ Successfully removed <strong>{$removed}</strong> duplicate copies!</h3>";
        echo "</div>";
        
        echo "<hr>";
        echo "<p><a href='/'>← Back to CineShelf</a> | <a href='clean-database.php?pass={$password}&action=view'>→ View Database Stats</a></p>";
    }
    
} catch (Exception $e) {
    echo "<pre style='color: red;'>Error: " . htmlspecialchars($e->getMessage()) . "</pre>";
}
?>
