<?php
// COMPREHENSIVE METADATA FILL - Gets director/certification for ALL movies
require_once __DIR__ . '/../../config/config.php';

set_time_limit(0); // No timeout — let it run to completion
$db = getDb();

// Accept certification region from query string (default US)
$certRegion = preg_replace('/[^A-Z\-]/', '', strtoupper($_GET['cert_region'] ?? 'US'));
$tmdbCertCountry = $certRegion === 'CA-QC' ? 'CA' : $certRegion;
$forceAll = isset($_GET['force']) && $_GET['force'] === '1';

// Count movies to process
if ($forceAll) {
    $countQuery = "
        SELECT COUNT(*) as count
        FROM movies
        WHERE tmdb_id NOT LIKE 'unresolved_%'
    ";
} else {
    $countQuery = "
        SELECT COUNT(*) as count
        FROM movies
        WHERE tmdb_id NOT LIKE 'unresolved_%'
        AND (director IS NULL OR director = '' OR certification IS NULL OR certification = '')
    ";
}
$total = $db->query($countQuery)->fetch(PDO::FETCH_ASSOC)['count'];

echo "<!DOCTYPE html><html><head><style>
body { font-family: Arial; padding: 20px; background: #0f0f0f; color: white; }
.success { color: #4caf50; font-weight: bold; }
.error { color: #ef4444; font-weight: bold; }
.info { color: #3b82f6; }
.movie-item {
    margin: 6px 0;
    padding: 10px 12px;
    background: rgba(255,255,255,0.05);
    border-radius: 5px;
    border-left: 3px solid #4caf50;
    font-size: 14px;
}
.movie-item.fail { border-left-color: #ef4444; }
.stats-box {
    padding: 20px;
    background: rgba(102, 126, 234, 0.2);
    border-radius: 10px;
    margin: 20px 0;
}
.progress-bar-container {
    width: 100%;
    background: rgba(255,255,255,0.1);
    border-radius: 8px;
    overflow: hidden;
    margin: 12px 0;
    height: 28px;
    position: relative;
}
.progress-bar {
    height: 100%;
    background: linear-gradient(135deg, #667eea, #764ba2);
    border-radius: 8px;
    transition: width 0.3s;
}
.progress-text {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: bold;
}
#logBox {
    max-height: 60vh;
    overflow-y: auto;
    padding: 8px;
    background: rgba(0,0,0,0.3);
    border-radius: 8px;
    margin-top: 12px;
}
.back-btn { display: inline-block; padding: 8px 16px; background: #4a9eff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
.back-btn:hover { background: #6bb0ff; }
</style></head><body>
<a href='../index.html' class='back-btn'>← Back to Admin Panel</a>
";

$modeLabel = $forceAll ? 'Re-fetch ALL' : 'Fill Missing';
echo "<h1>🔧 $modeLabel Director & Certification</h1>";
echo "<p class='info'>Region: <strong>$certRegion</strong>" . ($forceAll ? " — <strong>Force mode: re-fetching all titles</strong>" : "") . "</p>";

echo "<div class='stats-box'>";
$countLabel = $forceAll ? 'Total movies to re-fetch' : 'Movies needing director/certification';
echo "<strong>📊 $countLabel: $total</strong>";
if ($total > 0) {
    echo "<div class='progress-bar-container'><div class='progress-bar' id='pbar' style='width:0%'></div><div class='progress-text' id='ptxt'>0 / $total</div></div>";
    echo "<div id='statusLine' class='info'>Starting...</div>";
}
echo "</div>";

if ($total == 0) {
    echo "<div class='success'>🎉 All movies have complete metadata!</div>";
    $currentUrl = "?cert_region=" . urlencode($certRegion) . "&force=1";
    echo "<div style='margin-top:15px;'><a href='$currentUrl' class='back-btn' style='background:#e67e22;'>🔄 Re-fetch All Titles</a></div>";
    echo "</body></html>";
    exit;
}

echo "<div id='logBox'>";

// Flush helper — pushes output to browser immediately
function flushNow() {
    if (ob_get_level()) ob_end_flush();
    flush();
}

// Process movies
if ($forceAll) {
    $selectQuery = "
        SELECT id, tmdb_id, title, media_type
        FROM movies
        WHERE tmdb_id NOT LIKE 'unresolved_%'
    ";
} else {
    $selectQuery = "
        SELECT id, tmdb_id, title, media_type
        FROM movies
        WHERE tmdb_id NOT LIKE 'unresolved_%'
        AND (director IS NULL OR director = '' OR certification IS NULL OR certification = '')
    ";
}

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

    // Fetch from TMDB
    $endpoint = $mediaType === 'tv' ? '/tv/' : '/movie/';
    $url = "https://api.themoviedb.org/3" . $endpoint . $tmdbId . "?api_key=8039283176a74ffd71a1658c6f84a051&append_to_response=release_dates,content_ratings,credits";

    $context = stream_context_create(['http' => ['timeout' => 10]]);
    $response = @file_get_contents($url, false, $context);

    if ($response === false) {
        echo "<div class='movie-item fail'><strong>$processed.</strong> $title <span class='error'>❌ API Failed</span></div>";
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

        // Get certification for preferred region (fallback to US)
        $certification = null;
        if ($mediaType === 'tv' && isset($data['content_ratings']['results'])) {
            foreach ($data['content_ratings']['results'] as $rating) {
                if ($rating['iso_3166_1'] === $tmdbCertCountry) {
                    $certification = $rating['rating'];
                    break;
                }
            }
            if ($certification === null && $tmdbCertCountry !== 'US') {
                foreach ($data['content_ratings']['results'] as $rating) {
                    if ($rating['iso_3166_1'] === 'US') {
                        $certification = $rating['rating'];
                        break;
                    }
                }
            }
        } elseif (isset($data['release_dates']['results'])) {
            foreach ($data['release_dates']['results'] as $release) {
                if ($release['iso_3166_1'] === $tmdbCertCountry) {
                    foreach ($release['release_dates'] as $date) {
                        if (!empty($date['certification'])) {
                            $certification = $date['certification'];
                            break 2;
                        }
                    }
                }
            }
            if ($certification === null && $tmdbCertCountry !== 'US') {
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
        }

        // Update database
        $updateStmt = $db->prepare("
            UPDATE movies
            SET director = ?, certification = ?
            WHERE id = ?
        ");

        $updateStmt->execute([
            $director,
            $certification,
            $movieId
        ]);

        $details = '';
        if ($director) $details .= 'Dir: ' . htmlspecialchars($director);
        if ($certification) $details .= ($details ? ' | ' : '') . $certification;
        if (!$director && !$certification) $details = 'none found';

        echo "<div class='movie-item'><strong>$processed.</strong> $title <span class='success'>✅</span> <span style='opacity:0.6;font-size:12px;'>$details</span></div>";
        $updated++;
    }

    // Update progress bar
    $pct = round(($processed / $total) * 100);
    echo "<script>
      document.getElementById('pbar').style.width='${pct}%';
      document.getElementById('ptxt').textContent='$processed / $total';
      document.getElementById('statusLine').textContent='Processing... $processed of $total ($pct%)';
      document.getElementById('logBox').scrollTop=document.getElementById('logBox').scrollHeight;
    </script>";
    flushNow();

    // 300ms delay between API calls to be respectful to TMDB
    usleep(300000);
}

$stmt = null;

echo "</div>"; // close logBox

echo "<div class='stats-box'>";
echo "<div class='success'>🎉 Done! Updated: $updated movies</div>";
if ($failed > 0) {
    echo "<div class='error'>❌ Failed: $failed movies</div>";
}
$refetchUrl = "?cert_region=" . urlencode($certRegion) . "&force=1";
$missingUrl = "?cert_region=" . urlencode($certRegion);
echo "<div style='margin-top:15px;'>";
echo "<a href='$refetchUrl' class='back-btn' style='background:#e67e22;'>🔄 Re-fetch All Titles</a> ";
echo "<a href='$missingUrl' class='back-btn' style='background:#4caf50;'>🔍 Run Again (Missing Only)</a>";
echo "</div>";
echo "</div>";

// Final progress update
echo "<script>
  document.getElementById('pbar').style.width='100%';
  document.getElementById('ptxt').textContent='$processed / $total — Complete!';
  document.getElementById('statusLine').textContent='✅ Finished! $updated updated, $failed failed.';
</script>";

echo "</body></html>";
?>
