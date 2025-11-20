<?php
/**
 * CineShelf Authentication Handler - DEBUG VERSION
 * Shows all errors to help troubleshoot
 */

// Show ALL errors
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);

echo "<pre>";
echo "=== Auth Debug Mode ===\n\n";

try {
    echo "1. Loading config files...\n";
    require_once __DIR__ . '/../config/config.php';
    echo "   ✓ config.php loaded\n";

    require_once __DIR__ . '/../config/oauth-config.php';
    echo "   ✓ oauth-config.php loaded\n";

    echo "\n2. Starting session...\n";
    session_start();
    echo "   ✓ Session started\n";

    echo "\n3. Checking OAuth constants...\n";
    echo "   GOOGLE_CLIENT_ID: " . (defined('GOOGLE_CLIENT_ID') ? substr(GOOGLE_CLIENT_ID, 0, 20) . '...' : 'MISSING') . "\n";
    echo "   GOOGLE_AUTH_URL: " . (defined('GOOGLE_AUTH_URL') ? GOOGLE_AUTH_URL : 'MISSING') . "\n";
    echo "   GOOGLE_REDIRECT_URI: " . (defined('GOOGLE_REDIRECT_URI') ? GOOGLE_REDIRECT_URI : 'MISSING') . "\n";

    echo "\n4. Checking PHP extensions...\n";
    echo "   curl: " . (extension_loaded('curl') ? '✓ Available' : '✗ MISSING') . "\n";
    echo "   json: " . (extension_loaded('json') ? '✓ Available' : '✗ MISSING') . "\n";

    if (!extension_loaded('curl')) {
        die("\n❌ FATAL: curl extension is required but not installed!\n");
    }

    echo "\n5. Testing OAuth URL generation...\n";
    $params = [
        'client_id' => GOOGLE_CLIENT_ID,
        'redirect_uri' => GOOGLE_REDIRECT_URI,
        'response_type' => 'code',
        'scope' => 'email profile',
        'access_type' => 'offline',
        'prompt' => 'select_account'
    ];

    $authUrl = GOOGLE_AUTH_URL . '?' . http_build_query($params);
    echo "   Generated URL length: " . strlen($authUrl) . " characters\n";
    echo "   URL starts with: " . substr($authUrl, 0, 50) . "...\n";

    echo "\n6. Testing header setting...\n";
    if (headers_sent($file, $line)) {
        echo "   ⚠ Headers already sent by $file:$line\n";
    } else {
        echo "   ✓ Headers not sent yet - can still redirect\n";
    }

    echo "\n=== All Checks Passed ===\n\n";
    echo "The login flow SHOULD work. Let's test the actual redirect:\n\n";
    echo "<a href='/api/auth.php?action=login' style='display:inline-block;padding:10px 20px;background:#667eea;color:white;text-decoration:none;border-radius:5px;'>Click here to test Google login redirect</a>\n\n";
    echo "(This should redirect you to Google's login page)\n";

} catch (Exception $e) {
    echo "\n❌ ERROR: " . $e->getMessage() . "\n";
    echo "Stack trace:\n" . $e->getTraceAsString() . "\n";
}

echo "</pre>";
