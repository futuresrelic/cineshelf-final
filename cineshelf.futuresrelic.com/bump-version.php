<?php
/**
 * Bump Version - Increment patch version and update version.json
 * Admin-only. Call after deploying CSS/JS changes to bust client caches.
 */

header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store, must-revalidate');

require_once __DIR__ . '/api/auth-middleware.php';

try {
    $user = authenticateRequest();
    requireAdmin($user);
} catch (Exception $e) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    exit;
}

$versionFile = __DIR__ . '/version.json';

$data = ['version' => '2.1.1', 'updated' => null];
if (file_exists($versionFile)) {
    $decoded = json_decode(file_get_contents($versionFile), true);
    if ($decoded) {
        $data = $decoded;
    }
}

// Parse and increment patch version (e.g. 2.2.14 -> 2.2.15)
$parts = explode('.', $data['version'] ?? '2.1.1');
if (count($parts) === 3 && is_numeric($parts[2])) {
    $parts[2] = (int)$parts[2] + 1;
    $data['version'] = implode('.', $parts);
} else {
    $data['version'] = '2.1.2';
}

$data['updated'] = date('c');

if (file_put_contents($versionFile, json_encode($data, JSON_PRETTY_PRINT)) === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to write version file']);
    exit;
}

echo json_encode(['success' => true, 'version' => $data['version'], 'updated' => $data['updated']]);
