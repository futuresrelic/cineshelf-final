<?php
/**
 * CineShelf OAuth Configuration
 * Google OAuth 2.0 settings
 */

// IMPORTANT: You need to set these values from Google Cloud Console
// 1. Go to: https://console.cloud.google.com/
// 2. Create a new project or select existing
// 3. Enable Google+ API
// 4. Create OAuth 2.0 credentials
// 5. Add authorized redirect URI: https://cineshelf.futuresrelic.com/api/auth.php

define('GOOGLE_CLIENT_ID', '754407099284-tqu2gj2b2ifm01ti34eqto6mejou75pr.apps.googleusercontent.com');
define('GOOGLE_CLIENT_SECRET', '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');
define('GOOGLE_REDIRECT_URI', 'https://cineshelf.futuresrelic.com/api/auth.php');

// OAuth endpoints
define('GOOGLE_AUTH_URL', 'https://accounts.google.com/o/oauth2/v2/auth');
define('GOOGLE_TOKEN_URL', 'https://oauth2.googleapis.com/token');
define('GOOGLE_USERINFO_URL', 'https://www.googleapis.com/oauth2/v2/userinfo');

// Session configuration
define('SESSION_LIFETIME', 30 * 24 * 60 * 60); // 30 days
define('AUTH_TOKEN_NAME', 'cineshelf_auth_token');
