<?php
/**
 * Get Current Version - Returns current app version
 */

header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store, must-revalidate');

$versionFile = __DIR__ . '/version.json';

if (!file_exists($versionFile)) {
    // Default version if file doesn't exist
    echo json_encode(['version' => '2.1.1']);
    exit;
}

$data = json_decode(file_get_contents($versionFile), true);

echo json_encode([
    'version' => $data['version'] ?? '2.1.1',
    'updated' => $data['updated'] ?? null
]);