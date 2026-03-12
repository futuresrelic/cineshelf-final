<?php
/**
 * CineShelf - Database Configuration
 * Clean architecture inspired by ChoreQuest
 * Version: Managed by version-manager.html (see version.json)
 */

// Database file location
// Read from environment variable or use default path
$dbPath = getenv('DB_PATH');
if (!$dbPath) {
    $dbPath = __DIR__ . '/../data/cineshelf.sqlite';
}
define('DB_PATH', $dbPath);
define('DATA_DIR', dirname(DB_PATH));

// TMDB API Configuration
// Read from environment variable (set TMDB_API_KEY in Railway or local .env)
$tmdbKey = getenv('TMDB_API_KEY');
if (!$tmdbKey) {
    // No hardcoded fallback — set TMDB_API_KEY environment variable
    $tmdbKey = '';
}
define('TMDB_API_KEY', $tmdbKey);
define('TMDB_BASE_URL', 'https://api.themoviedb.org/3');
define('TMDB_IMAGE_BASE', 'https://image.tmdb.org/t/p/w500');

// UMDB API Configuration (physical media database)
// Read from environment variable — leave blank to use UMDB's open/unauthenticated mode
$umdbKey = getenv('UMDB_API_KEY');
if (!$umdbKey && file_exists(__DIR__ . '/secrets.php')) {
    $secrets = isset($secrets) ? $secrets : (include __DIR__ . '/secrets.php');
    $umdbKey = $secrets['UMDB_API_KEY'] ?? '';
}
define('UMDB_API_KEY', $umdbKey ?: '');
define('UMDB_BASE_URL', 'https://umdb-production.up.railway.app/api/v1');

// OpenAI API Configuration (for AI-powered article extraction)
// Load from environment variable or local secrets file (not in version control)
$openaiKey = getenv('OPENAI_API_KEY');
if (!$openaiKey && file_exists(__DIR__ . '/secrets.php')) {
    $secrets = include __DIR__ . '/secrets.php';
    $openaiKey = $secrets['OPENAI_API_KEY'] ?? '';
}
define('OPENAI_API_KEY', $openaiKey ?: '');
define('OPENAI_MODEL', 'gpt-4o-mini'); // Cost-effective model (~$0.01 per article)
define('OPENAI_API_URL', 'https://api.openai.com/v1/chat/completions');

// App Configuration
// Read version from volume-persisted location first, then fall back to source
$volumeVersionFile = __DIR__ . '/../data/version.json';
$sourceVersionFile = __DIR__ . '/../version.json';
$versionFile = file_exists($volumeVersionFile) ? $volumeVersionFile : $sourceVersionFile;
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
// Read from environment variable (DEBUG_MODE=true or DEBUG_MODE=false)
$debugMode = getenv('DEBUG_MODE');
if ($debugMode === 'true' || $debugMode === '1') {
    $debugMode = true;
} else if ($debugMode === 'false' || $debugMode === '0') {
    $debugMode = false;
} else {
    // Default to false (production) if not set
    $debugMode = false;
}
define('DEBUG_MODE', $debugMode);

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

        // Auto-migrate: TV show support columns (v2.7.1)
        try { $db->exec("ALTER TABLE copies ADD COLUMN seasons_owned TEXT"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE movies ADD COLUMN number_of_seasons INTEGER"); } catch (PDOException $e) {}

        // Auto-migrate: Physical media attributes (v3.0.0)
        try { $db->exec("ALTER TABLE copies ADD COLUMN aspect_ratio TEXT DEFAULT NULL"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE copies ADD COLUMN package_type TEXT DEFAULT NULL"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE copies ADD COLUMN feature_count TEXT DEFAULT 'Single'"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE copies ADD COLUMN has_slipcover INTEGER DEFAULT 0"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE copies ADD COLUMN has_booklet INTEGER DEFAULT 0"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE copies ADD COLUMN has_bonus_disc INTEGER DEFAULT 0"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE copies ADD COLUMN bonus_disc_count INTEGER DEFAULT 0"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE copies ADD COLUMN has_digital_copy INTEGER DEFAULT 0"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE copies ADD COLUMN has_3d INTEGER DEFAULT 0"); } catch (PDOException $e) {}
        // Container physical media attributes
        try { $db->exec("ALTER TABLE containers ADD COLUMN aspect_ratio TEXT DEFAULT NULL"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE containers ADD COLUMN package_type TEXT DEFAULT NULL"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE containers ADD COLUMN feature_count TEXT DEFAULT NULL"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE containers ADD COLUMN has_slipcover INTEGER DEFAULT 0"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE containers ADD COLUMN has_booklet INTEGER DEFAULT 0"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE containers ADD COLUMN has_bonus_disc INTEGER DEFAULT 0"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE containers ADD COLUMN bonus_disc_count INTEGER DEFAULT 0"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE containers ADD COLUMN has_digital_copy INTEGER DEFAULT 0"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE containers ADD COLUMN has_3d INTEGER DEFAULT 0"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE containers ADD COLUMN spine_type TEXT DEFAULT 'color'"); } catch (PDOException $e) {}
        // Recreate view with new fields
        try {
            $db->exec("DROP VIEW IF EXISTS containers_with_counts");
            $db->exec("CREATE VIEW IF NOT EXISTS containers_with_counts AS SELECT c.*, COUNT(cc.id) as total_movies, SUM(CASE WHEN cc.is_present = 1 THEN 1 ELSE 0 END) as present_movies, SUM(CASE WHEN cc.is_present = 0 THEN 1 ELSE 0 END) as missing_movies FROM containers c LEFT JOIN container_contents cc ON c.id = cc.container_id GROUP BY c.id");
        } catch (PDOException $e) {}

        // Auto-migrate: Physical media editions system (v4.0.0)
        try {
            $db->exec("CREATE TABLE IF NOT EXISTS media_editions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                movie_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                format TEXT,
                package_type TEXT,
                region TEXT,
                barcode TEXT,
                release_date TEXT,
                distributor TEXT,
                country TEXT,
                disc_count INTEGER DEFAULT 1,
                notes TEXT,
                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            )");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_media_editions_movie ON media_editions(movie_id)");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_media_editions_barcode ON media_editions(barcode)");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_media_editions_format ON media_editions(format)");
        } catch (PDOException $e) {}

        try {
            $db->exec("CREATE TABLE IF NOT EXISTS edition_components (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                edition_id INTEGER NOT NULL,
                component_type TEXT NOT NULL,
                component_name TEXT NOT NULL,
                description TEXT,
                position INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (edition_id) REFERENCES media_editions(id) ON DELETE CASCADE
            )");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_edition_components_edition ON edition_components(edition_id)");
        } catch (PDOException $e) {}

        try {
            $db->exec("CREATE TABLE IF NOT EXISTS copy_components (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                copy_id INTEGER NOT NULL,
                edition_component_id INTEGER NOT NULL,
                is_present INTEGER DEFAULT 1,
                condition TEXT DEFAULT 'Good',
                notes TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (copy_id) REFERENCES copies(id) ON DELETE CASCADE,
                FOREIGN KEY (edition_component_id) REFERENCES edition_components(id) ON DELETE CASCADE,
                UNIQUE(copy_id, edition_component_id)
            )");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_copy_components_copy ON copy_components(copy_id)");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_copy_components_edition_component ON copy_components(edition_component_id)");
        } catch (PDOException $e) {}

        // Add edition_id column to copies table
        try { $db->exec("ALTER TABLE copies ADD COLUMN edition_id INTEGER REFERENCES media_editions(id) ON DELETE SET NULL"); } catch (PDOException $e) {}

        // Auto-migrate: UMDB two-way linking (v4.1.0)
        try { $db->exec("ALTER TABLE media_editions ADD COLUMN umdb_release_id TEXT"); } catch (PDOException $e) {}
        try { $db->exec("CREATE INDEX IF NOT EXISTS idx_media_editions_umdb_release ON media_editions(umdb_release_id)"); } catch (PDOException $e) {}

        // Auto-migrate: UMDB enriched edition data (v4.2.0)
        // Languages, A/V specs, ASIN, edition type from physical media database
        try { $db->exec("ALTER TABLE media_editions ADD COLUMN languages TEXT"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE media_editions ADD COLUMN copy_protected INTEGER DEFAULT 0"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE media_editions ADD COLUMN video_system TEXT"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE media_editions ADD COLUMN asin TEXT"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE media_editions ADD COLUMN audio_formats TEXT"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE media_editions ADD COLUMN subtitles TEXT"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE media_editions ADD COLUMN disc_color TEXT"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE media_editions ADD COLUMN edition_type TEXT"); } catch (PDOException $e) {}

        // Auto-migrate: Shelf Layout Profiles (v5.0.0)
        try {
            $db->exec("CREATE TABLE IF NOT EXISTS shelf_layout_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                is_active INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_shelf_layout_profiles_user ON shelf_layout_profiles(user_id)");
        } catch (PDOException $e) {}

        try {
            $db->exec("CREATE TABLE IF NOT EXISTS shelf_layout_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                layout_id INTEGER NOT NULL,
                shelf_id INTEGER NOT NULL,
                copy_id INTEGER,
                container_id INTEGER,
                is_container INTEGER DEFAULT 0,
                position_in_shelf INTEGER DEFAULT 0,
                FOREIGN KEY (layout_id) REFERENCES shelf_layout_profiles(id) ON DELETE CASCADE,
                FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE
            )");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_shelf_layout_entries_layout ON shelf_layout_entries(layout_id)");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_shelf_layout_entries_shelf ON shelf_layout_entries(layout_id, shelf_id)");
        } catch (PDOException $e) {}

        // Auto-migrate: shelves.parent_shelf_id (used by app but not in original schema.sql)
        try { $db->exec("ALTER TABLE shelves ADD COLUMN parent_shelf_id INTEGER DEFAULT NULL REFERENCES shelves(id) ON DELETE SET NULL"); } catch (PDOException $e) {}

        // Auto-migrate: shelf_assignments container columns (ensures these exist even if box-set migration hasn't run)
        try { $db->exec("ALTER TABLE shelf_assignments ADD COLUMN container_id INTEGER DEFAULT NULL"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE shelf_assignments ADD COLUMN is_container INTEGER DEFAULT 0"); } catch (PDOException $e) {}

        // Auto-migrate: shelf_layout_profiles.recipe_json (v5.1.0)
        try { $db->exec("ALTER TABLE shelf_layout_profiles ADD COLUMN recipe_json TEXT DEFAULT NULL"); } catch (PDOException $e) {}

        // Auto-migrate: Persistent Movie Metadata (v5.1.0)
        // movie_people: directors, actors, writers per movie (role='director' used by wizard)
        try {
            $db->exec("CREATE TABLE IF NOT EXISTS movie_people (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                movie_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'director',
                sort_order INTEGER DEFAULT 0,
                FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
            )");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_movie_people_movie ON movie_people(movie_id)");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_movie_people_role ON movie_people(role)");
            $db->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_movie_people_uniq ON movie_people(movie_id, name, role)");
        } catch (PDOException $e) {}

        // movie_studios: normalized studio list per movie
        try {
            $db->exec("CREATE TABLE IF NOT EXISTS movie_studios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                movie_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
            )");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_movie_studios_movie ON movie_studios(movie_id)");
            $db->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_movie_studios_uniq ON movie_studios(movie_id, name)");
        } catch (PDOException $e) {}

        // movie_genres: normalized genre list per movie
        try {
            $db->exec("CREATE TABLE IF NOT EXISTS movie_genres (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                movie_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                tmdb_genre_id INTEGER,
                FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
            )");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_movie_genres_movie ON movie_genres(movie_id)");
            $db->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_movie_genres_uniq ON movie_genres(movie_id, name)");
        } catch (PDOException $e) {}

        // movie_certifications: age ratings per region
        try {
            $db->exec("CREATE TABLE IF NOT EXISTS movie_certifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                movie_id INTEGER NOT NULL,
                region TEXT NOT NULL DEFAULT 'US',
                certification TEXT NOT NULL,
                source TEXT DEFAULT 'tmdb',
                FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
            )");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_movie_certs_movie ON movie_certifications(movie_id)");
            $db->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_movie_certs_uniq ON movie_certifications(movie_id, region)");
        } catch (PDOException $e) {}

        // Auto-migrate: User Tagging System (v5.1.0)
        try {
            $db->exec("CREATE TABLE IF NOT EXISTS user_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                color TEXT DEFAULT '#667eea',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )");
            $db->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_tags_uniq ON user_tags(user_id, name)");
        } catch (PDOException $e) {}

        try {
            $db->exec("CREATE TABLE IF NOT EXISTS user_tag_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                entity_type TEXT NOT NULL CHECK(entity_type IN ('movie','copy','container')),
                entity_id INTEGER NOT NULL,
                tag_id INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES user_tags(id) ON DELETE CASCADE,
                UNIQUE(user_id, entity_type, entity_id, tag_id)
            )");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_tag_links_entity ON user_tag_links(entity_type, entity_id)");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_tag_links_tag ON user_tag_links(tag_id)");
        } catch (PDOException $e) {}

        // Auto-migrate: Shelf Unit Config (v6.2.0)
        // shelf_count      — how many child shelves this unit contains (for wizard planning)
        // items_per_shelf  — default capacity per child shelf (for wizard planning)
        // capacity_mode    — placeholder for future width-mode; currently always 'quantity'
        try { $db->exec("ALTER TABLE shelves ADD COLUMN shelf_count INTEGER DEFAULT 5"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE shelves ADD COLUMN items_per_shelf INTEGER DEFAULT 25"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE shelves ADD COLUMN capacity_mode TEXT DEFAULT 'quantity'"); } catch (PDOException $e) {}

        // Auto-migrate: Layout Sections (v6.3.0)
        // layout_sections  — persisted wizard blocks; one row per named group on a shelf
        // layout_section_id on shelf_layout_entries — links each entry to its section
        try {
            $db->exec("CREATE TABLE IF NOT EXISTS layout_sections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                layout_id INTEGER NOT NULL,
                shelf_id INTEGER NOT NULL,
                section_key TEXT NOT NULL,
                group_type TEXT,
                group_value TEXT,
                label TEXT NOT NULL,
                sort_index INTEGER DEFAULT 0,
                item_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (layout_id) REFERENCES shelf_layout_profiles(id) ON DELETE CASCADE,
                FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE
            )");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_layout_sections_layout ON layout_sections(layout_id)");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_layout_sections_shelf ON layout_sections(layout_id, shelf_id)");
        } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE shelf_layout_entries ADD COLUMN layout_section_id INTEGER DEFAULT NULL"); } catch (PDOException $e) {}

        // Auto-migrate: UMDB Box Set integration (v4.3.0)
        try { $db->exec("ALTER TABLE containers ADD COLUMN umdb_boxset_id TEXT DEFAULT NULL"); } catch (PDOException $e) {}
        try { $db->exec("ALTER TABLE containers ADD COLUMN umdb_cover_url TEXT DEFAULT NULL"); } catch (PDOException $e) {}
        try { $db->exec("CREATE INDEX IF NOT EXISTS idx_containers_umdb_boxset ON containers(umdb_boxset_id)"); } catch (PDOException $e) {}

        // Auto-migrate: UMDB Box Set release linkage (v4.4.0)
        // Stores the UMDB release ID returned when pushing/importing a box set
        try { $db->exec("ALTER TABLE containers ADD COLUMN umdb_release_id TEXT DEFAULT NULL"); } catch (PDOException $e) {}

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