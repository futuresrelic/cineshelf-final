<?php
/**
 * Fix Unknown Titles v2 - Better debugging and detection
 */
require_once __DIR__ . '/../../config/config.php';

// Password protect
$password = 'indeed'; // CHANGE THIS!
if (!isset($_GET['pass']) || $_GET['pass'] !== $password) {
    die('Access denied. Use: fix-unknown-titles-v2.php?pass=your_password');
}

set_time_limit(600); // 10 minutes max

try {
    $db = getDb();
    
    echo "<style>
        body { font-family: monospace; background: #1a1a1a; color: #fff; padding: 20px; line-height: 1.6; }
        .success { color: #4caf50; }
        .error { color: #f44336; }
        .info { color: #2196f3; }
        .warning { color: #ff9800; }
        .fixed { background: #1b4d1b; padding: 5px; margin: 5px 0; border-left: 3px solid #4caf50; }
        pre { background: #2a2a2a; padding: 10px; border-radius: 4px; overflow-x: auto; }
            .back-btn { display: inline-block; padding: 8px 16px; background: #4a9eff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .back-btn:hover { background: #6bb0ff; }
    </style>";
    
    echo "<a href='../index.html' class='back-btn'>← Back to Admin Panel</a><h1>🔧 Fix Unknown Titles v2</h1>";
    echo "<p>Searching for movies with valid TMDB IDs but missing data...</p>";
    echo "<hr>";
    
    // STEP 1: Find all candidates
    echo "<h2>🔍 Step 1: Finding Candidates</h2>";
    
    // Try multiple methods to find movies
    $queries = [
        'Unknown title' => "SELECT id, tmdb_id, title, media_type FROM movies WHERE title = 'Unknown' AND tmdb_id NOT LIKE 'unresolved_%' ORDER BY id",
        'NULL title' => "SELECT id, tmdb_id, title, media_type FROM movies WHERE title IS NULL AND tmdb_id NOT LIKE 'unresolved_%' ORDER BY id",
        'Empty title' => "SELECT id, tmdb_id, title, media_type FROM movies WHERE (title = '' OR TRIM(title) = '') AND tmdb_id NOT LIKE 'unresolved_%' ORDER BY id",
        'Has poster but Unknown' => "SELECT id, tmdb_id, title, media_type FROM movies WHERE title = 'Unknown' AND poster_url IS NOT NULL AND tmdb_id NOT LIKE 'unresolved_%' ORDER BY id"
    ];
    
    $allMovies = [];
    $movieIds = [];
    
    foreach ($queries as $label => $sql) {
        $stmt = $db->query($sql);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo "<div class='info'>📋 {$label}: Found <strong>" . count($results) . "</strong> movies</div>";
        
        foreach ($results as $row) {
            if (!in_array($row['id'], $movieIds)) {
                $allMovies[] = $row;
                $movieIds[] = $row['id'];
            }
        }
    }
    
    echo "<hr>";
    echo "<h2>📊 Total Found: <strong>" . count($allMovies) . "</strong> movies to fix</h2>";
    
    if (count($allMovies) === 0) {
        echo "<div class='success'>✅ All movies already have titles!</div>";
        echo "<p><a href='/'>← Back to CineShelf</a></p>";
        exit;
    }
    
    echo "<hr>";
    echo "<h2>🔧 Step 2: Fetching Data from TMDB</h2>";
    echo "<p class='warning'>This may take a few minutes...</p>";
    
    $fixed = 0;
    $failed = 0;
    $skipped = 0;
    
    foreach ($allMovies as $movie) {
        $tmdbId = $movie['tmdb_id'];
        $movieId = $movie['id'];
        $mediaType = $movie['media_type'] ?: 'movie';
        
        // Skip if TMDB ID looks invalid
        if (!is_numeric($tmdbId) || intval($tmdbId) <= 0) {
            echo "<div class='warning'>⚠️ Skipping movie ID {$movieId} - Invalid TMDB ID: {$tmdbId}</div>";
            $skipped++;
            continue;
        }
        
        echo "<div class='info'>📡 Fetching TMDB ID {$tmdbId} (DB ID: {$movieId}, Type: {$mediaType})...</div>";
        
        try {
            // Fetch from TMDB
            if ($mediaType === 'tv') {
                $url = TMDB_BASE_URL . '/tv/' . $tmdbId . '?api_key=' . TMDB_API_KEY;
            } else {
                $url = TMDB_BASE_URL . '/movie/' . $tmdbId . '?api_key=' . TMDB_API_KEY;
            }
            
            $response = @file_get_contents($url);
            
            if ($response === false) {
                echo "<div class='error'>  ❌ Failed to connect to TMDB</div>";
                $failed++;
                continue;
            }
            
            $data = json_decode($response, true);
            
            if (!isset($data['id'])) {
                echo "<div class='error'>  ❌ Invalid response from TMDB</div>";
                $failed++;
                continue;
            }
            
            // Check for 404 or deleted content
            if (isset($data['success']) && $data['success'] === false) {
                echo "<div class='warning'>  ⚠️ Movie not found on TMDB (deleted/removed)</div>";
                $failed++;
                continue;
            }
            
            // Extract data based on media type
            if ($mediaType === 'tv') {
                $title = $data['name'] ?? 'Unknown';
                $year = isset($data['first_air_date']) ? intval(substr($data['first_air_date'], 0, 4)) : null;
                $runtime = isset($data['episode_run_time'][0]) ? $data['episode_run_time'][0] : null;
            } else {
                $title = $data['title'] ?? 'Unknown';
                $year = isset($data['release_date']) ? intval(substr($data['release_date'], 0, 4)) : null;
                $runtime = $data['runtime'] ?? null;
            }
            
            $genres = implode(', ', array_column($data['genres'] ?? [], 'name'));
            
            // Update database
            $updateStmt = $db->prepare("
                UPDATE movies SET
                    imdb_id = ?,
                    title = ?,
                    year = ?,
                    poster_url = ?,
                    backdrop_url = ?,
                    overview = ?,
                    rating = ?,
                    runtime = ?,
                    genre = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ");
            
            $updateStmt->execute([
                $data['imdb_id'] ?? null,
                $title,
                $year,
                isset($data['poster_path']) ? TMDB_IMAGE_BASE . $data['poster_path'] : null,
                isset($data['backdrop_path']) ? TMDB_IMAGE_BASE . $data['backdrop_path'] : null,
                $data['overview'] ?? null,
                $data['vote_average'] ?? null,
                $runtime,
                $genres,
                $movieId
            ]);
            
            echo "<div class='fixed success'>  ✅ Fixed: <strong>{$title}</strong> ({$year}) - {$genres}</div>";
            $fixed++;
            
            // Rate limiting - be nice to TMDB API
            usleep(250000); // 0.25 second delay
            
        } catch (Exception $e) {
            echo "<div class='error'>  ❌ Error: " . htmlspecialchars($e->getMessage()) . "</div>";
            $failed++;
        }
        
        flush();
        ob_flush();
    }
    
    echo "<hr>";
    echo "<h2>📊 Final Summary</h2>";
    echo "<div class='success'>✅ Successfully Fixed: <strong>{$fixed}</strong> movies</div>";
    echo "<div class='error'>❌ Failed: <strong>{$failed}</strong> movies</div>";
    echo "<div class='warning'>⚠️ Skipped: <strong>{$skipped}</strong> movies</div>";
    echo "<hr>";
    echo "<p><a href='/'>← Back to CineShelf</a> | <a href='clean-database.php?pass={$password}&action=view'>→ Clean Database</a></p>";
    
} catch (Exception $e) {
    echo "<pre style='color: red;'>Error: " . htmlspecialchars($e->getMessage()) . "</pre>";
}
?>
