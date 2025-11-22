<?php
/**
 * CineShelf Authentication Handler
 * Google OAuth 2.0 flow
 */

// Enable error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/oauth-config.php';

session_start();

// Get action from query parameter
$action = $_GET['action'] ?? '';

// Only set JSON header for verify/logout actions (login/callback do redirects)
if (in_array($action, ['verify', 'logout'])) {
    header('Content-Type: application/json');
}

try {
    switch ($action) {
        case 'login':
            handleLogin();
            break;

        case 'callback':
            handleCallback();
            break;

        case 'logout':
            handleLogout();
            break;

        case 'verify':
            handleVerify();
            break;

        default:
            // Default: redirect to Google OAuth
            if (isset($_GET['code'])) {
                handleCallback();
            } else {
                handleLogin();
            }
            break;
    }
} catch (Exception $e) {
    error_log('Auth error: ' . $e->getMessage());
    authJsonResponse(false, null, $e->getMessage());
}

/**
 * Initiate Google OAuth login
 */
function handleLogin() {
    // Check if already logged in
    if (isset($_SESSION['user_id'])) {
        $returnUrl = $_GET['return_url'] ?? '/index.html';
        header('Location: ' . $returnUrl);
        exit;
    }

    // Save return URL in session for after OAuth callback
    if (isset($_GET['return_url'])) {
        $_SESSION['oauth_return_url'] = $_GET['return_url'];
    }

    // Build Google OAuth URL
    $params = [
        'client_id' => GOOGLE_CLIENT_ID,
        'redirect_uri' => GOOGLE_REDIRECT_URI,
        'response_type' => 'code',
        'scope' => 'email profile',
        'access_type' => 'offline',
        'prompt' => 'select_account',
        'state' => bin2hex(random_bytes(16)) // CSRF protection
    ];

    $authUrl = GOOGLE_AUTH_URL . '?' . http_build_query($params);

    // Redirect to Google
    header('Location: ' . $authUrl);
    exit;
}

/**
 * Handle OAuth callback from Google
 */
function handleCallback() {
    if (!isset($_GET['code'])) {
        throw new Exception('No authorization code received');
    }

    $code = $_GET['code'];

    // Exchange code for access token
    $tokenData = exchangeCodeForToken($code);

    if (!$tokenData || !isset($tokenData['access_token'])) {
        throw new Exception('Failed to get access token');
    }

    // Get user info from Google
    $userInfo = getUserInfo($tokenData['access_token']);

    if (!$userInfo || !isset($userInfo['email'])) {
        throw new Exception('Failed to get user info');
    }

    // Create or update user in database
    $db = getDb();
    $user = createOrUpdateUser($db, $userInfo);

    // Create session
    createSession($user, $tokenData);

    // Get return URL from session (if set from login page)
    $returnUrl = $_SESSION['oauth_return_url'] ?? '/index.html';
    unset($_SESSION['oauth_return_url']); // Clear it after use

    // Redirect to return URL or app
    header('Location: ' . $returnUrl);
    exit;
}

/**
 * Exchange authorization code for access token
 */
function exchangeCodeForToken($code) {
    $params = [
        'code' => $code,
        'client_id' => GOOGLE_CLIENT_ID,
        'client_secret' => GOOGLE_CLIENT_SECRET,
        'redirect_uri' => GOOGLE_REDIRECT_URI,
        'grant_type' => 'authorization_code'
    ];

    $ch = curl_init(GOOGLE_TOKEN_URL);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        error_log('Token exchange failed: ' . $response);
        return null;
    }

    return json_decode($response, true);
}

/**
 * Get user info from Google
 */
function getUserInfo($accessToken) {
    $ch = curl_init(GOOGLE_USERINFO_URL);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $accessToken
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        error_log('User info fetch failed: ' . $response);
        return null;
    }

    return json_decode($response, true);
}

/**
 * Create or update user in database
 */
function createOrUpdateUser($db, $userInfo) {
    $email = $userInfo['email'];
    $googleId = $userInfo['id'];
    $name = $userInfo['name'] ?? $email;
    $picture = $userInfo['picture'] ?? null;

    // Check if user exists
    $stmt = $db->prepare('SELECT * FROM users WHERE email = ? OR oauth_provider_id = ?');
    $stmt->execute([$email, $googleId]);
    $user = $stmt->fetch();

    if ($user) {
        // Update existing user
        $stmt = $db->prepare('
            UPDATE users
            SET oauth_provider_id = ?,
                oauth_provider = "google",
                profile_picture = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ');
        $stmt->execute([$googleId, $picture, $user['id']]);

        // Fetch updated user
        $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$user['id']]);
        return $stmt->fetch();
    } else {
        // Create new user
        $username = createUniqueUsername($db, $name, $email);

        $stmt = $db->prepare('
            INSERT INTO users (username, email, oauth_provider, oauth_provider_id, profile_picture, is_admin, created_at)
            VALUES (?, ?, "google", ?, ?, 0, CURRENT_TIMESTAMP)
        ');
        $stmt->execute([$username, $email, $googleId, $picture]);

        $userId = $db->lastInsertId();

        // Fetch new user
        $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        return $stmt->fetch();
    }
}

/**
 * Create unique username from name/email
 */
function createUniqueUsername($db, $name, $email) {
    // Start with name, fallback to email prefix
    $base = $name ?: explode('@', $email)[0];
    $base = preg_replace('/[^a-zA-Z0-9]/', '', $base);
    $base = strtolower(substr($base, 0, 20));

    $username = $base;
    $counter = 1;

    while (true) {
        $stmt = $db->prepare('SELECT id FROM users WHERE username = ?');
        $stmt->execute([$username]);

        if (!$stmt->fetch()) {
            return $username;
        }

        $username = $base . $counter;
        $counter++;
    }
}

/**
 * Create session for user
 */
function createSession($user, $tokenData) {
    // Generate session token
    $sessionToken = bin2hex(random_bytes(32));

    // Store in database
    $db = getDb();
    $expiresAt = date('Y-m-d H:i:s', time() + SESSION_LIFETIME);

    $stmt = $db->prepare('
        INSERT INTO sessions (user_id, token, oauth_access_token, oauth_refresh_token, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ');
    $stmt->execute([
        $user['id'],
        $sessionToken,
        $tokenData['access_token'] ?? null,
        $tokenData['refresh_token'] ?? null,
        $expiresAt
    ]);

    // Set PHP session
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['email'] = $user['email'];
    $_SESSION['is_admin'] = (bool)$user['is_admin'];
    $_SESSION['session_token'] = $sessionToken;

    // Set cookie
    // Note: secure flag should be true for HTTPS, but we detect it dynamically
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
        || (!empty($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);

    setcookie(
        AUTH_TOKEN_NAME,
        $sessionToken,
        time() + SESSION_LIFETIME,
        '/',
        '',
        $isHttps, // HTTPS only if actually using HTTPS
        true  // HTTP only (prevents JavaScript access)
    );

    // Log for debugging
    error_log(sprintf('Session cookie set: %s (HTTPS: %s, Expires: %s)',
        AUTH_TOKEN_NAME,
        $isHttps ? 'yes' : 'no',
        date('Y-m-d H:i:s', time() + SESSION_LIFETIME)
    ));
}

/**
 * Handle logout
 */
function handleLogout() {
    // Delete session from database
    if (isset($_SESSION['session_token'])) {
        $db = getDb();
        $stmt = $db->prepare('DELETE FROM sessions WHERE token = ?');
        $stmt->execute([$_SESSION['session_token']]);
    }

    // Clear PHP session
    session_destroy();

    // Clear cookie
    setcookie(AUTH_TOKEN_NAME, '', time() - 3600, '/');

    authJsonResponse(true, ['message' => 'Logged out successfully']);
}

/**
 * Verify current session
 */
function handleVerify() {
    $token = $_COOKIE[AUTH_TOKEN_NAME] ?? $_SESSION['session_token'] ?? null;

    if (!$token) {
        authJsonResponse(false, null, 'Not authenticated');
    }

    $db = getDb();
    $stmt = $db->prepare('
        SELECT s.*, u.username, u.email, u.display_name, u.is_admin, u.profile_picture, u.oauth_provider
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP
    ');
    $stmt->execute([$token]);
    $session = $stmt->fetch();

    if (!$session) {
        authJsonResponse(false, null, 'Invalid or expired session');
    }

    // Update session in PHP
    $_SESSION['user_id'] = $session['user_id'];
    $_SESSION['username'] = $session['username'];
    $_SESSION['email'] = $session['email'];
    $_SESSION['is_admin'] = (bool)$session['is_admin'];

    authJsonResponse(true, [
        'user_id' => $session['user_id'],
        'username' => $session['username'],
        'email' => $session['email'],
        'display_name' => $session['display_name'],
        'is_admin' => (bool)$session['is_admin'],
        'profile_picture' => $session['profile_picture'],
        'oauth_provider' => $session['oauth_provider']
    ]);
}

/**
 * JSON response helper for auth endpoints
 */
function authJsonResponse($success, $data = null, $error = null) {
    header('Content-Type: application/json');
    echo json_encode([
        'success' => $success,
        'data' => $data,
        'error' => $error
    ]);
    exit;
}