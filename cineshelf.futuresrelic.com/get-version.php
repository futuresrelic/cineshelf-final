<?php
/**
 * Get Current Version — single source of truth for effective app version.
 *
 * Logic (auto-sync on deploy):
 *   1. Read repo version.json  → $repoVersion
 *   2. Read/create data/version.json → $persistedVersion
 *   3. If data file missing  → seed from repo
 *   4. If repo > persisted   → auto-upgrade data file (new code was deployed)
 *   5. effective_version = what is now in data file
 */

header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store, must-revalidate');

$volumeVersionFile = __DIR__ . '/data/version.json';
$sourceVersionFile = __DIR__ . '/version.json';

// ── Read repo version ────────────────────────────────────────────────────────
$repoData    = file_exists($sourceVersionFile) ? json_decode(file_get_contents($sourceVersionFile), true) : [];
$repoVersion = $repoData['version'] ?? '2.0.0';

// ── Read / seed persisted version ───────────────────────────────────────────
$seeded = false;
if (!file_exists($volumeVersionFile)) {
    // First deploy or volume wiped: seed from repo
    $dir = dirname($volumeVersionFile);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $persistedData = $repoData;
    @file_put_contents($volumeVersionFile, json_encode($persistedData, JSON_PRETTY_PRINT));
    $seeded = true;
} else {
    $persistedData = json_decode(file_get_contents($volumeVersionFile), true) ?: $repoData;
}

$persistedVersion = $persistedData['version'] ?? $repoVersion;

// ── Auto-upgrade: new code deployed with higher version ─────────────────────
$autoUpgraded = false;
if (version_compare($repoVersion, $persistedVersion, '>')) {
    $persistedData['version'] = $repoVersion;
    $persistedData['updated'] = date('c');
    $persistedData['source']  = 'auto-sync';
    @file_put_contents($volumeVersionFile, json_encode($persistedData, JSON_PRETTY_PRINT));
    $persistedVersion = $repoVersion;
    $autoUpgraded = true;
}

$effectiveVersion = $persistedVersion;
$source = ($seeded || $autoUpgraded) ? 'repo' : 'data';

echo json_encode([
    'version'           => $effectiveVersion,          // backward-compat key
    'effective_version' => $effectiveVersion,
    'repo_version'      => $repoVersion,
    'persisted_version' => $persistedVersion,
    'source'            => $source,
    'updated'           => $persistedData['updated'] ?? null,
    'auto_upgraded'     => $autoUpgraded,
    'seeded'            => $seeded,
]);
