<?php
/**
 * CineShelf OAuth Configuration
 * Google OAuth 2.0 settings
 */

// IMPORTANT: Set these values as environment variables (recommended)
// Or create config/secrets.php with return ['GOOGLE_CLIENT_ID' => '...', ...]
//
// Get credentials from: https://console.cloud.google.com/apis/credentials
// 1. Create OAuth 2.0 credentials
// 2. Add authorized redirect URI to match your deployment URL
// 3. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI as environment variables

// Read from environment variables first, then fall back to secrets.php
$googleClientId = getenv('GOOGLE_CLIENT_ID');
$googleClientSecret = getenv('GOOGLE_CLIENT_SECRET');
$googleRedirectUri = getenv('GOOGLE_REDIRECT_URI');

// Fallback to secrets.php for local development (not in version control)
if (!$googleClientId || !$googleClientSecret || !$googleRedirectUri) {
    if (file_exists(__DIR__ . '/secrets.php')) {
        $secrets = include __DIR__ . '/secrets.php';
        $googleClientId = $googleClientId ?: ($secrets['GOOGLE_CLIENT_ID'] ?? '');
        $googleClientSecret = $googleClientSecret ?: ($secrets['GOOGLE_CLIENT_SECRET'] ?? '');
        $googleRedirectUri = $googleRedirectUri ?: ($secrets['GOOGLE_REDIRECT_URI'] ?? '');
    }
}

// Fallback for legacy setups (will show warning if used)
if (!$googleClientId) {
    $googleClientId = '';
    error_log('WARNING: GOOGLE_CLIENT_ID is not set. Please set environment variable!');
}
if (!$googleClientSecret) {
    $googleClientSecret = '';
    error_log('WARNING: GOOGLE_CLIENT_SECRET is not set. Please set environment variable!');
}
if (!$googleRedirectUri) {
    $googleRedirectUri = 'https://cineshelf.futuresrelic.com/api/auth.php';
    error_log('WARNING: Using hardcoded GOOGLE_REDIRECT_URI. Please set environment variable!');
}

define('GOOGLE_CLIENT_ID', $googleClientId);
define('GOOGLE_CLIENT_SECRET', $googleClientSecret);
define('GOOGLE_REDIRECT_URI', $googleRedirectUri);

// OAuth endpoints
define('GOOGLE_AUTH_URL', 'https://accounts.google.com/o/oauth2/v2/auth');
define('GOOGLE_TOKEN_URL', 'https://oauth2.googleapis.com/token');
define('GOOGLE_USERINFO_URL', 'https://www.googleapis.com/oauth2/v2/userinfo');

// Session configuration
define('SESSION_LIFETIME', 30 * 24 * 60 * 60); // 30 days
define('AUTH_TOKEN_NAME', 'cineshelf_auth_token');
