<?php
/**
 * Get Current Version - Returns current app version
 * Updated: 2026-02-09 - Box set system v2.3.0
 */

header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store, must-revalidate');

// Check volume-persisted version first (survives Railway deploys),
// then fall back to the source-controlled version.json
$volumeVersionFile = __DIR__ . '/data/version.json';
$sourceVersionFile = __DIR__ . '/version.json';

$versionFile = file_exists($volumeVersionFile) ? $volumeVersionFile : $sourceVersionFile;

if (!file_exists($versionFile)) {
    echo json_encode(['version' => '2.1.1']);
    exit;
}

$data = json_decode(file_get_contents($versionFile), true);

echo json_encode([
    'version' => $data['version'] ?? '2.1.1',
    'updated' => $data['updated'] ?? null
]);