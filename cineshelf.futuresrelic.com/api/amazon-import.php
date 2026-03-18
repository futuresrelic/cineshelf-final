<?php
/**
 * Amazon Product Data Importer — CineShelf
 *
 * Fetches an Amazon product page and extracts physical media details
 * (images, languages, ASIN, disc count, studio, etc.) so they can be
 * pre-populated in the edition creation form.
 *
 * GET params:
 *   url   — full Amazon product URL
 */
session_start();

header('Content-Type: application/json');

// Auth check
if (!isset($_SESSION['user_id'])) {
    echo json_encode(['ok' => false, 'error' => 'Login required']);
    exit;
}

// ── Validate input ────────────────────────────────────────────────────────
$rawUrl = trim($_GET['url'] ?? '');

if (empty($rawUrl)) {
    echo json_encode(['ok' => false, 'error' => 'URL is required']);
    exit;
}

// Accept any amazon.* domain
if (!preg_match('#^https?://(www\.)?amazon\.(com|ca|co\.uk|de|fr|es|it|co\.jp|com\.au|com\.br|com\.mx|nl|se|sg|in)/#i', $rawUrl)) {
    echo json_encode(['ok' => false, 'error' => 'Please provide a valid Amazon product URL (amazon.com, amazon.ca, etc.)']);
    exit;
}

// Extract ASIN from URL — /dp/XXXXXXXXXX/
$asin = null;
if (preg_match('#/dp/([A-Z0-9]{10})#i', $rawUrl, $m)) {
    $asin = strtoupper($m[1]);
}

// ── Fetch the page ────────────────────────────────────────────────────────
$ch = curl_init($rawUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_ENCODING       => 'gzip',
    CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    CURLOPT_HTTPHEADER     => [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language: en-US,en;q=0.9',
        'Cache-Control: max-age=0',
        'Upgrade-Insecure-Requests: 1',
        'Sec-Fetch-Dest: document',
        'Sec-Fetch-Mode: navigate',
        'Sec-Fetch-Site: none',
        'Sec-Fetch-User: ?1',
    ],
]);
$html     = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if (!$html || $httpCode !== 200) {
    echo json_encode(['ok' => false, 'error' => "Amazon returned HTTP $httpCode. The page may be blocked or unavailable."]);
    exit;
}

// Detect bot/captcha page
if (stripos($html, 'Robot Check') !== false || stripos($html, 'captcha') !== false || stripos($html, 'Enter the characters you see') !== false) {
    echo json_encode(['ok' => false, 'error' => 'Amazon served a CAPTCHA page. Try opening the URL in your browser first, then retry.', 'asin' => $asin]);
    exit;
}

// ── Parse HTML ────────────────────────────────────────────────────────────
libxml_use_internal_errors(true);
$doc = new DOMDocument();
$doc->loadHTML('<?xml encoding="utf-8" ?>' . $html);
libxml_clear_errors();
$xp = new DOMXPath($doc);

// ── Helper ────────────────────────────────────────────────────────────────
function xpText(DOMXPath $xp, string $query): string {
    $nodes = $xp->query($query);
    return $nodes && $nodes->length > 0 ? trim($nodes->item(0)->textContent) : '';
}

function cleanAmazonText(string $s): string {
    // Remove non-breaking spaces, excess whitespace, U+200E (LTR mark), etc.
    return trim(preg_replace('/[\x{200E}\x{200F}\x{00A0}]+/u', ' ', preg_replace('/\s+/', ' ', $s)));
}

// ── Title ─────────────────────────────────────────────────────────────────
$title = cleanAmazonText(xpText($xp, '//*[@id="productTitle"]'));
if (!$title) {
    $title = cleanAmazonText(xpText($xp, '//h1[@class and contains(@class,"a-size-large")]'));
}

// ── Images ────────────────────────────────────────────────────────────────
$images = [];

// Main image: data-a-dynamic-image JSON map of URL → [w, h]
$mainImgNodes = $xp->query('//*[@id="landingImage" or @id="imgBlkFront" or @id="main-image"][@data-a-dynamic-image]');
if ($mainImgNodes && $mainImgNodes->length > 0) {
    $jsonRaw = $mainImgNodes->item(0)->getAttribute('data-a-dynamic-image');
    $imgMap  = json_decode($jsonRaw, true);
    if (is_array($imgMap)) {
        // Pick the largest image by area
        $best = null; $bestArea = 0;
        foreach ($imgMap as $url => $dims) {
            $area = ($dims[0] ?? 0) * ($dims[1] ?? 0);
            if ($area > $bestArea) { $bestArea = $area; $best = $url; }
        }
        if ($best) $images[] = $best;
    }
}

// Alternate product images (different views: back, spine, inside case, etc.)
$altImgNodes = $xp->query('//*[@id="altImages"]//li[contains(@class,"item")]//img');
foreach ($altImgNodes as $img) {
    $src = $img->getAttribute('src');
    if (!$src) continue;
    // Thumbnail URLs look like: ...I/51abc._SS40_.jpg
    // Upgrade to full resolution by removing size suffix and adding _SL1200_
    $full = preg_replace('/\._[A-Z]{2}\d+_\./', '._SL1200_.', $src);
    if ($full && $full !== $src && !in_array($full, $images)) {
        $images[] = $full;
    }
}

// ── Product Details — parse all rows from the two common table formats ────
$details = []; // [ 'label' => 'value' ]

// Format 1: #productDetails_techSpec_section_1 / #productDetails_detailBullets_sections1
foreach (['productDetails_techSpec_section_1', 'productDetails_detailBullets_sections1'] as $tableId) {
    $rows = $xp->query("//*[@id='$tableId']//tr");
    if (!$rows) continue;
    foreach ($rows as $row) {
        $label = cleanAmazonText(xpText($xp, './/th', $row) ?: xpText($xp, './/td[1]', $row));
        $value = cleanAmazonText(xpText($xp, './/td[last()]', $row));
        if ($label && $value) {
            $details[strtolower(trim($label, " \t\n\r\0\x0B:"))] = $value;
        }
    }
}

// Format 2: #detailBullets_feature_div — li items with "Label : Value" text
$bullets = $xp->query('//*[@id="detailBullets_feature_div"]//li');
if ($bullets) {
    foreach ($bullets as $li) {
        $text = cleanAmazonText($li->textContent);
        // "Label ‏ : ‎ Value" or "Label : Value"
        if (preg_match('/^(.+?)\s*[:\u200f\u200e]+\s*(.+)$/u', $text, $bm)) {
            $label = strtolower(trim($bm[1], " \u{200E}\u{200F}"));
            $value = trim($bm[2], " \u{200E}\u{200F}");
            if ($label && $value) $details[$label] = $value;
        }
    }
}

// ── Helper to look up details by partial key ──────────────────────────────
function detail(array $d, string ...$keys): string {
    foreach ($keys as $k) {
        $kl = strtolower($k);
        foreach ($d as $label => $val) {
            if (strpos($label, $kl) !== false) return $val;
        }
    }
    return '';
}

// ── Map details to structured fields ──────────────────────────────────────
$discCountRaw = detail($details, 'number of discs', 'disc');
$discCount = (int) preg_replace('/\D/', '', $discCountRaw) ?: 1;

$runtimeRaw = detail($details, 'run time', 'runtime');
$runtimeMin = 0;
if ($runtimeRaw) {
    // "1 hour and 31 minutes" or "91 minutes"
    preg_match('/(\d+)\s*hour/', $runtimeRaw, $hm);
    preg_match('/(\d+)\s*min/', $runtimeRaw, $mm);
    $runtimeMin = intval($hm[1] ?? 0) * 60 + intval($mm[1] ?? 0);
}

// Format detection from URL, title hints, or explicit field
$formatRaw  = detail($details, 'media format', 'format');
$format = 'DVD'; // default
if (stripos($rawUrl . $title . $formatRaw, '4k') !== false || stripos($rawUrl . $title, 'ultra hd') !== false) {
    $format = '4K UHD';
} elseif (stripos($rawUrl . $title . $formatRaw, 'blu-ray') !== false || stripos($rawUrl . $title, 'bluray') !== false) {
    $format = 'Blu-ray';
} elseif (stripos($rawUrl . $title . $formatRaw, 'vhs') !== false) {
    $format = 'VHS';
} elseif (stripos($rawUrl . $title . $formatRaw, 'laserdisc') !== false) {
    $format = 'LaserDisc';
}

// Languages — Amazon sometimes has separate "Language", "Dubbed", "Subtitles" fields
$audioLangs  = detail($details, 'language');
$dubbedLangs = detail($details, 'dubbed');
$subLangs    = detail($details, 'subtitles', 'subtitle');

// Release date — try to normalize to YYYY-MM-DD
$releaseDateRaw = detail($details, 'release date', 'date first');
$releaseDate = '';
if ($releaseDateRaw) {
    $ts = @strtotime($releaseDateRaw);
    if ($ts) $releaseDate = date('Y-m-d', $ts);
}

// Aspect ratio
$aspectRatio = detail($details, 'aspect ratio');

// Region / video system detection from rating/country
$region = '';
$country = detail($details, 'country of origin', 'country');
if ($country) {
    if (in_array(strtolower($country), ['usa', 'united states', 'canada', 'mexico', 'japan'])) {
        $region = $format === 'Blu-ray' || $format === '4K UHD' ? 'Region A' : 'Region 1 (US/CA)';
    } elseif (in_array(strtolower($country), ['uk', 'united kingdom', 'great britain', 'germany', 'france', 'europe'])) {
        $region = $format === 'Blu-ray' || $format === '4K UHD' ? 'Region B' : 'Region 2 (Europe/UK)';
    }
}

// Build edition name suggestion: "Title (Year) - Format + extra info"
$editionName = $title;
if ($format) $editionName .= ' — ' . $format;
if ($discCount > 1) $editionName .= ' — ' . $discCount . ' Disc' . ($discCount > 1 ? 's' : '');
// Detect special editions in title
foreach (['Special Edition', "Collector's Edition", 'Criterion', 'Steelbook', 'Limited Edition', 'Criterion Collection', 'Arrow Video', 'Criterion'] as $kw) {
    if (stripos($title, $kw) !== false) {
        $editionName = $title; // Use full title which contains the edition info
        break;
    }
}

// Build response
$data = [
    'asin'          => $asin ?: detail($details, 'asin'),
    'title'         => $title,
    'edition_name'  => $editionName,
    'format'        => $format,
    'languages'     => $audioLangs,
    'dubbed'        => $dubbedLangs,
    'subtitles'     => $subLangs,
    'distributor'   => detail($details, 'studio', 'label', 'publisher'),
    'disc_count'    => $discCount,
    'country'       => $country,
    'region'        => $region,
    'barcode'       => detail($details, 'model number', 'item model', 'upc', 'ean', 'barcode'),
    'release_date'  => $releaseDate,
    'aspect_ratio'  => $aspectRatio,
    'runtime_min'   => $runtimeMin,
    'images'        => array_values(array_unique($images)),
    'raw_details'   => $details, // pass all detected details for debugging/display
];

echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
