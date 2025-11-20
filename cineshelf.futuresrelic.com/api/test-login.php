<?php
/**
 * Test Login Flow - Verbose Debugging
 */

// Start output buffering to catch everything
ob_start();

echo "<pre>";
echo "=== Testing Login Flow ===\n\n";

try {
    echo "Step 1: Loading config.php...\n";
    require_once __DIR__ . '/../config/config.php';
    echo "   ✓ config.php loaded\n\n";

    echo "Step 2: Loading oauth-config.php...\n";
    require_once __DIR__ . '/../config/oauth-config.php';
    echo "   ✓ oauth-config.php loaded\n\n";

    echo "Step 3: Starting session...\n";
    session_start();
    echo "   ✓ Session started (ID: " . session_id() . ")\n\n";

    echo "Step 4: Checking required constants...\n";
    $required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_AUTH_URL', 'GOOGLE_REDIRECT_URI'];
    foreach ($required as $const) {
        if (!defined($const)) {
            throw new Exception("Missing constant: $const");
        }
        $value = constant($const);
        $display = (strlen($value) > 50) ? substr($value, 0, 30) . '...' : $value;
        echo "   ✓ $const = $display\n";
    }
    echo "\n";

    echo "Step 5: Building OAuth URL...\n";
    $params = [
        'client_id' => GOOGLE_CLIENT_ID,
        'redirect_uri' => GOOGLE_REDIRECT_URI,
        'response_type' => 'code',
        'scope' => 'email profile',
        'access_type' => 'offline',
        'prompt' => 'select_account'
    ];
    echo "   Parameters:\n";
    foreach ($params as $key => $val) {
        $display = (strlen($val) > 50) ? substr($val, 0, 30) . '...' : $val;
        echo "      $key = $display\n";
    }

    $queryString = http_build_query($params);
    echo "\n   Query string length: " . strlen($queryString) . " chars\n";

    $authUrl = GOOGLE_AUTH_URL . '?' . $queryString;
    echo "   Full URL length: " . strlen($authUrl) . " chars\n";
    echo "   URL preview: " . substr($authUrl, 0, 80) . "...\n\n";

    echo "Step 6: Testing redirect...\n";
    if (headers_sent($file, $line)) {
        echo "   ⚠ WARNING: Headers already sent by $file:$line\n";
        echo "   Cannot perform actual redirect, but URL is valid\n\n";
    } else {
        echo "   ✓ Headers not sent yet\n";
        echo "   Ready to redirect!\n\n";
    }

    echo "=== ALL CHECKS PASSED ===\n\n";
    echo "The login should work. Here's the redirect URL:\n\n";
    echo "<a href='$authUrl' style='display:inline-block;padding:10px 20px;background:#4285f4;color:white;text-decoration:none;border-radius:4px;'>Click to Login with Google</a>\n\n";

    echo "Or test the actual auth.php:\n";
    echo "<a href='/api/auth.php?action=login' style='display:inline-block;padding:10px 20px;background:#667eea;color:white;text-decoration:none;border-radius:4px;margin-left:10px;'>Test auth.php?action=login</a>\n\n";

} catch (Exception $e) {
    echo "\n❌ ERROR: " . $e->getMessage() . "\n";
    echo "File: " . $e->getFile() . "\n";
    echo "Line: " . $e->getLine() . "\n";
    echo "\nStack trace:\n" . $e->getTraceAsString() . "\n";
} catch (Error $e) {
    echo "\n❌ FATAL ERROR: " . $e->getMessage() . "\n";
    echo "File: " . $e->getFile() . "\n";
    echo "Line: " . $e->getLine() . "\n";
    echo "\nStack trace:\n" . $e->getTraceAsString() . "\n";
}

echo "</pre>";

// Flush output
ob_end_flush();
