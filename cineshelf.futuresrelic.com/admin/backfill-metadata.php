<?php
// Admin tool to backfill missing metadata (actors, studio, director) for existing movies
// This fetches data from TMDB for all movies missing these fields

session_start();

// Database connection
function getDB() {
    $dbPath = __DIR__ . '/../data/cineshelf.sqlite';
    try {
        $db = new PDO('sqlite:' . $dbPath);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $db;
    } catch (PDOException $e) {
        die(json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]));
    }
}

// Check if user is admin (simple session check)
function isAdmin() {
    if (!isset($_SESSION['user_id'])) {
        return false;
    }

    $db = getDB();
    $stmt = $db->prepare("SELECT is_admin FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    return $user && $user['is_admin'] == 1;
}

// TMDB API Configuration
define('TMDB_API_KEY', getenv('TMDB_API_KEY') ?: '3c278a1f8d50d2ac3a36b7774545b3e1');
define('TMDB_BASE_URL', 'https://api.themoviedb.org/3');

// Get action
$action = $_GET['action'] ?? 'show_form';

// For AJAX requests, check admin and return JSON
if ($action !== 'show_form') {
    header('Content-Type: application/json');

    if (!isAdmin()) {
        echo json_encode(['error' => 'Admin access required']);
        exit;
    }
}

if ($action === 'show_form') {
    // For form display, just check if logged in
    if (!isAdmin()) {
        die('<h1>Admin Access Required</h1><p>Please <a href="/">login to CineShelf</a> first, then return to this page.</p>');
    }
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Backfill Movie Metadata - CineShelf Admin</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 2rem;
            color: white;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 2rem;
            backdrop-filter: blur(10px);
        }

        h1 {
            font-size: 2rem;
            margin-bottom: 0.5rem;
        }

        .subtitle {
            color: rgba(255, 255, 255, 0.8);
            margin-bottom: 2rem;
            line-height: 1.6;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .stat-card {
            background: rgba(255, 255, 255, 0.15);
            border-radius: 12px;
            padding: 1.5rem;
            text-align: center;
        }

        .stat-value {
            font-size: 2.5rem;
            font-weight: bold;
            margin-bottom: 0.5rem;
        }

        .stat-label {
            font-size: 0.9rem;
            color: rgba(255, 255, 255, 0.8);
        }

        .btn {
            background: rgba(255, 255, 255, 0.2);
            border: 2px solid white;
            color: white;
            padding: 1rem 2rem;
            border-radius: 8px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            display: inline-block;
            text-decoration: none;
        }

        .btn:hover {
            background: white;
            color: #667eea;
            transform: translateY(-2px);
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .warning {
            background: rgba(255, 193, 7, 0.2);
            border-left: 4px solid #ffc107;
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 2rem;
        }

        .warning-title {
            font-weight: bold;
            margin-bottom: 0.5rem;
        }

        .progress-container {
            background: rgba(255, 255, 255, 0.15);
            border-radius: 12px;
            padding: 2rem;
            margin-top: 2rem;
            display: none;
        }

        .progress-bar {
            width: 100%;
            height: 30px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 15px;
            overflow: hidden;
            margin-bottom: 1rem;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4caf50, #8bc34a);
            transition: width 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        }

        .log {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 8px;
            padding: 1rem;
            max-height: 300px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.9rem;
        }

        .log-entry {
            margin-bottom: 0.5rem;
        }

        .log-entry.success { color: #4caf50; }
        .log-entry.error { color: #f44336; }
        .log-entry.info { color: #2196f3; }

        .back-link {
            display: inline-block;
            margin-bottom: 1rem;
            color: white;
            text-decoration: none;
            opacity: 0.8;
        }

        .back-link:hover {
            opacity: 1;
        }

        #resultsSection {
            display: none;
            margin-top: 2rem;
        }

        .result-summary {
            background: rgba(76, 175, 80, 0.2);
            border-left: 4px solid #4caf50;
            padding: 1rem;
            border-radius: 8px;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/admin/" class="back-link">← Back to Admin Panel</a>

        <h1>🔄 Backfill Movie Metadata</h1>
        <p class="subtitle">
            This tool will fetch missing metadata (actors, studio, director) from TMDB for all movies in your collection.
            This process may take several minutes depending on how many movies need updating.
        </p>

        <div class="stats-grid" id="statsGrid">
            <div class="stat-card">
                <div class="stat-value" id="totalMovies">...</div>
                <div class="stat-label">Total Movies</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="missingMetadata">...</div>
                <div class="stat-label">Missing Metadata</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="estimatedTime">...</div>
                <div class="stat-label">Est. Time</div>
            </div>
        </div>

        <div class="warning">
            <div class="warning-title">⚠️ Important Notes:</div>
            <ul style="margin-left: 1.5rem; line-height: 1.8;">
                <li>This will update all movies missing actors, studio, or director information</li>
                <li>It makes API calls to TMDB (rate limited to 40 requests/10 seconds)</li>
                <li>The process runs in batches to avoid timeouts</li>
                <li>You can safely close this page - the process will continue</li>
                <li>Already complete metadata will NOT be overwritten</li>
            </ul>
        </div>

        <button class="btn" id="startBtn" onclick="startBackfill()">
            🚀 Start Backfill Process
        </button>

        <div class="progress-container" id="progressContainer">
            <h3 style="margin-bottom: 1rem;">Processing Movies...</h3>
            <div class="progress-bar">
                <div class="progress-fill" id="progressFill" style="width: 0%">0%</div>
            </div>
            <div class="log" id="logContainer"></div>
        </div>

        <div id="resultsSection">
            <h3 style="margin-bottom: 1rem;">✅ Backfill Complete!</h3>
            <div class="result-summary" id="resultSummary"></div>
        </div>
    </div>

    <script>
        let totalToProcess = 0;
        let processed = 0;
        let updated = 0;
        let skipped = 0;
        let errors = 0;

        // Load initial stats
        async function loadStats() {
            try {
                const response = await fetch('?action=get_stats');
                const data = await response.json();

                if (data.error) {
                    alert('Error: ' + data.error);
                    return;
                }

                document.getElementById('totalMovies').textContent = data.total;
                document.getElementById('missingMetadata').textContent = data.missing;
                document.getElementById('estimatedTime').textContent = data.estimated_time;

                totalToProcess = data.missing;
            } catch (error) {
                console.error('Failed to load stats:', error);
                alert('Failed to load stats: ' + error.message);
            }
        }

        async function startBackfill() {
            const startBtn = document.getElementById('startBtn');
            startBtn.disabled = true;
            startBtn.textContent = '⏳ Processing...';

            document.getElementById('progressContainer').style.display = 'block';

            addLog('Starting backfill process...', 'info');

            // Process in batches
            let offset = 0;
            const batchSize = 10;

            while (offset < totalToProcess) {
                try {
                    const response = await fetch(`?action=process_batch&offset=${offset}&limit=${batchSize}`);
                    const result = await response.json();

                    if (result.error) {
                        addLog('Error: ' + result.error, 'error');
                        break;
                    }

                    if (result.success) {
                        processed += result.processed;
                        updated += result.updated;
                        skipped += result.skipped;
                        errors += result.errors;

                        // Update progress
                        const percent = Math.round((processed / totalToProcess) * 100);
                        document.getElementById('progressFill').style.width = percent + '%';
                        document.getElementById('progressFill').textContent = percent + '%';

                        // Add logs
                        result.logs.forEach(log => {
                            addLog(log.message, log.type);
                        });

                        offset += batchSize;

                        // Small delay to avoid rate limits
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    if (result.completed) {
                        showResults();
                        break;
                    }
                } catch (error) {
                    addLog('Network error: ' + error.message, 'error');
                    break;
                }
            }
        }

        function addLog(message, type = 'info') {
            const logContainer = document.getElementById('logContainer');
            const entry = document.createElement('div');
            entry.className = 'log-entry ' + type;
            entry.textContent = new Date().toLocaleTimeString() + ' - ' + message;
            logContainer.appendChild(entry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }

        function showResults() {
            document.getElementById('progressContainer').style.display = 'none';
            document.getElementById('resultsSection').style.display = 'block';

            document.getElementById('resultSummary').innerHTML = `
                <p><strong>Total Processed:</strong> ${processed} movies</p>
                <p><strong>Updated:</strong> ${updated} movies</p>
                <p><strong>Skipped:</strong> ${skipped} movies (already had complete metadata)</p>
                <p><strong>Errors:</strong> ${errors} movies</p>
                <p style="margin-top: 1rem;">
                    The filter dropdowns should now show directors, actors, and studios!
                    <a href="/" style="color: white; text-decoration: underline;">Go to CineShelf</a>
                </p>
            `;
        }

        // Load stats on page load
        loadStats();
    </script>
</body>
</html>
<?php
    exit;
}

// Get stats about movies needing metadata
if ($action === 'get_stats') {
    try {
        $db = getDB();

        // Count total movies
        $stmt = $db->query("SELECT COUNT(*) as total FROM movies");
        $total = $stmt->fetchColumn();

        // Count movies missing actors OR studio OR director
        $stmt = $db->query("
            SELECT COUNT(*) as missing
            FROM movies
            WHERE actors IS NULL OR actors = ''
               OR studio IS NULL OR studio = ''
               OR director IS NULL OR director = ''
        ");
        $missing = $stmt->fetchColumn();

        // Estimate time (roughly 0.25 seconds per movie due to rate limiting)
        $estimatedSeconds = $missing * 0.25;
        $estimatedMinutes = ceil($estimatedSeconds / 60);
        $estimatedTime = $estimatedMinutes > 1 ? "$estimatedMinutes min" : "< 1 min";

        echo json_encode([
            'total' => $total,
            'missing' => $missing,
            'estimated_time' => $estimatedTime
        ]);
    } catch (Exception $e) {
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

// Process a batch of movies
if ($action === 'process_batch') {
    $offset = intval($_GET['offset'] ?? 0);
    $limit = intval($_GET['limit'] ?? 10);

    try {
        $db = getDB();

        // Get movies missing metadata
        $stmt = $db->prepare("
            SELECT id, tmdb_id, title, year, media_type, actors, studio, director
            FROM movies
            WHERE actors IS NULL OR actors = ''
               OR studio IS NULL OR studio = ''
               OR director IS NULL OR director = ''
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([$limit, $offset]);
        $movies = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $logs = [];
        $updated = 0;
        $skipped = 0;
        $errors = 0;

        foreach ($movies as $movie) {
            try {
                // Check if this movie actually needs updating
                $needsUpdate = empty($movie['actors']) || empty($movie['studio']) || empty($movie['director']);

                if (!$needsUpdate) {
                    $skipped++;
                    continue;
                }

                // Fetch from TMDB
                $endpoint = $movie['media_type'] === 'tv' ? '/tv/' : '/movie/';
                $url = TMDB_BASE_URL . $endpoint . $movie['tmdb_id'] . '?api_key=' . TMDB_API_KEY . '&append_to_response=credits,release_dates';

                $ch = curl_init($url);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 10);
                $response = curl_exec($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);

                if ($httpCode !== 200) {
                    // For 404s, mark the movie as processed so we don't retry it
                    if ($httpCode === 404) {
                        // Set metadata to "N/A" so it won't be counted as missing anymore
                        $stmt = $db->prepare("UPDATE movies SET actors = ?, studio = ?, director = ? WHERE id = ?");
                        $stmt->execute(['N/A', 'N/A', $movie['director'] ?: 'N/A', $movie['id']]);
                        $skipped++;
                        $logs[] = ['message' => "Skipped: {$movie['title']} (not found in TMDB)", 'type' => 'info'];
                    } else {
                        $errors++;
                        $logs[] = ['message' => "Failed to fetch: {$movie['title']} (HTTP $httpCode)", 'type' => 'error'];
                    }
                    continue;
                }

                $data = json_decode($response, true);

                // Extract metadata
                $updateData = [];

                // Director (only if missing)
                if (empty($movie['director']) && !empty($data['credits']['crew'])) {
                    foreach ($data['credits']['crew'] as $person) {
                        if ($person['job'] === 'Director') {
                            $updateData['director'] = $person['name'];
                            break;
                        }
                    }
                }

                // Actors (only if missing)
                if (empty($movie['actors']) && !empty($data['credits']['cast'])) {
                    $topActors = array_slice($data['credits']['cast'], 0, 5);
                    $actorNames = array_column($topActors, 'name');
                    $updateData['actors'] = implode(', ', $actorNames);
                }

                // Studio (only if missing)
                if (empty($movie['studio']) && !empty($data['production_companies'])) {
                    $updateData['studio'] = $data['production_companies'][0]['name'];
                }

                // Update database if we got any new data
                if (!empty($updateData)) {
                    $setParts = [];
                    $params = [];
                    foreach ($updateData as $key => $value) {
                        $setParts[] = "$key = ?";
                        $params[] = $value;
                    }
                    $params[] = $movie['id'];

                    $sql = "UPDATE movies SET " . implode(', ', $setParts) . " WHERE id = ?";
                    $stmt = $db->prepare($sql);
                    $stmt->execute($params);

                    $updated++;
                    $logs[] = ['message' => "✓ Updated: {$movie['title']}", 'type' => 'success'];
                } else {
                    $skipped++;
                    $logs[] = ['message' => "Skipped: {$movie['title']} (no new data from TMDB)", 'type' => 'info'];
                }

            } catch (Exception $e) {
                $errors++;
                $logs[] = ['message' => "Error processing {$movie['title']}: {$e->getMessage()}", 'type' => 'error'];
            }
        }

        // Check if completed
        $stmt = $db->query("
            SELECT COUNT(*) as remaining
            FROM movies
            WHERE actors IS NULL OR actors = ''
               OR studio IS NULL OR studio = ''
               OR director IS NULL OR director = ''
        ");
        $remaining = $stmt->fetchColumn();

        echo json_encode([
            'success' => true,
            'processed' => count($movies),
            'updated' => $updated,
            'skipped' => $skipped,
            'errors' => $errors,
            'logs' => $logs,
            'completed' => $remaining === 0
        ]);

    } catch (Exception $e) {
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
    exit;
}
