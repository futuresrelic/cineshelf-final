<?php
// Admin tool to backfill missing spine colors for existing movies
// Color extraction runs in-browser via Canvas API (same algorithm as the main app)

session_start();

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

function isAdmin() {
    if (!isset($_SESSION['user_id'])) return false;
    $db = getDB();
    $stmt = $db->prepare("SELECT is_admin FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    return $user && $user['is_admin'] == 1;
}

$action = $_GET['action'] ?? 'show_form';

if ($action !== 'show_form') {
    header('Content-Type: application/json');
    if (!isAdmin()) {
        echo json_encode(['error' => 'Admin access required']);
        exit;
    }
}

// ── Stats ──────────────────────────────────────────────────────────────────
if ($action === 'get_stats') {
    $db = getDB();
    $total     = $db->query("SELECT COUNT(*) FROM movies")->fetchColumn();
    $missing   = $db->query("SELECT COUNT(*) FROM movies WHERE (spine_color IS NULL OR spine_color = '') AND poster_url IS NOT NULL AND poster_url != ''")->fetchColumn();
    $noPoster  = $db->query("SELECT COUNT(*) FROM movies WHERE poster_url IS NULL OR poster_url = ''")->fetchColumn();
    echo json_encode(['total' => (int)$total, 'missing' => (int)$missing, 'no_poster' => (int)$noPoster]);
    exit;
}

// ── Batch of movies needing colour ────────────────────────────────────────
if ($action === 'get_batch') {
    $offset = max(0, intval($_GET['offset'] ?? 0));
    $limit  = min(50, max(1, intval($_GET['limit'] ?? 20)));
    $db = getDB();
    $stmt = $db->prepare("
        SELECT id, title, poster_url
        FROM movies
        WHERE (spine_color IS NULL OR spine_color = '')
          AND poster_url IS NOT NULL AND poster_url != ''
        ORDER BY id ASC
        LIMIT ? OFFSET ?
    ");
    $stmt->execute([$limit, $offset]);
    $movies = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['movies' => $movies]);
    exit;
}

// ── HTML page ──────────────────────────────────────────────────────────────
if ($action === 'show_form') {
    if (!isAdmin()) {
        die('<h1>Admin Access Required</h1><p>Please <a href="/">login to CineShelf</a> first, then return to this page.</p>');
    }
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Backfill Spine Colors - CineShelf Admin</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 2rem;
            color: white;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            background: rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 2rem;
            backdrop-filter: blur(10px);
        }

        h1 { font-size: 2rem; margin-bottom: 0.5rem; }

        .subtitle {
            color: rgba(255,255,255,0.8);
            margin-bottom: 2rem;
            line-height: 1.6;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .stat-card {
            background: rgba(255,255,255,0.15);
            border-radius: 12px;
            padding: 1.5rem;
            text-align: center;
        }

        .stat-value { font-size: 2.5rem; font-weight: bold; margin-bottom: 0.5rem; }
        .stat-label { font-size: 0.9rem; color: rgba(255,255,255,0.8); }

        .controls {
            display: flex;
            align-items: center;
            gap: 1rem;
            flex-wrap: wrap;
            margin-bottom: 1.5rem;
        }

        .btn {
            background: rgba(255,255,255,0.2);
            border: 2px solid white;
            color: white;
            padding: 0.85rem 1.75rem;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .btn:hover:not(:disabled) { background: white; color: #667eea; }
        .btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .btn.danger { border-color: #ff8a80; color: #ff8a80; }
        .btn.danger:hover:not(:disabled) { background: #ff8a80; color: white; }

        label { font-size: 0.95rem; color: rgba(255,255,255,0.9); }

        select, input[type=number] {
            background: rgba(255,255,255,0.15);
            border: 1px solid rgba(255,255,255,0.4);
            color: white;
            padding: 0.5rem 0.75rem;
            border-radius: 6px;
            font-size: 0.95rem;
        }

        select option { background: #4a4a8a; }

        .progress-container {
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
        }

        .progress-bar {
            width: 100%;
            height: 28px;
            background: rgba(0,0,0,0.3);
            border-radius: 14px;
            overflow: hidden;
            margin-bottom: 0.75rem;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4caf50, #8bc34a);
            transition: width 0.4s;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 0.85rem;
            min-width: 2rem;
        }

        .progress-meta {
            font-size: 0.9rem;
            color: rgba(255,255,255,0.8);
            margin-bottom: 0.5rem;
        }

        .log {
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            padding: 1rem;
            max-height: 280px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.82rem;
            line-height: 1.5;
        }

        .log-entry { margin-bottom: 0.25rem; }
        .log-entry.success { color: #81c784; }
        .log-entry.error   { color: #e57373; }
        .log-entry.info    { color: #64b5f6; }
        .log-entry.warn    { color: #ffb74d; }

        .result-banner {
            background: rgba(76,175,80,0.25);
            border-left: 4px solid #4caf50;
            padding: 1rem 1.25rem;
            border-radius: 8px;
            margin-top: 1.5rem;
            line-height: 1.8;
        }

        .back-link {
            display: inline-block;
            margin-bottom: 1rem;
            color: white;
            text-decoration: none;
            opacity: 0.8;
        }
        .back-link:hover { opacity: 1; }

        .color-swatch {
            display: inline-block;
            width: 14px;
            height: 14px;
            border-radius: 3px;
            vertical-align: middle;
            margin-right: 4px;
            border: 1px solid rgba(255,255,255,0.3);
        }
    </style>
</head>
<body>
<div class="container">
    <a href="/admin/" class="back-link">← Back to Admin Panel</a>

    <h1>🎨 Backfill Spine Colors</h1>
    <p class="subtitle">
        Extracts the dominant poster color for every movie that doesn't have one stored yet.
        This runs entirely in your browser using the same Canvas-based algorithm as the live shelf view.
    </p>

    <div class="stats-grid" id="statsGrid">
        <div class="stat-card">
            <div class="stat-value" id="statTotal">…</div>
            <div class="stat-label">Total Movies</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" id="statMissing">…</div>
            <div class="stat-label">Missing Color</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" id="statNoPoster">…</div>
            <div class="stat-label">No Poster (skipped)</div>
        </div>
    </div>

    <div class="controls">
        <button class="btn" id="startBtn" onclick="startBackfill()">🚀 Start Backfill</button>
        <button class="btn danger" id="stopBtn" onclick="stopBackfill()" style="display:none">⏹ Stop</button>
        <label>Batch size:
            <input type="number" id="batchSize" value="10" min="1" max="50" style="width:70px; margin-left:6px">
        </label>
    </div>

    <div class="progress-container" id="progressContainer" style="display:none">
        <div class="progress-meta" id="progressMeta">Starting…</div>
        <div class="progress-bar">
            <div class="progress-fill" id="progressFill" style="width:0%">0%</div>
        </div>
        <div class="log" id="logContainer"></div>
    </div>

    <div class="result-banner" id="resultBanner" style="display:none"></div>
</div>

<script>
const API_URL = '/api/api.php';

let running = false;
let totalMissing = 0;
let processed = 0, saved = 0, errors = 0;

// ── Canvas-based color extraction (mirrors app.js extractAverageColor) ──
function extractAverageColor(imageUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 50;
            canvas.height = 75;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 50, 75);
            const data = ctx.getImageData(0, 0, 50, 75).data;

            let r = 0, g = 0, b = 0, count = 0;
            for (let y = 0; y < 75; y++) {
                for (let x = 0; x < 50; x++) {
                    const i = (y * 50 + x) * 4;
                    const edgeWeight = (x < 8 || x > 42) ? 3 : 1;
                    r += data[i]     * edgeWeight;
                    g += data[i + 1] * edgeWeight;
                    b += data[i + 2] * edgeWeight;
                    count += edgeWeight;
                }
            }
            r = Math.round(r / count);
            g = Math.round(g / count);
            b = Math.round(b / count);

            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            if (max - min > 20) {
                const avg = (r + g + b) / 3;
                r = Math.min(255, Math.round(avg + (r - avg) * 1.2));
                g = Math.min(255, Math.round(avg + (g - avg) * 1.2));
                b = Math.min(255, Math.round(avg + (b - avg) * 1.2));
            }

            resolve('#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join(''));
        };
        img.onerror = () => resolve(null); // null = skip, no fallback stored
        img.src = imageUrl;
    });
}

// ── Save via existing API endpoint ────────────────────────────────────────
async function saveSpineColor(movieId, color) {
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'save_movie_spine_color', movie_id: movieId, spine_color: color })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'API error');
}

// ── Load stats ────────────────────────────────────────────────────────────
async function loadStats() {
    const res  = await fetch('?action=get_stats');
    const data = await res.json();
    document.getElementById('statTotal').textContent    = data.total;
    document.getElementById('statMissing').textContent  = data.missing;
    document.getElementById('statNoPoster').textContent = data.no_poster;
    totalMissing = data.missing;
}

// ── UI helpers ────────────────────────────────────────────────────────────
function addLog(msg, type = 'info', color = null) {
    const log = document.getElementById('logContainer');
    const el  = document.createElement('div');
    el.className = 'log-entry ' + type;
    const swatch = color ? `<span class="color-swatch" style="background:${color}"></span>` : '';
    el.innerHTML = new Date().toLocaleTimeString() + ' — ' + swatch + msg;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
}

function updateProgress() {
    const pct = totalMissing > 0 ? Math.round((processed / totalMissing) * 100) : 100;
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressFill').textContent = pct + '%';
    document.getElementById('progressMeta').textContent =
        `Processed ${processed} / ${totalMissing} — Saved: ${saved} — Errors: ${errors}`;
}

// ── Main backfill loop ────────────────────────────────────────────────────
async function startBackfill() {
    if (running) return;
    running = true;
    processed = 0; saved = 0; errors = 0;

    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').style.display = 'inline-block';
    document.getElementById('progressContainer').style.display = 'block';
    document.getElementById('resultBanner').style.display = 'none';
    document.getElementById('logContainer').innerHTML = '';

    const batchSize = Math.min(50, Math.max(1, parseInt(document.getElementById('batchSize').value) || 10));
    addLog(`Starting — ${totalMissing} movies to process (batch ${batchSize})`, 'info');

    let offset = 0;

    while (running) {
        let batch;
        try {
            const res = await fetch(`?action=get_batch&offset=${offset}&limit=${batchSize}`);
            const data = await res.json();
            batch = data.movies || [];
        } catch (e) {
            addLog('Network error fetching batch: ' + e.message, 'error');
            break;
        }

        if (batch.length === 0) break;

        for (const movie of batch) {
            if (!running) break;

            try {
                const color = await extractAverageColor(movie.poster_url);
                if (color) {
                    await saveSpineColor(movie.id, color);
                    saved++;
                    addLog(`✓ ${movie.title}`, 'success', color);
                } else {
                    errors++;
                    addLog(`⚠ ${movie.title} — image failed to load`, 'warn');
                }
            } catch (e) {
                errors++;
                addLog(`✗ ${movie.title} — ${e.message}`, 'error');
            }

            processed++;
            updateProgress();
        }

        // offset doesn't advance because processed rows are no longer returned
        // (they now have spine_color set), so we always fetch from offset 0
    }

    running = false;
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').style.display = 'none';

    const banner = document.getElementById('resultBanner');
    banner.style.display = 'block';
    banner.innerHTML = `
        <strong>✅ Done!</strong><br>
        Processed: <strong>${processed}</strong> &nbsp;|&nbsp;
        Saved: <strong>${saved}</strong> &nbsp;|&nbsp;
        Errors: <strong>${errors}</strong><br>
        <a href="/" style="color:white;text-decoration:underline;margin-top:0.5rem;display:inline-block">
            → Open CineShelf to see the colors
        </a>
    `;

    await loadStats(); // refresh counts
}

function stopBackfill() {
    running = false;
    addLog('Stopped by user.', 'warn');
}

// Init
loadStats();
</script>
</body>
</html>
<?php
    exit;
}
?>
