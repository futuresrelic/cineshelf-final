<?php
/**
 * CineShelf Authentication Middleware
 * Validates session tokens and protects API endpoints
 */

require_once __DIR__ . '/../config/oauth-config.php';

/**
 * Authenticate user from request
 * Returns user array or throws exception
 */
function authenticateRequest() {
    // Check for auth token in cookie or header
    $token = $_COOKIE[AUTH_TOKEN_NAME] ?? null;

    if (!$token && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        // Support Bearer token in header
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
        if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            $token = $matches[1];
        }
    }

    if (!$token) {
        // LEGACY SUPPORT: For existing users without auth
        // This allows gradual migration
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $username = $input['user'] ?? null;

        if ($username) {
            return authenticateLegacyUser($username);
        }

        throw new Exception('Authentication required');
    }

    // Validate token
    $db = getDb();
    $stmt = $db->prepare('
        SELECT s.*, u.id as user_id, u.username, u.email, u.display_name, u.is_admin, u.profile_picture, u.oauth_provider
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP
    ');
    $stmt->execute([$token]);
    $session = $stmt->fetch();

    if (!$session) {
        throw new Exception('Invalid or expired session');
    }

    // Update last used timestamp
    $stmt = $db->prepare('UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?');
    $stmt->execute([$session['id']]);

    return [
        'id' => $session['user_id'],
        'username' => $session['username'],
        'email' => $session['email'],
        'display_name' => $session['display_name'],
        'is_admin' => (bool)$session['is_admin'],
        'profile_picture' => $session['profile_picture'],
        'oauth_provider' => $session['oauth_provider']
    ];
}

/**
 * Legacy authentication for existing users
 * Creates OAuth-compatible user record
 */
function authenticateLegacyUser($username) {
    $db = getDb();

    // Check if user exists
    $stmt = $db->prepare('SELECT * FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user) {
        // Create new legacy user
        $stmt = $db->prepare('
            INSERT INTO users (username, is_admin, created_at)
            VALUES (?, 0, CURRENT_TIMESTAMP)
        ');
        $stmt->execute([$username]);

        $userId = $db->lastInsertId();

        $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
    }

    return [
        'id' => $user['id'],
        'username' => $user['username'],
        'email' => $user['email'],
        'display_name' => $user['display_name'] ?? $user['username'],
        'is_admin' => (bool)$user['is_admin'],
        'profile_picture' => $user['profile_picture'],
        'oauth_provider' => $user['oauth_provider'] ?? 'legacy',
        'legacy_mode' => true
    ];
}

/**
 * Require authentication
 * Throws exception if not authenticated
 */
function requireAuth() {
    return authenticateRequest();
}

/**
 * Check if user is admin
 */
function requireAdmin($user) {
    if (!$user['is_admin']) {
        throw new Exception('Admin access required');
    }
}

/**
 * Optional authentication
 * Returns user if authenticated, null otherwise
 */
function optionalAuth() {
    try {
        return authenticateRequest();
    } catch (Exception $e) {
        return null;
    }
}