<?php
/**
 * CineShelf - Main API Endpoint
 * Features: Groups/Family Collections, Borrowing System, Trivia Game
 * OAuth-Enabled: Session-based authentication with legacy fallback
 * Version: Managed by version-manager.html (see version.json)
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/auth-middleware.php';

/**
 * Extract movie titles and years from HTML content using OpenAI
 * @param string $htmlContent The HTML content to parse
 * @param string $articleTitle Optional article title for context
 * @return array Array of movies with title and year, or error
 */
function extractMoviesWithAI($htmlContent, $articleTitle = '') {
    // Remove scripts, styles, and other noise
    $cleanedContent = preg_replace('/<script\b[^>]*>.*?<\/script>/is', '', $htmlContent);
    $cleanedContent = preg_replace('/<style\b[^>]*>.*?<\/style>/is', '', $cleanedContent);
    $cleanedContent = preg_replace('/<nav\b[^>]*>.*?<\/nav>/is', '', $cleanedContent);
    $cleanedContent = preg_replace('/<footer\b[^>]*>.*?<\/footer>/is', '', $cleanedContent);

    // Strip tags but keep structure
    $cleanedContent = strip_tags($cleanedContent);

    // Truncate if too long (to avoid token limits - keep first 15000 chars)
    if (strlen($cleanedContent) > 15000) {
        $cleanedContent = substr($cleanedContent, 0, 15000);
    }

    // Build the prompt
    $prompt = "Extract all movie titles and their release years from this article";
    if ($articleTitle) {
        $prompt .= " titled '$articleTitle'";
    }
    $prompt .= ".\n\nReturn ONLY a JSON array with this exact format:\n[{\"title\": \"Movie Name\", \"year\": 2024}, ...]\n\nRules:\n- Extract ONLY movies (not TV shows, books, or other media)\n- Include the release year if mentioned\n- If year is not mentioned, use null\n- Return empty array [] if no movies found\n- Do not include explanatory text, only the JSON array\n\nArticle content:\n\n" . $cleanedContent;

    // Prepare OpenAI API request
    $apiData = [
        'model' => OPENAI_MODEL,
        'messages' => [
            [
                'role' => 'system',
                'content' => 'You are a helpful assistant that extracts movie information from articles. Always respond with valid JSON only.'
            ],
            [
                'role' => 'user',
                'content' => $prompt
            ]
        ],
        'temperature' => 0.3, // Lower temperature for more consistent extraction
        'max_tokens' => 2000
    ];

    // Make API request
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, OPENAI_API_URL);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($apiData));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . OPENAI_API_KEY
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError) {
        return ['error' => 'OpenAI API request failed: ' . $curlError];
    }

    if ($httpCode !== 200) {
        return ['error' => 'OpenAI API returned HTTP ' . $httpCode];
    }

    $result = json_decode($response, true);

    if (!$result || !isset($result['choices'][0]['message']['content'])) {
        return ['error' => 'Invalid response from OpenAI API'];
    }

    $content = trim($result['choices'][0]['message']['content']);

    // Try to parse the JSON response
    $movies = json_decode($content, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        // Try to extract JSON from markdown code blocks if present
        if (preg_match('/```(?:json)?\s*([\s\S]*?)```/', $content, $matches)) {
            $movies = json_decode(trim($matches[1]), true);
        }

        if (json_last_error() !== JSON_ERROR_NONE) {
            return ['error' => 'Failed to parse AI response as JSON'];
        }
    }

    if (!is_array($movies)) {
        return ['error' => 'AI response was not an array'];
    }

    return ['success' => true, 'movies' => $movies];
}

// Set execution time limit for long-running operations (e.g., large CSV imports)
set_time_limit(300); // 5 minutes

// Start session for OAuth authentication
session_start();

// CORS Headers (allow credentials for OAuth)
$origin = $_SERVER['HTTP_ORIGIN'] ?? 'https://cineshelf.futuresrelic.com';
header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Get request data
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $input['action'] ?? '';

// Basic validation
if (empty($action)) {
    jsonResponse(false, null, 'Action required');
}

try {
    $db = getDb();

    // Authenticate user (supports both OAuth and legacy)
    $currentUser = authenticateRequest();
    $userId = $currentUser['id'];
    $user = $currentUser['username']; // For backwards compatibility

    // Route to appropriate action
    switch ($action) {
        
        // ========================================
        // MOVIE SEARCH ACTIONS
        // ========================================
        
        case 'search_movie':
            $query = sanitize($input['query'] ?? '', 100);
            
            if (empty($query)) {
                jsonResponse(false, null, 'Search query required');
            }
            
            $url = TMDB_BASE_URL . '/search/movie?api_key=' . TMDB_API_KEY . '&query=' . urlencode($query);
            $response = file_get_contents($url);
            
            if ($response === false) {
                jsonResponse(false, null, 'TMDB API request failed');
            }
            
            $data = json_decode($response, true);
            jsonResponse(true, $data['results'] ?? []);
            break;
            
        case 'search_multi':
            $query = sanitize($input['query'] ?? '', 100);
            
            if (empty($query)) {
                jsonResponse(false, null, 'Search query required');
            }
            
            $url = TMDB_BASE_URL . '/search/multi?api_key=' . TMDB_API_KEY . '&query=' . urlencode($query);
            $response = file_get_contents($url);
            
            if ($response === false) {
                jsonResponse(false, null, 'TMDB API request failed');
            }
            
            $data = json_decode($response, true);
            
            // Filter to only movies and TV shows
            $results = array_filter($data['results'] ?? [], function($item) {
                return in_array($item['media_type'], ['movie', 'tv']);
            });
            
            jsonResponse(true, array_values($results));
            break;
        
        case 'get_movie':
            $tmdbId = sanitize($input['tmdb_id'] ?? '', 20);
            $mediaType = sanitize($input['media_type'] ?? 'movie', 20);
            
            if (empty($tmdbId)) {
                jsonResponse(false, null, 'TMDB ID required');
            }
            
            $endpoint = $mediaType === 'tv' ? '/tv/' : '/movie/';
            $url = TMDB_BASE_URL . $endpoint . $tmdbId . '?api_key=' . TMDB_API_KEY . '&append_to_response=release_dates,content_ratings,credits';
            
            $response = file_get_contents($url);
            
            if ($response === false) {
                jsonResponse(false, null, 'TMDB API request failed');
            }
            
            $data = json_decode($response, true);
            
            // Get certification
            $certification = null;
            if ($mediaType === 'tv' && isset($data['content_ratings']['results'])) {
                foreach ($data['content_ratings']['results'] as $rating) {
                    if ($rating['iso_3166_1'] === 'US') {
                        $certification = $rating['rating'];
                        break;
                    }
                }
            } elseif (isset($data['release_dates']['results'])) {
                foreach ($data['release_dates']['results'] as $release) {
                    if ($release['iso_3166_1'] === 'US') {
                        foreach ($release['release_dates'] as $date) {
                            if (!empty($date['certification'])) {
                                $certification = $date['certification'];
                                break 2;
                            }
                        }
                    }
                }
            }
            
            $genres = implode(', ', array_column($data['genres'] ?? [], 'name'));
            
            if ($mediaType === 'tv') {
                jsonResponse(true, [
                    'id' => $data['id'],
                    'title' => $data['name'],
                    'year' => isset($data['first_air_date']) ? intval(substr($data['first_air_date'], 0, 4)) : null,
                    'poster_url' => isset($data['poster_path']) ? TMDB_IMAGE_BASE . $data['poster_path'] : null,
                    'backdrop_url' => isset($data['backdrop_path']) ? TMDB_IMAGE_BASE . $data['backdrop_path'] : null,
                    'overview' => $data['overview'] ?? null,
                    'rating' => $data['vote_average'] ?? null,
                    'runtime' => isset($data['episode_run_time'][0]) ? $data['episode_run_time'][0] : null,
                    'genre' => $genres,
                    'media_type' => 'tv',
                    'director' => isset($data['created_by'][0]['name']) ? $data['created_by'][0]['name'] : null,
                    'certification' => $certification
                ]);
            } else {
                // Get director
                $director = null;
                if (isset($data['credits']['crew'])) {
                    foreach ($data['credits']['crew'] as $person) {
                        if ($person['job'] === 'Director') {
                            $director = $person['name'];
                            break;
                        }
                    }
                }

                jsonResponse(true, [
                    'id' => $data['id'],
                    'title' => $data['title'],
                    'year' => isset($data['release_date']) ? intval(substr($data['release_date'], 0, 4)) : null,
                    'poster_url' => isset($data['poster_path']) ? TMDB_IMAGE_BASE . $data['poster_path'] : null,
                    'backdrop_url' => isset($data['backdrop_path']) ? TMDB_IMAGE_BASE . $data['backdrop_path'] : null,
                    'overview' => $data['overview'] ?? null,
                    'rating' => $data['vote_average'] ?? null,
                    'runtime' => $data['runtime'] ?? null,
                    'genre' => $genres,
                    'imdb_id' => $data['imdb_id'] ?? null,
                    'media_type' => 'movie',
                    'director' => $director,
                    'certification' => $certification
                ]);
            }
            break;
        
        // ========================================
        // COPY ACTIONS (Collection Management)
        // ========================================
        
        case 'add_copy':
            $tmdbId = sanitize($input['tmdb_id'] ?? '', 20);
            $mediaType = sanitize($input['media_type'] ?? 'movie', 20);
            $format = sanitize($input['format'] ?? 'DVD', 50);
            $edition = sanitize($input['edition'] ?? '', 100);
            $region = sanitize($input['region'] ?? '', 50);
            $condition = sanitize($input['condition'] ?? 'Good', 50);
            $notes = sanitize($input['notes'] ?? '', 500);
            $barcode = sanitize($input['barcode'] ?? '', 50);
            
            if (empty($tmdbId)) {
                jsonResponse(false, null, 'TMDB ID required');
            }
            
            // Get or create movie
            $stmt = $db->prepare("SELECT id FROM movies WHERE tmdb_id = ?");
            $stmt->execute([$tmdbId]);
            $movie = $stmt->fetch();
            
            if (!$movie) {
                // Fetch from TMDB first
                $endpoint = $mediaType === 'tv' ? '/tv/' : '/movie/';
                $url = TMDB_BASE_URL . $endpoint . $tmdbId . '?api_key=' . TMDB_API_KEY;
                $response = file_get_contents($url);
                
                if ($response === false) {
                    jsonResponse(false, null, 'Failed to fetch movie from TMDB');
                }
                
                $data = json_decode($response, true);
                $genres = implode(', ', array_column($data['genres'] ?? [], 'name'));
                
                // Insert movie
                $stmt = $db->prepare("
                    INSERT INTO movies (tmdb_id, title, year, poster_url, overview, rating, runtime, genre, media_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                
                $title = $mediaType === 'tv' ? $data['name'] : $data['title'];
                $releaseDate = $mediaType === 'tv' ? ($data['first_air_date'] ?? null) : ($data['release_date'] ?? null);
                $year = $releaseDate ? intval(substr($releaseDate, 0, 4)) : null;
                
                $stmt->execute([
                    $tmdbId,
                    $title,
                    $year,
                    isset($data['poster_path']) ? TMDB_IMAGE_BASE . $data['poster_path'] : null,
                    $data['overview'] ?? null,
                    $data['vote_average'] ?? null,
                    $data['runtime'] ?? ($data['episode_run_time'][0] ?? null),
                    $genres,
                    $mediaType
                ]);
                
                $movieId = $db->lastInsertId();
            } else {
                $movieId = $movie['id'];
            }
            
            // Add copy
            $stmt = $db->prepare("
                INSERT INTO copies (user_id, movie_id, format, edition, region, condition, notes, barcode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            $stmt->execute([$userId, $movieId, $format, $edition, $region, $condition, $notes, $barcode]);
            
            logAction($db, $userId, 'copy_added', 'copy', $db->lastInsertId());
            
            jsonResponse(true, ['copy_id' => $db->lastInsertId()]);
            break;
        
        case 'list_collection':
            $stmt = $db->prepare("
                SELECT 
                    c.id as copy_id,
                    c.format,
                    c.edition,
                    c.region,
                    c.condition,
                    c.notes,
                    c.barcode,
                    c.created_at,
                    m.id as movie_id,
                    m.tmdb_id,
                    m.title,
                    m.display_title,
                    m.year,
                    m.poster_url,
                    m.rating,
                    m.runtime,
                    m.genre,
                    m.media_type,
                    m.overview,
                    m.director,
                    m.certification,
                    COUNT(*) OVER (PARTITION BY m.id) as copy_count
                FROM copies c
                JOIN movies m ON c.movie_id = m.id
                WHERE c.user_id = ?
                ORDER BY COALESCE(m.display_title, m.title) ASC
            ");
            $stmt->execute([$userId]);
            
            jsonResponse(true, $stmt->fetchAll());
            break;
        
        case 'delete_copy':
            $copyId = intval($input['copy_id'] ?? 0);
            
            $stmt = $db->prepare("DELETE FROM copies WHERE id = ? AND user_id = ?");
            $stmt->execute([$copyId, $userId]);
            
            logAction($db, $userId, 'copy_deleted', 'copy', $copyId);
            
            jsonResponse(true, ['deleted' => $copyId]);
            break;
        
case 'update_copy':
    $copyId = intval($input['copy_id'] ?? 0);
    $format = sanitize($input['format'] ?? '', 50);
    $edition = sanitize($input['edition'] ?? '', 100);
    $region = sanitize($input['region'] ?? '', 20);
    $condition = sanitize($input['condition'] ?? '', 20);
    $notes = sanitize($input['notes'] ?? '', 500);
    
    if (empty($copyId) || empty($format)) {
        jsonResponse(false, null, 'Copy ID and format required');
    }
    
    // Verify ownership
    $stmt = $db->prepare("SELECT user_id FROM copies WHERE id = ?");
    $stmt->execute([$copyId]);
    $copy = $stmt->fetch();
    
    if (!$copy) {
        jsonResponse(false, null, 'Copy not found');
    }
    
    if ($copy['user_id'] != $userId) {
        jsonResponse(false, null, 'Not authorized to edit this copy');
    }
    
    // Update copy
    $stmt = $db->prepare("
        UPDATE copies 
        SET format = ?, edition = ?, region = ?, condition = ?, notes = ?
        WHERE id = ? AND user_id = ?
    ");
    $stmt->execute([$format, $edition, $region, $condition, $notes, $copyId, $userId]);
    
    logAction($db, $userId, 'copy_updated', 'copy', $copyId);  // ← FIXED!
    
    jsonResponse(true, ['copy_id' => $copyId]);
    break;
        
        case 'get_movie_copies':
            $movieId = intval($input['movie_id'] ?? 0);
            
            $stmt = $db->prepare("
                SELECT * FROM copies
                WHERE movie_id = ? AND user_id = ?
                ORDER BY created_at DESC
            ");
            $stmt->execute([$movieId, $userId]);
            
            jsonResponse(true, $stmt->fetchAll());
            break;

case 'update_display_title':
    $movieId = intval($input['movie_id'] ?? 0);
    $displayTitle = sanitize($input['display_title'] ?? '', 500);
    
    if (empty($movieId)) {
        jsonResponse(false, null, 'Movie ID required');
    }
    
    // Empty string means revert to original title
    $stmt = $db->prepare("
        UPDATE movies 
        SET display_title = ?
        WHERE id = ?
    ");
    $stmt->execute([empty($displayTitle) ? null : $displayTitle, $movieId]);
    
    logAction($db, $userId, 'display_title_updated', 'movie', $movieId);
    
    jsonResponse(true, ['movie_id' => $movieId, 'display_title' => $displayTitle]);
    break;

case 'get_movie_posters':
    $tmdbId = sanitize($input['tmdb_id'] ?? '', 20);
    $mediaType = sanitize($input['media_type'] ?? 'movie', 20);
    
    if (empty($tmdbId)) {
        jsonResponse(false, null, 'TMDB ID required');
    }
    
    // Fetch posters from TMDB
    $endpoint = $mediaType === 'tv' ? '/tv/' : '/movie/';
    $url = TMDB_BASE_URL . $endpoint . $tmdbId . '/images?api_key=' . TMDB_API_KEY;
    
    $response = file_get_contents($url);
    
    if ($response === false) {
        jsonResponse(false, null, 'Failed to fetch posters from TMDB');
    }
    
    $data = json_decode($response, true);
    $posters = $data['posters'] ?? [];
    
    // Sort by vote_average (highest rated first)
    usort($posters, function($a, $b) {
        return ($b['vote_average'] ?? 0) <=> ($a['vote_average'] ?? 0);
    });
    
    // Return top 20 posters
    jsonResponse(true, array_slice($posters, 0, 20));
    break;

case 'update_movie_poster':
    $movieId = intval($input['movie_id'] ?? 0);
    $posterPath = sanitize($input['poster_path'] ?? '', 200);
    
    if (empty($movieId) || empty($posterPath)) {
        jsonResponse(false, null, 'Movie ID and poster path required');
    }
    
    // Build full poster URL
    $posterUrl = TMDB_IMAGE_BASE . $posterPath;
    
    // Update movie poster
    $stmt = $db->prepare("
        UPDATE movies 
        SET poster_url = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ");
    $stmt->execute([$posterUrl, $movieId]);
    
    logAction($db, $userId, 'poster_updated', 'movie', $movieId);
    
    jsonResponse(true, ['movie_id' => $movieId, 'poster_url' => $posterUrl]);
    break;

// ========================================
// WISHLIST ACTIONS
// ========================================
        
        case 'add_wishlist':
            $tmdbId = sanitize($input['tmdb_id'] ?? '', 20);
            $mediaType = sanitize($input['media_type'] ?? 'movie', 20);
            $priority = intval($input['priority'] ?? 0);
            $targetFormat = sanitize($input['target_format'] ?? '', 50);
            $notes = sanitize($input['notes'] ?? '', 500);
            
            if (empty($tmdbId)) {
                jsonResponse(false, null, 'TMDB ID required');
            }
            
            // Get or create movie (same as add_copy)
            $stmt = $db->prepare("SELECT id FROM movies WHERE tmdb_id = ?");
            $stmt->execute([$tmdbId]);
            $movie = $stmt->fetch();
            
            if (!$movie) {
                $endpoint = $mediaType === 'tv' ? '/tv/' : '/movie/';
                $url = TMDB_BASE_URL . $endpoint . $tmdbId . '?api_key=' . TMDB_API_KEY;
                $response = file_get_contents($url);
                
                if ($response === false) {
                    jsonResponse(false, null, 'Failed to fetch from TMDB');
                }
                
                $data = json_decode($response, true);
                $genres = implode(', ', array_column($data['genres'] ?? [], 'name'));
                
                $stmt = $db->prepare("
                    INSERT INTO movies (tmdb_id, title, year, poster_url, overview, rating, runtime, genre, media_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                
                $title = $mediaType === 'tv' ? $data['name'] : $data['title'];
                $releaseDate = $mediaType === 'tv' ? ($data['first_air_date'] ?? null) : ($data['release_date'] ?? null);
                $year = $releaseDate ? intval(substr($releaseDate, 0, 4)) : null;
                
                $stmt->execute([
                    $tmdbId,
                    $title,
                    $year,
                    isset($data['poster_path']) ? TMDB_IMAGE_BASE . $data['poster_path'] : null,
                    $data['overview'] ?? null,
                    $data['vote_average'] ?? null,
                    $data['runtime'] ?? ($data['episode_run_time'][0] ?? null),
                    $genres,
                    $mediaType
                ]);
                
                $movieId = $db->lastInsertId();
            } else {
                $movieId = $movie['id'];
            }
            
            // Add to wishlist
            $stmt = $db->prepare("
                INSERT OR REPLACE INTO wishlist (user_id, movie_id, priority, target_format, notes)
                VALUES (?, ?, ?, ?, ?)
            ");
            
            $stmt->execute([$userId, $movieId, $priority, $targetFormat, $notes]);
            
            logAction($db, $userId, 'wishlist_added', 'wishlist', $movieId);
            
            jsonResponse(true, ['movie_id' => $movieId]);
            break;
        
        case 'list_wishlist':
            $stmt = $db->prepare("
                SELECT 
                    w.*,
                    m.id as movie_id,
                    m.title,
                    m.year,
                    m.poster_url,
                    m.rating,
                    m.runtime,
                    m.genre,
                    m.tmdb_id,
                    m.overview,
                    m.director,
                    m.certification,
                    m.media_type
                FROM wishlist w
                JOIN movies m ON w.movie_id = m.id
                WHERE w.user_id = ?
                ORDER BY w.priority DESC, m.title ASC
            ");
            $stmt->execute([$userId]);
            
            jsonResponse(true, $stmt->fetchAll());
            break;
        
        case 'remove_wishlist':
            $movieId = intval($input['movie_id'] ?? 0);
            
            $stmt = $db->prepare("DELETE FROM wishlist WHERE movie_id = ? AND user_id = ?");
            $stmt->execute([$movieId, $userId]);
            
            logAction($db, $userId, 'wishlist_removed', 'wishlist', $movieId);
            
            jsonResponse(true, ['deleted' => $movieId]);
            break;
        
        // ========================================
        // RESOLVE ACTIONS
        // ========================================
        
        case 'list_unresolved':
            $stmt = $db->prepare("
                SELECT DISTINCT
                    m.id as movie_id,
                    m.tmdb_id,
                    m.title,
                    m.poster_url,
                    m.year,
                    COUNT(c.id) as copy_count
                FROM movies m
                JOIN copies c ON c.movie_id = m.id
                WHERE c.user_id = ?
                  AND m.tmdb_id LIKE 'unresolved_%'
                GROUP BY m.id
                ORDER BY m.title ASC
            ");
            $stmt->execute([$userId]);
            
            jsonResponse(true, $stmt->fetchAll());
            break;
        
case 'resolve_movie':
    $movieId = intval($input['movie_id'] ?? 0);
    $tmdbId = sanitize($input['tmdb_id'] ?? '', 20);
    $mediaType = sanitize($input['media_type'] ?? 'movie', 20);
    $confirmMerge = $input['confirm_merge'] ?? false;
    
    if (empty($movieId) || empty($tmdbId)) {
        jsonResponse(false, null, 'Movie ID and TMDB ID required');
    }
    
    // Check if this TMDB ID already exists in database
    $stmt = $db->prepare("SELECT id, title FROM movies WHERE tmdb_id = ?");
    $stmt->execute([$tmdbId]);
    $existingMovie = $stmt->fetch();
    
    if ($existingMovie) {
        // Movie already exists!
        
        if (!$confirmMerge) {
            // First time - ask user to confirm
            jsonResponse(false, [
                'already_exists' => true,
                'existing_movie' => $existingMovie,
                'unresolved_movie_id' => $movieId
            ], 'This movie already exists in your collection');
        }
        
        // User confirmed - merge the unresolved copies into existing movie
        
        // Get all copies of the unresolved movie
        $stmt = $db->prepare("SELECT id FROM copies WHERE movie_id = ? AND user_id = ?");
        $stmt->execute([$movieId, $userId]);
        $copies = $stmt->fetchAll();
        
        // Update copies to point to existing movie
        $stmt = $db->prepare("UPDATE copies SET movie_id = ? WHERE movie_id = ? AND user_id = ?");
        $stmt->execute([$existingMovie['id'], $movieId, $userId]);
        
        // Check if unresolved movie has any other copies from other users
        $stmt = $db->prepare("SELECT COUNT(*) FROM copies WHERE movie_id = ?");
        $stmt->execute([$movieId]);
        $remainingCopies = $stmt->fetchColumn();
        
        // If no other copies, delete the unresolved movie entry
        if ($remainingCopies == 0) {
            $stmt = $db->prepare("DELETE FROM movies WHERE id = ?");
            $stmt->execute([$movieId]);
        }
        
        logAction($db, $userId, 'movie_merged', 'movie', $existingMovie['id']);
        
        jsonResponse(true, [
            'movie_id' => $existingMovie['id'],
            'title' => $existingMovie['title'],
            'merged' => true,
            'copies_moved' => count($copies)
        ]);
        
    } else {
        // Movie doesn't exist - fetch from TMDB and update
        
        $endpoint = $mediaType === 'tv' ? '/tv/' : '/movie/';
        $url = TMDB_BASE_URL . $endpoint . $tmdbId . '?api_key=' . TMDB_API_KEY;
        $response = file_get_contents($url);
        
        if ($response === false) {
            jsonResponse(false, null, 'Failed to fetch from TMDB');
        }
        
        $data = json_decode($response, true);
        $genres = implode(', ', array_column($data['genres'] ?? [], 'name'));
        
        // Update movie record
        $stmt = $db->prepare("
            UPDATE movies SET
                tmdb_id = ?,
                title = ?,
                year = ?,
                poster_url = ?,
                overview = ?,
                rating = ?,
                runtime = ?,
                genre = ?,
                media_type = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ");
        
        $title = $mediaType === 'tv' ? $data['name'] : $data['title'];
        $releaseDate = $mediaType === 'tv' ? ($data['first_air_date'] ?? null) : ($data['release_date'] ?? null);
        $year = $releaseDate ? intval(substr($releaseDate, 0, 4)) : null;
        
        $stmt->execute([
            $tmdbId,
            $title,
            $year,
            isset($data['poster_path']) ? TMDB_IMAGE_BASE . $data['poster_path'] : null,
            $data['overview'] ?? null,
            $data['vote_average'] ?? null,
            $data['runtime'] ?? ($data['episode_run_time'][0] ?? null),
            $genres,
            $mediaType,
            $movieId
        ]);
        
        jsonResponse(true, ['movie_id' => $movieId, 'title' => $title]);
    }
    break;
            
        case 'add_unresolved':
            $title = sanitize($input['title'] ?? '', 200);
            
            if (empty($title)) {
                jsonResponse(false, null, 'Title required');
            }
            
            // Create unresolved movie entry
            $unresolvedId = 'unresolved_' . md5($title . time() . $userId);
            
            $stmt = $db->prepare("
                INSERT INTO movies (tmdb_id, title, year, poster_url)
                VALUES (?, ?, NULL, NULL)
            ");
            $stmt->execute([$unresolvedId, $title]);
            $movieId = $db->lastInsertId();
            
            // Create copy
            $stmt = $db->prepare("
                INSERT INTO copies (user_id, movie_id, format, condition, created_at)
                VALUES (?, ?, 'DVD', 'Good', datetime('now'))
            ");
            $stmt->execute([$userId, $movieId]);
            
            jsonResponse(true, ['movie_id' => $movieId, 'title' => $title]);
            break;
        
        // ========================================
        // USER ACTIONS
        // ========================================
        
        case 'get_user_settings':
            jsonResponse(true, json_decode($currentUser['settings_json'] ?? '{}', true));
            break;
        
        case 'save_user_settings':
            $settings = $input['settings'] ?? [];
            
            $stmt = $db->prepare("UPDATE users SET settings_json = ? WHERE id = ?");
            $stmt->execute([json_encode($settings), $userId]);
            
            jsonResponse(true, $settings);
            break;
        
        // ========================================
        // STATISTICS
        // ========================================
        
        case 'get_stats':
            $stats = [];

            $stmt = $db->prepare("SELECT COUNT(*) as count FROM copies WHERE user_id = ?");
            $stmt->execute([$userId]);
            $stats['total_copies'] = $stmt->fetch()['count'];

            $stmt = $db->prepare("SELECT COUNT(DISTINCT movie_id) as count FROM copies WHERE user_id = ?");
            $stmt->execute([$userId]);
            $stats['unique_movies'] = $stmt->fetch()['count'];

            $stmt = $db->prepare("SELECT COUNT(*) as count FROM wishlist WHERE user_id = ?");
            $stmt->execute([$userId]);
            $stats['wishlist_count'] = $stmt->fetch()['count'];

            jsonResponse(true, $stats);
            break;

        case 'update_profile':
            $displayName = sanitize($input['display_name'] ?? '', 100);

            if (empty($displayName)) {
                jsonResponse(false, null, 'Display name cannot be empty');
            }

            // Update display name
            $stmt = $db->prepare("UPDATE users SET display_name = ? WHERE id = ?");
            $stmt->execute([$displayName, $userId]);

            logAction($db, $userId, 'profile_updated', 'user', $userId);

            jsonResponse(true, [
                'display_name' => $displayName,
                'message' => 'Display name updated successfully'
            ]);
            break;

        // ========================================
        // GROUP MANAGEMENT (NEW IN V3.0)
        // ========================================
        
        case 'create_group':
            $name = sanitize($input['name'] ?? '', 100);
            $description = sanitize($input['description'] ?? '', 500);
            
            if (empty($name)) {
                jsonResponse(false, null, 'Group name required');
            }
            
            // Create group
            $stmt = $db->prepare("
                INSERT INTO groups (name, description, created_by)
                VALUES (?, ?, ?)
            ");
            $stmt->execute([$name, $description, $userId]);
            $groupId = $db->lastInsertId();
            
            // Add creator as admin
            $stmt = $db->prepare("
                INSERT INTO group_members (group_id, user_id, role)
                VALUES (?, ?, 'admin')
            ");
            $stmt->execute([$groupId, $userId]);
            
            logAction($db, $userId, 'group_created', 'group', $groupId);
            
            jsonResponse(true, ['group_id' => $groupId, 'name' => $name]);
            break;
        
        case 'list_groups':
            $stmt = $db->prepare("
                SELECT 
                    g.id,
                    g.name,
                    g.description,
                    g.created_at,
                    gm.role,
                    u.username as creator_name,
                    COUNT(DISTINCT gm2.user_id) as member_count
                FROM groups g
                JOIN group_members gm ON g.id = gm.group_id
                JOIN users u ON g.created_by = u.id
                LEFT JOIN group_members gm2 ON g.id = gm2.group_id
                WHERE gm.user_id = ?
                GROUP BY g.id
                ORDER BY g.name ASC
            ");
            $stmt->execute([$userId]);
            
            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'get_group':
            $groupId = $input['group_id'] ?? null;

            if (!$groupId) {
                jsonResponse(false, null, 'Group ID required');
            }

            // Check if user is a member of this group
            $stmt = $db->prepare("
                SELECT COUNT(*)
                FROM group_members
                WHERE group_id = ? AND user_id = ?
            ");
            $stmt->execute([$groupId, $userId]);

            if ($stmt->fetchColumn() == 0) {
                jsonResponse(false, null, 'Not a member of this group');
            }

            // Get group details with members
            $stmt = $db->prepare("
                SELECT
                    g.id,
                    g.name,
                    g.description,
                    g.created_at,
                    g.created_by,
                    u.username as creator_name
                FROM groups g
                JOIN users u ON g.created_by = u.id
                WHERE g.id = ?
            ");
            $stmt->execute([$groupId]);
            $group = $stmt->fetch();

            if (!$group) {
                jsonResponse(false, null, 'Group not found');
            }

            // Get all members
            $stmt = $db->prepare("
                SELECT
                    gm.user_id,
                    u.username,
                    u.display_name,
                    u.email,
                    gm.role,
                    gm.joined_at
                FROM group_members gm
                JOIN users u ON gm.user_id = u.id
                WHERE gm.group_id = ?
                ORDER BY gm.role DESC, u.username ASC
            ");
            $stmt->execute([$groupId]);
            $group['members'] = $stmt->fetchAll();

            jsonResponse(true, $group);
            break;

        case 'get_user_wishlist':
            $targetUserId = $input['user_id'] ?? null;

            if (!$targetUserId) {
                jsonResponse(false, null, 'User ID required');
            }

            // Check if requester shares a group with target user
            $stmt = $db->prepare("
                SELECT COUNT(*)
                FROM group_members gm1
                JOIN group_members gm2 ON gm1.group_id = gm2.group_id
                WHERE gm1.user_id = ? AND gm2.user_id = ?
            ");
            $stmt->execute([$userId, $targetUserId]);

            if ($stmt->fetchColumn() == 0) {
                jsonResponse(false, null, 'You must share a group with this user to view their wishlist');
            }

            // Get user's wishlist
            $stmt = $db->prepare("
                SELECT
                    w.id,
                    w.movie_id,
                    w.priority,
                    w.target_format,
                    w.notes,
                    w.added_at,
                    m.tmdb_id,
                    m.title,
                    m.year,
                    m.poster_url,
                    m.overview,
                    m.rating,
                    m.runtime,
                    m.genre,
                    m.director,
                    m.certification
                FROM wishlist w
                JOIN movies m ON w.movie_id = m.id
                WHERE w.user_id = ?
                ORDER BY w.added_at DESC
            ");
            $stmt->execute([$targetUserId]);

            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'admin_list_all_groups':
            // Admin-only: List ALL groups regardless of membership
            if (!$currentUser['is_admin']) {
                jsonResponse(false, null, 'Admin access required');
            }

            $stmt = $db->prepare("
                SELECT
                    g.id,
                    g.name,
                    g.description,
                    g.created_at,
                    u.username as creator_name,
                    COUNT(DISTINCT gm.user_id) as member_count
                FROM groups g
                JOIN users u ON g.created_by = u.id
                LEFT JOIN group_members gm ON g.id = gm.group_id
                GROUP BY g.id
                ORDER BY g.name ASC
            ");
            $stmt->execute();

            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'add_group_member':
            // DEPRECATED: This endpoint was insecure - it allowed adding users without consent
            // Use invite system instead
            jsonResponse(false, null, 'This endpoint is deprecated. Use invite links instead.');
            break;
        
        case 'remove_group_member':
            $groupId = intval($input['group_id'] ?? 0);
            $memberUserId = intval($input['user_id'] ?? 0);
            
            if (empty($groupId) || empty($memberUserId)) {
                jsonResponse(false, null, 'Group ID and user ID required');
            }
            
            // Check permission - system admin OR group admin OR removing self
            $isSystemAdmin = isAdmin($user);

            if (!$isSystemAdmin) {
                // Not a system admin, check group membership
                $stmt = $db->prepare("
                    SELECT role FROM group_members
                    WHERE group_id = ? AND user_id = ?
                ");
                $stmt->execute([$groupId, $userId]);
                $membership = $stmt->fetch();

                if (!$membership) {
                    jsonResponse(false, null, 'Not a member of this group');
                }

                if ($membership['role'] !== 'admin' && $memberUserId !== $userId) {
                    jsonResponse(false, null, 'Only admins can remove other members');
                }
            }
            
            // Remove
            $stmt = $db->prepare("
                DELETE FROM group_members
                WHERE group_id = ? AND user_id = ?
            ");
            $stmt->execute([$groupId, $memberUserId]);
            
            logAction($db, $userId, 'member_removed', 'group', $groupId);
            
            jsonResponse(true, ['removed' => $memberUserId]);
            break;
        
        case 'list_group_members':
            $groupId = intval($input['group_id'] ?? 0);
            
            if (empty($groupId)) {
                jsonResponse(false, null, 'Group ID required');
            }
            
            // Verify membership
            $stmt = $db->prepare("
                SELECT 1 FROM group_members
                WHERE group_id = ? AND user_id = ?
            ");
            $stmt->execute([$groupId, $userId]);
            
            if (!$stmt->fetch()) {
                jsonResponse(false, null, 'Not a member of this group');
            }
            
            // Get members
            $stmt = $db->prepare("
                SELECT
                    u.id,
                    u.username,
                    COALESCE(u.display_name, u.username, u.email) as display_name,
                    u.email,
                    gm.role,
                    gm.joined_at,
                    COUNT(DISTINCT c.id) as copy_count
                FROM group_members gm
                JOIN users u ON gm.user_id = u.id
                LEFT JOIN copies c ON c.user_id = u.id
                WHERE gm.group_id = ?
                GROUP BY u.id
                ORDER BY gm.role DESC, u.display_name ASC
            ");
            $stmt->execute([$groupId]);

            jsonResponse(true, $stmt->fetchAll());
            break;
        
        case 'list_group_collection':
            $groupId = intval($input['group_id'] ?? 0);
            
            if (empty($groupId)) {
                jsonResponse(false, null, 'Group ID required');
            }
            
            // Verify membership
            $stmt = $db->prepare("
                SELECT 1 FROM group_members
                WHERE group_id = ? AND user_id = ?
            ");
            $stmt->execute([$groupId, $userId]);
            
            if (!$stmt->fetch()) {
                jsonResponse(false, null, 'Not a member of this group');
            }
            
            // Get combined collection
            $stmt = $db->prepare("
                SELECT 
                    c.id as copy_id,
                    c.user_id as owner_id,
                    c.format,
                    c.edition,
                    c.region,
                    c.condition,
                    c.notes,
                    c.barcode,
                    c.created_at,
                    u.username as owner_name,
                    m.id as movie_id,
                    m.tmdb_id,
                    m.title,
                    m.display_title,
                    m.year,
                    m.poster_url,
                    m.rating,
                    m.runtime,
                    m.genre,
                    m.media_type,
                    m.overview,
                    m.director,
                    m.certification,
                    b.id as borrow_id,
                    b.borrower_id,
                    b.borrowed_at,
                    b.due_date,
                    b2.username as borrower_name
                FROM copies c
                JOIN users u ON c.user_id = u.id
                JOIN movies m ON c.movie_id = m.id
                JOIN group_members gm ON c.user_id = gm.user_id
                LEFT JOIN borrows b ON c.id = b.copy_id AND b.returned_at IS NULL
                LEFT JOIN users b2 ON b.borrower_id = b2.id
                WHERE gm.group_id = ?
                ORDER BY m.title ASC, u.username ASC
            ");
            $stmt->execute([$groupId]);
            
            jsonResponse(true, $stmt->fetchAll());
            break;
        
        case 'list_member_collection':
            $groupId = intval($input['group_id'] ?? 0);
            $memberUserId = intval($input['member_user_id'] ?? 0);
            
            if (empty($groupId) || empty($memberUserId)) {
                jsonResponse(false, null, 'Group ID and member user ID required');
            }
            
            // Verify both users are in group
            $stmt = $db->prepare("
                SELECT COUNT(*) as count FROM group_members
                WHERE group_id = ? AND user_id IN (?, ?)
            ");
            $stmt->execute([$groupId, $userId, $memberUserId]);
            
            if ($stmt->fetch()['count'] < 2) {
                jsonResponse(false, null, 'Not authorized');
            }
            
            // Get member's collection
            $stmt = $db->prepare("
                SELECT 
                    c.id as copy_id,
                    c.format,
                    c.edition,
                    c.region,
                    c.condition,
                    c.notes,
                    c.barcode,
                    c.created_at,
                    m.id as movie_id,
                    m.tmdb_id,
                    m.title,
                    m.year,
                    m.poster_url,
                    m.rating,
                    m.runtime,
                    m.genre,
                    m.media_type,
                    m.overview,
                    m.director,
                    m.certification,
                    b.id as borrow_id,
                    b.borrower_id,
                    b.borrowed_at,
                    b.due_date,
                    b2.username as borrower_name
                FROM copies c
                JOIN movies m ON c.movie_id = m.id
                LEFT JOIN borrows b ON c.id = b.copy_id AND b.returned_at IS NULL
                LEFT JOIN users b2 ON b.borrower_id = b2.id
                WHERE c.user_id = ?
                ORDER BY m.title ASC
            ");
            $stmt->execute([$memberUserId]);
            
            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'update_group':
            $groupId = intval($input['group_id'] ?? 0);
            $name = sanitize($input['name'] ?? '', 100);
            $description = sanitize($input['description'] ?? '', 500);

            if (empty($groupId) || empty($name)) {
                jsonResponse(false, null, 'Group ID and name required');
            }

            // Check if user is admin of the group
            $stmt = $db->prepare("
                SELECT role FROM group_members
                WHERE group_id = ? AND user_id = ?
            ");
            $stmt->execute([$groupId, $userId]);
            $membership = $stmt->fetch();

            if (!$membership || $membership['role'] !== 'admin') {
                jsonResponse(false, null, 'Only group admins can update group details');
            }

            // Update group
            $stmt = $db->prepare("
                UPDATE groups
                SET name = ?, description = ?
                WHERE id = ?
            ");
            $stmt->execute([$name, $description, $groupId]);

            jsonResponse(true, ['message' => 'Group updated successfully']);
            break;

        case 'delete_group':
            $groupId = intval($input['group_id'] ?? 0);

            if (empty($groupId)) {
                jsonResponse(false, null, 'Group ID required');
            }

            // Check if user is system admin OR group admin
            $isSystemAdmin = isAdmin($user);

            if (!$isSystemAdmin) {
                // Not a system admin, check if they're a group admin
                $stmt = $db->prepare("
                    SELECT role FROM group_members
                    WHERE group_id = ? AND user_id = ?
                ");
                $stmt->execute([$groupId, $userId]);
                $membership = $stmt->fetch();

                if (!$membership || $membership['role'] !== 'admin') {
                    jsonResponse(false, null, 'Only group admins can delete groups');
                }
            }

            // Delete group members first (foreign key constraint)
            $stmt = $db->prepare("DELETE FROM group_members WHERE group_id = ?");
            $stmt->execute([$groupId]);

            // Delete the group
            $stmt = $db->prepare("DELETE FROM groups WHERE id = ?");
            $stmt->execute([$groupId]);

            jsonResponse(true, ['message' => 'Group deleted successfully']);
            break;

        // ========================================
        // GROUP INVITES (OAuth Email-Based)
        // ========================================

        case 'create_group_invite':
            $groupId = intval($input['group_id'] ?? 0);

            if (empty($groupId)) {
                jsonResponse(false, null, 'Group ID required');
            }

            // Check if user is admin of the group
            $stmt = $db->prepare("
                SELECT role FROM group_members
                WHERE group_id = ? AND user_id = ?
            ");
            $stmt->execute([$groupId, $userId]);
            $membership = $stmt->fetch();

            if (!$membership || $membership['role'] !== 'admin') {
                jsonResponse(false, null, 'Only group admins can create invites');
            }

            // Check for existing active group invite (one invite per group)
            $stmt = $db->prepare("
                SELECT invite_token, expires_at FROM group_invites
                WHERE group_id = ? AND invited_email IS NULL AND expires_at > CURRENT_TIMESTAMP
                ORDER BY created_at DESC
                LIMIT 1
            ");
            $stmt->execute([$groupId]);
            if ($existing = $stmt->fetch()) {
                // Return existing invite
                jsonResponse(true, [
                    'invite_token' => $existing['invite_token'],
                    'expires_at' => $existing['expires_at'],
                    'message' => 'Using existing group invite link',
                    'existing' => true
                ]);
            }

            // Generate unique invite token (short and shareable)
            $inviteToken = bin2hex(random_bytes(16)); // 32 characters
            $expiresAt = date('Y-m-d H:i:s', strtotime('+30 days')); // Longer expiry for reusable links

            // Create group-wide invite (invited_email = NULL means anyone can join)
            $stmt = $db->prepare("
                INSERT INTO group_invites (group_id, invited_email, invite_token, invited_by, expires_at)
                VALUES (?, NULL, ?, ?, ?)
            ");
            $stmt->execute([$groupId, $inviteToken, $userId, $expiresAt]);

            logAction($db, $userId, 'group_invite_created', 'group', $groupId);

            jsonResponse(true, [
                'invite_token' => $inviteToken,
                'expires_at' => $expiresAt
            ]);
            break;

        case 'accept_group_invite':
            $inviteToken = sanitize($input['invite_token'] ?? '', 64);

            if (empty($inviteToken)) {
                jsonResponse(false, null, 'Invite token required');
            }

            // Get invite details
            $stmt = $db->prepare("
                SELECT
                    gi.*,
                    g.name as group_name,
                    u.username as invited_by_username
                FROM group_invites gi
                JOIN groups g ON gi.group_id = g.id
                JOIN users u ON gi.invited_by = u.id
                WHERE gi.invite_token = ?
            ");
            $stmt->execute([$inviteToken]);
            $invite = $stmt->fetch();

            if (!$invite) {
                jsonResponse(false, null, 'Invalid invite link');
            }

            if (strtotime($invite['expires_at']) < time()) {
                jsonResponse(false, null, 'This invite link has expired');
            }

            // Check if already a member
            $stmt = $db->prepare("
                SELECT id FROM group_members
                WHERE group_id = ? AND user_id = ?
            ");
            $stmt->execute([$invite['group_id'], $userId]);
            if ($stmt->fetch()) {
                jsonResponse(true, [
                    'group_id' => $invite['group_id'],
                    'group_name' => $invite['group_name'],
                    'message' => 'You are already a member of ' . $invite['group_name'],
                    'already_member' => true
                ]);
            }

            // Add user to group
            $stmt = $db->prepare("
                INSERT INTO group_members (group_id, user_id, role)
                VALUES (?, ?, 'member')
            ");
            $stmt->execute([$invite['group_id'], $userId]);

            logAction($db, $userId, 'group_invite_accepted', 'group', $invite['group_id']);

            jsonResponse(true, [
                'group_id' => $invite['group_id'],
                'group_name' => $invite['group_name'],
                'message' => 'Successfully joined ' . $invite['group_name']
            ]);
            break;

        case 'list_group_invites':
            $groupId = intval($input['group_id'] ?? 0);

            if (empty($groupId)) {
                jsonResponse(false, null, 'Group ID required');
            }

            // Check if user is admin of the group
            $stmt = $db->prepare("
                SELECT role FROM group_members
                WHERE group_id = ? AND user_id = ?
            ");
            $stmt->execute([$groupId, $userId]);
            $membership = $stmt->fetch();

            if (!$membership || $membership['role'] !== 'admin') {
                jsonResponse(false, null, 'Only group admins can view invites');
            }

            // Get pending invites
            $stmt = $db->prepare("
                SELECT
                    gi.id,
                    gi.invited_email,
                    gi.invite_token,
                    gi.created_at,
                    gi.expires_at,
                    gi.accepted_at,
                    u1.username as invited_by_username,
                    u2.username as accepted_by_username
                FROM group_invites gi
                JOIN users u1 ON gi.invited_by = u1.id
                LEFT JOIN users u2 ON gi.accepted_by = u2.id
                WHERE gi.group_id = ?
                ORDER BY gi.created_at DESC
            ");
            $stmt->execute([$groupId]);

            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'cancel_group_invite':
            $inviteId = intval($input['invite_id'] ?? 0);

            if (empty($inviteId)) {
                jsonResponse(false, null, 'Invite ID required');
            }

            // Get invite and verify permission
            $stmt = $db->prepare("
                SELECT gi.group_id, gm.role
                FROM group_invites gi
                JOIN group_members gm ON gi.group_id = gm.group_id
                WHERE gi.id = ? AND gm.user_id = ?
            ");
            $stmt->execute([$inviteId, $userId]);
            $invite = $stmt->fetch();

            if (!$invite || $invite['role'] !== 'admin') {
                jsonResponse(false, null, 'Not authorized');
            }

            // Delete invite
            $stmt = $db->prepare("DELETE FROM group_invites WHERE id = ?");
            $stmt->execute([$inviteId]);

            jsonResponse(true, ['message' => 'Invite cancelled']);
            break;

        // ========================================
        // BORROWING SYSTEM (NEW IN V3.0)
        // ========================================
        
        case 'borrow_copy':
            $copyId = intval($input['copy_id'] ?? 0);
            $dueDate = sanitize($input['due_date'] ?? '', 20);
            $notes = sanitize($input['notes'] ?? '', 500);
            
            if (empty($copyId)) {
                jsonResponse(false, null, 'Copy ID required');
            }
            
            // Get copy info
            $stmt = $db->prepare("
                SELECT c.user_id as owner_id, b.id as existing_borrow
                FROM copies c
                LEFT JOIN borrows b ON c.id = b.copy_id AND b.returned_at IS NULL
                WHERE c.id = ?
            ");
            $stmt->execute([$copyId]);
            $copy = $stmt->fetch();
            
            if (!$copy) {
                jsonResponse(false, null, 'Copy not found');
            }
            
            if ($copy['existing_borrow']) {
                jsonResponse(false, null, 'Copy already borrowed');
            }
            
            if ($copy['owner_id'] == $userId) {
                jsonResponse(false, null, 'Cannot borrow your own copy');
            }
            
            // Create borrow
            $stmt = $db->prepare("
                INSERT INTO borrows (copy_id, owner_id, borrower_id, due_date, notes)
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $copyId,
                $copy['owner_id'],
                $userId,
                $dueDate ?: null,
                $notes
            ]);
            
            $borrowId = $db->lastInsertId();
            
            logAction($db, $userId, 'copy_borrowed', 'borrow', $borrowId);
            
            jsonResponse(true, ['borrow_id' => $borrowId]);
            break;
        
        case 'return_copy':
            $borrowId = intval($input['borrow_id'] ?? 0);
            
            if (empty($borrowId)) {
                jsonResponse(false, null, 'Borrow ID required');
            }
            
            // Verify authorization
            $stmt = $db->prepare("
                SELECT borrower_id, owner_id
                FROM borrows
                WHERE id = ? AND returned_at IS NULL
            ");
            $stmt->execute([$borrowId]);
            $borrow = $stmt->fetch();
            
            if (!$borrow) {
                jsonResponse(false, null, 'Active borrow not found');
            }
            
            if ($borrow['borrower_id'] != $userId && $borrow['owner_id'] != $userId) {
                jsonResponse(false, null, 'Not authorized');
            }
            
            // Mark returned
            $stmt = $db->prepare("
                UPDATE borrows
                SET returned_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ");
            $stmt->execute([$borrowId]);
            
            logAction($db, $userId, 'copy_returned', 'borrow', $borrowId);
            
            jsonResponse(true, ['returned' => $borrowId]);
            break;
        
        case 'list_borrowed':
            // What I borrowed
            $stmt = $db->prepare("
                SELECT 
                    b.id as borrow_id,
                    b.borrowed_at,
                    b.due_date,
                    b.notes,
                    c.id as copy_id,
                    c.format,
                    c.edition,
                    u.username as owner_name,
                    m.title,
                    m.year,
                    m.poster_url
                FROM borrows b
                JOIN copies c ON b.copy_id = c.id
                JOIN users u ON b.owner_id = u.id
                JOIN movies m ON c.movie_id = m.id
                WHERE b.borrower_id = ? AND b.returned_at IS NULL
                ORDER BY b.due_date ASC NULLS LAST, b.borrowed_at DESC
            ");
            $stmt->execute([$userId]);
            
            jsonResponse(true, $stmt->fetchAll());
            break;
        
        case 'list_lent':
            // What I lent
            $stmt = $db->prepare("
                SELECT 
                    b.id as borrow_id,
                    b.borrowed_at,
                    b.due_date,
                    b.notes,
                    c.id as copy_id,
                    c.format,
                    c.edition,
                    u.username as borrower_name,
                    m.title,
                    m.year,
                    m.poster_url
                FROM borrows b
                JOIN copies c ON b.copy_id = c.id
                JOIN users u ON b.borrower_id = u.id
                JOIN movies m ON c.movie_id = m.id
                WHERE b.owner_id = ? AND b.returned_at IS NULL
                ORDER BY b.due_date ASC NULLS LAST, b.borrowed_at DESC
            ");
            $stmt->execute([$userId]);
            
            jsonResponse(true, $stmt->fetchAll());
            break;
        
        // ========================================
        // TRIVIA GAME ACTIONS
        // ========================================

        case 'trivia_start_game':
            $gameId = generateId();
            $mode = sanitize($input['mode'] ?? 'sprint', 20);
            $scope = sanitize($input['scope'] ?? 'collection', 20);
            $livesRemaining = ($mode === 'survival') ? 3 : 0;

            $stmt = $db->prepare("
                INSERT INTO trivia_games (id, user_id, mode, scope, lives_remaining)
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([$gameId, $userId, $mode, $scope, $livesRemaining]);

            logAction($db, $userId, 'trivia_game_started', 'trivia_game', $gameId);

            jsonResponse(true, ['game_id' => $gameId]);
            break;

        case 'trivia_save_question':
            $questionId = generateId();
            $gameId = sanitize($input['game_id'] ?? '', 50);
            $roundNumber = intval($input['round_number'] ?? 0);
            $question = sanitize($input['question'] ?? '', 500);
            $type = sanitize($input['type'] ?? '', 50);
            $difficulty = sanitize($input['difficulty'] ?? '', 20);
            $templateId = sanitize($input['template_id'] ?? '', 50);
            $choicesJson = json_encode($input['choices'] ?? []);
            $correctAnswer = sanitize($input['correct_answer'] ?? '', 200);
            $userAnswer = sanitize($input['user_answer'] ?? '', 200);
            $isCorrect = intval($input['is_correct'] ?? 0);
            $timeTaken = floatval($input['time_taken'] ?? 0);
            $pointsEarned = intval($input['points_earned'] ?? 0);
            $streakAtTime = intval($input['streak_at_time'] ?? 0);
            $questionHash = sanitize($input['question_hash'] ?? '', 100);
            $metadataJson = json_encode($input['metadata'] ?? []);

            $stmt = $db->prepare("
                INSERT INTO trivia_questions (
                    id, game_id, user_id, round_number, question, type, difficulty,
                    template_id, choices_json, correct_answer, user_answer, is_correct,
                    time_taken, points_earned, streak_at_time, question_hash, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $questionId, $gameId, $userId, $roundNumber, $question, $type, $difficulty,
                $templateId, $choicesJson, $correctAnswer, $userAnswer, $isCorrect,
                $timeTaken, $pointsEarned, $streakAtTime, $questionHash, $metadataJson
            ]);

            jsonResponse(true, ['question_id' => $questionId]);
            break;

        case 'trivia_update_game':
            $gameId = sanitize($input['game_id'] ?? '', 50);
            $questionsCount = intval($input['questions_count'] ?? 0);
            $correctCount = intval($input['correct_count'] ?? 0);
            $incorrectCount = intval($input['incorrect_count'] ?? 0);
            $score = intval($input['score'] ?? 0);
            $duration = intval($input['duration'] ?? 0);
            $completed = intval($input['completed'] ?? 0);
            $bestStreak = intval($input['best_streak'] ?? 0);
            $livesRemaining = intval($input['lives_remaining'] ?? 0);

            $stmt = $db->prepare("
                UPDATE trivia_games
                SET questions_count = ?,
                    correct_count = ?,
                    incorrect_count = ?,
                    score = ?,
                    duration = ?,
                    completed = ?,
                    best_streak = ?,
                    lives_remaining = ?,
                    completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE completed_at END
                WHERE id = ? AND user_id = ?
            ");
            $stmt->execute([
                $questionsCount, $correctCount, $incorrectCount, $score, $duration,
                $completed, $bestStreak, $livesRemaining, $completed, $gameId, $userId
            ]);

            jsonResponse(true, ['updated' => true]);
            break;

        case 'trivia_complete_game':
            $gameId = sanitize($input['game_id'] ?? '', 50);
            $mode = sanitize($input['mode'] ?? '', 20);
            $score = intval($input['score'] ?? 0);
            $questionsCount = intval($input['questions_count'] ?? 0);
            $correctCount = intval($input['correct_count'] ?? 0);
            $incorrectCount = intval($input['incorrect_count'] ?? 0);
            $bestStreak = intval($input['best_streak'] ?? 0);
            $duration = intval($input['duration'] ?? 0);

            // Update game as complete
            $stmt = $db->prepare("
                UPDATE trivia_games
                SET completed = 1,
                    completed_at = CURRENT_TIMESTAMP,
                    questions_count = ?,
                    correct_count = ?,
                    incorrect_count = ?,
                    score = ?,
                    duration = ?,
                    best_streak = ?
                WHERE id = ? AND user_id = ?
            ");
            $stmt->execute([
                $questionsCount, $correctCount, $incorrectCount, $score,
                $duration, $bestStreak, $gameId, $userId
            ]);

            // Get or create stats record
            $stmt = $db->prepare("SELECT * FROM trivia_stats WHERE user_id = ?");
            $stmt->execute([$userId]);
            $stats = $stmt->fetch();

            if (!$stats) {
                $stmt = $db->prepare("INSERT INTO trivia_stats (user_id) VALUES (?)");
                $stmt->execute([$userId]);
                $stmt = $db->prepare("SELECT * FROM trivia_stats WHERE user_id = ?");
                $stmt->execute([$userId]);
                $stats = $stmt->fetch();
            }

            // Update stats
            $newTotalGames = $stats['total_games'] + 1;
            $newTotalQuestions = $stats['total_questions'] + $questionsCount;
            $newCorrectAnswers = $stats['correct_answers'] + $correctCount;
            $newIncorrectAnswers = $stats['incorrect_answers'] + $incorrectCount;
            $newBestScore = max($stats['best_score'], $score);
            $newLongestStreak = max($stats['longest_streak'], $bestStreak);
            $newTotalTimePlayed = $stats['total_time_played'] + $duration;

            // Mode-specific stats
            $modeGamesField = $mode . '_games';
            $modeBestScoreField = $mode . '_best_score';
            $modeWinsField = ($mode === 'sprint') ? 'sprint_wins' : null;
            $modeBestRoundField = ($mode === 'endless' || $mode === 'survival') ? $mode . '_best_round' : null;

            $modeGames = $stats[$modeGamesField] + 1;
            $modeBestScore = max($stats[$modeBestScoreField], $score);

            $updateSql = "
                UPDATE trivia_stats
                SET total_games = ?,
                    total_questions = ?,
                    correct_answers = ?,
                    incorrect_answers = ?,
                    best_score = ?,
                    longest_streak = ?,
                    total_time_played = ?,
                    {$modeGamesField} = ?,
                    {$modeBestScoreField} = ?,
                    last_played_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            ";

            $stmt = $db->prepare($updateSql);
            $stmt->execute([
                $newTotalGames, $newTotalQuestions, $newCorrectAnswers, $newIncorrectAnswers,
                $newBestScore, $newLongestStreak, $newTotalTimePlayed,
                $modeGames, $modeBestScore, $userId
            ]);

            logAction($db, $userId, 'trivia_game_completed', 'trivia_game', $gameId, [
                'score' => $score,
                'mode' => $mode,
                'questions' => $questionsCount,
                'correct' => $correctCount
            ]);

            jsonResponse(true, ['completed' => true]);
            break;

        case 'trivia_get_stats':
            $stmt = $db->prepare("SELECT * FROM trivia_stats WHERE user_id = ?");
            $stmt->execute([$userId]);
            $stats = $stmt->fetch();

            if (!$stats) {
                // Return empty stats
                jsonResponse(true, [
                    'total_games' => 0,
                    'total_questions' => 0,
                    'correct_answers' => 0,
                    'incorrect_answers' => 0,
                    'accuracy' => 0
                ]);
            }

            $accuracy = $stats['total_questions'] > 0
                ? round(($stats['correct_answers'] / $stats['total_questions']) * 100, 1)
                : 0;

            jsonResponse(true, array_merge($stats, ['accuracy' => $accuracy]));
            break;

        case 'trivia_get_history':
            $limit = intval($input['limit'] ?? 50);
            $offset = intval($input['offset'] ?? 0);

            $stmt = $db->prepare("
                SELECT
                    q.*,
                    g.mode,
                    g.scope,
                    g.score as game_score,
                    g.completed
                FROM trivia_questions q
                JOIN trivia_games g ON q.game_id = g.id
                WHERE q.user_id = ?
                ORDER BY q.created_at DESC
                LIMIT ? OFFSET ?
            ");
            $stmt->execute([$userId, $limit, $offset]);
            $questions = $stmt->fetchAll();

            // Decode JSON fields
            foreach ($questions as &$q) {
                $q['choices'] = json_decode($q['choices_json'], true);
                $q['metadata'] = json_decode($q['metadata_json'], true);
                unset($q['choices_json'], $q['metadata_json']);
            }

            jsonResponse(true, $questions);
            break;

        case 'trivia_group_leaderboard':
            $groupId = $data['group_id'] ?? null;

            if (!$groupId) {
                jsonResponse(false, null, 'Group ID required');
            }

            // Check if user is a member
            $stmt = $db->prepare("
                SELECT COUNT(*)
                FROM group_members
                WHERE group_id = ? AND user_id = ?
            ");
            $stmt->execute([$groupId, $userId]);

            if ($stmt->fetchColumn() == 0) {
                jsonResponse(false, null, 'Not a member of this group');
            }

            // Get leaderboard for group members using trivia_stats table
            $stmt = $db->prepare("
                SELECT
                    u.id as user_id,
                    u.username,
                    u.display_name,
                    COALESCE(ts.total_games, 0) as total_games,
                    COALESCE(ts.best_score, 0) as best_score,
                    ROUND(
                        CASE
                            WHEN ts.total_questions > 0
                            THEN (ts.correct_answers * 100.0 / ts.total_questions)
                            ELSE 0
                        END,
                        1
                    ) as accuracy,
                    COALESCE(ts.average_score, 0) as average_score
                FROM users u
                JOIN group_members gm ON u.id = gm.user_id
                LEFT JOIN trivia_stats ts ON u.id = ts.user_id
                WHERE gm.group_id = ?
                AND ts.total_games > 0
                ORDER BY best_score DESC, accuracy DESC
                LIMIT 100
            ");
            $stmt->execute([$groupId]);

            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'trivia_global_leaderboard':
            $limit = intval($data['limit'] ?? 100);

            // Get global leaderboard using trivia_stats table
            $stmt = $db->prepare("
                SELECT
                    u.id as user_id,
                    u.username,
                    u.display_name,
                    COALESCE(ts.total_games, 0) as total_games,
                    COALESCE(ts.best_score, 0) as best_score,
                    ROUND(
                        CASE
                            WHEN ts.total_questions > 0
                            THEN (ts.correct_answers * 100.0 / ts.total_questions)
                            ELSE 0
                        END,
                        1
                    ) as accuracy,
                    COALESCE(ts.average_score, 0) as average_score
                FROM users u
                LEFT JOIN trivia_stats ts ON u.id = ts.user_id
                WHERE ts.total_games > 0
                ORDER BY best_score DESC, accuracy DESC
                LIMIT ?
            ");
            $stmt->execute([$limit]);

            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'trivia_get_recent_games':
            $limit = intval($input['limit'] ?? 10);

            $stmt = $db->prepare("
                SELECT *
                FROM trivia_games
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            ");
            $stmt->execute([$userId, $limit]);

            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'trivia_get_used_hashes':
            // Get hashes of recently asked questions to avoid repeats
            $limit = intval($input['limit'] ?? 100);

            $stmt = $db->prepare("
                SELECT DISTINCT question_hash
                FROM trivia_questions
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            ");
            $stmt->execute([$userId, $limit]);

            $hashes = array_column($stmt->fetchAll(), 'question_hash');
            jsonResponse(true, $hashes);
            break;

        case 'get_movie_cast':
            // Get cast/crew for a movie from TMDB
            $tmdbId = sanitize($input['tmdb_id'] ?? '', 20);

            if (empty($tmdbId)) {
                jsonResponse(false, null, 'TMDB ID required');
            }

            $url = TMDB_BASE_URL . '/movie/' . $tmdbId . '/credits?api_key=' . TMDB_API_KEY;
            $response = file_get_contents($url);

            if ($response === false) {
                jsonResponse(false, null, 'TMDB API request failed');
            }

            $data = json_decode($response, true);

            // Return top 10 cast members
            $cast = array_slice($data['cast'] ?? [], 0, 10);
            $castNames = array_map(function($actor) {
                return [
                    'id' => $actor['id'],
                    'name' => $actor['name'],
                    'character' => $actor['character'] ?? ''
                ];
            }, $cast);

            jsonResponse(true, $castNames);
            break;

        // ========================================
        // PRESET LISTS MANAGEMENT
        // ========================================

        case 'get_presets':
            // Get all wishlist preset lists
            $presetsFile = __DIR__ . '/../data/presets.json';

            if (!file_exists($presetsFile)) {
                jsonResponse(false, null, 'Presets file not found');
            }

            $presets = json_decode(file_get_contents($presetsFile), true);

            if ($presets === null) {
                jsonResponse(false, null, 'Failed to parse presets file');
            }

            jsonResponse(true, $presets);
            break;

        case 'save_presets':
            // Save preset lists (admin only)
            if (!$currentUser['is_admin']) {
                jsonResponse(false, null, 'Admin access required');
            }

            $presets = $input['presets'] ?? null;

            if (!$presets) {
                jsonResponse(false, null, 'Presets data required');
            }

            $presetsFile = __DIR__ . '/../data/presets.json';

            // Backup existing file
            if (file_exists($presetsFile)) {
                $backupFile = __DIR__ . '/../data/presets.backup.' . date('Y-m-d_H-i-s') . '.json';
                copy($presetsFile, $backupFile);
            }

            // Save new presets
            $result = file_put_contents($presetsFile, json_encode($presets, JSON_PRETTY_PRINT));

            if ($result === false) {
                jsonResponse(false, null, 'Failed to save presets file');
            }

            logAction($db, $userId, 'presets_updated', 'settings', null);

            jsonResponse(true, ['message' => 'Presets saved successfully']);
            break;

        // ========================================
        // ADMIN USER DATA MANAGEMENT
        // ========================================

        case 'admin_list_users':
            // List all users with their collection/wishlist counts (admin only)
            if (!$currentUser['is_admin']) {
                jsonResponse(false, null, 'Admin access required');
            }

            $stmt = $db->prepare("
                SELECT
                    u.id,
                    u.username,
                    u.email,
                    u.display_name,
                    u.is_admin,
                    u.created_at,
                    COUNT(DISTINCT c.id) as collection_count,
                    COUNT(DISTINCT w.id) as wishlist_count
                FROM users u
                LEFT JOIN copies c ON u.id = c.user_id
                LEFT JOIN wishlist w ON u.id = w.user_id
                GROUP BY u.id
                ORDER BY u.username ASC
            ");
            $stmt->execute();

            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'admin_get_user_data':
            // Get detailed user data (admin only)
            if (!$currentUser['is_admin']) {
                jsonResponse(false, null, 'Admin access required');
            }

            $targetUserId = intval($input['user_id'] ?? 0);

            if (!$targetUserId) {
                jsonResponse(false, null, 'User ID required');
            }

            // Get user info
            $stmt = $db->prepare("SELECT * FROM users WHERE id = ?");
            $stmt->execute([$targetUserId]);
            $user = $stmt->fetch();

            if (!$user) {
                jsonResponse(false, null, 'User not found');
            }

            // Get collection count
            $stmt = $db->prepare("SELECT COUNT(*) as count FROM copies WHERE user_id = ?");
            $stmt->execute([$targetUserId]);
            $collectionCount = $stmt->fetch()['count'];

            // Get wishlist count
            $stmt = $db->prepare("SELECT COUNT(*) as count FROM wishlist WHERE user_id = ?");
            $stmt->execute([$targetUserId]);
            $wishlistCount = $stmt->fetch()['count'];

            // Get group memberships
            $stmt = $db->prepare("
                SELECT g.id, g.name
                FROM groups g
                JOIN group_members gm ON g.id = gm.group_id
                WHERE gm.user_id = ?
            ");
            $stmt->execute([$targetUserId]);
            $groups = $stmt->fetchAll();

            jsonResponse(true, [
                'user' => $user,
                'collection_count' => $collectionCount,
                'wishlist_count' => $wishlistCount,
                'groups' => $groups
            ]);
            break;

        case 'admin_clear_wishlist':
            // Clear a user's wishlist (admin only)
            if (!$currentUser['is_admin']) {
                jsonResponse(false, null, 'Admin access required');
            }

            $targetUserId = intval($input['user_id'] ?? 0);

            if (!$targetUserId) {
                jsonResponse(false, null, 'User ID required');
            }

            // Get count before deleting
            $stmt = $db->prepare("SELECT COUNT(*) as count FROM wishlist WHERE user_id = ?");
            $stmt->execute([$targetUserId]);
            $count = $stmt->fetch()['count'];

            // Delete all wishlist items for this user
            $stmt = $db->prepare("DELETE FROM wishlist WHERE user_id = ?");
            $stmt->execute([$targetUserId]);

            logAction($db, $userId, 'admin_cleared_wishlist', 'user', $targetUserId, [
                'items_deleted' => $count
            ]);

            jsonResponse(true, [
                'message' => 'Wishlist cleared successfully',
                'items_deleted' => $count
            ]);
            break;

        case 'admin_clear_collection':
            // Clear a user's collection (admin only)
            if (!$currentUser['is_admin']) {
                jsonResponse(false, null, 'Admin access required');
            }

            $targetUserId = intval($input['user_id'] ?? 0);

            if (!$targetUserId) {
                jsonResponse(false, null, 'User ID required');
            }

            // Get count before deleting
            $stmt = $db->prepare("SELECT COUNT(*) as count FROM copies WHERE user_id = ?");
            $stmt->execute([$targetUserId]);
            $count = $stmt->fetch()['count'];

            // Delete all copies for this user
            $stmt = $db->prepare("DELETE FROM copies WHERE user_id = ?");
            $stmt->execute([$targetUserId]);

            logAction($db, $userId, 'admin_cleared_collection', 'user', $targetUserId, [
                'items_deleted' => $count
            ]);

            jsonResponse(true, [
                'message' => 'Collection cleared successfully',
                'items_deleted' => $count
            ]);
            break;

        case 'fetch_article':
            // Fetch article content from URL (admin only)
            if (!$currentUser['is_admin']) {
                jsonResponse(false, null, 'Admin access required');
            }

            $url = $input['url'] ?? '';
            $debug = $input['debug'] ?? false;
            $useAI = $input['use_ai'] ?? false;

            if (!$url || !filter_var($url, FILTER_VALIDATE_URL)) {
                jsonResponse(false, null, 'Valid URL required');
            }

            // Fetch the article content using cURL with comprehensive browser headers
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
            curl_setopt($ch, CURLOPT_ENCODING, 'gzip, deflate');
            curl_setopt($ch, CURLOPT_VERBOSE, $debug); // Enable verbose output for debugging

            // Comprehensive browser headers to bypass anti-scraping
            $headers = [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language: en-US,en;q=0.9',
                'Accept-Encoding: gzip, deflate, br',
                'DNT: 1',
                'Connection: keep-alive',
                'Upgrade-Insecure-Requests: 1',
                'Sec-Fetch-Dest: document',
                'Sec-Fetch-Mode: navigate',
                'Sec-Fetch-Site: none',
                'Cache-Control: max-age=0',
            ];
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

            $content = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
            $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
            $error = curl_error($ch);
            curl_close($ch);

            // Debug information
            if ($debug) {
                jsonResponse(true, [
                    'debug' => true,
                    'url' => $url,
                    'effective_url' => $effectiveUrl,
                    'http_code' => $httpCode,
                    'content_type' => $contentType,
                    'error' => $error,
                    'content_length' => strlen($content),
                    'content_preview' => substr($content, 0, 500)
                ]);
            }

            // Better error handling
            if ($error) {
                jsonResponse(false, null, 'Network error: ' . $error);
            }

            // For AI extraction, we can work with any HTTP response that has content
            // (even 403/404 sometimes return HTML we can parse)
            if ($httpCode !== 200 && !$useAI) {
                // Provide helpful error messages based on HTTP status
                $errorMsg = 'HTTP ' . $httpCode;
                if ($httpCode == 403 || $httpCode == 401) {
                    $errorMsg .= ' - Site blocked the request. Try AI extraction instead.';
                } elseif ($httpCode == 404) {
                    $errorMsg .= ' - Page not found. Check the URL.';
                } elseif ($httpCode == 429) {
                    $errorMsg .= ' - Too many requests. Wait a moment and try again.';
                } elseif ($httpCode >= 500) {
                    $errorMsg .= ' - Server error. Try again later.';
                } elseif ($httpCode == 0) {
                    $errorMsg = 'Connection failed - Unable to reach the website.';
                }
                jsonResponse(false, null, $errorMsg);
            }

            if (empty($content)) {
                jsonResponse(false, null, 'No content received from URL');
            }

            // Extract title from HTML if possible
            $title = '';
            if (preg_match('/<title>(.*?)<\/title>/is', $content, $matches)) {
                $title = html_entity_decode(strip_tags($matches[1]));
            }

            // AI Extraction Mode - Use OpenAI to extract movie data
            if ($useAI) {
                $aiResult = extractMoviesWithAI($content, $title);

                if (isset($aiResult['error'])) {
                    jsonResponse(false, null, 'AI extraction failed: ' . $aiResult['error']);
                }

                jsonResponse(true, [
                    'ai_extracted' => true,
                    'movies' => $aiResult['movies'],
                    'title' => $title,
                    'movie_count' => count($aiResult['movies'])
                ]);
            }

            // Standard extraction (legacy mode)
            // Convert HTML to plain text for easier parsing
            // Remove scripts and styles
            $content = preg_replace('/<script\b[^>]*>.*?<\/script>/is', '', $content);
            $content = preg_replace('/<style\b[^>]*>.*?<\/style>/is', '', $content);

            // Decode HTML entities
            $content = html_entity_decode($content);

            jsonResponse(true, [
                'content' => $content,
                'title' => $title
            ]);
            break;

        // ========================================
        // DEFAULT
        // ========================================

        default:
            jsonResponse(false, null, 'Unknown action: ' . $action);
    }
    
} catch (Exception $e) {
    error_log('CineShelf API Error: ' . $e->getMessage());
    error_log('Stack trace: ' . $e->getTraceAsString());
    jsonResponse(false, null, 'Server error: ' . $e->getMessage());
}