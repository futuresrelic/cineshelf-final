<?php
/**
 * Spine Color Review — CineShelf Admin
 * Shows every movie with its stored spine_color next to the poster thumbnail
 * so you can instantly see if the extracted color matches the cover art.
 *
 * Also lets you re-run extraction for any single movie or wipe all stored
 * colors so the backfill can start fresh with the improved algorithm.
 */
session_start();

function getDB() {
    $dbPath = __DIR__ . '/../data/cineshelf.sqlite';
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    return $db;
}

function isAdmin() {
    if (!isset($_SESSION['user_id'])) return false;
    $db = getDB();
    $stmt = $db->prepare("SELECT is_admin FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    return $user && $user['is_admin'] == 1;
}

/**
 * Improved color extraction: instead of a pixel average (which produces muddy
 * grey tones), we bucket pixels by hue into 12 segments, find the most
 * populated saturated bucket, then return the vivid representative color.
 * Falls back to the weighted average only when no saturated color is found.
 */
function extractDominantColor($url) {
    if (empty($url)) return null;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 12,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT      => 'CineShelf/1.0',
        CURLOPT_HTTPHEADER     => ['Accept: image/*'],
    ]);
    $imageData = curl_exec($ch);
    $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if (!$imageData || $httpCode !== 200) return null;

    $img = @imagecreatefromstring($imageData);
    if (!$img) return null;

    // Resample to 60×90 for a bit more detail
    $thumb = imagecreatetruecolor(60, 90);
    imagecopyresampled($thumb, $img, 0, 0, 0, 0, 60, 90, imagesx($img), imagesy($img));
    imagedestroy($img);

    // Bucket pixels by hue (12 buckets × 30°), tracking total saturation weight
    $hueBuckets = array_fill(0, 12, ['r' => 0, 'g' => 0, 'b' => 0, 'weight' => 0.0]);
    $fallbackR = $fallbackG = $fallbackB = $fallbackCount = 0;

    for ($y = 0; $y < 90; $y++) {
        for ($x = 0; $x < 60; $x++) {
            $pixel = imagecolorat($thumb, $x, $y);
            $r = ($pixel >> 16) & 0xFF;
            $g = ($pixel >>  8) & 0xFF;
            $b =  $pixel        & 0xFF;

            // Skip near-black and near-white (they dominate averages but look bad)
            $brightness = ($r + $g + $b) / 3;
            if ($brightness < 25 || $brightness > 235) continue;

            $max = max($r, $g, $b);
            $min = min($r, $g, $b);
            $delta = $max - $min;
            $saturation = ($max === 0) ? 0 : $delta / $max;

            // Weight by saturation squared — vivid pixels count more
            $weight = $saturation * $saturation + 0.05; // +0.05 so even gray pixels contribute a little

            // Compute hue 0–360
            if ($delta === 0) {
                $hue = 0;
            } elseif ($max === $r) {
                $hue = 60 * fmod(($g - $b) / $delta, 6);
            } elseif ($max === $g) {
                $hue = 60 * (($b - $r) / $delta + 2);
            } else {
                $hue = 60 * (($r - $g) / $delta + 4);
            }
            if ($hue < 0) $hue += 360;

            $bucket = (int)floor($hue / 30) % 12;
            $hueBuckets[$bucket]['r']      += $r * $weight;
            $hueBuckets[$bucket]['g']      += $g * $weight;
            $hueBuckets[$bucket]['b']      += $b * $weight;
            $hueBuckets[$bucket]['weight'] += $weight;

            $fallbackR += $r; $fallbackG += $g; $fallbackB += $b; $fallbackCount++;
        }
    }
    imagedestroy($thumb);

    // Find the bucket with the most weight
    $bestBucket = 0;
    $bestWeight = -1;
    foreach ($hueBuckets as $i => $bucket) {
        if ($bucket['weight'] > $bestWeight) {
            $bestWeight = $bucket['weight'];
            $bestBucket = $i;
        }
    }

    if ($bestWeight > 0) {
        $w = $hueBuckets[$bestBucket]['weight'];
        $r = (int)round($hueBuckets[$bestBucket]['r'] / $w);
        $g = (int)round($hueBuckets[$bestBucket]['g'] / $w);
        $b = (int)round($hueBuckets[$bestBucket]['b'] / $w);

        // Boost saturation for vivid spine color
        $max = max($r, $g, $b);
        $min = min($r, $g, $b);
        if ($max - $min > 10) {
            $avg = ($r + $g + $b) / 3;
            $factor = 1.4;
            $r = min(255, max(0, (int)round($avg + ($r - $avg) * $factor)));
            $g = min(255, max(0, (int)round($avg + ($g - $avg) * $factor)));
            $b = min(255, max(0, (int)round($avg + ($b - $avg) * $factor)));
        }
        return sprintf('#%02x%02x%02x', $r, $g, $b);
    }

    // Fallback: simple average of non-black/white pixels
    if ($fallbackCount > 0) {
        return sprintf('#%02x%02x%02x',
            (int)round($fallbackR / $fallbackCount),
            (int)round($fallbackG / $fallbackCount),
            (int)round($fallbackB / $fallbackCount));
    }
    return null;
}

// ── JSON API actions ──────────────────────────────────────────────────────
$action = $_GET['action'] ?? 'page';

if ($action !== 'page') {
    header('Content-Type: application/json');
    if (!isAdmin()) { echo json_encode(['error' => 'Admin only']); exit; }

    $db = getDB();

    if ($action === 'get_movies') {
        $filter = $_GET['filter'] ?? 'all'; // all | with_color | without_color
        $where  = match($filter) {
            'with_color'    => "AND (spine_color IS NOT NULL AND spine_color != '')",
            'without_color' => "AND (spine_color IS NULL OR spine_color = '')",
            default         => ''
        };
        $stmt = $db->query("
            SELECT id, title, display_title, year, poster_url, spine_color
            FROM movies
            WHERE poster_url IS NOT NULL AND poster_url != ''
            $where
            ORDER BY COALESCE(display_title, title) ASC
        ");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        exit;
    }

    if ($action === 'reextract') {
        $movieId = intval($_GET['movie_id'] ?? 0);
        if (!$movieId) { echo json_encode(['error' => 'movie_id required']); exit; }
        $row = $db->query("SELECT id, title, poster_url FROM movies WHERE id = $movieId")->fetch(PDO::FETCH_ASSOC);
        if (!$row) { echo json_encode(['error' => 'Movie not found']); exit; }
        $color = extractDominantColor($row['poster_url']);
        if ($color) {
            $db->prepare("UPDATE movies SET spine_color = ? WHERE id = ?")->execute([$color, $movieId]);
            echo json_encode(['ok' => true, 'color' => $color, 'title' => $row['title']]);
        } else {
            echo json_encode(['ok' => false, 'error' => 'Extraction failed', 'title' => $row['title']]);
        }
        exit;
    }

    if ($action === 'reextract_batch') {
        $limit = min(20, intval($_GET['limit'] ?? 10));
        $filter = $_GET['filter'] ?? 'all'; // all | missing_only
        $where = ($filter === 'missing_only') ? "AND (spine_color IS NULL OR spine_color = '')" : '';
        $stmt = $db->query("
            SELECT id, title, poster_url FROM movies
            WHERE poster_url IS NOT NULL AND poster_url != '' $where
            ORDER BY id ASC LIMIT $limit
        ");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $results = [];
        foreach ($rows as $row) {
            $color = extractDominantColor($row['poster_url']);
            if ($color) {
                $db->prepare("UPDATE movies SET spine_color = ? WHERE id = ?")->execute([$color, $row['id']]);
                $results[] = ['id' => $row['id'], 'title' => $row['title'], 'color' => $color, 'ok' => true];
            } else {
                $results[] = ['id' => $row['id'], 'title' => $row['title'], 'ok' => false];
            }
        }
        $remaining = (int)$db->query("
            SELECT COUNT(*) FROM movies
            WHERE poster_url IS NOT NULL AND poster_url != '' $where
        ")->fetchColumn();
        echo json_encode(['results' => $results, 'remaining' => $remaining]);
        exit;
    }

    if ($action === 'wipe_all') {
        $db->exec("UPDATE movies SET spine_color = NULL");
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($action === 'stats') {
        $total     = (int)$db->query("SELECT COUNT(*) FROM movies")->fetchColumn();
        $withColor = (int)$db->query("SELECT COUNT(*) FROM movies WHERE spine_color IS NOT NULL AND spine_color != ''")->fetchColumn();
        $noPoster  = (int)$db->query("SELECT COUNT(*) FROM movies WHERE poster_url IS NULL OR poster_url = ''")->fetchColumn();
        echo json_encode(['total' => $total, 'with_color' => $withColor, 'no_poster' => $noPoster]);
        exit;
    }

    // ── Copy-level actions ────────────────────────────────────────────────
    if ($action === 'get_copies') {
        // Return all copies that have an edition cover OR any copy with a stored color
        $filter = $_GET['filter'] ?? 'all'; // all | with_edition_cover | with_color | without_color
        $where = match($filter) {
            'with_edition_cover' => "AND me.cover_image_url IS NOT NULL AND me.cover_image_url != ''",
            'with_color'         => "AND (c.spine_color IS NOT NULL AND c.spine_color != '')",
            'without_color'      => "AND (c.spine_color IS NULL OR c.spine_color = '')",
            default              => "AND (me.cover_image_url IS NOT NULL AND me.cover_image_url != '' OR c.spine_color IS NOT NULL AND c.spine_color != '')",
        };
        $stmt = $db->query("
            SELECT c.id as copy_id, c.format, c.edition, c.spine_color as copy_spine_color,
                   m.id as movie_id, m.title, m.display_title, m.year, m.poster_url, m.spine_color as movie_spine_color,
                   me.cover_image_url as edition_cover_url, me.name as edition_name
            FROM copies c
            JOIN movies m ON c.movie_id = m.id
            LEFT JOIN media_editions me ON c.edition_id = me.id
            WHERE 1=1 $where
            ORDER BY COALESCE(m.display_title, m.title) ASC, c.id ASC
        ");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        exit;
    }

    if ($action === 'reextract_copy') {
        $copyId = intval($_GET['copy_id'] ?? 0);
        $source = $_GET['source'] ?? 'edition'; // 'edition' | 'tmdb'
        if (!$copyId) { echo json_encode(['error' => 'copy_id required']); exit; }
        $row = $db->query("
            SELECT c.id as copy_id, c.movie_id, m.poster_url, me.cover_image_url as edition_cover_url
            FROM copies c
            JOIN movies m ON c.movie_id = m.id
            LEFT JOIN media_editions me ON c.edition_id = me.id
            WHERE c.id = $copyId
        ")->fetch(PDO::FETCH_ASSOC);
        if (!$row) { echo json_encode(['error' => 'Copy not found']); exit; }

        $url = ($source === 'edition' && !empty($row['edition_cover_url']))
            ? $row['edition_cover_url']
            : $row['poster_url'];
        $color = extractDominantColor($url);
        if ($color) {
            $db->prepare("UPDATE copies SET spine_color = ? WHERE id = ?")->execute([$color, $copyId]);
            echo json_encode(['ok' => true, 'color' => $color, 'copy_id' => $copyId, 'source_url' => $url]);
        } else {
            echo json_encode(['ok' => false, 'error' => 'Extraction failed', 'copy_id' => $copyId]);
        }
        exit;
    }

    if ($action === 'wipe_copy_colors') {
        $db->exec("UPDATE copies SET spine_color = NULL");
        echo json_encode(['ok' => true]);
        exit;
    }

    echo json_encode(['error' => 'Unknown action']);
    exit;
}

// ── HTML page ──────────────────────────────────────────────────────────────
if (!isAdmin()) {
    die('<h1 style="font-family:sans-serif;padding:2rem">Admin access required. <a href="/">Login first</a>.</h1>');
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Spine Color Review — CineShelf Admin</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1a1a2e;
    min-height: 100vh;
    color: #e0e0e0;
}
/* Tabs */
.tabs {
    display: flex;
    gap: 0;
    background: #16213e;
    border-bottom: 2px solid #2a2a4a;
    padding: 0 2rem;
}
.tab-btn {
    padding: 0.7rem 1.4rem;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    color: #999;
    font-size: 0.9rem;
    cursor: pointer;
    font-weight: 600;
    margin-bottom: -2px;
}
.tab-btn.active { color: #fff; border-bottom-color: #667eea; }
.tab-btn:hover { color: #fff; }
.tab-panel { display: none; }
.tab-panel.active { display: block; }
header {
    background: linear-gradient(135deg,#667eea,#764ba2);
    padding: 1.2rem 2rem;
    display: flex;
    align-items: center;
    gap: 1rem;
}
header h1 { font-size: 1.4rem; color: white; }
header a  { color: rgba(255,255,255,0.75); text-decoration: none; font-size: 0.9rem; }
header a:hover { color: white; }
.toolbar {
    background: #16213e;
    padding: 1rem 2rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    border-bottom: 1px solid #2a2a4a;
}
.stats { color: #aaa; font-size: 0.85rem; }
.stats strong { color: #fff; }
button {
    padding: 0.4rem 0.9rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
}
.btn-primary   { background: #667eea; color: #fff; }
.btn-success   { background: #27ae60; color: #fff; }
.btn-warning   { background: #e67e22; color: #fff; }
.btn-danger    { background: #c0392b; color: #fff; }
.btn-sm        { padding: 0.25rem 0.6rem; font-size: 0.75rem; }
button:disabled { opacity: 0.5; cursor: default; }
select {
    padding: 0.4rem 0.7rem;
    background: #2a2a4a;
    border: 1px solid #444;
    color: #eee;
    border-radius: 6px;
    font-size: 0.85rem;
}
.progress-bar-outer {
    background: #2a2a4a;
    border-radius: 8px;
    height: 8px;
    width: 200px;
    overflow: hidden;
    display: none;
}
.progress-bar-inner {
    background: #27ae60;
    height: 100%;
    width: 0%;
    transition: width 0.3s;
}
.progress-label { font-size: 0.8rem; color: #aaa; min-width: 80px; }

/* Grid */
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 0.75rem;
    padding: 1.5rem 2rem;
}
.card {
    background: #16213e;
    border-radius: 8px;
    overflow: hidden;
    border: 2px solid transparent;
    transition: border-color 0.2s, transform 0.15s;
    cursor: pointer;
}
.card:hover { border-color: #667eea; transform: translateY(-2px); }
.card .swatch {
    height: 8px;
    width: 100%;
}
.card img {
    width: 100%;
    aspect-ratio: 2/3;
    object-fit: cover;
    display: block;
    background: #2a2a4a;
}
.card .info {
    padding: 0.4rem 0.5rem 0.5rem;
}
.card .title {
    font-size: 0.7rem;
    color: #ccc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 0.25rem;
}
.card .hex {
    font-size: 0.65rem;
    color: #888;
    font-family: monospace;
    display: flex;
    align-items: center;
    gap: 0.3rem;
}
.card .hex .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
}
.card .no-color {
    font-size: 0.65rem;
    color: #666;
    font-style: italic;
}
.card .re-btn {
    margin-top: 0.3rem;
    width: 100%;
    padding: 0.2rem;
    font-size: 0.65rem;
    background: #2a2a4a;
    color: #aaa;
    border: 1px solid #444;
    border-radius: 4px;
    cursor: pointer;
}
.card .re-btn:hover { background: #667eea; color: white; border-color: #667eea; }
.loading { text-align: center; padding: 4rem; color: #666; font-size: 1.1rem; }
.empty   { text-align: center; padding: 4rem; color: #666; }

/* Legend row */
.legend {
    padding: 0.5rem 2rem;
    display: flex;
    gap: 1.5rem;
    font-size: 0.8rem;
    color: #999;
    background: #16213e;
    border-bottom: 1px solid #2a2a4a;
    flex-wrap: wrap;
    align-items: center;
}
.legend-item { display: flex; align-items: center; gap: 0.4rem; }
.legend-swatch { width: 20px; height: 8px; border-radius: 2px; }

/* Copy cards */
.copy-card {
    background: #16213e;
    border-radius: 8px;
    overflow: hidden;
    border: 2px solid transparent;
    transition: border-color 0.2s;
}
.copy-card:hover { border-color: #667eea; }
.copy-card .swatch { height: 8px; width: 100%; }
.copy-card .covers {
    display: flex;
    gap: 0;
}
.copy-card .cover-slot {
    flex: 1;
    position: relative;
}
.copy-card .cover-slot img {
    width: 100%;
    aspect-ratio: 2/3;
    object-fit: cover;
    display: block;
    background: #2a2a4a;
}
.copy-card .cover-slot .cover-label {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0,0,0,0.75);
    color: #ddd;
    font-size: 0.55rem;
    text-align: center;
    padding: 2px;
}
.copy-card .info { padding: 0.4rem 0.5rem 0.5rem; }
.copy-card .title { font-size: 0.7rem; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 0.2rem; }
.copy-card .sub   { font-size: 0.6rem; color: #888; margin-bottom: 0.25rem; }
.copy-card .hex   { font-size: 0.65rem; color: #888; font-family: monospace; display: flex; align-items: center; gap: 0.3rem; margin-bottom: 0.25rem; }
.copy-card .hex .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.copy-card .no-color { font-size: 0.65rem; color: #666; font-style: italic; margin-bottom: 0.25rem; }
.copy-card .source-row { display: flex; gap: 0.3rem; align-items: center; margin-top: 0.25rem; }
.copy-card .source-row select { flex: 1; padding: 0.2rem 0.3rem; font-size: 0.65rem; }
.copy-card .source-row button { padding: 0.2rem 0.4rem; font-size: 0.65rem; background: #667eea; color: #fff; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap; }
.copy-card .source-row button:hover { background: #556dcc; }

/* Batch log */
.batch-log {
    background: #0d0d1a;
    border: 1px solid #2a2a4a;
    border-radius: 6px;
    max-height: 120px;
    overflow-y: auto;
    padding: 0.5rem;
    font-size: 0.72rem;
    font-family: monospace;
    color: #aaa;
    margin: 0 2rem;
    display: none;
}
</style>
</head>
<body>
<header>
    <div>
        <a href="/admin/">← Admin Panel</a>
        <h1>🎨 Spine Color Review</h1>
    </div>
</header>

<div class="tabs">
    <button class="tab-btn active" onclick="switchTab('movies')">🎬 Movies (TMDB)</button>
    <button class="tab-btn" onclick="switchTab('copies')">📀 Copies (Edition Covers)</button>
</div>

<!-- ── MOVIES TAB ───────────────────────────────────────────── -->
<div class="tab-panel active" id="tab-movies">
<div class="toolbar">
    <div class="stats" id="stats">Loading…</div>
    <select id="filterSel" onchange="loadMovies()">
        <option value="all">All movies with poster</option>
        <option value="with_color">Has stored color</option>
        <option value="without_color">Missing color</option>
    </select>
    <button class="btn-success" onclick="startBatchReextract(false)" id="btnBatch">⚡ Re-extract All (improved algo)</button>
    <button class="btn-warning" onclick="startBatchReextract(true)" id="btnMissing">Fill Missing Only</button>
    <button class="btn-danger" onclick="wipeAll()" id="btnWipe">🗑 Wipe All Colors</button>
    <div class="progress-bar-outer" id="progressBar">
        <div class="progress-bar-inner" id="progressInner"></div>
    </div>
    <span class="progress-label" id="progressLabel"></span>
</div>

<div class="legend">
    <span>Color swatch at top of each card = stored spine color.</span>
    <span>Click any card to instantly re-extract that movie's color with the improved algorithm.</span>
    <div class="legend-item"><div class="legend-swatch" style="background:#667eea"></div>Default blue = no color stored or very muted result</div>
</div>

<div class="batch-log" id="batchLog"></div>
<div class="grid" id="grid"><div class="loading">Loading movies…</div></div>
</div><!-- /tab-movies -->

<!-- ── COPIES TAB ───────────────────────────────────────────── -->
<div class="tab-panel" id="tab-copies">
<div class="toolbar">
    <div class="stats" id="copyStats">Loading…</div>
    <select id="copyFilterSel" onchange="loadCopies()">
        <option value="all">All copies with edition covers</option>
        <option value="with_edition_cover">Has edition cover</option>
        <option value="with_color">Has stored copy color</option>
        <option value="without_color">Missing copy color</option>
    </select>
    <button class="btn-danger" onclick="wipeCopyColors()" id="btnWipeCopies">🗑 Wipe All Copy Colors</button>
</div>

<div class="legend">
    <span>Each card shows the edition cover (left) and TMDB poster (right) for a copy.</span>
    <span>Use the <strong>Source</strong> dropdown to choose which image to extract the spine color from, then click <strong>Extract</strong>.</span>
    <div class="legend-item"><div class="legend-swatch" style="background:#27ae60"></div>Green swatch = copy has its own stored color (overrides movie color)</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#2a2a4a"></div>Dark = no copy-level color stored (falls back to movie color)</div>
</div>

<div class="grid" id="copyGrid"><div class="loading">Loading copies…</div></div>
</div><!-- /tab-copies -->

<script>
const BASE = '/admin/spine-color-review.php';

async function api(params) {
    const url = BASE + '?' + new URLSearchParams(params);
    const r = await fetch(url);
    return r.json();
}

async function loadStats() {
    const s = await api({ action: 'stats' });
    document.getElementById('stats').innerHTML =
        `<strong>${s.total}</strong> total · <strong>${s.with_color}</strong> with color · <strong>${s.no_poster}</strong> no poster`;
}

async function loadMovies() {
    const filter = document.getElementById('filterSel').value;
    const grid = document.getElementById('grid');
    grid.innerHTML = '<div class="loading">Loading…</div>';
    const movies = await api({ action: 'get_movies', filter });
    if (!movies.length) { grid.innerHTML = '<div class="empty">No movies found for this filter.</div>'; return; }
    grid.innerHTML = movies.map(m => renderCard(m)).join('');
}

function renderCard(m) {
    const color = m.spine_color || '#2a2a4a';
    const title = m.display_title || m.title;
    const year  = m.year ? ` (${m.year})` : '';
    const poster = m.poster_url
        ? `<img src="${escHtml(m.poster_url)}" alt="${escHtml(title)}" loading="lazy" onerror="this.style.display='none'">`
        : `<div style="width:100%;aspect-ratio:2/3;background:#2a2a4a;display:flex;align-items:center;justify-content:center;font-size:2rem;">🎬</div>`;
    const colorInfo = m.spine_color
        ? `<div class="hex"><div class="dot" style="background:${m.spine_color}"></div>${m.spine_color}</div>`
        : `<div class="no-color">no color</div>`;
    return `<div class="card" id="card-${m.id}" title="${escHtml(title)}${year}" onclick="reextractOne(${m.id})">
        <div class="swatch" style="background:${color}"></div>
        ${poster}
        <div class="info">
            <div class="title">${escHtml(title)}</div>
            ${colorInfo}
        </div>
    </div>`;
}

async function reextractOne(movieId) {
    const card = document.getElementById('card-' + movieId);
    if (!card) return;
    card.style.opacity = '0.5';
    const res = await api({ action: 'reextract', movie_id: movieId });
    card.style.opacity = '1';
    if (res.ok) {
        // Update swatch and hex live
        card.querySelector('.swatch').style.background = res.color;
        const info = card.querySelector('.info');
        const colorDiv = info.querySelector('.hex, .no-color');
        if (colorDiv) colorDiv.outerHTML = `<div class="hex"><div class="dot" style="background:${res.color}"></div>${res.color}</div>`;
        card.querySelector('.swatch').style.background = res.color;
    } else {
        card.style.border = '2px solid #c0392b';
    }
    loadStats();
}

let batchRunning = false;
async function startBatchReextract(missingOnly) {
    if (batchRunning) return;
    batchRunning = true;
    const log = document.getElementById('batchLog');
    log.style.display = 'block';
    log.innerHTML = '';
    document.getElementById('progressBar').style.display = 'block';
    document.getElementById('btnBatch').disabled = true;
    document.getElementById('btnMissing').disabled = true;
    document.getElementById('btnWipe').disabled = true;

    let processed = 0;
    const filter = missingOnly ? 'missing_only' : 'all';

    // Count total first
    const stats = await api({ action: 'stats' });
    const total = missingOnly ? (stats.total - stats.with_color - stats.no_poster) : (stats.total - stats.no_poster);

    const batchSize = 10;
    while (true) {
        const res = await api({ action: 'reextract_batch', limit: batchSize, filter });
        if (!res.results || res.results.length === 0) break;
        res.results.forEach(r => {
            processed++;
            const pct = total > 0 ? Math.round(processed / total * 100) : 100;
            document.getElementById('progressInner').style.width = pct + '%';
            document.getElementById('progressLabel').textContent = `${processed} / ${total}`;
            const line = document.createElement('div');
            line.textContent = r.ok ? `✓ ${r.title} → ${r.color}` : `✗ ${r.title} — failed`;
            line.style.color = r.ok ? '#27ae60' : '#e74c3c';
            log.appendChild(line);
            log.scrollTop = log.scrollHeight;

            // Live-update any visible card
            const card = document.getElementById('card-' + r.id);
            if (card && r.ok) {
                card.querySelector('.swatch').style.background = r.color;
                const colorDiv = card.querySelector('.hex, .no-color');
                if (colorDiv) colorDiv.outerHTML = `<div class="hex"><div class="dot" style="background:${r.color}"></div>${r.color}</div>`;
            }
        });
        if (res.remaining <= 0) break;
    }

    batchRunning = false;
    document.getElementById('btnBatch').disabled = false;
    document.getElementById('btnMissing').disabled = false;
    document.getElementById('btnWipe').disabled = false;
    document.getElementById('progressLabel').textContent = 'Done!';
    loadStats();
    loadMovies();
}

async function wipeAll() {
    if (!confirm('Wipe ALL stored spine colors? You will need to re-run extraction after.')) return;
    await api({ action: 'wipe_all' });
    loadStats();
    loadMovies();
}

function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Tab switching ──────────────────────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((b, i) => {
        b.classList.toggle('active', (i === 0 ? 'movies' : 'copies') === tab);
    });
    document.getElementById('tab-movies').classList.toggle('active', tab === 'movies');
    document.getElementById('tab-copies').classList.toggle('active', tab === 'copies');
    if (tab === 'copies') loadCopies();
}

// ── Copy tab logic ─────────────────────────────────────────────────────────
async function loadCopies() {
    const filter = document.getElementById('copyFilterSel').value;
    const grid = document.getElementById('copyGrid');
    grid.innerHTML = '<div class="loading">Loading…</div>';
    const copies = await api({ action: 'get_copies', filter });
    if (!Array.isArray(copies) || !copies.length) {
        grid.innerHTML = '<div class="empty">No copies found. Copies need to be linked to a UMDB edition (which has a cover image) to appear here.</div>';
        updateCopyStats(copies);
        return;
    }
    grid.innerHTML = copies.map(c => renderCopyCard(c)).join('');
    updateCopyStats(copies);
}

function updateCopyStats(copies) {
    if (!Array.isArray(copies)) { document.getElementById('copyStats').textContent = '—'; return; }
    const total = copies.length;
    const withColor = copies.filter(c => c.copy_spine_color).length;
    const withEdition = copies.filter(c => c.edition_cover_url).length;
    document.getElementById('copyStats').innerHTML =
        `<strong>${total}</strong> copies · <strong>${withEdition}</strong> with edition cover · <strong>${withColor}</strong> with stored copy color`;
}

function renderCopyCard(c) {
    const color = c.copy_spine_color || '#2a2a4a';
    const swatchBorder = c.copy_spine_color ? 'outline: 1px solid #27ae60;' : '';
    const title = escHtml(c.display_title || c.title);
    const sub   = [c.format, c.edition_name || c.edition].filter(Boolean).join(' · ');
    const colorInfo = c.copy_spine_color
        ? `<div class="hex"><div class="dot" style="background:${c.copy_spine_color}"></div>${c.copy_spine_color} <small style="color:#27ae60">(copy)</small></div>`
        : `<div class="no-color">no copy color${c.movie_spine_color ? ' (uses movie: ' + c.movie_spine_color + ')' : ''}</div>`;

    const editionImg = c.edition_cover_url
        ? `<div class="cover-slot"><img src="${escHtml(c.edition_cover_url)}" loading="lazy" onerror="this.style.display='none'"><div class="cover-label">Edition Cover</div></div>`
        : `<div class="cover-slot"><div style="width:100%;aspect-ratio:2/3;background:#111;display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:#444">📀</div><div class="cover-label">No edition cover</div></div>`;
    const tmdbImg = c.poster_url
        ? `<div class="cover-slot"><img src="${escHtml(c.poster_url)}" loading="lazy" onerror="this.style.display='none'"><div class="cover-label">TMDB Poster</div></div>`
        : `<div class="cover-slot"><div style="width:100%;aspect-ratio:2/3;background:#111;display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:#444">🎬</div><div class="cover-label">No TMDB poster</div></div>`;

    const hasEdition = !!c.edition_cover_url;
    const sourceOptions = hasEdition
        ? `<option value="edition" selected>Edition Cover</option><option value="tmdb">TMDB Poster</option>`
        : `<option value="tmdb" selected>TMDB Poster</option>`;

    return `<div class="copy-card" id="copycard-${c.copy_id}">
        <div class="swatch" style="background:${color};${swatchBorder}"></div>
        <div class="covers">${editionImg}${tmdbImg}</div>
        <div class="info">
            <div class="title">${title}</div>
            ${sub ? `<div class="sub">${escHtml(sub)}</div>` : ''}
            ${colorInfo}
            <div class="source-row">
                <select id="src-${c.copy_id}">${sourceOptions}</select>
                <button onclick="reextractCopy(${c.copy_id})">Extract</button>
            </div>
        </div>
    </div>`;
}

async function reextractCopy(copyId) {
    const card = document.getElementById('copycard-' + copyId);
    if (!card) return;
    const source = document.getElementById('src-' + copyId)?.value || 'edition';
    card.style.opacity = '0.5';
    const res = await api({ action: 'reextract_copy', copy_id: copyId, source });
    card.style.opacity = '1';
    if (res.ok) {
        card.querySelector('.swatch').style.background = res.color;
        card.querySelector('.swatch').style.outline = '1px solid #27ae60';
        const colorDiv = card.querySelector('.hex, .no-color');
        if (colorDiv) colorDiv.outerHTML = `<div class="hex"><div class="dot" style="background:${res.color}"></div>${res.color} <small style="color:#27ae60">(copy)</small></div>`;
    } else {
        card.style.outline = '2px solid #c0392b';
        setTimeout(() => { card.style.outline = ''; }, 2000);
    }
}

async function wipeCopyColors() {
    if (!confirm('Wipe ALL stored per-copy spine colors? Movie-level colors are unaffected.')) return;
    await api({ action: 'wipe_copy_colors' });
    loadCopies();
}

// Init
loadStats();
loadMovies();
</script>
</body>
</html>
