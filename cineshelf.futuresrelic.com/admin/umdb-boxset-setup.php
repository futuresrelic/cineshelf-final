<?php
/**
 * CineShelf Admin — UMDB Box Set Setup
 * Runs the UMDB database migration and backfills existing box sets.
 * Safe to run multiple times (UMDB endpoints are idempotent).
 */
require_once __DIR__ . '/../config/config.php';

// Simple admin gate — only allow logged-in admins or if accessed from localhost
$isLocal = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1']);
if (!$isLocal) {
    // Check for a valid admin session via the DB
    try {
        $db = getDb();
        $token = $_COOKIE['cineshelf_auth_token'] ?? '';
        $isAdmin = false;
        if ($token) {
            $stmt = $db->prepare("
                SELECT u.is_admin FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP
            ");
            $stmt->execute([$token]);
            $row = $stmt->fetch();
            $isAdmin = !empty($row['is_admin']);
        }
        if (!$isAdmin) {
            http_response_code(403);
            die('<h2 style="font-family:sans-serif;padding:2rem;color:#c00;">Access denied — admin only.</h2>');
        }
    } catch (Exception $e) {
        http_response_code(500);
        die('Database error: ' . htmlspecialchars($e->getMessage()));
    }
}

$umdbBase = defined('UMDB_BASE_URL') ? UMDB_BASE_URL : 'https://umdb-production.up.railway.app/api/v1';
$apiKey   = defined('UMDB_API_KEY')  ? UMDB_API_KEY  : '';

// ── Auto-detect all box sets pushed to UMDB from any user ──
$knownBoxSets = [];
try {
    $db = getDb();
    $stmt = $db->query("SELECT umdb_boxset_id, name FROM containers WHERE umdb_boxset_id IS NOT NULL ORDER BY name ASC");
    foreach ($stmt->fetchAll() as $row) {
        $knownBoxSets[$row['umdb_boxset_id']] = $row['name'];
    }
} catch (Exception $e) {
    // Non-fatal — will just show empty backfill list
}

// ── Helper: make a UMDB request ──────────────────────────────
function umdbAdminRequest($method, $url, $apiKey, $body = null) {
    $headers = "Accept: application/json\r\nContent-Type: application/json\r\n";
    if ($apiKey) $headers .= "X-API-Key: $apiKey\r\n";
    $opts = ['http' => [
        'method'        => $method,
        'header'        => $headers,
        'timeout'       => 20,
        'ignore_errors' => true,
    ]];
    if ($body !== null) {
        $json = json_encode($body);
        $opts['http']['content'] = $json;
        $opts['http']['header'] .= "Content-Length: " . strlen($json) . "\r\n";
    }
    $ctx      = stream_context_create($opts);
    $response = @file_get_contents($url, false, $ctx);
    $status   = 0;
    if (!empty($http_response_header[0])) {
        preg_match('/\d{3}/', $http_response_header[0], $m);
        $status = intval($m[0] ?? 0);
    }
    return ['status' => $status, 'body' => $response, 'data' => json_decode($response, true)];
}

$results  = [];
$doRun    = $_POST['run'] ?? false;

if ($doRun) {
    // Step 1: Run UMDB migration
    $migUrl = $umdbBase . '/migrate/box-set-fields';
    if ($apiKey) $migUrl .= '?api_key=' . urlencode($apiKey); // support query-param auth too
    $migResult = umdbAdminRequest('GET', $migUrl, $apiKey);
    $results['migration'] = $migResult;

    // Step 2: Backfill each known box set
    $results['backfills'] = [];
    foreach ($knownBoxSets as $bsId => $bsName) {
        $bfUrl    = $umdbBase . '/box-sets/' . urlencode($bsId) . '/create-releases';
        $bfResult = umdbAdminRequest('POST', $bfUrl, $apiKey, []);
        $results['backfills'][$bsId] = ['name' => $bsName, 'result' => $bfResult];
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UMDB Box Set Setup — CineShelf Admin</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: flex-start;
            justify-content: center;
            padding: 2rem;
        }
        .container {
            background: white;
            border-radius: 12px;
            padding: 2.5rem;
            max-width: 680px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 { font-size: 1.6rem; color: #1a1a2e; margin-bottom: 0.4rem; }
        .subtitle { color: #666; font-size: 0.9rem; margin-bottom: 1.8rem; }
        .step {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 1rem 1.2rem;
            margin-bottom: 1rem;
        }
        .step h3 { font-size: 0.95rem; color: #374151; margin-bottom: 0.3rem; }
        .step p  { font-size: 0.85rem; color: #6b7280; }
        .key-check {
            background: <?= $apiKey ? '#f0fdf4' : '#fef2f2' ?>;
            border: 1px solid <?= $apiKey ? '#86efac' : '#fca5a5' ?>;
            border-radius: 8px;
            padding: 0.8rem 1rem;
            margin-bottom: 1.5rem;
            font-size: 0.88rem;
            color: <?= $apiKey ? '#166534' : '#991b1b' ?>;
        }
        .btn {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 0.85rem 2rem;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            margin-top: 0.5rem;
        }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .result-block {
            margin-top: 1.5rem;
            border-radius: 8px;
            overflow: hidden;
        }
        .result-header {
            padding: 0.7rem 1rem;
            font-weight: 600;
            font-size: 0.9rem;
        }
        .ok   { background: #f0fdf4; border: 1px solid #86efac; }
        .fail { background: #fef2f2; border: 1px solid #fca5a5; }
        .ok   .result-header { color: #166534; background: #dcfce7; }
        .fail .result-header { color: #991b1b; background: #fee2e2; }
        pre {
            background: #f9fafb;
            padding: 1rem;
            font-size: 0.8rem;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .back { display:inline-block; margin-top:1.2rem; color:#667eea; font-size:0.85rem; text-decoration:none; }
    </style>
</head>
<body>
<div class="container">
    <h1>UMDB Box Set Setup</h1>
    <p class="subtitle">Runs the UMDB database migration and backfills existing box sets so they appear as physical releases on each movie. Safe to run multiple times.</p>

    <div class="key-check">
        <?php if ($apiKey): ?>
            UMDB_API_KEY is configured — ready to run.
        <?php else: ?>
            UMDB_API_KEY is NOT set. Set it in Railway environment variables before running.
        <?php endif; ?>
    </div>

    <div class="step">
        <h3>Step 1 — Run UMDB migration</h3>
        <p>Adds <code>isBoxSet</code>, <code>boxSetId</code>, <code>boxSetPosition</code> columns to UMDB's PhysicalCopy table. Idempotent.</p>
    </div>
    <div class="step">
        <h3>Step 2 — Backfill existing box sets (<?= count($knownBoxSets) ?> found)</h3>
        <?php if ($knownBoxSets): ?>
            <p style="margin-bottom:0.4rem;">Creates PhysicalCopy records for each box set so they appear in each movie's releases list:</p>
            <ul style="margin-left:1.2rem;font-size:0.83rem;color:#6b7280;">
                <?php foreach ($knownBoxSets as $bsId => $bsName): ?>
                    <li><?= htmlspecialchars($bsName) ?> <span style="color:#9ca3af;font-family:monospace;font-size:0.75rem;">(<?= htmlspecialchars($bsId) ?>)</span></li>
                <?php endforeach; ?>
            </ul>
        <?php else: ?>
            <p>No box sets pushed to UMDB yet — push some from CineShelf first.</p>
        <?php endif; ?>
    </div>

    <?php if (!$doRun): ?>
    <form method="POST">
        <input type="hidden" name="run" value="1">
        <button type="submit" class="btn" <?= $apiKey ? '' : 'disabled' ?>>
            Run Migration &amp; Backfill
        </button>
    </form>
    <?php endif; ?>

    <?php if ($doRun && !empty($results)): ?>

        <?php
        $migOk = ($results['migration']['status'] >= 200 && $results['migration']['status'] < 300);
        $migClass = $migOk ? 'ok' : 'fail';
        $migLabel = $migOk ? '✓ Migration succeeded' : '✗ Migration failed (HTTP ' . $results['migration']['status'] . ')';
        ?>
        <div class="result-block <?= $migClass ?>">
            <div class="result-header"><?= $migLabel ?></div>
            <pre><?= htmlspecialchars(json_encode($results['migration']['data'] ?? $results['migration']['body'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) ?></pre>
        </div>

        <?php foreach ($results['backfills'] as $bsId => $bf): ?>
            <?php
            $bfOk = ($bf['result']['status'] >= 200 && $bf['result']['status'] < 300);
            $bfClass = $bfOk ? 'ok' : 'fail';
            $bfLabel = $bfOk
                ? '✓ Backfill succeeded — ' . htmlspecialchars($bf['name'])
                : '✗ Backfill failed (HTTP ' . $bf['result']['status'] . ') — ' . htmlspecialchars($bf['name']);
            ?>
            <div class="result-block <?= $bfClass ?>" style="margin-top:1rem;">
                <div class="result-header"><?= $bfLabel ?></div>
                <pre><?= htmlspecialchars(json_encode($bf['result']['data'] ?? $bf['result']['body'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) ?></pre>
            </div>
        <?php endforeach; ?>

        <form method="POST" style="margin-top:1rem;">
            <input type="hidden" name="run" value="1">
            <button type="submit" class="btn" style="background:linear-gradient(135deg,#10b981,#059669);">
                Run Again (verify idempotency)
            </button>
        </form>

    <?php endif; ?>

    <a href="/admin/" class="back">← Back to Admin</a>
</div>
</body>
</html>
