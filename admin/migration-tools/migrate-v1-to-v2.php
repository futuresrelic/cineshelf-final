<?php
/**
 * CineShelf v1 → v2 Migration Script
 * Imports old localStorage JSON backup into new SQLite database
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/../../config/config.php';

echo "🎬 CineShelf v1 → v2 Migration Tool\n";
echo "====================================\n\n";

// Get JSON file path from command line or use default
$jsonFile = $argv[1] ?? __DIR__ . '/cineshelf_backup_klindakoil.json';

if (!file_exists($jsonFile)) {
    die("❌ Error: JSON file not found: $jsonFile\n");
}

echo "📂 Reading backup file: $jsonFile\n";
$jsonData = file_get_contents($jsonFile);
$backup = json_decode($jsonData, true);

if (!$backup) {
    die("❌ Error: Failed to parse JSON file\n");
}

$username = $backup['user'] ?? 'default';
$oldCopies = $backup['copies'] ?? [];
$oldMovies = $backup['movies'] ?? [];

echo "👤 User: $username\n";
echo "📦 Total copies: " . count($oldCopies) . "\n";
echo "🎬 Unique movies: " . count($oldMovies) . "\n\n";

try {
    $db = getDb();
    
    // Start transaction
    $db->beginTransaction();
    
    // Get or create user
    echo "🔍 Looking up user...\n";
    $user = getOrCreateUser($db, $username);
    $userId = $user['id'];
    echo "✅ User ID: $userId\n\n";
    
    // Import movies first
    echo "🎬 Importing movies...\n";
    $movieMap = []; // Old movieId (TMDB ID) → new database ID
    $importedMovies = 0;
    $skippedMovies = 0;
    
    foreach ($oldMovies as $oldMovie) {
        $tmdbId = $oldMovie['imdbID'] ?? null; // v1 called it imdbID but it's actually TMDB ID
        
        if (!$tmdbId) {
            echo "  ⚠️  Skipping movie without ID: " . ($oldMovie['Title'] ?? 'Unknown') . "\n";
            $skippedMovies++;
            continue;
        }
        
        // Check if movie already exists
        $stmt = $db->prepare("SELECT id FROM movies WHERE tmdb_id = ?");
        $stmt->execute([$tmdbId]);
        $existing = $stmt->fetch();
        
        if ($existing) {
            $movieMap[$tmdbId] = $existing['id'];
            continue;
        }
        
        // Insert new movie
        $stmt = $db->prepare("
            INSERT INTO movies (tmdb_id, imdb_id, title, year, poster_url, overview, rating, runtime, director, genre)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        
        $year = null;
        if (isset($oldMovie['Year']) && $oldMovie['Year'] !== 'N/A') {
            $year = intval($oldMovie['Year']);
        }
        
        $rating = null;
        if (isset($oldMovie['imdbRating']) && $oldMovie['imdbRating'] !== 'N/A') {
            $rating = floatval($oldMovie['imdbRating']);
        }
        
        $runtime = null;
        if (isset($oldMovie['Runtime']) && $oldMovie['Runtime'] !== 'N/A') {
            $runtime = intval($oldMovie['Runtime']);
        }
        
        $stmt->execute([
            $tmdbId,
            null, // Don't have separate IMDB ID in v1
            $oldMovie['Title'] ?? 'Unknown',
            $year,
            $oldMovie['posterIMG'] ?? null,
            $oldMovie['Plot'] ?? null,
            $rating,
            $runtime,
            $oldMovie['Director'] ?? null,
            $oldMovie['Genre'] ?? null
        ]);
        
        $newMovieId = $db->lastInsertId();
        $movieMap[$tmdbId] = $newMovieId;
        $importedMovies++;
        
        if ($importedMovies % 50 == 0) {
            echo "  📝 Imported $importedMovies movies...\n";
        }
    }
    
    echo "✅ Movies imported: $importedMovies\n";
    if ($skippedMovies > 0) {
        echo "⚠️  Movies skipped: $skippedMovies\n";
    }
    echo "\n";
    
    // Import copies
    echo "📦 Importing copies...\n";
    $importedCopies = 0;
    $skippedCopies = 0;
    $unresolvedCopies = 0;
    
    foreach ($oldCopies as $oldCopy) {
        $tmdbId = $oldCopy['movieId'] ?? null;
        $title = $oldCopy['title'] ?? 'Unknown';
        
        // Skip if no title at all
        if (empty($title) || $title === 'Unknown') {
            $skippedCopies++;
            continue;
        }
        
        // Handle unresolved copies (no TMDB ID)
        if (!$tmdbId) {
            // Create placeholder movie entry with title only
            $stmt = $db->prepare("
                INSERT INTO movies (tmdb_id, title, year, poster_url)
                VALUES (?, ?, NULL, NULL)
            ");
            $placeholderTmdbId = 'unresolved_' . md5($title . time() . $unresolvedCopies);
            $stmt->execute([$placeholderTmdbId, $title]);
            $movieId = $db->lastInsertId();
            $unresolvedCopies++;
        } else {
            // Get the database movie ID for resolved copies
            $movieId = $movieMap[$tmdbId] ?? null;
            
            if (!$movieId) {
                echo "  ⚠️  Skipping - movie not in map: $title\n";
                $skippedCopies++;
                continue;
            }
        }
        
        // Check if this is wishlist (v1 had isWishlist flag)
        $isWishlist = $oldCopy['isWishlist'] ?? false;
        
        if ($isWishlist) {
            // Insert into wishlist table
            $stmt = $db->prepare("
                INSERT INTO wishlist (user_id, movie_id, priority, target_format, notes, added_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            
            $stmt->execute([
                $userId,
                $movieId,
                0, // Default priority
                $oldCopy['format'] ?? 'DVD',
                $oldCopy['notes'] ?? null,
                $oldCopy['created'] ?? date('Y-m-d H:i:s')
            ]);
        } else {
            // Insert into copies table
            $stmt = $db->prepare("
                INSERT INTO copies (user_id, movie_id, format, edition, region, condition, notes, barcode, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            $format = $oldCopy['format'] ?? 'DVD';
            if (empty($format)) {
                $format = 'DVD';
            }
            
            $stmt->execute([
                $userId,
                $movieId,
                $format,
                $oldCopy['edition'] ?? null,
                $oldCopy['region'] ?? null,
                'Good', // v1 didn't track condition
                $oldCopy['notes'] ?? null,
                $oldCopy['upc'] ?? null,
                $oldCopy['created'] ?? date('Y-m-d H:i:s')
            ]);
        }
        
        $importedCopies++;
        
        if ($importedCopies % 100 == 0) {
            echo "  📝 Imported $importedCopies copies...\n";
        }
    }
    
    echo "✅ Copies imported: $importedCopies\n";
    if ($unresolvedCopies > 0) {
        echo "⚠️  Unresolved copies (need TMDB match): $unresolvedCopies\n";
    }
    if ($skippedCopies > 0) {
        echo "⚠️  Copies skipped (no title): $skippedCopies\n";
    }
    echo "\n";
    
    // Commit transaction
    $db->commit();
    
    echo "🎉 Migration complete!\n\n";
    echo "Summary:\n";
    echo "  Movies imported: $importedMovies\n";
    echo "  Copies imported: $importedCopies\n";
    echo "  Unresolved copies: $unresolvedCopies\n";
    echo "  User: $username (ID: $userId)\n\n";
    echo "✅ All data imported!\n";
    echo "🔍 Visit app → click unresolved movies to match with TMDB\n";
    
} catch (Exception $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    echo "❌ Error: " . $e->getMessage() . "\n";
    echo "📍 Stack trace:\n" . $e->getTraceAsString() . "\n";
    exit(1);
}