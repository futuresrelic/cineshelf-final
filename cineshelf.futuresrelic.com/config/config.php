<?php
/**
 * CineShelf - Database Configuration
 * Clean architecture inspired by ChoreQuest
 * Version: Managed by version-manager.html (see version.json)
 */

// Database file location
define('DB_PATH', __DIR__ . '/../data/cineshelf.sqlite');
define('DATA_DIR', __DIR__ . '/../data');

// TMDB API Configuration
define('TMDB_API_KEY', '8039283176a74ffd71a1658c6f84a051');
define('TMDB_BASE_URL', 'https://api.themoviedb.org/3');
define('TMDB_IMAGE_BASE', 'https://image.tmdb.org/t/p/w500');

// App Configuration
// Read version dynamically from version.json (managed by version-manager.html)
$versionFile = __DIR__ . '/../version.json';
$appVersion = '2.0.0'; // Fallback version
if (file_exists($versionFile)) {
    $versionData = json_decode(file_get_contents($versionFile), true);
    $appVersion = $versionData['version'] ?? '2.0.0';
}
define('APP_VERSION', $appVersion);
define('DEFAULT_USER', 'default');

// Admin users list (usernames)
define('ADMIN_USERS', ['admin', 'klindakoil', 'default']);

// Error Reporting Configuration
// Set to true for development (shows detailed errors), false for production (logs errors silently)
define('DEBUG_MODE', false);

if (DEBUG_MODE) {
    // Development: Show all errors
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
    ini_set('display_startup_errors', 1);
} else {
    // Production: Log errors, don't display them
    error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
    ini_set('display_errors', 0);
    ini_set('log_errors', 1);
    ini_set('error_log', __DIR__ . '/../data/php-errors.log');
}

// Security settings
ini_set('session.cookie_httponly', 1);
ini_set('session.cookie_samesite', 'Lax');
date_default_timezone_set('America/New_York');

// Create data directory if needed
if (!file_exists(DATA_DIR)) {
    mkdir(DATA_DIR, 0755, true);
}

/**
 * Get database connection with proper configuration
 * @return PDO Database connection
 */
function getDb() {
    try {
        // Create database file if it doesn't exist
        $isNewDb = !file_exists(DB_PATH);
        
        $db = new PDO('sqlite:' . DB_PATH);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        
        // Enable foreign keys
        $db->exec('PRAGMA foreign_keys = ON');
        
        // Performance settings
        $db->exec('PRAGMA journal_mode = WAL');
        $db->exec('PRAGMA synchronous = NORMAL');
        $db->exec('PRAGMA temp_store = MEMORY');
        $db->exec('PRAGMA cache_size = 10000');
        
        // Initialize database schema if new
        if ($isNewDb) {
            initializeDatabase($db);
        }
        
        return $db;
        
    } catch (PDOException $e) {
        error_log('CineShelf: Database connection failed: ' . $e->getMessage());
        throw new Exception('Database connection failed');
    }
}

/**
 * Initialize database with schema
 * @param PDO $db Database connection
 */
function initializeDatabase($db) {
    $schemaFile = __DIR__ . '/../api/schema.sql';
    
    if (!file_exists($schemaFile)) {
        throw new Exception('Schema file not found');
    }
    
    $schema = file_get_contents($schemaFile);
    $db->exec($schema);
    
    error_log('CineShelf: Database initialized successfully');
}

/**
 * Check if user is admin
 * @param string $username Username to check
 * @return bool True if admin
 */
function isAdmin($username) {
    return in_array($username, ADMIN_USERS);
}

/**
 * Sanitize input string
 * @param string $str Input string
 * @param int $maxLength Maximum length
 * @return string Sanitized string
 */
function sanitize($str, $maxLength = 255) {
    $str = trim($str);
    $str = strip_tags($str);
    return substr($str, 0, $maxLength);
}

/**
 * Generate unique ID
 * @return string Unique identifier
 */
function generateId() {
    return bin2hex(random_bytes(16));
}

/**
 * Log action to audit trail
 * @param PDO $db Database connection
 * @param int $userId User ID
 * @param string $action Action performed
 * @param string $targetType Target type (movie, copy, wishlist)
 * @param int $targetId Target ID
 * @param array $details Additional details
 */
function logAction($db, $userId, $action, $targetType = null, $targetId = null, $details = []) {
    try {
        $stmt = $db->prepare("
            INSERT INTO audit_log (user_id, action, target_type, target_id, details_json)
            VALUES (?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $userId,
            $action,
            $targetType,
            $targetId,
            json_encode($details)
        ]);
    } catch (Exception $e) {
        error_log('CineShelf: Failed to log action: ' . $e->getMessage());
    }
}

/**
 * Get or create user by username
 * @param PDO $db Database connection
 * @param string $username Username
 * @return array User record
 */
function getOrCreateUser($db, $username) {
    $username = sanitize($username, 50);
    
    // Try to find existing user
    $stmt = $db->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();
    
    if ($user) {
        return $user;
    }
    
    // Create new user
    $isAdmin = isAdmin($username) ? 1 : 0;
    
    $stmt = $db->prepare("
        INSERT INTO users (username, is_admin, settings_json)
        VALUES (?, ?, ?)
    ");
    $stmt->execute([
        $username,
        $isAdmin,
        json_encode(['defaultView' => 'grid', 'gridColumns' => 5])
    ]);
    
    $userId = $db->lastInsertId();
    
    // Get the newly created user
    $stmt = $db->prepare("SELECT * FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    
    error_log("CineShelf: Created new user: $username (ID: $userId, Admin: $isAdmin)");
    
    return $stmt->fetch();
}

/**
 * JSON response helper
 * @param bool $ok Success status
 * @param mixed $data Response data
 * @param string $error Error message
 */
function jsonResponse($ok, $data = null, $error = null) {
    header('Content-Type: application/json');
    echo json_encode([
        'ok' => $ok,
        'data' => $data,
        'error' => $error
    ]);
    exit;
}