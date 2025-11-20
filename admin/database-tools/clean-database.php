<?php
/**
 * Clean Database - Remove duplicates and optionally wipe user data
 */
require_once __DIR__ . '/../../config/config.php';

// Password protect
$password = 'indeed'; // CHANGE THIS!
if (!isset($_GET['pass']) || $_GET['pass'] !== $password) {
    die('Access denied. Use: clean-database.php?pass=your_password&action=view');
}

$action = $_GET['action'] ?? 'view';

echo "<style>
    body { font-family: monospace; background: #1a1a1a; color: #fff; padding: 20px; }
    .success { color: #4caf50; }
    .error { color: #f44336; }
    .warning { color: #ff9800; }
    button { padding: 10px 20px; margin: 10px; font-size: 14px; cursor: pointer; }
    .danger { background: #f44336; color: white; border: none; }
    .safe { background: #4caf50; color: white; border: none; }
        .back-btn { display: inline-block; padding: 8px 16px; background: #4a9eff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .back-btn:hover { background: #6bb0ff; }
    </style>";

try {
    $db = getDb();
    
    echo "<a href='../index.html' class='back-btn'>← Back to Admin Panel</a><h1>🧹 Database Cleaner</h1>";
    
    if ($action === 'view') {
        // Show statistics
        echo "<h2>📊 Current Statistics</h2>";
        
        // Per user stats
        $stmt = $db->query("
            SELECT 
                u.username,
                u.id as user_id,
                COUNT(DISTINCT c.id) as copy_count,
                COUNT(DISTINCT c.movie_id) as unique_movies
            FROM users u
            LEFT JOIN copies c ON c.user_id = u.id
            GROUP BY u.id
            ORDER BY copy_count DESC
        ");
        
        echo "<table border='1' cellpadding='10' style='border-collapse: collapse;'>";
        echo "<tr><th>User</th><th>Copies</th><th>Unique Movies</th><th>Actions</th></tr>";
        
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            echo "<tr>";
            echo "<td><strong>{$row['username']}</strong></td>";
            echo "<td>{$row['copy_count']}</td>";
            echo "<td>{$row['unique_movies']}</td>";
            echo "<td>";
            if ($row['copy_count'] > 0) {
                echo "<button class='danger' onclick=\"if(confirm('DELETE ALL data for {$row['username']}?')) location.href='?pass={$password}&action=delete_user&user_id={$row['user_id']}';\">🗑️ Delete User Data</button>";
            }
            echo "</td>";
            echo "</tr>";
        }
        echo "</table>";
        
        // Show duplicate detection
        echo "<h2>🔍 Duplicate Detection</h2>";
        $stmt = $db->query("
            SELECT 
                movie_id,
                user_id,
                COUNT(*) as copy_count,
                GROUP_CONCAT(id) as copy_ids
            FROM copies
            GROUP BY movie_id, user_id, format, edition, region
            HAVING COUNT(*) > 1
        ");
        
        $dupes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        if (count($dupes) > 0) {
            echo "<p class='warning'>Found <strong>" . count($dupes) . "</strong> sets of potential duplicates</p>";
            echo "<button class='danger' onclick=\"if(confirm('Remove ALL duplicate copies (keeps newest)?')) location.href='?pass={$password}&action=remove_dupes';\">🗑️ Remove All Duplicates</button>";
        } else {
            echo "<p class='success'>✅ No duplicates found!</p>";
        }
        
        // Show unresolved with bad titles
        echo "<h2>🔧 Corrupted Unresolved Titles</h2>";
        $stmt = $db->query("
            SELECT COUNT(*) as count
            FROM movies
            WHERE tmdb_id LIKE 'unresolved_%'
              AND (title LIKE '%,%' OR title IS NULL)
        ");
        $corrupt = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($corrupt['count'] > 0) {
            echo "<p class='warning'>Found <strong>{$corrupt['count']}</strong> unresolved movies with corrupted titles</p>";
            echo "<button class='danger' onclick=\"if(confirm('DELETE all unresolved movies with corrupted titles?')) location.href='?pass={$password}&action=delete_corrupt';\">🗑️ Delete Corrupted</button>";
        } else {
            echo "<p class='success'>✅ No corrupted titles!</p>";
        }
        
    } elseif ($action === 'delete_user') {
        $userId = intval($_GET['user_id'] ?? 0);
        
        if ($userId === 0) {
            die('Invalid user ID');
        }
        
        // Get username
        $stmt = $db->prepare("SELECT username FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        
        if (!$user) {
            die('User not found');
        }
        
        echo "<h2>🗑️ Deleting data for: {$user['username']}</h2>";
        
        // Delete copies
        $stmt = $db->prepare("DELETE FROM copies WHERE user_id = ?");
        $stmt->execute([$userId]);
        echo "<p class='success'>✅ Deleted copies: " . $stmt->rowCount() . "</p>";
        
        // Delete wishlist
        $stmt = $db->prepare("DELETE FROM wishlist WHERE user_id = ?");
        $stmt->execute([$userId]);
        echo "<p class='success'>✅ Deleted wishlist items: " . $stmt->rowCount() . "</p>";
        
        // Clean up orphaned movies
        $db->exec("
            DELETE FROM movies 
            WHERE id NOT IN (SELECT DISTINCT movie_id FROM copies)
              AND id NOT IN (SELECT DISTINCT movie_id FROM wishlist)
        ");
        
        echo "<p class='success'>✅ Cleaned up orphaned movies</p>";
        echo "<hr>";
        echo "<p><a href='?pass={$password}&action=view'>← Back</a></p>";
        
    } elseif ($action === 'remove_dupes') {
        echo "<h2>🗑️ Removing Duplicates</h2>";
        
        // Find and remove duplicates (keep the one with highest ID = newest)
        $db->exec("
            DELETE FROM copies
            WHERE id NOT IN (
                SELECT MAX(id)
                FROM copies
                GROUP BY user_id, movie_id, format, edition, region, condition
            )
        ");
        
        $removed = $db->changes();
        
        echo "<p class='success'>✅ Removed <strong>{$removed}</strong> duplicate copies</p>";
        echo "<hr>";
        echo "<p><a href='?pass={$password}&action=view'>← Back</a></p>";
        
    } elseif ($action === 'delete_corrupt') {
        echo "<h2>🗑️ Deleting Corrupted Unresolved Movies</h2>";
        
        $stmt = $db->exec("
            DELETE FROM movies
            WHERE tmdb_id LIKE 'unresolved_%'
              AND (title LIKE '%,%' OR title IS NULL)
        ");
        
        echo "<p class='success'>✅ Deleted corrupted movies</p>";
        
        // Clean up orphaned copies
        $db->exec("
            DELETE FROM copies
            WHERE movie_id NOT IN (SELECT id FROM movies)
        ");
        
        echo "<p class='success'>✅ Cleaned up orphaned copies</p>";
        echo "<hr>";
        echo "<p><a href='?pass={$password}&action=view'>← Back</a></p>";
    }
    
} catch (Exception $e) {
    echo "<pre style='color: red;'>Error: " . $e->getMessage() . "</pre>";
}
?>