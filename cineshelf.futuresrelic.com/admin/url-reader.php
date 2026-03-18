<?php
/**
 * URL Reader / Text Browser — CineShelf Admin
 *
 * Fetches any URL and renders just the text content (no HTML, no scripts).
 * Especially useful for Amazon product pages where the full HTML is hard
 * to read — paste the URL here, get clean text you can copy into the
 * Amazon Import tool.
 */
session_start();

function isAdmin() {
    if (!isset($_SESSION['user_id'])) return false;
    $dbPath = __DIR__ . '/../data/cineshelf.sqlite';
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $stmt = $db->prepare("SELECT is_admin FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    return $user && $user['is_admin'] == 1;
}

if (!isAdmin()) {
    die('<h1 style="font-family:sans-serif;padding:2rem">Admin access required. <a href="/">Login first</a>.</h1>');
}

// ── JSON fetch action ─────────────────────────────────────────────────────
if (isset($_GET['action']) && $_GET['action'] === 'fetch') {
    header('Content-Type: application/json');

    $url = trim($_GET['url'] ?? '');
    if (empty($url)) {
        echo json_encode(['ok' => false, 'error' => 'No URL provided']);
        exit;
    }

    // Strategies: try a few different approaches
    $strategies = [
        [
            'label' => 'Browser (Chrome/Windows)',
            'ua'    => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'url'   => $url,
        ],
        [
            'label' => 'Mobile (iPhone Safari)',
            'ua'    => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            'url'   => preg_replace('#^(https?://)(?:www\.)(amazon\.)#', '$1m.$2', $url),
        ],
        [
            'label' => 'Firefox/Linux',
            'ua'    => 'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
            'url'   => $url,
        ],
    ];

    $html     = null;
    $usedLabel = '';

    foreach ($strategies as $s) {
        $ch = curl_init($s['url']);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => 18,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_ENCODING       => 'gzip',
            CURLOPT_USERAGENT      => $s['ua'],
            CURLOPT_HTTPHEADER     => [
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language: en-US,en;q=0.9,fr;q=0.8',
                'Cache-Control: no-cache',
                'Upgrade-Insecure-Requests: 1',
                'Sec-Fetch-Dest: document',
                'Sec-Fetch-Mode: navigate',
                'Sec-Fetch-Site: none',
            ],
            CURLOPT_COOKIEJAR  => sys_get_temp_dir() . '/cs_url_cookies.txt',
            CURLOPT_COOKIEFILE => sys_get_temp_dir() . '/cs_url_cookies.txt',
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($body && $code === 200
            && stripos($body, 'Robot Check') === false
            && stripos($body, 'captcha')     === false
            && stripos($body, 'Enter the characters') === false) {
            $html      = $body;
            $usedLabel = $s['label'];
            break;
        }
    }

    if (!$html) {
        echo json_encode(['ok' => false, 'error' => 'All fetch strategies failed. Amazon is likely blocking server-side requests. Use the "Paste Text" method instead: open the page in your browser, Select All (Ctrl+A), Copy (Ctrl+C), then paste into the Paste Text tab.']);
        exit;
    }

    // ── Strip to text ─────────────────────────────────────────────────────
    libxml_use_internal_errors(true);
    $doc = new DOMDocument();
    $doc->loadHTML('<?xml encoding="utf-8" ?>' . $html);
    libxml_clear_errors();

    // Remove non-content elements
    $removeSelectors = ['script', 'style', 'nav', 'header', 'footer', 'noscript',
                        'iframe', 'form', 'button', 'img', 'svg', 'link', 'meta'];
    foreach ($removeSelectors as $tag) {
        foreach (iterator_to_array($doc->getElementsByTagName($tag)) as $node) {
            $node->parentNode && $node->parentNode->removeChild($node);
        }
    }

    // Also remove elements with aria-hidden, or known nav/sidebar IDs/classes
    $xp = new DOMXPath($doc);
    $hidden = $xp->query('//*[@aria-hidden="true" or @id="navFooter" or @id="navbar" or contains(@class,"nav-") or contains(@class,"sidebar")]');
    if ($hidden) {
        foreach (iterator_to_array($hidden) as $node) {
            $node->parentNode && $node->parentNode->removeChild($node);
        }
    }

    // Get clean text
    $text = $doc->textContent;

    // Normalize whitespace — collapse runs of blank lines
    $text = preg_replace('/[ \t]+/', ' ', $text);
    $text = preg_replace('/\n{3,}/', "\n\n", $text);
    $text = preg_replace('/^ +/m', '', $text);
    $text = trim($text);

    echo json_encode([
        'ok'       => true,
        'text'     => $text,
        'strategy' => $usedLabel,
        'length'   => strlen($text),
    ]);
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>URL Text Reader — CineShelf Admin</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1a1a2e; min-height: 100vh; color: #e0e0e0;
}
header {
    background: linear-gradient(135deg,#667eea,#764ba2);
    padding: 1.2rem 2rem; display:flex; align-items:center; gap:1rem;
}
header h1 { font-size:1.4rem; color:#fff; }
header a  { color:rgba(255,255,255,0.75); text-decoration:none; font-size:0.9rem; }
header a:hover { color:#fff; }
.toolbar {
    background:#16213e; padding:1rem 2rem;
    display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;
    border-bottom:1px solid #2a2a4a;
}
input[type=url] {
    flex:1; min-width:260px; padding:0.5rem 0.75rem;
    background:#0d0d1a; border:1px solid #444; color:#eee;
    border-radius:6px; font-size:0.9rem;
}
input[type=url]:focus { outline:none; border-color:#667eea; }
button {
    padding:0.45rem 1rem; border:none; border-radius:6px;
    cursor:pointer; font-size:0.85rem; font-weight:600;
}
.btn-primary { background:#667eea; color:#fff; }
.btn-primary:hover { background:#556dcc; }
.btn-primary:disabled { opacity:0.5; cursor:default; }
.btn-copy { background:#27ae60; color:#fff; }
.btn-copy:hover { background:#229954; }
.btn-amazon { background:linear-gradient(135deg,#ff9900,#e88b00); color:#111; font-weight:700; }
.btn-amazon:hover { filter:brightness(1.1); }
.note {
    background:rgba(102,126,234,0.12); border:1px solid rgba(102,126,234,0.3);
    border-radius:6px; padding:0.75rem 1rem; margin:1rem 2rem; font-size:0.85rem;
    color:#b0c0ff;
}
.note strong { color:#fff; }
.note code { background:rgba(255,255,255,0.1); padding:1px 5px; border-radius:3px; font-family:monospace; }
#status { color:#aaa; font-size:0.85rem; }
#status.error { color:#f5a0a0; }
#status.success { color:#7ec8a0; }
.output-wrap {
    padding:1rem 2rem;
}
#textOutput {
    background:#0d0d1a; border:1px solid #2a2a4a; border-radius:8px;
    padding:1rem; font-family:monospace; font-size:0.8rem;
    line-height:1.5; color:#ccc; white-space:pre-wrap;
    max-height:60vh; overflow-y:auto; min-height:200px;
}
.actions { display:flex; gap:0.5rem; margin-top:0.75rem; flex-wrap:wrap; }
.hint {
    background:#16213e; border:1px solid #2a2a4a; border-radius:8px;
    padding:1.25rem; margin:0 2rem;
}
.hint h3 { color:#a8b8ff; margin-bottom:0.75rem; font-size:1rem; }
.hint ol { padding-left:1.25rem; color:#bbb; font-size:0.875rem; line-height:1.8; }
.hint code { background:rgba(255,255,255,0.08); padding:1px 5px; border-radius:3px; font-family:monospace; }
.steps { display:grid; grid-template-columns:1fr 1fr; gap:1rem; padding:1rem 2rem; }
@media(max-width:700px){ .steps { grid-template-columns:1fr; } }
</style>
</head>
<body>
<header>
    <div>
        <a href="/admin/">← Admin Panel</a>
        <h1>🌐 URL Text Reader</h1>
    </div>
</header>

<div class="toolbar">
    <input type="url" id="urlInput" placeholder="https://www.amazon.ca/dp/B00005O3VC"
           onkeydown="if(event.key==='Enter') fetchUrl()">
    <button class="btn-primary" id="fetchBtn" onclick="fetchUrl()">📄 Read as Text</button>
    <span id="status"></span>
</div>

<div class="note">
    <strong>⚠️ Amazon blocks most server-side requests.</strong>
    If the fetch fails, use the <strong>manual method</strong> below:
    open the Amazon page in your browser → <code>Ctrl+A</code> → <code>Ctrl+C</code> → paste into CineShelf's Amazon Import "Paste Text" tab.
</div>

<div class="steps">
    <div class="hint">
        <h3>Method A — Auto Fetch (try first)</h3>
        <ol>
            <li>Paste the Amazon URL above</li>
            <li>Click <strong>Read as Text</strong></li>
            <li>If it works, you'll see the product text below</li>
            <li>Click <strong>Copy Text</strong> then paste it into the Amazon Import tool's Paste Text tab</li>
        </ol>
    </div>
    <div class="hint">
        <h3>Method B — Manual Paste (always works)</h3>
        <ol>
            <li>Open the Amazon product page in your browser normally</li>
            <li>Press <code>Ctrl+A</code> (Select All) then <code>Ctrl+C</code> (Copy)</li>
            <li>Go to Copy Manager → Link Physical Edition → 🛒 Import from Amazon</li>
            <li>Click the <strong>Paste Text</strong> tab and paste</li>
        </ol>
    </div>
</div>

<div class="output-wrap" id="outputSection" style="display:none;">
    <div class="actions">
        <button class="btn-copy" onclick="copyText()">📋 Copy All Text</button>
        <button class="btn-amazon" onclick="openAmazonImport()">→ Use in Amazon Import</button>
    </div>
    <pre id="textOutput"></pre>
</div>

<script>
let lastText = '';

async function fetchUrl() {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) return;
    const btn = document.getElementById('fetchBtn');
    const status = document.getElementById('status');
    const section = document.getElementById('outputSection');
    btn.disabled = true;
    btn.textContent = 'Fetching…';
    status.className = '';
    status.textContent = 'Fetching page…';
    section.style.display = 'none';

    try {
        const resp = await fetch('?action=fetch&url=' + encodeURIComponent(url));
        const json = await resp.json();
        if (json.ok) {
            lastText = json.text;
            document.getElementById('textOutput').textContent = json.text;
            section.style.display = 'block';
            status.className = 'success';
            status.textContent = `✓ ${json.length.toLocaleString()} chars — fetched via ${json.strategy}`;
        } else {
            status.className = 'error';
            status.textContent = '✗ ' + json.error;
            section.style.display = 'none';
        }
    } catch (e) {
        status.className = 'error';
        status.textContent = 'Network error: ' + e.message;
    } finally {
        btn.disabled = false;
        btn.textContent = '📄 Read as Text';
    }
}

function copyText() {
    navigator.clipboard.writeText(lastText).then(() => {
        const btn = event.target;
        btn.textContent = '✓ Copied!';
        setTimeout(() => btn.textContent = '📋 Copy All Text', 2000);
    });
}

function openAmazonImport() {
    // Store text in sessionStorage so the import tool can pick it up
    sessionStorage.setItem('cineshelf_amazon_paste_text', lastText);
    // Also store the detected URL for reference
    sessionStorage.setItem('cineshelf_amazon_paste_url', document.getElementById('urlInput').value.trim());
    window.location.href = '/?openAmazonImport=1';
}
</script>
</body>
</html>
