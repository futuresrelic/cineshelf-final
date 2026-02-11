<?php
/**
 * upload-cover.php
 * Accepts a multipart POST with a single image file field named "cover".
 * Saves it to /data/uploads/covers/ (Railway persistent volume path)
 * and returns { success: true, url: "/data/uploads/covers/xxx.jpg" }.
 *
 * Auth: session-based (same as api.php).
 */

session_start();

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');

// ── Auth ───────────────────────────────────────────────────────────────────
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// ── File validation ────────────────────────────────────────────────────────
$file = $_FILES['cover'] ?? null;

if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
    $errCodes = [
        UPLOAD_ERR_INI_SIZE   => 'File too large (server limit)',
        UPLOAD_ERR_FORM_SIZE  => 'File too large (form limit)',
        UPLOAD_ERR_PARTIAL    => 'Partial upload',
        UPLOAD_ERR_NO_FILE    => 'No file received',
        UPLOAD_ERR_NO_TMP_DIR => 'No temp directory',
        UPLOAD_ERR_CANT_WRITE => 'Write failed',
        UPLOAD_ERR_EXTENSION  => 'Blocked by extension',
    ];
    $code = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    echo json_encode(['success' => false, 'error' => $errCodes[$code] ?? 'Upload error']);
    exit;
}

// Accept JPEG, PNG, WebP only
$allowedMime = ['image/jpeg', 'image/png', 'image/webp'];
$finfo = new finfo(FILEINFO_MIME_TYPE);
$detectedMime = $finfo->file($file['tmp_name']);
if (!in_array($detectedMime, $allowedMime, true)) {
    echo json_encode(['success' => false, 'error' => 'Only JPEG, PNG or WebP images allowed']);
    exit;
}

// 8 MB hard cap (uploaded image has already been cropped client-side, so usually tiny)
if ($file['size'] > 8 * 1024 * 1024) {
    echo json_encode(['success' => false, 'error' => 'File too large (max 8 MB)']);
    exit;
}

// ── Save ───────────────────────────────────────────────────────────────────
// Store on the Railway persistent volume: <app-root>/data/uploads/covers/
$uploadDir = dirname(__DIR__) . '/data/uploads/covers/';
if (!is_dir($uploadDir)) {
    if (!mkdir($uploadDir, 0755, true)) {
        echo json_encode(['success' => false, 'error' => 'Could not create upload directory']);
        exit;
    }
}

$ext      = ($detectedMime === 'image/png') ? 'png' : (($detectedMime === 'image/webp') ? 'webp' : 'jpg');
$filename = 'cover_' . intval($_SESSION['user_id']) . '_' . uniqid() . '.' . $ext;
$filepath = $uploadDir . $filename;

if (!move_uploaded_file($file['tmp_name'], $filepath)) {
    echo json_encode(['success' => false, 'error' => 'Failed to save file']);
    exit;
}

// URL served directly (data/ is in the web root and publicly readable)
$url = '/data/uploads/covers/' . $filename;

echo json_encode(['success' => true, 'url' => $url]);
