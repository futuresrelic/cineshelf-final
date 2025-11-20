<?php
/**
 * Version Bumper - Increments app version for cache busting
 */

header('Content-Type: application/json');

$versionFile = __DIR__ . '/../version.json';

if (!file_exists($versionFile)) {
    die(json_encode(['error' => 'version.json not found']));
}

// Read current version
$data = json_decode(file_get_contents($versionFile), true);
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

file_put_contents($versionFile, json_encode($data, JSON_PRETTY_PRINT));

// Return result
echo json_encode([
    'success' => true,
    'oldVersion' => $currentVersion,
    'newVersion' => $newVersion,
    'message' => "Version bumped from $currentVersion to $newVersion"
]);