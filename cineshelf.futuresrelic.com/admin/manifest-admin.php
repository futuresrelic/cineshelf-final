<?php
/**
 * CineShelf Admin PWA Manifest
 * Separate installable app for admin panel
 */

header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store, must-revalidate');

// Read version from volume-persisted location first, then fall back to source
$volumeVersionFile = dirname(__DIR__) . '/data/version.json';
$sourceVersionFile = dirname(__DIR__) . '/version.json';
$versionFile = file_exists($volumeVersionFile) ? $volumeVersionFile : $sourceVersionFile;
$version = '2.1.0'; // Fallback

if (file_exists($versionFile)) {
    $data = json_decode(file_get_contents($versionFile), true);
    $version = $data['version'] ?? '2.1.0';
}

// Output manifest with versioned icons
$manifest = [
    "id" => "/admin/",
    "name" => "CineShelf Admin - Management Panel",
    "short_name" => "CineShelf Admin",
    "description" => "Administration panel for CineShelf movie collection manager",
    "start_url" => "/admin/",
    "display" => "standalone",
    "background_color" => "#1a1a1a",
    "theme_color" => "#4a9eff",
    "orientation" => "portrait-primary",
    "scope" => "/admin/",
    "categories" => ["utilities", "productivity"],
    "icons" => [
        [
            "src" => "/admin/admin-icon.png?v=" . $version,
            "sizes" => "512x512",
            "type" => "image/png",
            "purpose" => "any maskable"
        ],
        [
            "src" => "/admin/admin-icon-192.png?v=" . $version,
            "sizes" => "192x192",
            "type" => "image/png",
            "purpose" => "any"
        ]
    ]
];

echo json_encode($manifest, JSON_PRETTY_PRINT);
