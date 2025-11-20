<?php
// IMPROVED MIGRATION - Tracks progress better
require_once __DIR__ . '/../../config/config.php';

set_time_limit(120);
$db = getDb();

echo "<!DOCTYPE html><html><head><meta http-equiv='refresh' content='0'><style>
body { font-family: Arial; padding: 20px; background: #0f0f0f; color: white; }
.success { color: #4caf50; font-weight: bold; }
.error { color: #ef4444; font-weight: bold; }
.info { color: #3b82f6; }
.movie-item {
    margin: 8px 0;
    padding: 12px;
    background: rgba(255,255,255,0.05);
    border-radius: 5px;
    border-left: 3px solid #4caf50;
    animation: slideIn 0.3s;
}
@keyframes slideIn {
    from { opacity: 0; transform: translateX(-20px); }
    to { opacity: 1; transform: translateX(0); }
}
.stats-box {
    padding: 20px;
    background: rgba(102, 126, 234, 0.2);
    border-radius: 10px;
    margin: 20px 0;
}
.progress {
    width: 100%;
    height: 30px;
    background: rgba(255,255,255,0.1);
    border-radius: 15px;
    overflow: hidden;
    margin: 10px 0;
}
.progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #667eea, #764ba2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    transition: width 1s;
}
        .back-btn { display: inline-block; padding: 8px 16px; background: #4a9eff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .back-btn:hover { background: #6bb0ff; }
    </style></head><body>
<a href='../index.html' class='back-btn'>← Back to Admin Panel</a>
";

echo "<h1>🔧 Auto-Processing Directors & Certifications</h1>";

// Get total before starting
$totalQuery = "
    SELECT COUNT(*) as count 
    FROM movies 
    WHERE tmdb_id NOT LIKE 'unresolved_%' 
    AND (director IS NULL OR director = '' OR certification IS NULL OR certification = '')
";
$totalBefore = $db->query($totalQuery)->fetch(PDO::FETCH_ASSOC)['count'];

if ($totalBefore == 0) {
    echo "<div class='success'>🎉 All movies have complete metadata!</div>";
    echo "<p><a href='/' style='color: #4caf50; font-weight: bold;'>Return to CineShelf</a></p>";
    exit;
}

// Show initial count
echo "<div class='stats-box'>";
echo "<strong>📊 Movies to process: $totalBefore</strong>";
$percentDone = 0;
if ($totalBefore < 66) {
    $percentDone = round(((66 - $totalBefore) / 66) * 100);
}
echo "<div class='progress'><div class='progress-bar' style='width: {$percentDone}%'>{$percentDone}% Complete</div></div>";
echo "</div>";

echo "<h2>Processing Batch...</h2>";

// Process 5 at a time (smaller batches to avoid timeouts)
$selectQuery = "
    SELECT id, tmdb_id, title, media_type 
    FROM movies 
    WHERE tmdb_id NOT LIKE 'unresolved_%' 
    AND (director IS NULL OR director = '' OR certification IS NULL OR certification = '')
    LIMIT 5
";

$stmt = $db->query($selectQuery);
$processed = 0;
$updated = 0;
$failed = 0;

while ($movie = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $processed++;
    
    $movieId = $movie['id'];
    $tmdbId = $movie['tmdb_id'];
    $mediaType = $movie['media_type'] ?? 'movie';
    $title = htmlspecialchars($movie['title']);
    
    echo "<div class='movie-item'>";
    echo "<strong>$processed.</strong> $title ";
    
    // Fetch from TMDB
    $endpoint = $mediaType === 'tv' ? '/tv/' : '/movie/';
    $url = "https://api.themoviedb.org/3" . $endpoint . $tmdbId . "?api_key=8039283176a74ffd71a1658c6f84a051&append_to_response=release_dates,content_ratings,credits";
    
    $context = stream_context_create(['http' => ['timeout' => 10]]);
    $response = @file_get_contents($url, false, $context);
    
    if ($response === false) {
        echo "<span class='error'>❌ API Failed</span>";
        $failed++;
    } else {
        $data = json_decode($response, true);
        
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
            SET director = COALESCE(?, director), 
                certification = COALESCE(?, certification)
            WHERE id = ?
        ");
        
        $updateStmt->execute([
            $director,
            $certification,
            $movieId
        ]);
        
        echo "<span class='success'>✅</span>";
        if ($director) echo " Dir: " . htmlspecialchars($director);
        if ($certification) echo " | $certification";
        if (!$director && !$certification) echo " (none found)";
        
        $updated++;
        
        usleep(300000); // 0.3 second delay
    }
    
    echo "</div>";
}

$stmt = null;

// Show results
$remaining = $totalBefore - $processed;

echo "<br><div class='stats-box'>";
echo "<div class='success'>✅ Processed: $processed movies</div>";
if ($failed > 0) {
    echo "<div class='error'>❌ Failed: $failed movies</div>";
}

if ($remaining > 0) {
    echo "<br><div class='info'>⏳ Remaining: $remaining movies</div>";
    echo "<p><strong>Auto-refreshing in 2 seconds...</strong></p>";
    echo "<meta http-equiv='refresh' content='2'>";
} else {
    echo "<br><div class='success' style='font-size: 1.5em;'>🎉 ALL MOVIES UPDATED!</div>";
    echo "<p>You can now:</p>";
    echo "<ul>";
    echo "<li>Delete this script</li>";
    echo "<li><a href='/' style='color: #4caf50; font-weight: bold;'>Return to CineShelf</a></li>";
    echo "<li>Hard refresh (Ctrl+Shift+R) to see the changes</li>";
    echo "</ul>";
}
echo "</div>";

echo "</body></html>";
?>
