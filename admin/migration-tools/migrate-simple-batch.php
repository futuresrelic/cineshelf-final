<?php
// SIMPLE BATCH MIGRATION: Processes 10 movies at a time, then shows results
require_once __DIR__ . '/../../config/config.php';

set_time_limit(120);
$db = getDb();

echo "<!DOCTYPE html><html><head><style>
body { font-family: Arial; padding: 20px; background: #0f0f0f; color: white; }
.success { color: #4caf50; font-weight: bold; }
.error { color: #ef4444; font-weight: bold; }
.info { color: #3b82f6; }
.warning { color: #f59e0b; }
.movie-item {
    margin: 8px 0;
    padding: 12px;
    background: rgba(255,255,255,0.05);
    border-radius: 5px;
    border-left: 3px solid #4caf50;
}
.stats-box {
    padding: 20px;
    background: rgba(102, 126, 234, 0.2);
    border-radius: 10px;
    margin: 20px 0;
    font-size: 1.1em;
}
.continue-btn {
    display: inline-block;
    padding: 15px 30px;
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    text-decoration: none;
    border-radius: 10px;
    font-weight: bold;
    font-size: 1.2em;
    margin: 20px 0;
}
.continue-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}
        .back-btn { display: inline-block; padding: 8px 16px; background: #4a9eff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .back-btn:hover { background: #6bb0ff; }
    </style></head><body>
<a href='../index.html' class='back-btn'>← Back to Admin Panel</a>
";

echo "<h1>🔧 CineShelf Metadata Migration (Batch Mode)</h1>";

// Step 1: Add missing columns (only on first run)
$columns = ['overview' => 'TEXT', 'director' => 'TEXT', 'runtime' => 'INTEGER', 'certification' => 'TEXT'];

echo "<h2>Database Columns</h2>";
foreach ($columns as $column => $type) {
    try {
        $db->exec("ALTER TABLE movies ADD COLUMN $column $type");
        echo "<div class='success'>✅ Added column: $column</div>";
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'duplicate column name') !== false) {
            echo "<div class='info'>✓ Column exists: $column</div>";
        }
    }
}

// Get total count
$totalNeedingUpdate = $db->query("
    SELECT COUNT(*) as count 
    FROM movies 
    WHERE tmdb_id NOT LIKE 'unresolved_%' 
    AND (overview IS NULL OR overview = '' OR director IS NULL OR director = '')
")->fetch(PDO::FETCH_ASSOC)['count'];

echo "<br><div class='stats-box'>";
echo "<strong>📊 Movies needing metadata: $totalNeedingUpdate</strong>";
echo "</div>";

if ($totalNeedingUpdate === 0) {
    echo "<div class='success' style='padding: 20px; background: rgba(76, 175, 80, 0.2); border-radius: 10px;'>";
    echo "<h2>🎉 All Done!</h2>";
    echo "<p>All movies have complete metadata. You can delete this script and refresh CineShelf!</p>";
    echo "</div>";
} else {
    echo "<h2>Processing Batch...</h2>";
    
    // Process 10 movies at a time for reliability
    $stmt = $db->query("
        SELECT movie_id, tmdb_id, title, media_type 
        FROM movies 
        WHERE tmdb_id NOT LIKE 'unresolved_%' 
        AND (overview IS NULL OR overview = '' OR director IS NULL OR director = '')
        LIMIT 10
    ");
    
    $movies = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $processed = count($movies);
    
    echo "<p class='info'>Processing $processed movies in this batch...</p>";
    
    $updated = 0;
    $failed = 0;
    
    foreach ($movies as $movie) {
        $tmdbId = $movie['tmdb_id'];
        $mediaType = $movie['media_type'] ?? 'movie';
        $title = htmlspecialchars($movie['title']);
        
        echo "<div class='movie-item'>";
        echo "<strong>$title</strong> (TMDB: $tmdbId)";
        
        // Fetch from TMDB
        $endpoint = $mediaType === 'tv' ? '/tv/' : '/movie/';
        $url = "https://api.themoviedb.org/3" . $endpoint . $tmdbId . "?api_key=8039283176a74ffd71a1658c6f84a051&append_to_response=release_dates,content_ratings,credits";
        
        $response = @file_get_contents($url);
        
        if ($response === false) {
            echo " <span class='error'>❌ Failed to fetch</span>";
            $failed++;
        } else {
            $data = json_decode($response, true);
            
            // Extract metadata
            $overview = $data['overview'] ?? null;
            $runtime = $data['runtime'] ?? ($data['episode_run_time'][0] ?? null);
            
            // Get director
            $director = null;
            if ($mediaType === 'tv' && isset($data['created_by'][0]['name'])) {
                $director = $data['created_by'][0]['name'];
            } elseif (isset($data['credits']['crew'])) {
                foreach ($data['credits']['crew'] as $person) {
                    if ($person['job'] === 'Director') {
                        $director = $person['name'];
                        break;
                    }
                }
            }
            
            // Get certification
            $certification = null;
            if ($mediaType === 'tv' && isset($data['content_ratings']['results'])) {
                foreach ($data['content_ratings']['results'] as $rating) {
                    if ($rating['iso_3166_1'] === 'US') {
                        $certification = $rating['rating'];
                        break;
                    }
                }
            } elseif (isset($data['release_dates']['results'])) {
                foreach ($data['release_dates']['results'] as $release) {
                    if ($release['iso_3166_1'] === 'US') {
                        foreach ($release['release_dates'] as $date) {
                            if (!empty($date['certification'])) {
                                $certification = $date['certification'];
                                break 2;
                            }
                        }
                    }
                }
            }
            
            // Update database
            $updateStmt = $db->prepare("
                UPDATE movies 
                SET overview = ?, director = ?, runtime = ?, certification = ?
                WHERE movie_id = ?
            ");
            
            $updateStmt->execute([
                $overview,
                $director,
                $runtime,
                $certification,
                $movie['movie_id']
            ]);
            
            echo " <span class='success'>✅ Updated</span>";
            if ($director) echo "<br>└─ Dir: " . htmlspecialchars($director);
            if ($runtime) echo " | {$runtime}m";
            if ($certification) echo " | $certification";
            
            $updated++;
            
            // Small delay to be nice to TMDB
            usleep(250000);
        }
        
        echo "</div>";
    }
    
    // Show results
    echo "<br><div class='stats-box'>";
    echo "<div class='success'>✅ Updated in this batch: $updated</div>";
    if ($failed > 0) {
        echo "<div class='error'>❌ Failed: $failed</div>";
    }
    
    $remaining = $totalNeedingUpdate - $processed;
    
    if ($remaining > 0) {
        echo "<br><div class='warning'>⏳ Remaining: $remaining movies</div>";
        echo "<br><a href='' class='continue-btn'>🔄 Process Next Batch ($remaining left)</a>";
    } else {
        echo "<br><div class='success'>🎉 ALL MOVIES UPDATED!</div>";
        echo "<p>You can now:</p>";
        echo "<ul>";
        echo "<li>Delete this script from your server</li>";
        echo "<li>Hard refresh CineShelf (Ctrl+Shift+R)</li>";
        echo "<li>View movie details to see plot, director, runtime, certification!</li>";
        echo "</ul>";
    }
    echo "</div>";
}

echo "</body></html>";
?>
