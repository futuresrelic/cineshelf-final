<?php
/**
 * Debug Auth Endpoint
 * Shows PHP errors to help troubleshoot
 */

// Show all errors
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<pre>";
echo "=== CineShelf Auth Debug ===\n\n";

// Check if files exist
echo "1. Checking required files:\n";
$configPath = __DIR__ . '/../config/config.php';
$oauthConfigPath = __DIR__ . '/../config/oauth-config.php';

echo "   config.php: " . (file_exists($configPath) ? "✓ EXISTS" : "✗ MISSING") . "\n";
echo "   oauth-config.php: " . (file_exists($oauthConfigPath) ? "✓ EXISTS" : "✗ MISSING") . "\n\n";

if (!file_exists($configPath)) {
    die("ERROR: config.php not found at $configPath\n");
}

if (!file_exists($oauthConfigPath)) {
    die("ERROR: oauth-config.php not found at $oauthConfigPath\n");
}

// Try to load config
echo "2. Loading config files:\n";
try {
    require_once $configPath;
    echo "   ✓ config.php loaded\n";
} catch (Exception $e) {
    die("   ✗ config.php failed: " . $e->getMessage() . "\n");
}

try {
    require_once $oauthConfigPath;
    echo "   ✓ oauth-config.php loaded\n";
} catch (Exception $e) {
    die("   ✗ oauth-config.php failed: " . $e->getMessage() . "\n");
}

echo "\n3. Checking OAuth constants:\n";
echo "   GOOGLE_CLIENT_ID: " . (defined('GOOGLE_CLIENT_ID') ? (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID' ? '⚠ NOT SET (placeholder)' : '✓ SET') : '✗ MISSING') . "\n";
echo "   GOOGLE_CLIENT_SECRET: " . (defined('GOOGLE_CLIENT_SECRET') ? (GOOGLE_CLIENT_SECRET === 'YOUR_GOOGLE_CLIENT_SECRET' ? '⚠ NOT SET (placeholder)' : '✓ SET') : '✗ MISSING') . "\n";
echo "   GOOGLE_REDIRECT_URI: " . (defined('GOOGLE_REDIRECT_URI') ? GOOGLE_REDIRECT_URI : '✗ MISSING') . "\n";

echo "\n4. Checking database:\n";
try {
    $db = getDb();
    echo "   ✓ Database connection successful\n";

    // Check sessions table
    $tables = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")->fetchAll();
    if (count($tables) > 0) {
        echo "   ✓ Sessions table exists\n";
    } else {
        echo "   ✗ Sessions table missing (run migration!)\n";
    }

    // Check users table for OAuth columns
    $cols = $db->query("PRAGMA table_info(users)")->fetchAll();
    $hasOAuth = false;
    foreach ($cols as $col) {
        if ($col['name'] === 'oauth_provider') {
            $hasOAuth = true;
            break;
        }
    }

    if ($hasOAuth) {
        echo "   ✓ Users table has OAuth columns\n";
    } else {
        echo "   ✗ Users table missing OAuth columns (run migration!)\n";
    }

} catch (Exception $e) {
    echo "   ✗ Database error: " . $e->getMessage() . "\n";
}

echo "\n5. Testing auth.php verify action:\n";
try {
    session_start();

    // Simulate verify action
    $token = $_COOKIE['cineshelf_auth_token'] ?? null;

    if (!$token) {
        echo "   ℹ No auth token found (expected for first visit)\n";
        echo "   This is normal - user needs to login\n";
    } else {
        echo "   ✓ Auth token found in cookie\n";

        $stmt = $db->prepare('
            SELECT s.*, u.username, u.email
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP
        ');
        $stmt->execute([$token]);
        $session = $stmt->fetch();

        if ($session) {
            echo "   ✓ Valid session found for user: " . $session['username'] . "\n";
        } else {
            echo "   ⚠ Token exists but session invalid/expired\n";
        }
    }

} catch (Exception $e) {
    echo "   ✗ Session check failed: " . $e->getMessage() . "\n";
}

echo "\n=== Debug Complete ===\n";
echo "\nIf you see errors above, fix them and try again.\n";
echo "If everything shows ✓, the issue is elsewhere.\n";
echo "</pre>";
