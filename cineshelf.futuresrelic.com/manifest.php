<?php
/**
 * Dynamic Manifest - Auto-versioned icons
 */

header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store, must-revalidate');

// Read current version
$versionFile = __DIR__ . '/version.json';
$version = '2.1.0'; // Fallback

if (file_exists($versionFile)) {
    $data = json_decode(file_get_contents($versionFile), true);
    $version = $data['version'] ?? '2.1.0';
}

// Output manifest with versioned icons
$manifest = [
    "id" => "/",
    "name" => "CineShelf - Movie Collection Manager",
    "short_name" => "CineShelf",
    "description" => "Manage your physical movie collection",
    "start_url" => "/",
    "display" => "standalone",
    "background_color" => "#0f0f0f",
    "theme_color" => "#667eea",
    "orientation" => "portrait-primary",
    "scope" => "/",
    "categories" => ["entertainment", "lifestyle"],
    "icons" => [
        [
            "src" => "/app-icon.png?v=" . $version,
            "sizes" => "512x512",
            "type" => "image/png",
            "purpose" => "any maskable"
        ],
        [
            "src" => "/app-icon-192.png?v=" . $version,
            "sizes" => "192x192",
            "type" => "image/png",
            "purpose" => "any"
        ]
    ]
];

echo json_encode($manifest, JSON_PRETTY_PRINT);