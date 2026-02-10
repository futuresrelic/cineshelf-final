<?php
/**
 * Version Bumper - Increments app version for cache busting
 */

header('Content-Type: application/json');

// Write/read from volume-persisted location so bumped version survives Railway deploys.
// Falls back to reading from source version.json on the very first bump.
$volumeVersionFile = __DIR__ . '/../data/version.json';
$sourceVersionFile = __DIR__ . '/../version.json';

// Read from volume if it exists, otherwise seed from source
$readFrom = file_exists($volumeVersionFile) ? $volumeVersionFile : $sourceVersionFile;
$writeTo  = $volumeVersionFile; // Always write to volume

if (!file_exists($readFrom)) {
    die(json_encode(['error' => 'version.json not found']));
}

// Read current version
$data = json_decode(file_get_contents($readFrom), true);
$currentVersion = $data['version'] ?? '2.0.0';

// Parse version (e.g., "2.1.1" -> [2, 1, 1])
$parts = explode('.', $currentVersion);
$major = (int)($parts[0] ?? 2);
$minor = (int)($parts[1] ?? 0);
$patch = (int)($parts[2] ?? 0);

// Increment patch version
$patch++;

// Create new version
$newVersion = "$major.$minor.$patch";

// Update file
$data['version'] = $newVersion;
$data['updated'] = date('c'); // ISO 8601 timestamp

file_put_contents($writeTo, json_encode($data, JSON_PRETTY_PRINT));

// Return result
echo json_encode([
    'success' => true,
    'oldVersion' => $currentVersion,
    'newVersion' => $newVersion,
    'message' => "Version bumped from $currentVersion to $newVersion"
]);