<?php
/**
 * CineShelf - Main API Endpoint
 * Features: Groups/Family Collections, Borrowing System, Trivia Game
 * OAuth-Enabled: Session-based authentication with legacy fallback
 * Version: Managed by version-manager.html (see version.json)
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/auth-middleware.php';

// ========================================
// UMDB API HELPERS
// ========================================

/**
 * Check if an ID is a UMDB ID (prefixed with "umdb-")
 * @param string $id The ID to check
 * @return bool True if this is a UMDB ID
 */
function isUmdbId($id) {
    return str_starts_with((string)$id, 'umdb-');
}

/**
 * Make an HTTP GET request to the UMDB API
 * Automatically attaches the X-API-Key header when UMDB_API_KEY is set.
 *
 * @param string $path  API path (e.g. "/movie/umdb-42" or "/search/multi?query=foo")
 * @return array|false  Decoded JSON response, or false on failure
 */
function umdbFetch($path) {
    $url = UMDB_BASE_URL . $path;

    $opts = ['http' => [
        'method' => 'GET',
        'timeout' => 15,
        'header' => "Accept: application/json\r\n",
    ]];

    if (!empty(UMDB_API_KEY)) {
        $opts['http']['header'] .= "X-API-Key: " . UMDB_API_KEY . "\r\n";
    }

    $ctx = stream_context_create($opts);
    $response = @file_get_contents($url, false, $ctx);

    if ($response === false) {
        error_log("CineShelf: UMDB request failed – $url");
        return false;
    }

    return json_decode($response, true);
}

/**
 * Make an HTTP POST request to the UMDB API (for push/create operations).
 *
 * @param string $path  API path (e.g. "/releases")
 * @param array  $body  Request body (will be JSON-encoded)
 * @return array|false  Decoded JSON response, or false on failure
 */
function umdbPost($path, $body) {
    return umdbRequest('POST', $path, $body);
}

/**
 * Make an HTTP PUT request to the UMDB API (for update operations).
 *
 * @param string $path  API path (e.g. "/releases/rel-abc123")
 * @param array  $body  Request body (will be JSON-encoded)
 * @return array|false  Decoded JSON response, or false on failure
 */
function umdbPut($path, $body) {
    return umdbRequest('PUT', $path, $body);
}

/**
 * Generic UMDB request helper for POST/PUT.
 *
 * @param string $method  HTTP method (POST or PUT)
 * @param string $path    API path
 * @param array  $body    Request body (will be JSON-encoded)
 * @return array|false    Decoded JSON response, or false on failure
 */
function umdbRequest($method, $path, $body) {
    $url = UMDB_BASE_URL . $path;
    $json = json_encode($body);

    $headerStr = "Accept: application/json\r\nContent-Type: application/json\r\nContent-Length: " . strlen($json) . "\r\n";
    if (!empty(UMDB_API_KEY)) {
        $headerStr .= "X-API-Key: " . UMDB_API_KEY . "\r\n";
    }

    $opts = ['http' => [
        'method'  => $method,
        'timeout' => 15,
        'header'  => $headerStr,
        'content' => $json,
        'ignore_errors' => true,   // Return body even on 4xx/5xx so we can read error details
    ]];

    $ctx = stream_context_create($opts);
    $response = @file_get_contents($url, false, $ctx);

    // Capture HTTP status from the magic $http_response_header variable
    $statusCode = 0;
    if (isset($http_response_header) && is_array($http_response_header) && !empty($http_response_header[0])) {
        preg_match('/\d{3}/', $http_response_header[0], $m);
        $statusCode = intval($m[0] ?? 0);
    }

    if ($response === false) {
        $lastErr = error_get_last();
        $errMsg = $lastErr['message'] ?? 'unknown error';
        error_log("CineShelf: UMDB $method connection failed – $url – $errMsg");
        return false;
    }

    // Log and fail on non-2xx responses
    if ($statusCode >= 400) {
        error_log("CineShelf: UMDB $method returned HTTP $statusCode – $url – Response: " . substr($response, 0, 500));
        // Store error details so callers can surface them
        $GLOBALS['_umdb_last_error'] = "HTTP $statusCode: " . substr($response, 0, 300);
        return false;
    }

    return json_decode($response, true);
}

/**
 * Build the correct detail-fetch URL for a movie/tv id.
 * Returns [url, source] where source is 'umdb' or 'tmdb'.
 *
 * @param string $id        The tmdb_id or umdb-{n} id
 * @param string $mediaType 'movie' or 'tv'
 * @param string $append    append_to_response value
 * @return array            ['url' => string, 'source' => 'umdb'|'tmdb', 'headers' => array]
 */
function buildDetailUrl($id, $mediaType = 'movie', $append = 'credits,release_dates') {
    $endpoint = $mediaType === 'tv' ? '/tv/' : '/movie/';

    if (isUmdbId($id)) {
        $url = UMDB_BASE_URL . $endpoint . $id;
        if ($append) {
            $url .= '?append_to_response=' . urlencode($append);
        }
        $headers = [];
        if (!empty(UMDB_API_KEY)) {
            $headers[] = "X-API-Key: " . UMDB_API_KEY;
        }
        return ['url' => $url, 'source' => 'umdb', 'headers' => $headers];
    }

    // Default: TMDB
    $url = TMDB_BASE_URL . $endpoint . $id . '?api_key=' . TMDB_API_KEY;
    if ($append) {
        $url .= '&append_to_response=' . urlencode($append);
    }
    return ['url' => $url, 'source' => 'tmdb', 'headers' => []];
}

/**
 * Fetch JSON from a URL, optionally with extra headers (used for UMDB auth).
 *
 * @param string $url
 * @param array  $extraHeaders
 * @return string|false  Raw response body
 */
function fetchUrl($url, $extraHeaders = []) {
    $headerStr = "Accept: application/json\r\n";
    foreach ($extraHeaders as $h) {
        $headerStr .= $h . "\r\n";
    }
    $opts = ['http' => [
        'method'  => 'GET',
        'timeout' => 15,
        'header'  => $headerStr,
    ]];
    $ctx = stream_context_create($opts);
    return @file_get_contents($url, false, $ctx);
}

/**
 * Resolve a poster/backdrop path to a full URL.
 * UMDB may return full URLs; TMDB returns relative paths.
 *
 * @param string|null $path  poster_path or poster_url value
 * @return string|null       Full URL or null
 */
function resolveImageUrl($path) {
    if (empty($path)) return null;
    // Already a full URL (UMDB may return these)
    if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
        return $path;
    }
    // TMDB-style relative path
    return TMDB_IMAGE_BASE . $path;
}

/**
 * Seed enriched metadata tables from fields already stored in the movies table.
 * Used when TMDB API is unavailable or as a quick first pass.
 * @param PDO $db
 * @param array $movie  Row from movies table (id, director, genre, studio, certification)
 */
function _backfillFromExistingFields($db, $movie) {
    $movieId = intval($movie['id']);
    // Director (stored as comma-sep or single name)
    if (!empty($movie['director'])) {
        foreach (array_filter(array_map('trim', explode(',', $movie['director']))) as $i => $name) {
            try { $db->prepare("INSERT OR IGNORE INTO movie_people (movie_id, name, role, sort_order) VALUES (?, ?, 'director', ?)")
                     ->execute([$movieId, $name, $i]); } catch (Exception $e) {}
        }
    }
    // Genre (comma-separated text)
    if (!empty($movie['genre'])) {
        foreach (array_filter(array_map('trim', explode(',', $movie['genre']))) as $name) {
            try { $db->prepare("INSERT OR IGNORE INTO movie_genres (movie_id, name) VALUES (?, ?)")
                     ->execute([$movieId, $name]); } catch (Exception $e) {}
        }
    }
    // Studio
    if (!empty($movie['studio'])) {
        try { $db->prepare("INSERT OR IGNORE INTO movie_studios (movie_id, name, sort_order) VALUES (?, ?, 0)")
                 ->execute([$movieId, trim($movie['studio'])]); } catch (Exception $e) {}
    }
    // Certification
    if (!empty($movie['certification'])) {
        try { $db->prepare("INSERT OR IGNORE INTO movie_certifications (movie_id, region, certification, source) VALUES (?, 'US', ?, 'movies_table')")
                 ->execute([$movieId, trim($movie['certification'])]); } catch (Exception $e) {}
    }
}

/**
 * Extract movie titles and years from HTML content using OpenAI
 * @param string $htmlContent The HTML content to parse
 * @param string $articleTitle Optional article title for context
 * @return array Array of movies with title and year, or error with debug info
 */
function extractMoviesWithAI($htmlContent, $articleTitle = '') {
    $debugSteps = [];

    // Step 1: Check API key
    $debugSteps[] = 'Step 1: Checking API key';
    if (empty(OPENAI_API_KEY)) {
        return [
            'error' => 'OpenAI API key not configured',
            'debug_steps' => $debugSteps,
            'help' => 'Create config/secrets.php with OPENAI_API_KEY'
        ];
    }
    $debugSteps[] = 'Step 1: API key found (' . strlen(OPENAI_API_KEY) . ' chars)';

    // Step 2: Clean content - preserve article text while removing noise
    $debugSteps[] = 'Step 2: Cleaning HTML content';

    // First, try to extract main article content if possible
    $articleContent = $htmlContent;

    // Try to find <article> tag first (most semantic)
    if (preg_match('/<article[^>]*>(.*?)<\/article>/is', $htmlContent, $matches)) {
        $articleContent = $matches[1];
        $debugSteps[] = 'Step 2: Found <article> tag, using its content';
    }
    // Try <main> tag as fallback
    else if (preg_match('/<main[^>]*>(.*?)<\/main>/is', $htmlContent, $matches)) {
        $articleContent = $matches[1];
        $debugSteps[] = 'Step 2: Found <main> tag, using its content';
    }
    // Try to find div with article/content/post class
    else if (preg_match('/<div[^>]*class="[^"]*(?:article|content|post|entry)[^"]*"[^>]*>(.*?)<\/div>/is', $htmlContent, $matches)) {
        $articleContent = $matches[1];
        $debugSteps[] = 'Step 2: Found content div, using its content';
    }
    else {
        $debugSteps[] = 'Step 2: No article container found, using full HTML';
    }

    // Remove noisy elements
    $cleanedContent = preg_replace('/<script\b[^>]*>.*?<\/script>/is', ' ', $articleContent);
    $cleanedContent = preg_replace('/<style\b[^>]*>.*?<\/style>/is', ' ', $cleanedContent);
    $cleanedContent = preg_replace('/<nav\b[^>]*>.*?<\/nav>/is', ' ', $cleanedContent);
    $cleanedContent = preg_replace('/<header\b[^>]*>.*?<\/header>/is', ' ', $cleanedContent);
    $cleanedContent = preg_replace('/<footer\b[^>]*>.*?<\/footer>/is', ' ', $cleanedContent);
    $cleanedContent = preg_replace('/<aside\b[^>]*>.*?<\/aside>/is', ' ', $cleanedContent);
    $cleanedContent = preg_replace('/<!--.*?-->/s', ' ', $cleanedContent); // Remove comments

    // Strip remaining HTML tags but preserve spacing
    $cleanedContent = preg_replace('/<[^>]+>/', ' ', $cleanedContent);

    // Decode HTML entities
    $cleanedContent = html_entity_decode($cleanedContent, ENT_QUOTES | ENT_HTML5, 'UTF-8');

    // Clean up whitespace - collapse multiple spaces/newlines but keep paragraph breaks
    $cleanedContent = preg_replace('/[ \t]+/', ' ', $cleanedContent); // Collapse spaces
    $cleanedContent = preg_replace('/\n\s*\n+/', "\n\n", $cleanedContent); // Keep paragraph breaks
    $cleanedContent = trim($cleanedContent);

    $originalLength = strlen($cleanedContent);
    if ($originalLength > 15000) {
        $cleanedContent = substr($cleanedContent, 0, 15000);
    }
    $debugSteps[] = "Step 2: Cleaned content: $originalLength chars (truncated to " . strlen($cleanedContent) . ")";

    // Step 3: Build prompt
    $debugSteps[] = 'Step 3: Building AI prompt';
    $prompt = "You are analyzing an article";
    if ($articleTitle) {
        $prompt .= " titled '$articleTitle'";
    }
    $prompt .= " that contains information about movies. Your task is to extract ALL movie titles and their release years.\n\n";
    $prompt .= "This may be a ranked list, review, or article discussing movies. Look for:\n";
    $prompt .= "- Movie titles (may include subtitles in parentheses)\n";
    $prompt .= "- Release years (often in parentheses like '(2014)' or mentioned in text)\n";
    $prompt .= "- Director names and actor names are often mentioned near movie titles\n\n";
    $prompt .= "Return a JSON object with a 'movies' array like this:\n";
    $prompt .= "{\"movies\": [{\"title\": \"Movie Name\", \"year\": 2024}, {\"title\": \"Another Movie\", \"year\": 2020}]}\n\n";
    $prompt .= "Important rules:\n";
    $prompt .= "- Extract ALL movies mentioned (this could be 5-50+ movies)\n";
    $prompt .= "- Include the release year as a number (not a string)\n";
    $prompt .= "- If no year is found, use null\n";
    $prompt .= "- Only extract movies (not TV shows)\n";
    $prompt .= "- Remove subtitles like 'or (The Unexpected Virtue of Ignorance)' - keep main title only\n";
    $prompt .= "- If you truly find no movies, return {\"movies\": []}\n\n";
    $prompt .= "Article content:\n\n" . $cleanedContent;

    // Step 4: Prepare API request
    $debugSteps[] = 'Step 4: Preparing OpenAI API request';
    $apiData = [
        'model' => OPENAI_MODEL,
        'messages' => [
            [
                'role' => 'system',
                'content' => 'You are a specialized movie information extractor. You analyze web articles, reviews, and lists to identify all movie titles and years mentioned. You MUST respond with ONLY valid JSON - no explanations, no markdown, no commentary. If you find movies, return the array. If you find none, return [].'
            ],
            [
                'role' => 'user',
                'content' => $prompt
            ]
        ],
        'temperature' => 0.3,
        'max_tokens' => 3000,
        'response_format' => ['type' => 'json_object']
    ];
    $debugSteps[] = 'Step 4: Request prepared for model: ' . OPENAI_MODEL . ' (JSON mode enabled)';

    // Step 5: Make cURL request
    $debugSteps[] = 'Step 5: Making cURL request to OpenAI';
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
        $debugSteps[] = 'Step 5: cURL ERROR - ' . $curlError;
        return [
            'error' => 'Network error connecting to OpenAI: ' . $curlError,
            'debug_steps' => $debugSteps
        ];
    }
    $debugSteps[] = 'Step 5: Request completed with HTTP ' . $httpCode;

    // Step 6: Check HTTP response
    if ($httpCode !== 200) {
        $debugSteps[] = 'Step 6: HTTP error ' . $httpCode;
        $errorDetail = json_decode($response, true);
        $errorMsg = 'OpenAI API returned HTTP ' . $httpCode;

        if ($errorDetail && isset($errorDetail['error']['message'])) {
            $errorMsg .= ': ' . $errorDetail['error']['message'];
            $debugSteps[] = 'OpenAI error: ' . $errorDetail['error']['message'];
        }

        return [
            'error' => $errorMsg,
            'debug_steps' => $debugSteps,
            'http_code' => $httpCode,
            'raw_response' => substr($response, 0, 500)
        ];
    }
    $debugSteps[] = 'Step 6: HTTP 200 OK';

    // Step 7: Parse response
    $debugSteps[] = 'Step 7: Parsing OpenAI response';
    $result = json_decode($response, true);

    if (!$result) {
        $debugSteps[] = 'Step 7: Failed to decode JSON response';
        return [
            'error' => 'Failed to decode OpenAI response',
            'debug_steps' => $debugSteps,
            'raw_response' => substr($response, 0, 500)
        ];
    }

    if (!isset($result['choices'][0]['message']['content'])) {
        $debugSteps[] = 'Step 7: Invalid response structure';
        return [
            'error' => 'Invalid response structure from OpenAI',
            'debug_steps' => $debugSteps,
            'response_keys' => array_keys($result)
        ];
    }

    $content = trim($result['choices'][0]['message']['content']);
    $debugSteps[] = 'Step 7: Extracted content (' . strlen($content) . ' chars)';
    $debugSteps[] = 'Step 7: AI response preview: ' . substr($content, 0, 200);

    // Step 8: Parse movie data
    $debugSteps[] = 'Step 8: Parsing movie data from AI response';
    $parsedData = json_decode($content, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        $debugSteps[] = 'Step 8: Initial JSON parse failed, trying markdown extraction';
        if (preg_match('/```(?:json)?\s*([\s\S]*?)```/', $content, $matches)) {
            $parsedData = json_decode(trim($matches[1]), true);
        }

        if (json_last_error() !== JSON_ERROR_NONE) {
            $debugSteps[] = 'Step 8: JSON parse failed - ' . json_last_error_msg();
            return [
                'error' => 'Failed to parse AI response as JSON: ' . json_last_error_msg(),
                'debug_steps' => $debugSteps,
                'ai_content' => substr($content, 0, 500)
            ];
        }
    }

    // Extract movies array from response object
    $movies = [];
    if (is_array($parsedData)) {
        // Check if it's already an array of movies (legacy format)
        if (isset($parsedData[0]) && isset($parsedData[0]['title'])) {
            $movies = $parsedData;
            $debugSteps[] = 'Step 8: Using legacy array format';
        }
        // Check if it's an object with a movies key (new format)
        else if (isset($parsedData['movies']) && is_array($parsedData['movies'])) {
            $movies = $parsedData['movies'];
            $debugSteps[] = 'Step 8: Extracted movies from response object';
        }
        else {
            $debugSteps[] = 'Step 8: Unexpected response format';
            $debugSteps[] = 'Response keys: ' . implode(', ', array_keys($parsedData));
        }
    } else {
        $debugSteps[] = 'Step 8: Response was not an array or object';
        return [
            'error' => 'AI response was not valid JSON',
            'debug_steps' => $debugSteps,
            'response_type' => gettype($parsedData)
        ];
    }

    $movieCount = count($movies);
    $debugSteps[] = 'Step 8: Successfully parsed ' . $movieCount . ' movies';

    // If we got 0 movies, that's suspicious - log more details
    if ($movieCount === 0) {
        $debugSteps[] = 'WARNING: AI returned empty array';
        $debugSteps[] = 'Full AI response: ' . $content;
        $debugSteps[] = 'Input content length sent to AI: ' . strlen($cleanedContent) . ' chars';
        $debugSteps[] = 'Input preview: ' . substr($cleanedContent, 0, 500);
    }

    $debugSteps[] = 'SUCCESS: AI extraction completed';

    return [
        'success' => true,
        'movies' => $movies,
        'debug_steps' => $debugSteps
    ];
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

    // Admin-only actions that don't require user authentication
    $adminActions = ['save_icon'];

    if (in_array($action, $adminActions)) {
        // Skip authentication for admin tools
        $currentUser = null;
        $userId = null;
        $user = null;
    } else {
        // Authenticate user (supports both OAuth and legacy)
        $currentUser = authenticateRequest();
        $userId = $currentUser['id'];
        $user = $currentUser['username']; // For backwards compatibility
    }

    // Route to appropriate action
    switch ($action) {
        
        // ========================================
        // MOVIE SEARCH ACTIONS
        // ========================================
        
        case 'search_movie':
        case 'search_movies':  // Alias for box set functionality
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
            // Return full TMDB response with results array
            jsonResponse(true, ['results' => $data['results'] ?? []]);
            break;
            
        case 'search_multi':
            $query = sanitize($input['query'] ?? '', 100);
            $includeUmdb = ($input['include_umdb'] ?? true);

            if (empty($query)) {
                jsonResponse(false, null, 'Search query required');
            }

            // Search TMDB
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
            $results = array_values($results);

            // Also search UMDB and merge results (non-blocking: failure is OK)
            if ($includeUmdb) {
                $umdbData = umdbFetch('/search/multi?query=' . urlencode($query));
                if ($umdbData && !empty($umdbData['results'])) {
                    $umdbResults = array_filter($umdbData['results'], function($item) {
                        return in_array($item['media_type'] ?? 'movie', ['movie', 'tv']);
                    });
                    // Tag UMDB results with source for frontend differentiation
                    foreach ($umdbResults as &$r) {
                        $r['source'] = 'umdb';
                    }
                    unset($r);
                    // Append UMDB results after TMDB results
                    $results = array_merge($results, array_values($umdbResults));
                }
            }

            jsonResponse(true, $results);
            break;

        case 'find_by_imdb':
            // Lookup a movie/TV show by IMDb ID — tries TMDB, then UMDB
            $imdbId = sanitize($input['imdb_id'] ?? '', 20);

            if (empty($imdbId)) {
                jsonResponse(false, null, 'IMDb ID required');
            }

            // Try TMDB first
            $tmdbFindUrl = TMDB_BASE_URL . '/find/' . urlencode($imdbId) . '?api_key=' . TMDB_API_KEY . '&external_source=imdb_id';
            $tmdbResp = file_get_contents($tmdbFindUrl);
            $tmdbFind = $tmdbResp ? json_decode($tmdbResp, true) : null;

            $result = null;
            $mediaType = 'movie';

            if ($tmdbFind) {
                if (!empty($tmdbFind['movie_results'])) {
                    $result = $tmdbFind['movie_results'][0];
                    $mediaType = 'movie';
                } elseif (!empty($tmdbFind['tv_results'])) {
                    $result = $tmdbFind['tv_results'][0];
                    $mediaType = 'tv';
                }
            }

            // If TMDB had no result, try UMDB
            if (!$result) {
                $umdbFind = umdbFetch('/find/' . urlencode($imdbId) . '?external_source=imdb_id');
                if ($umdbFind) {
                    if (!empty($umdbFind['movie_results'])) {
                        $result = $umdbFind['movie_results'][0];
                        $mediaType = 'movie';
                        $result['source'] = 'umdb';
                    } elseif (!empty($umdbFind['tv_results'])) {
                        $result = $umdbFind['tv_results'][0];
                        $mediaType = 'tv';
                        $result['source'] = 'umdb';
                    }
                }
            }

            if (!$result) {
                jsonResponse(false, null, 'No movie or TV show found for IMDb ID: ' . $imdbId);
            }

            // Now fetch full details
            $detailId = $result['id'];
            $appendTo = $mediaType === 'tv' ? 'credits,content_ratings' : 'credits,release_dates';
            $detail = buildDetailUrl((string)$detailId, $mediaType, $appendTo);
            $detailResp = fetchUrl($detail['url'], $detail['headers']);

            if ($detailResp === false) {
                // Return the basic find result if detail fetch fails
                $result['media_type'] = $mediaType;
                jsonResponse(true, $result);
            }

            $details = json_decode($detailResp, true);
            $details['media_type'] = $mediaType;
            $details['source'] = $detail['source'];

            jsonResponse(true, $details);
            break;

        case 'get_movie':
            $tmdbId = sanitize($input['tmdb_id'] ?? '', 20);
            $mediaType = sanitize($input['media_type'] ?? 'movie', 20);
            $certRegion = sanitize($input['cert_region'] ?? 'US', 10);

            // Map special sub-regions to TMDB country codes
            $tmdbCertCountry = $certRegion;
            if ($certRegion === 'CA-QC') $tmdbCertCountry = 'CA';

            if (empty($tmdbId)) {
                jsonResponse(false, null, 'TMDB ID required');
            }

            // Route to UMDB or TMDB based on ID prefix
            $appendTo = $mediaType === 'tv' ? 'credits,content_ratings' : 'credits,release_dates';
            $detail = buildDetailUrl($tmdbId, $mediaType, $appendTo);
            $response = fetchUrl($detail['url'], $detail['headers']);

            if ($response === false) {
                $apiName = $detail['source'] === 'umdb' ? 'UMDB' : 'TMDB';
                jsonResponse(false, null, "$apiName API request failed");
            }

            $data = json_decode($response, true);

            // Get certification for the user's preferred region
            $certification = null;
            if ($mediaType === 'tv' && isset($data['content_ratings']['results'])) {
                foreach ($data['content_ratings']['results'] as $rating) {
                    if ($rating['iso_3166_1'] === $tmdbCertCountry) {
                        $certification = $rating['rating'];
                        break;
                    }
                }
                // Fallback to US if preferred region has no rating
                if ($certification === null && $tmdbCertCountry !== 'US') {
                    foreach ($data['content_ratings']['results'] as $rating) {
                        if ($rating['iso_3166_1'] === 'US') {
                            $certification = $rating['rating'];
                            break;
                        }
                    }
                }
            } elseif (isset($data['release_dates']['results'])) {
                foreach ($data['release_dates']['results'] as $release) {
                    if ($release['iso_3166_1'] === $tmdbCertCountry) {
                        foreach ($release['release_dates'] as $date) {
                            if (!empty($date['certification'])) {
                                $certification = $date['certification'];
                                break 2;
                            }
                        }
                    }
                }
                // Fallback to US if preferred region has no certification
                if ($certification === null && $tmdbCertCountry !== 'US') {
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
            }
            
            $genres = implode(', ', array_column($data['genres'] ?? [], 'name'));
            
            if ($mediaType === 'tv') {
                jsonResponse(true, [
                    'id' => $data['id'],
                    'title' => $data['name'],
                    'year' => isset($data['first_air_date']) ? intval(substr($data['first_air_date'], 0, 4)) : null,
                    'poster_url' => resolveImageUrl($data['poster_path'] ?? $data['poster_url'] ?? null),
                    'backdrop_url' => resolveImageUrl($data['backdrop_path'] ?? $data['backdrop_url'] ?? null),
                    'overview' => $data['overview'] ?? null,
                    'rating' => $data['vote_average'] ?? null,
                    'runtime' => isset($data['episode_run_time'][0]) ? $data['episode_run_time'][0] : null,
                    'genre' => $genres,
                    'media_type' => 'tv',
                    'number_of_seasons' => $data['number_of_seasons'] ?? null,
                    'director' => isset($data['created_by'][0]['name']) ? $data['created_by'][0]['name'] : null,
                    'certification' => $certification,
                    'source' => $detail['source']
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
                    'poster_url' => resolveImageUrl($data['poster_path'] ?? $data['poster_url'] ?? null),
                    'backdrop_url' => resolveImageUrl($data['backdrop_path'] ?? $data['backdrop_url'] ?? null),
                    'overview' => $data['overview'] ?? null,
                    'rating' => $data['vote_average'] ?? null,
                    'runtime' => $data['runtime'] ?? null,
                    'genre' => $genres,
                    'imdb_id' => $data['imdb_id'] ?? null,
                    'media_type' => 'movie',
                    'director' => $director,
                    'certification' => $certification,
                    'source' => $detail['source']
                ]);
            }
            break;
        
        // ========================================
        // COPY ACTIONS (Collection Management)
        // ========================================
        
        case 'add_copy':
            $debugLog = "[add_copy] START - Input: " . json_encode($input) . "\n";
            file_put_contents('php://stderr', $debugLog);

            $tmdbId = sanitize($input['tmdb_id'] ?? '', 20);
            $movieId = intval($input['movie_id'] ?? 0);

            $debugLog = "[add_copy] Parsed: tmdbId=$tmdbId, movieId=$movieId\n";
            file_put_contents('php://stderr', $debugLog);

            $mediaType = sanitize($input['media_type'] ?? 'movie', 20);
            $certRegion = sanitize($input['cert_region'] ?? 'US', 10);
            $tmdbCertCountry = $certRegion === 'CA-QC' ? 'CA' : $certRegion;
            $format = sanitize($input['format'] ?? 'DVD', 50);
            $edition = sanitize($input['edition'] ?? '', 100);
            $region = sanitize($input['region'] ?? '', 50);
            $condition = sanitize($input['condition'] ?? 'Good', 50);
            $notes = sanitize($input['notes'] ?? '', 500);
            $barcode = sanitize($input['barcode'] ?? '', 50);
            $seasonsOwned = sanitize($input['seasons_owned'] ?? '', 200);
            // Physical media attributes (v3.0.0)
            $aspectRatio = sanitize($input['aspect_ratio'] ?? '', 50);
            $packageType = sanitize($input['package_type'] ?? '', 50);
            $featureCount = sanitize($input['feature_count'] ?? 'Single', 50);
            $hasSlipcover = intval($input['has_slipcover'] ?? 0);
            $hasBooklet = intval($input['has_booklet'] ?? 0);
            $hasBonusDisc = intval($input['has_bonus_disc'] ?? 0);
            $bonusDiscCount = intval($input['bonus_disc_count'] ?? 0);
            $hasDigitalCopy = intval($input['has_digital_copy'] ?? 0);
            $has3d = intval($input['has_3d'] ?? 0);
            // Edition link (v4.0.0)
            $editionId = !empty($input['edition_id']) ? intval($input['edition_id']) : null;

            // Accept either tmdb_id (legacy) or movie_id (for box sets where movie is already created)
            if (empty($tmdbId) && empty($movieId)) {
                file_put_contents('php://stderr', "[add_copy] ERROR: Neither TMDB ID nor Movie ID provided\n");
                jsonResponse(false, null, 'Either TMDB ID or Movie ID required');
            }

            // Get or create movie
            if ($movieId) {
                file_put_contents('php://stderr', "[add_copy] Looking up movie with ID: $movieId\n");
                // Movie already exists, use the provided movie_id
                $stmt = $db->prepare("SELECT * FROM movies WHERE id = ?");
                $stmt->execute([$movieId]);
                $movie = $stmt->fetch();

                if ($movie) {
                    file_put_contents('php://stderr', "[add_copy] Movie FOUND: id={$movie['id']}, tmdb_id={$movie['tmdb_id']}, title={$movie['title']}\n");
                } else {
                    file_put_contents('php://stderr', "[add_copy] Movie NOT FOUND with id=$movieId\n");
                }

                if (!$movie) {
                    file_put_contents('php://stderr', "[add_copy] ERROR: Movie $movieId not found - returning error\n");
                    jsonResponse(false, null, 'Movie not found');
                }
                $movieId = $movie['id'];
                file_put_contents('php://stderr', "[add_copy] Using movie_id: $movieId from movie: {$movie['title']}\n");
            } else {
                // Legacy path: look up or create movie using TMDB ID
                $stmt = $db->prepare("SELECT id FROM movies WHERE tmdb_id = ?");
                $stmt->execute([$tmdbId]);
                $movie = $stmt->fetch();
            }

            if (!$movie) {
                // Fetch from TMDB or UMDB (with credits for actors/director/studio)
                $appendTo = $mediaType === 'tv' ? 'credits,content_ratings' : 'credits,release_dates';
                $detail = buildDetailUrl($tmdbId, $mediaType, $appendTo);
                $response = fetchUrl($detail['url'], $detail['headers']);

                if ($response === false) {
                    $apiName = $detail['source'] === 'umdb' ? 'UMDB' : 'TMDB';
                    jsonResponse(false, null, "Failed to fetch movie from $apiName");
                }

                $data = json_decode($response, true);
                $genres = implode(', ', array_column($data['genres'] ?? [], 'name'));

                // Extract director (or creator for TV shows)
                $director = '';
                if ($mediaType === 'tv' && !empty($data['created_by'])) {
                    $director = $data['created_by'][0]['name'];
                } elseif (!empty($data['credits']['crew'])) {
                    foreach ($data['credits']['crew'] as $person) {
                        if ($person['job'] === 'Director') {
                            $director = $person['name'];
                            break;
                        }
                    }
                }

                // Extract top 5 actors
                $actors = '';
                if (!empty($data['credits']['cast'])) {
                    $topActors = array_slice($data['credits']['cast'], 0, 5);
                    $actors = implode(', ', array_column($topActors, 'name'));
                }

                // Extract studio (first production company)
                $studio = '';
                if (!empty($data['production_companies'])) {
                    $studio = $data['production_companies'][0]['name'] ?? '';
                }

                // Extract certification for user's preferred region (fallback to US)
                $certification = '';
                if ($mediaType === 'tv' && !empty($data['content_ratings']['results'])) {
                    foreach ($data['content_ratings']['results'] as $rating) {
                        if ($rating['iso_3166_1'] === $tmdbCertCountry) {
                            $certification = $rating['rating'];
                            break;
                        }
                    }
                    if (empty($certification) && $tmdbCertCountry !== 'US') {
                        foreach ($data['content_ratings']['results'] as $rating) {
                            if ($rating['iso_3166_1'] === 'US') {
                                $certification = $rating['rating'];
                                break;
                            }
                        }
                    }
                } elseif (!empty($data['release_dates']['results'])) {
                    foreach ($data['release_dates']['results'] as $country) {
                        if ($country['iso_3166_1'] === $tmdbCertCountry) {
                            foreach ($country['release_dates'] as $release) {
                                if (!empty($release['certification'])) {
                                    $certification = $release['certification'];
                                    break 2;
                                }
                            }
                        }
                    }
                    if (empty($certification) && $tmdbCertCountry !== 'US') {
                        foreach ($data['release_dates']['results'] as $country) {
                            if ($country['iso_3166_1'] === 'US') {
                                foreach ($country['release_dates'] as $release) {
                                    if (!empty($release['certification'])) {
                                        $certification = $release['certification'];
                                        break 2;
                                    }
                                }
                            }
                        }
                    }
                }

                // Insert movie with all metadata
                $numberOfSeasons = $mediaType === 'tv' ? ($data['number_of_seasons'] ?? null) : null;
                $stmt = $db->prepare("
                    INSERT INTO movies (tmdb_id, title, year, poster_url, overview, rating, runtime, genre, director, actors, studio, certification, media_type, number_of_seasons)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");

                $title = $mediaType === 'tv' ? $data['name'] : $data['title'];
                $releaseDate = $mediaType === 'tv' ? ($data['first_air_date'] ?? null) : ($data['release_date'] ?? null);
                $year = $releaseDate ? intval(substr($releaseDate, 0, 4)) : null;

                $stmt->execute([
                    $tmdbId,
                    $title,
                    $year,
                    resolveImageUrl($data['poster_path'] ?? $data['poster_url'] ?? null),
                    $data['overview'] ?? null,
                    $data['vote_average'] ?? null,
                    $data['runtime'] ?? ($data['episode_run_time'][0] ?? null),
                    $genres,
                    $director,
                    $actors,
                    $studio,
                    $certification,
                    $mediaType,
                    $numberOfSeasons
                ]);

                $movieId = $db->lastInsertId();
            } else {
                $movieId = $movie['id'];
            }

            // Add copy
            file_put_contents('php://stderr', "[add_copy] Creating copy: userId=$userId, movieId=$movieId, format=$format, editionId=$editionId\n");
            $stmt = $db->prepare("
                INSERT INTO copies (user_id, movie_id, edition_id, format, edition, region, condition, notes, barcode, seasons_owned,
                    aspect_ratio, package_type, feature_count, has_slipcover, has_booklet, has_bonus_disc, bonus_disc_count, has_digital_copy, has_3d)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");

            $stmt->execute([$userId, $movieId, $editionId, $format, $edition, $region, $condition, $notes, $barcode, $seasonsOwned ?: null,
                $aspectRatio ?: null, $packageType ?: null, $featureCount ?: 'Single',
                $hasSlipcover, $hasBooklet, $hasBonusDisc, $bonusDiscCount, $hasDigitalCopy, $has3d]);

            $newCopyId = $db->lastInsertId();
            file_put_contents('php://stderr', "[add_copy] Copy created with ID: $newCopyId\n");

            // Verify what was actually inserted with full movie details
            $verifyStmt = $db->prepare("
                SELECT c.id as copy_id, c.movie_id, m.tmdb_id, m.title
                FROM copies c
                JOIN movies m ON c.movie_id = m.id
                WHERE c.id = ?
            ");
            $verifyStmt->execute([$newCopyId]);
            $verifyResult = $verifyStmt->fetch();
            file_put_contents('php://stderr', "[add_copy] VERIFICATION: copy_id={$verifyResult['copy_id']}, movie_id={$verifyResult['movie_id']}, tmdb_id={$verifyResult['tmdb_id']}, title={$verifyResult['title']}\n");

            // If edition was specified, auto-initialize copy components
            if ($editionId) {
                $compStmt = $db->prepare("SELECT id FROM edition_components WHERE edition_id = ?");
                $compStmt->execute([$editionId]);
                $editionComps = $compStmt->fetchAll();
                $insertCompStmt = $db->prepare("
                    INSERT OR IGNORE INTO copy_components (copy_id, edition_component_id, is_present, condition)
                    VALUES (?, ?, 1, 'Good')
                ");
                foreach ($editionComps as $comp) {
                    $insertCompStmt->execute([$newCopyId, $comp['id']]);
                }
            }

            logAction($db, $userId, 'copy_added', 'copy', $newCopyId);

            jsonResponse(true, ['copy_id' => $newCopyId]);
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
                    m.actors,
                    m.studio,
                    m.number_of_seasons,
                    c.seasons_owned,
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
    $seasonsOwned = sanitize($input['seasons_owned'] ?? '', 200);
    // Physical media attributes (v3.0.0)
    $aspectRatio = sanitize($input['aspect_ratio'] ?? '', 50);
    $packageType = sanitize($input['package_type'] ?? '', 50);
    $featureCount = sanitize($input['feature_count'] ?? '', 50);
    $hasSlipcover = intval($input['has_slipcover'] ?? 0);
    $hasBooklet = intval($input['has_booklet'] ?? 0);
    $hasBonusDisc = intval($input['has_bonus_disc'] ?? 0);
    $bonusDiscCount = intval($input['bonus_disc_count'] ?? 0);
    $hasDigitalCopy = intval($input['has_digital_copy'] ?? 0);
    $has3d = intval($input['has_3d'] ?? 0);

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
        SET format = ?, edition = ?, region = ?, condition = ?, notes = ?, seasons_owned = ?,
            aspect_ratio = ?, package_type = ?, feature_count = ?,
            has_slipcover = ?, has_booklet = ?, has_bonus_disc = ?, bonus_disc_count = ?,
            has_digital_copy = ?, has_3d = ?
        WHERE id = ? AND user_id = ?
    ");
    $stmt->execute([$format, $edition, $region, $condition, $notes, $seasonsOwned ?: null,
        $aspectRatio ?: null, $packageType ?: null, $featureCount ?: 'Single',
        $hasSlipcover, $hasBooklet, $hasBonusDisc, $bonusDiscCount, $hasDigitalCopy, $has3d,
        $copyId, $userId]);
    
    logAction($db, $userId, 'copy_updated', 'copy', $copyId);  // ← FIXED!
    
    jsonResponse(true, ['copy_id' => $copyId]);
    break;
        
        case 'get_movie_copies':
            $movieId = intval($input['movie_id'] ?? 0);

            $stmt = $db->prepare("
                SELECT c.*,
                    me.name as edition_name,
                    me.distributor as edition_distributor,
                    me.disc_count as edition_disc_count,
                    me.umdb_release_id as edition_umdb_release_id,
                    (SELECT COUNT(*) FROM edition_components ec WHERE ec.edition_id = c.edition_id) as edition_component_count,
                    (SELECT COUNT(*) FROM copy_components cc WHERE cc.copy_id = c.id AND cc.is_present = 1) as components_present,
                    (SELECT COUNT(*) FROM copy_components cc WHERE cc.copy_id = c.id) as components_total
                FROM copies c
                LEFT JOIN media_editions me ON c.edition_id = me.id
                WHERE c.movie_id = ? AND c.user_id = ?
                ORDER BY c.created_at DESC
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

    // Route to UMDB or TMDB for images
    $endpoint = $mediaType === 'tv' ? '/tv/' : '/movie/';
    if (isUmdbId($tmdbId)) {
        $url = UMDB_BASE_URL . $endpoint . $tmdbId . '/images';
        $headers = !empty(UMDB_API_KEY) ? ["X-API-Key: " . UMDB_API_KEY] : [];
    } else {
        $url = TMDB_BASE_URL . $endpoint . $tmdbId . '/images?api_key=' . TMDB_API_KEY;
        $headers = [];
    }

    $response = fetchUrl($url, $headers);

    if ($response === false) {
        $apiName = isUmdbId($tmdbId) ? 'UMDB' : 'TMDB';
        jsonResponse(false, null, "Failed to fetch posters from $apiName");
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
    
    // Build full poster URL (handle both TMDB relative paths and full URLs from UMDB)
    $posterUrl = resolveImageUrl($posterPath);
    
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
                
                $numberOfSeasons = $mediaType === 'tv' ? ($data['number_of_seasons'] ?? null) : null;
                $stmt = $db->prepare("
                    INSERT INTO movies (tmdb_id, title, year, poster_url, overview, rating, runtime, genre, media_type, number_of_seasons)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    $numberOfSeasons
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

        case 'delete_unresolved':
            $movieId = intval($input['movie_id'] ?? 0);

            if (!$movieId) {
                jsonResponse(false, null, 'Movie ID required');
            }

            // Verify movie is unresolved and user owns copies
            $stmt = $db->prepare("
                SELECT m.id, m.tmdb_id FROM movies m
                JOIN copies c ON c.movie_id = m.id
                WHERE m.id = ? AND c.user_id = ? AND m.tmdb_id LIKE 'unresolved_%'
                LIMIT 1
            ");
            $stmt->execute([$movieId, $userId]);
            $movie = $stmt->fetch();

            if (!$movie) {
                jsonResponse(false, null, 'Unresolved movie not found or access denied');
            }

            // Delete all copies for this movie belonging to this user
            $stmt = $db->prepare("DELETE FROM copies WHERE movie_id = ? AND user_id = ?");
            $stmt->execute([$movieId, $userId]);

            // If no copies remain for this movie from any user, clean up the movie record
            $stmt = $db->prepare("SELECT COUNT(*) as cnt FROM copies WHERE movie_id = ?");
            $stmt->execute([$movieId]);
            $remaining = $stmt->fetch();

            if ($remaining['cnt'] == 0) {
                $stmt = $db->prepare("DELETE FROM movies WHERE id = ?");
                $stmt->execute([$movieId]);
            }

            logAction($db, $userId, 'unresolved_deleted', 'movie', $movieId);

            jsonResponse(true, ['message' => 'Unresolved movie deleted']);
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
            // Get cast/crew for a movie from TMDB or UMDB
            $tmdbId = sanitize($input['tmdb_id'] ?? '', 20);

            if (empty($tmdbId)) {
                jsonResponse(false, null, 'TMDB ID required');
            }

            if (isUmdbId($tmdbId)) {
                $url = UMDB_BASE_URL . '/movie/' . $tmdbId . '/credits';
                $headers = !empty(UMDB_API_KEY) ? ["X-API-Key: " . UMDB_API_KEY] : [];
            } else {
                $url = TMDB_BASE_URL . '/movie/' . $tmdbId . '/credits?api_key=' . TMDB_API_KEY;
                $headers = [];
            }

            $response = fetchUrl($url, $headers);

            if ($response === false) {
                $apiName = isUmdbId($tmdbId) ? 'UMDB' : 'TMDB';
                jsonResponse(false, null, "$apiName API request failed");
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
            // NOTE: presets.json is in the main directory (not /data) to avoid being
            // overridden by Railway's persistent volume mount
            $presetsFile = __DIR__ . '/../presets.json';

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

            // NOTE: presets.json is in main directory (not /data) to avoid Railway volume override
            $presetsFile = __DIR__ . '/../presets.json';

            // Backup existing file (backups go to /data which is on the persistent volume)
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

        case 'admin_sync_version': {
            // Sync persisted data/version.json to repo version.json (admin only)
            if (!$currentUser['is_admin']) {
                jsonResponse(false, null, 'Admin access required');
            }
            $sourceFile = __DIR__ . '/../version.json';
            $volumeFile = __DIR__ . '/../../data/version.json';
            // Try the volume path relative to app root
            $altVolume  = dirname(__DIR__) . '/data/version.json';
            $vFile = file_exists($altVolume) ? $altVolume : $volumeFile;

            if (!file_exists($sourceFile)) {
                jsonResponse(false, null, 'Source version.json not found');
            }
            $repoData = json_decode(file_get_contents($sourceFile), true) ?: [];
            $repoVersion = $repoData['version'] ?? '2.0.0';
            $dir = dirname($vFile);
            if (!is_dir($dir)) @mkdir($dir, 0755, true);
            $repoData['updated'] = date('c');
            $repoData['source']  = 'admin-sync';
            file_put_contents($vFile, json_encode($repoData, JSON_PRETTY_PRINT));
            jsonResponse(true, ['synced_version' => $repoVersion, 'file' => $vFile]);
            break;
        }

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

        case 'admin_export_user_csv':
            // Export a user's collection and wishlist as CSV (admin only)
            if (!$currentUser['is_admin']) {
                jsonResponse(false, null, 'Admin access required');
            }

            $targetUserId = intval($input['user_id'] ?? 0);

            if (!$targetUserId) {
                jsonResponse(false, null, 'User ID required');
            }

            // Get user info for filename
            $stmt = $db->prepare("SELECT username, display_name FROM users WHERE id = ?");
            $stmt->execute([$targetUserId]);
            $user = $stmt->fetch();

            if (!$user) {
                jsonResponse(false, null, 'User not found');
            }

            // Get collection items
            $stmt = $db->prepare("
                SELECT
                    m.title,
                    m.year,
                    m.tmdb_id,
                    c.format,
                    c.edition,
                    c.region,
                    c.condition,
                    c.notes,
                    c.barcode
                FROM copies c
                JOIN movies m ON c.movie_id = m.id
                WHERE c.user_id = ?
                ORDER BY m.title ASC
            ");
            $stmt->execute([$targetUserId]);
            $collectionItems = $stmt->fetchAll();

            // Get wishlist items
            $stmt = $db->prepare("
                SELECT
                    m.title,
                    m.year,
                    m.tmdb_id
                FROM wishlist w
                JOIN movies m ON w.movie_id = m.id
                WHERE w.user_id = ?
                ORDER BY m.title ASC
            ");
            $stmt->execute([$targetUserId]);
            $wishlistItems = $stmt->fetchAll();

            // Build CSV
            $csv = "title,year,tmdb_id,status,format,edition,region,condition,notes,barcode\n";

            // Add collection items
            foreach ($collectionItems as $item) {
                $csv .= sprintf(
                    '"%s",%s,%s,"collection","%s","%s","%s","%s","%s","%s"' . "\n",
                    str_replace('"', '""', $item['title'] ?? ''),
                    $item['year'] ?? '',
                    $item['tmdb_id'] ?? '',
                    str_replace('"', '""', $item['format'] ?? 'DVD'),
                    str_replace('"', '""', $item['edition'] ?? ''),
                    str_replace('"', '""', $item['region'] ?? ''),
                    str_replace('"', '""', $item['condition'] ?? 'Good'),
                    str_replace('"', '""', $item['notes'] ?? ''),
                    str_replace('"', '""', $item['barcode'] ?? '')
                );
            }

            // Add wishlist items
            foreach ($wishlistItems as $item) {
                $csv .= sprintf(
                    '"%s",%s,%s,"wishlist","","","","","",""' . "\n",
                    str_replace('"', '""', $item['title'] ?? ''),
                    $item['year'] ?? '',
                    $item['tmdb_id'] ?? ''
                );
            }

            $filename = 'cineshelf_' . ($user['display_name'] ?? $user['username']) . '_' . date('Y-m-d') . '.csv';

            jsonResponse(true, [
                'csv' => $csv,
                'filename' => $filename,
                'username' => $user['display_name'] ?? $user['username'],
                'collection_count' => count($collectionItems),
                'wishlist_count' => count($wishlistItems)
            ]);
            break;

        case 'admin_import_user_csv':
            // Import CSV data for a specific user (admin only)
            if (!$currentUser['is_admin']) {
                jsonResponse(false, null, 'Admin access required');
            }

            $targetUserId = intval($input['user_id'] ?? 0);
            $csvData = $input['csv_data'] ?? '';

            if (!$targetUserId) {
                jsonResponse(false, null, 'User ID required');
            }

            if (!$csvData) {
                jsonResponse(false, null, 'CSV data required');
            }

            // Parse CSV
            $lines = explode("\n", $csvData);
            $lines = array_filter(array_map('trim', $lines));

            if (count($lines) < 2) {
                jsonResponse(false, null, 'CSV file is empty or invalid');
            }

            // Parse header
            $header = str_getcsv($lines[0]);
            $header = array_map('strtolower', array_map('trim', $header));

            // Find column indices
            $titleIndex = array_search('title', $header);
            if ($titleIndex === false) {
                $titleIndex = array_search('name', $header);
            }
            if ($titleIndex === false) {
                $titleIndex = array_search('movie', $header);
            }

            $yearIndex = array_search('year', $header);
            $tmdbIdIndex = array_search('tmdb_id', $header);
            $statusIndex = array_search('status', $header);
            $formatIndex = array_search('format', $header);
            $editionIndex = array_search('edition', $header);
            $regionIndex = array_search('region', $header);
            $conditionIndex = array_search('condition', $header);
            $notesIndex = array_search('notes', $header);
            $barcodeIndex = array_search('barcode', $header);

            if ($titleIndex === false) {
                jsonResponse(false, null, 'CSV must have a "title" column');
            }

            $added = 0;
            $skipped = 0;
            $errors = [];

            for ($i = 1; $i < count($lines); $i++) {
                $values = str_getcsv($lines[$i]);

                if (!isset($values[$titleIndex]) || !trim($values[$titleIndex])) {
                    continue;
                }

                $title = trim($values[$titleIndex]);
                $year = ($yearIndex !== false && isset($values[$yearIndex])) ? trim($values[$yearIndex]) : null;
                $tmdbId = ($tmdbIdIndex !== false && isset($values[$tmdbIdIndex])) ? trim($values[$tmdbIdIndex]) : null;
                $status = ($statusIndex !== false && isset($values[$statusIndex])) ? strtolower(trim($values[$statusIndex])) : 'collection';
                $format = ($formatIndex !== false && isset($values[$formatIndex])) ? trim($values[$formatIndex]) : 'DVD';
                $edition = ($editionIndex !== false && isset($values[$editionIndex])) ? trim($values[$editionIndex]) : '';
                $region = ($regionIndex !== false && isset($values[$regionIndex])) ? trim($values[$regionIndex]) : '';
                $condition = ($conditionIndex !== false && isset($values[$conditionIndex])) ? trim($values[$conditionIndex]) : 'Good';
                $notes = ($notesIndex !== false && isset($values[$notesIndex])) ? trim($values[$notesIndex]) : '';
                $barcode = ($barcodeIndex !== false && isset($values[$barcodeIndex])) ? trim($values[$barcodeIndex]) : '';

                try {
                    // If no TMDB ID, search for the movie
                    if (!$tmdbId) {
                        $searchUrl = 'https://api.themoviedb.org/3/search/movie?' . http_build_query([
                            'api_key' => TMDB_API_KEY,
                            'query' => $title,
                            'year' => $year ?: ''
                        ]);

                        $searchResponse = @file_get_contents($searchUrl);
                        if ($searchResponse) {
                            $searchData = json_decode($searchResponse, true);
                            if (!empty($searchData['results'])) {
                                $tmdbId = $searchData['results'][0]['id'];
                            }
                        }
                    }

                    if (!$tmdbId) {
                        $errors[] = "Could not find TMDB ID for: $title ($year)";
                        $skipped++;
                        continue;
                    }

                    // Get full movie data
                    $movieUrl = 'https://api.themoviedb.org/3/movie/' . $tmdbId . '?' . http_build_query([
                        'api_key' => TMDB_API_KEY,
                        'append_to_response' => 'credits,release_dates'
                    ]);

                    $movieResponse = @file_get_contents($movieUrl);
                    if (!$movieResponse) {
                        $errors[] = "Could not fetch movie data for: $title";
                        $skipped++;
                        continue;
                    }

                    $movieData = json_decode($movieResponse, true);

                    // Check if movie exists in database
                    $stmt = $db->prepare("SELECT id FROM movies WHERE tmdb_id = ?");
                    $stmt->execute([$tmdbId]);
                    $existingMovie = $stmt->fetch();

                    if (!$existingMovie) {
                        // Insert movie
                        $director = '';
                        if (!empty($movieData['credits']['crew'])) {
                            foreach ($movieData['credits']['crew'] as $member) {
                                if ($member['job'] === 'Director') {
                                    $director = $member['name'];
                                    break;
                                }
                            }
                        }

                        // Extract top 5 actors
                        $actors = '';
                        if (!empty($movieData['credits']['cast'])) {
                            $topActors = array_slice($movieData['credits']['cast'], 0, 5);
                            $actors = implode(', ', array_column($topActors, 'name'));
                        }

                        // Extract studio
                        $studio = '';
                        if (!empty($movieData['production_companies'])) {
                            $studio = $movieData['production_companies'][0]['name'] ?? '';
                        }

                        $genres = !empty($movieData['genres']) ? implode(', ', array_column($movieData['genres'], 'name')) : '';

                        $stmt = $db->prepare("
                            INSERT INTO movies (tmdb_id, title, year, poster_url, backdrop_url, overview, rating, runtime, director, actors, studio, genre, media_type)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'movie')
                        ");
                        $stmt->execute([
                            $tmdbId,
                            $movieData['title'] ?? $title,
                            !empty($movieData['release_date']) ? intval(substr($movieData['release_date'], 0, 4)) : $year,
                            !empty($movieData['poster_path']) ? 'https://image.tmdb.org/t/p/w500' . $movieData['poster_path'] : null,
                            !empty($movieData['backdrop_path']) ? 'https://image.tmdb.org/t/p/original' . $movieData['backdrop_path'] : null,
                            $movieData['overview'] ?? '',
                            $movieData['vote_average'] ?? 0,
                            $movieData['runtime'] ?? 0,
                            $director,
                            $actors,
                            $studio,
                            $genres
                        ]);
                        $movieId = $db->lastInsertId();
                    } else {
                        $movieId = $existingMovie['id'];
                    }

                    // Add to collection or wishlist
                    if ($status === 'wishlist') {
                        // Check if already in wishlist
                        $stmt = $db->prepare("SELECT id FROM wishlist WHERE user_id = ? AND movie_id = ?");
                        $stmt->execute([$targetUserId, $movieId]);
                        if (!$stmt->fetch()) {
                            $stmt = $db->prepare("INSERT INTO wishlist (user_id, movie_id) VALUES (?, ?)");
                            $stmt->execute([$targetUserId, $movieId]);
                            $added++;
                        } else {
                            $skipped++;
                        }
                    } else {
                        // Add to collection
                        $stmt = $db->prepare("
                            INSERT INTO copies (user_id, movie_id, format, edition, region, condition, notes, barcode)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ");
                        $stmt->execute([
                            $targetUserId,
                            $movieId,
                            $format,
                            $edition,
                            $region,
                            $condition,
                            $notes,
                            $barcode
                        ]);
                        $added++;
                    }

                } catch (Exception $e) {
                    $errors[] = "Error importing $title: " . $e->getMessage();
                    $skipped++;
                }
            }

            jsonResponse(true, [
                'added' => $added,
                'skipped' => $skipped,
                'errors' => $errors
            ]);
            break;

        // ========================================
        // BOX SET / CONTAINER SYSTEM (v2.3.0)
        // Multi-movie physical cases (box sets, double features, etc.)
        // ========================================

        case 'run_box_set_migration':
            // Admin-only endpoint to run box set migration
            // SPECIAL CASE: If no admins exist, grant admin to current user (first-time setup)
            try {
                $user = authenticateRequest();
            } catch (Exception $e) {
                jsonResponse(false, null, 'Authentication required. Please log in to CineShelf first.');
            }

            $currentUserId = $user['user_id'] ?? $user['id'];
            $isAdmin = $user['is_admin'] ?? false;

            // Check if ANY admins exist in the system
            $adminCount = $db->query("SELECT COUNT(*) as count FROM users WHERE is_admin = 1")->fetch()['count'];

            if (!$isAdmin) {
                if ($adminCount === 0) {
                    // First-time setup: No admins exist, make this user an admin
                    $db->prepare("UPDATE users SET is_admin = 1 WHERE id = ?")->execute([$currentUserId]);
                    $isAdmin = true;
                    error_log("CineShelf: Granted admin privileges to user $currentUserId during first-time migration");
                } else {
                    jsonResponse(false, null, 'Admin access required. Contact your administrator.');
                }
            }

            try {
                // Check if migration is already complete
                $containersExists = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='containers'")->fetch();
                $contentsExists = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='container_contents'")->fetch();

                // Check if columns exist in shelf_assignments
                $shelfColumns = $db->query("PRAGMA table_info(shelf_assignments)")->fetchAll(PDO::FETCH_ASSOC);
                $hasContainerId = false;
                $hasIsContainer = false;
                foreach ($shelfColumns as $col) {
                    if ($col['name'] === 'container_id') $hasContainerId = true;
                    if ($col['name'] === 'is_container') $hasIsContainer = true;
                }

                if ($containersExists && $contentsExists && $hasContainerId && $hasIsContainer) {
                    jsonResponse(true, ['message' => 'Box set migration already complete', 'skipped' => true]);
                }

                // Read and execute migration SQL
                $migrationPath = __DIR__ . '/../migrations/add_box_sets.sql';
                if (!file_exists($migrationPath)) {
                    throw new Exception('Migration file not found');
                }

                $sql = file_get_contents($migrationPath);
                // Split on semicolons but handle multi-line statements properly
                $statements = [];
                $currentStmt = '';
                $lines = explode("\n", $sql);

                foreach ($lines as $line) {
                    $line = trim($line);

                    // Skip full-line comments and empty lines
                    if (empty($line) || str_starts_with($line, '--')) continue;

                    // Remove inline comments (everything after --)
                    $commentPos = strpos($line, '--');
                    if ($commentPos !== false) {
                        $line = trim(substr($line, 0, $commentPos));
                    }

                    // Skip if line is now empty after removing comment
                    if (empty($line)) continue;

                    $currentStmt .= ' ' . $line;

                    if (str_ends_with($line, ';')) {
                        $stmt = trim(rtrim($currentStmt, ';'));
                        if (!empty($stmt)) {
                            $statements[] = $stmt;
                        }
                        $currentStmt = '';
                    }
                }

                $errors = [];
                $executed = 0;
                $skipped = 0;

                foreach ($statements as $statement) {
                    $stmt = trim($statement);
                    if (empty($stmt)) continue;

                    try {
                        // Check if this is an ALTER TABLE statement
                        if (stripos($stmt, 'ALTER TABLE') !== false) {
                            if (preg_match('/ALTER TABLE (\w+) ADD COLUMN (\w+)/i', $stmt, $matches)) {
                                $table = $matches[1];
                                $column = $matches[2];

                                // Check if column already exists
                                $tableInfo = $db->query("PRAGMA table_info($table)")->fetchAll(PDO::FETCH_ASSOC);
                                $columnExists = false;
                                foreach ($tableInfo as $col) {
                                    if ($col['name'] === $column) {
                                        $columnExists = true;
                                        break;
                                    }
                                }

                                if ($columnExists) {
                                    $skipped++;
                                    continue;
                                }
                            }
                        }

                        $db->exec($stmt . ';');
                        $executed++;
                    } catch (Exception $e) {
                        $errorMsg = $e->getMessage();

                        // Don't count "already exists" as real errors
                        if (strpos($errorMsg, 'already exists') !== false) {
                            $skipped++;
                        } else {
                            $errors[] = substr($stmt, 0, 50) . '... => ' . $errorMsg;
                        }
                    }
                }

                if ($executed > 0 || $skipped > 0) {
                    jsonResponse(true, [
                        'message' => 'Box set migration completed',
                        'executed' => $executed,
                        'skipped' => $skipped,
                        'errors' => empty($errors) ? [] : $errors
                    ]);
                } else {
                    throw new Exception('Migration failed. Errors: ' . implode(' | ', $errors));
                }

            } catch (Exception $e) {
                jsonResponse(false, null, 'Migration failed: ' . $e->getMessage());
            }
            break;

        case 'get_or_create_movie':
            // Get existing movie or create from TMDB (used by box set creation)
            $tmdbId = sanitize($input['tmdb_id'] ?? '', 20);
            $mediaType = sanitize($input['media_type'] ?? 'movie', 20);
            $certRegion = sanitize($input['cert_region'] ?? 'US', 10);
            $tmdbCertCountry = $certRegion === 'CA-QC' ? 'CA' : $certRegion;

            file_put_contents('php://stderr', "[get_or_create_movie] START - tmdb_id: $tmdbId\n");

            if (empty($tmdbId)) {
                jsonResponse(false, null, 'TMDB ID required');
            }

            // Check if movie already exists
            $stmt = $db->prepare("SELECT * FROM movies WHERE tmdb_id = ?");
            $stmt->execute([$tmdbId]);
            $movie = $stmt->fetch();

            file_put_contents('php://stderr', "[get_or_create_movie] Query result: " . json_encode($movie) . "\n");

            if ($movie) {
                // Movie exists, return it with movie_id alias for compatibility
                $movie['movie_id'] = $movie['id'];
                file_put_contents('php://stderr', "[get_or_create_movie] RETURNING EXISTING: movie_id={$movie['movie_id']}, tmdb_id={$movie['tmdb_id']}, title={$movie['title']}\n");
                jsonResponse(true, $movie);
            } else {
                // Movie doesn't exist, fetch from TMDB or UMDB and create it
                $appendTo = $mediaType === 'tv' ? 'credits,content_ratings' : 'credits,release_dates';
                $detail = buildDetailUrl($tmdbId, $mediaType, $appendTo);
                $response = fetchUrl($detail['url'], $detail['headers']);

                if ($response === false) {
                    $apiName = $detail['source'] === 'umdb' ? 'UMDB' : 'TMDB';
                    jsonResponse(false, null, "Failed to fetch movie from $apiName");
                }

                $data = json_decode($response, true);
                $genres = implode(', ', array_column($data['genres'] ?? [], 'name'));

                // Extract director (or creator for TV shows)
                $director = '';
                if ($mediaType === 'tv' && !empty($data['created_by'])) {
                    $director = $data['created_by'][0]['name'];
                } elseif (!empty($data['credits']['crew'])) {
                    foreach ($data['credits']['crew'] as $person) {
                        if ($person['job'] === 'Director') {
                            $director = $person['name'];
                            break;
                        }
                    }
                }

                // Extract top 5 actors
                $actors = '';
                if (!empty($data['credits']['cast'])) {
                    $topActors = array_slice($data['credits']['cast'], 0, 5);
                    $actors = implode(', ', array_column($topActors, 'name'));
                }

                // Extract studio (first production company)
                $studio = '';
                if (!empty($data['production_companies'])) {
                    $studio = $data['production_companies'][0]['name'] ?? '';
                }

                // Extract certification for user's preferred region (fallback to US)
                $certification = '';
                if ($mediaType === 'tv' && !empty($data['content_ratings']['results'])) {
                    foreach ($data['content_ratings']['results'] as $rating) {
                        if ($rating['iso_3166_1'] === $tmdbCertCountry) {
                            $certification = $rating['rating'];
                            break;
                        }
                    }
                    if (empty($certification) && $tmdbCertCountry !== 'US') {
                        foreach ($data['content_ratings']['results'] as $rating) {
                            if ($rating['iso_3166_1'] === 'US') {
                                $certification = $rating['rating'];
                                break;
                            }
                        }
                    }
                } elseif (!empty($data['release_dates']['results'])) {
                    foreach ($data['release_dates']['results'] as $country) {
                        if ($country['iso_3166_1'] === $tmdbCertCountry) {
                            foreach ($country['release_dates'] as $release) {
                                if (!empty($release['certification'])) {
                                    $certification = $release['certification'];
                                    break 2;
                                }
                            }
                        }
                    }
                    if (empty($certification) && $tmdbCertCountry !== 'US') {
                        foreach ($data['release_dates']['results'] as $country) {
                            if ($country['iso_3166_1'] === 'US') {
                                foreach ($country['release_dates'] as $release) {
                                    if (!empty($release['certification'])) {
                                        $certification = $release['certification'];
                                        break 2;
                                    }
                                }
                            }
                        }
                    }
                }

                // Insert movie with all metadata
                $numberOfSeasons = $mediaType === 'tv' ? ($data['number_of_seasons'] ?? null) : null;
                $stmt = $db->prepare("
                    INSERT INTO movies (tmdb_id, title, year, poster_url, overview, rating, runtime, genre, director, actors, studio, certification, media_type, number_of_seasons)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");

                $title = $mediaType === 'tv' ? $data['name'] : $data['title'];
                $releaseDate = $mediaType === 'tv' ? ($data['first_air_date'] ?? null) : ($data['release_date'] ?? null);
                $year = $releaseDate ? intval(substr($releaseDate, 0, 4)) : null;

                $stmt->execute([
                    $tmdbId,
                    $title,
                    $year,
                    resolveImageUrl($data['poster_path'] ?? $data['poster_url'] ?? null),
                    $data['overview'] ?? null,
                    $data['vote_average'] ?? null,
                    $data['runtime'] ?? ($data['episode_run_time'][0] ?? null),
                    $genres,
                    $director,
                    $actors,
                    $studio,
                    $certification,
                    $mediaType,
                    $numberOfSeasons
                ]);

                $movieId = $db->lastInsertId();
                file_put_contents('php://stderr', "[get_or_create_movie] Created new movie with ID: $movieId\n");

                // Fetch the created movie to return
                $stmt = $db->prepare("SELECT * FROM movies WHERE id = ?");
                $stmt->execute([$movieId]);
                $movie = $stmt->fetch();

                file_put_contents('php://stderr', "[get_or_create_movie] RETURNING NEW: movie_id={$movieId}, tmdb_id={$movie['tmdb_id']}, title={$movie['title']}\n");

                // Add movie_id alias for frontend compatibility
                $movie['movie_id'] = $movie['id'];
                jsonResponse(true, $movie);
            }
            break;

        case 'create_container':
            // Create a new box set/container
            $name = sanitize($input['name'] ?? '', 200);
            $spineLabel = sanitize($input['spine_label'] ?? $name, 200);
            $spineImageType = sanitize($input['spine_image_type'] ?? 'color', 20);
            $spineColor = sanitize($input['spine_color'] ?? '#667eea', 20);
            $spineType = sanitize($input['spine_type'] ?? 'color', 20);
            $format = sanitize($input['format'] ?? '', 100);
            $edition = sanitize($input['edition'] ?? '', 100);
            $region = sanitize($input['region'] ?? '', 20);
            $condition = sanitize($input['condition'] ?? 'Mint', 20);
            $purchaseDate = sanitize($input['purchase_date'] ?? '', 20);
            $purchasePrice = floatval($input['purchase_price'] ?? 0);
            $notes = sanitize($input['notes'] ?? '', 500);
            // Physical media attributes (v3.0.0)
            $aspectRatio = sanitize($input['aspect_ratio'] ?? '', 50);
            $packageType = sanitize($input['package_type'] ?? '', 50);
            $featureCount = sanitize($input['feature_count'] ?? '', 50);
            $hasSlipcover = intval($input['has_slipcover'] ?? 0);
            $hasBooklet = intval($input['has_booklet'] ?? 0);
            $hasBonusDisc = intval($input['has_bonus_disc'] ?? 0);
            $bonusDiscCount = intval($input['bonus_disc_count'] ?? 0);
            $hasDigitalCopy = intval($input['has_digital_copy'] ?? 0);
            $has3d = intval($input['has_3d'] ?? 0);

            if (empty($name)) {
                jsonResponse(false, null, 'Container name required');
            }

            $stmt = $db->prepare("
                INSERT INTO containers (
                    user_id, name, spine_label, spine_image_type, spine_color, spine_type,
                    format, edition, region, condition, purchase_date, purchase_price, notes,
                    aspect_ratio, package_type, feature_count, has_slipcover, has_booklet,
                    has_bonus_disc, bonus_disc_count, has_digital_copy, has_3d
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $userId, $name, $spineLabel, $spineImageType, $spineColor, $spineType,
                $format, $edition, $region, $condition, $purchaseDate ?: null, $purchasePrice, $notes,
                $aspectRatio ?: null, $packageType ?: null, $featureCount ?: null,
                $hasSlipcover, $hasBooklet, $hasBonusDisc, $bonusDiscCount, $hasDigitalCopy, $has3d
            ]);

            $containerId = $db->lastInsertId();
            logAction($db, $userId, 'container_created', 'container', $containerId);

            jsonResponse(true, ['container_id' => $containerId, 'message' => 'Container created successfully']);
            break;

        case 'list_containers':
            // List all containers for current user with stats
            $stmt = $db->prepare("
                SELECT * FROM containers_with_counts
                WHERE user_id = ?
                ORDER BY name ASC
            ");
            $stmt->execute([$userId]);

            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'get_container_contents':
            // Get container details with all movies
            $containerId = intval($input['container_id'] ?? 0);

            if (!$containerId) {
                jsonResponse(false, null, 'Container ID required');
            }

            // Verify ownership
            $stmt = $db->prepare("SELECT * FROM containers_with_counts WHERE id = ? AND user_id = ?");
            $stmt->execute([$containerId, $userId]);
            $container = $stmt->fetch();

            if (!$container) {
                jsonResponse(false, null, 'Container not found');
            }

            // Get all movies in container
            error_log("[get_container_contents] Fetching movies for container ID: $containerId");

            $stmt = $db->prepare("
                SELECT
                    cc.id as content_id,
                    cc.container_id,
                    cc.copy_id as cc_copy_id,
                    cc.disc_number,
                    cc.disc_label,
                    cc.is_present,
                    cc.missing_since,
                    cc.missing_notes,
                    cc.position_in_container,
                    c.id as copy_id,
                    c.movie_id as c_movie_id,
                    c.format,
                    c.edition,
                    c.condition,
                    m.id as movie_id,
                    m.tmdb_id,
                    m.title,
                    m.display_title,
                    m.year,
                    m.poster_url,
                    m.rating,
                    m.runtime,
                    m.genre,
                    m.director,
                    m.certification
                FROM container_contents cc
                JOIN copies c ON cc.copy_id = c.id
                JOIN movies m ON c.movie_id = m.id
                WHERE cc.container_id = ?
                ORDER BY cc.position_in_container ASC, cc.disc_number ASC
            ");
            $stmt->execute([$containerId]);
            $movies = $stmt->fetchAll();

            error_log("[get_container_contents] Found " . count($movies) . " movies");
            foreach ($movies as $movie) {
                error_log("[get_container_contents] Movie: container_id={$movie['container_id']}, cc_copy_id={$movie['cc_copy_id']}, copy_id={$movie['copy_id']}, c_movie_id={$movie['c_movie_id']}, movie_id={$movie['movie_id']}, tmdb_id={$movie['tmdb_id']}, title={$movie['title']}");
            }

            jsonResponse(true, ['container' => $container, 'movies' => $movies]);
            break;

        case 'add_movie_to_container':
            // Add a movie (copy) to a container
            $containerId = intval($input['container_id'] ?? 0);
            $copyId = intval($input['copy_id'] ?? 0);
            $discNumber = intval($input['disc_number'] ?? 1);
            $discLabel = sanitize($input['disc_label'] ?? '', 200);
            $isPresent = intval($input['is_present'] ?? 1);
            $position = intval($input['position_in_container'] ?? 0);

            file_put_contents('php://stderr', "[add_movie_to_container] START - container_id: $containerId, copy_id: $copyId\n");

            if (!$containerId || !$copyId) {
                jsonResponse(false, null, 'Container ID and Copy ID required');
            }

            // Log what copy we're adding
            $copyInfoStmt = $db->prepare("
                SELECT c.id as copy_id, c.movie_id, m.tmdb_id, m.title
                FROM copies c
                JOIN movies m ON c.movie_id = m.id
                WHERE c.id = ?
            ");
            $copyInfoStmt->execute([$copyId]);
            $copyInfo = $copyInfoStmt->fetch();
            if ($copyInfo) {
                file_put_contents('php://stderr', "[add_movie_to_container] Copy details: copy_id={$copyInfo['copy_id']}, movie_id={$copyInfo['movie_id']}, tmdb_id={$copyInfo['tmdb_id']}, title={$copyInfo['title']}\n");
            } else {
                file_put_contents('php://stderr', "[add_movie_to_container] WARNING: Copy $copyId not found in database!\n");
            }

            // Verify container ownership
            $stmt = $db->prepare("SELECT user_id FROM containers WHERE id = ?");
            $stmt->execute([$containerId]);
            $container = $stmt->fetch();

            if (!$container || $container['user_id'] != $userId) {
                jsonResponse(false, null, 'Container not found or access denied');
            }

            // Verify copy ownership
            $stmt = $db->prepare("SELECT user_id FROM copies WHERE id = ?");
            $stmt->execute([$copyId]);
            $copy = $stmt->fetch();

            if (!$copy || $copy['user_id'] != $userId) {
                jsonResponse(false, null, 'Copy not found or access denied');
            }

            // Check if already in container
            $stmt = $db->prepare("SELECT id FROM container_contents WHERE container_id = ? AND copy_id = ?");
            $stmt->execute([$containerId, $copyId]);
            if ($stmt->fetch()) {
                jsonResponse(false, null, 'Movie already in this container');
            }

            // Add to container
            $stmt = $db->prepare("
                INSERT INTO container_contents (
                    container_id, copy_id, disc_number, disc_label, is_present, position_in_container
                ) VALUES (?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$containerId, $copyId, $discNumber, $discLabel, $isPresent, $position]);

            $contentId = $db->lastInsertId();
            file_put_contents('php://stderr', "[add_movie_to_container] SUCCESS - content_id: $contentId created linking container $containerId to copy $copyId\n");

            logAction($db, $userId, 'movie_added_to_container', 'container_content', $contentId);

            jsonResponse(true, ['content_id' => $contentId, 'message' => 'Movie added to container']);
            break;

        case 'remove_movie_from_container':
            // Remove a movie from container (keeps the copy in collection)
            $contentId = intval($input['content_id'] ?? 0);

            if (!$contentId) {
                jsonResponse(false, null, 'Content ID required');
            }

            // Verify ownership
            $stmt = $db->prepare("
                SELECT cc.id, c.user_id
                FROM container_contents cc
                JOIN containers c ON cc.container_id = c.id
                WHERE cc.id = ?
            ");
            $stmt->execute([$contentId]);
            $content = $stmt->fetch();

            if (!$content || $content['user_id'] != $userId) {
                jsonResponse(false, null, 'Content not found or access denied');
            }

            $stmt = $db->prepare("DELETE FROM container_contents WHERE id = ?");
            $stmt->execute([$contentId]);

            logAction($db, $userId, 'movie_removed_from_container', 'container_content', $contentId);

            jsonResponse(true, ['message' => 'Movie removed from container']);
            break;

        case 'update_container':
            // Edit container details
            $containerId = intval($input['container_id'] ?? 0);
            $name = sanitize($input['name'] ?? '', 200);
            $spineLabel = sanitize($input['spine_label'] ?? '', 200);
            $spineImageType = sanitize($input['spine_image_type'] ?? '', 20);
            $spineImageUrl  = sanitize($input['spine_image_url'] ?? '', 500);
            $spineColor = sanitize($input['spine_color'] ?? '', 20);
            $spineType = sanitize($input['spine_type'] ?? '', 20);
            $format = sanitize($input['format'] ?? '', 100);
            $edition = sanitize($input['edition'] ?? '', 100);
            $region = sanitize($input['region'] ?? '', 50);
            $condition = sanitize($input['condition'] ?? '', 20);
            $notes = sanitize($input['notes'] ?? '', 500);
            // Physical media attributes (v3.0.0)
            $aspectRatio = sanitize($input['aspect_ratio'] ?? '', 50);
            $packageType = sanitize($input['package_type'] ?? '', 50);
            $featureCount = sanitize($input['feature_count'] ?? '', 50);

            if (!$containerId) {
                jsonResponse(false, null, 'Container ID required');
            }

            // Verify ownership
            $stmt = $db->prepare("SELECT user_id FROM containers WHERE id = ?");
            $stmt->execute([$containerId]);
            $container = $stmt->fetch();

            if (!$container || $container['user_id'] != $userId) {
                jsonResponse(false, null, 'Container not found or access denied');
            }

            // Build dynamic UPDATE query
            $updates = [];
            $params = [];

            if (!empty($name)) {
                $updates[] = "name = ?";
                $params[] = $name;
            }
            if (!empty($spineLabel)) {
                $updates[] = "spine_label = ?";
                $params[] = $spineLabel;
            }
            if (!empty($spineImageType)) {
                $updates[] = "spine_image_type = ?";
                $params[] = $spineImageType;
            }
            if (!empty($spineImageUrl)) {
                $updates[] = "spine_image_url = ?";
                $params[] = $spineImageUrl;
            }
            if (!empty($spineColor)) {
                $updates[] = "spine_color = ?";
                $params[] = $spineColor;
            }
            if (!empty($spineType)) {
                $updates[] = "spine_type = ?";
                $params[] = $spineType;
            }
            if (!empty($format)) {
                $updates[] = "format = ?";
                $params[] = $format;
            }
            if (!empty($edition)) {
                $updates[] = "edition = ?";
                $params[] = $edition;
            }
            if (!empty($region)) {
                $updates[] = "region = ?";
                $params[] = $region;
            }
            if (!empty($condition)) {
                $updates[] = "condition = ?";
                $params[] = $condition;
            }
            if (isset($input['notes'])) {
                $updates[] = "notes = ?";
                $params[] = $notes;
            }
            // Physical media attributes
            if (isset($input['aspect_ratio'])) {
                $updates[] = "aspect_ratio = ?";
                $params[] = $aspectRatio ?: null;
            }
            if (isset($input['package_type'])) {
                $updates[] = "package_type = ?";
                $params[] = $packageType ?: null;
            }
            if (isset($input['feature_count'])) {
                $updates[] = "feature_count = ?";
                $params[] = $featureCount ?: null;
            }
            if (isset($input['has_slipcover'])) {
                $updates[] = "has_slipcover = ?";
                $params[] = intval($input['has_slipcover']);
            }
            if (isset($input['has_booklet'])) {
                $updates[] = "has_booklet = ?";
                $params[] = intval($input['has_booklet']);
            }
            if (isset($input['has_bonus_disc'])) {
                $updates[] = "has_bonus_disc = ?";
                $params[] = intval($input['has_bonus_disc']);
            }
            if (isset($input['bonus_disc_count'])) {
                $updates[] = "bonus_disc_count = ?";
                $params[] = intval($input['bonus_disc_count']);
            }
            if (isset($input['has_digital_copy'])) {
                $updates[] = "has_digital_copy = ?";
                $params[] = intval($input['has_digital_copy']);
            }
            if (isset($input['has_3d'])) {
                $updates[] = "has_3d = ?";
                $params[] = intval($input['has_3d']);
            }

            if (empty($updates)) {
                jsonResponse(false, null, 'No fields to update');
            }

            $updates[] = "updated_at = CURRENT_TIMESTAMP";
            $params[] = $containerId;
            $params[] = $userId;

            $sql = "UPDATE containers SET " . implode(', ', $updates) . " WHERE id = ? AND user_id = ?";
            $stmt = $db->prepare($sql);
            $stmt->execute($params);

            logAction($db, $userId, 'container_updated', 'container', $containerId);

            jsonResponse(true, ['message' => 'Container updated successfully']);
            break;

        case 'delete_container':
            // Delete container (keeps movies in collection)
            $containerId = intval($input['container_id'] ?? 0);

            if (!$containerId) {
                jsonResponse(false, null, 'Container ID required');
            }

            // Verify ownership
            $stmt = $db->prepare("SELECT user_id FROM containers WHERE id = ?");
            $stmt->execute([$containerId]);
            $container = $stmt->fetch();

            if (!$container || $container['user_id'] != $userId) {
                jsonResponse(false, null, 'Container not found or access denied');
            }

            // Delete container (cascade will delete contents and shelf assignments)
            $stmt = $db->prepare("DELETE FROM containers WHERE id = ? AND user_id = ?");
            $stmt->execute([$containerId, $userId]);

            logAction($db, $userId, 'container_deleted', 'container', $containerId);

            jsonResponse(true, ['message' => 'Container deleted successfully']);
            break;

        case 'mark_disc_status':
            // Mark a disc as missing or present
            $contentId = intval($input['content_id'] ?? 0);
            $isPresent = intval($input['is_present'] ?? 1);
            $missingNotes = sanitize($input['missing_notes'] ?? '', 500);

            if (!$contentId) {
                jsonResponse(false, null, 'Content ID required');
            }

            // Verify ownership
            $stmt = $db->prepare("
                SELECT cc.id, c.user_id
                FROM container_contents cc
                JOIN containers c ON cc.container_id = c.id
                WHERE cc.id = ?
            ");
            $stmt->execute([$contentId]);
            $content = $stmt->fetch();

            if (!$content || $content['user_id'] != $userId) {
                jsonResponse(false, null, 'Content not found or access denied');
            }

            // Update status
            $missingSince = $isPresent ? null : date('Y-m-d');
            $stmt = $db->prepare("
                UPDATE container_contents
                SET is_present = ?, missing_since = ?, missing_notes = ?
                WHERE id = ?
            ");
            $stmt->execute([$isPresent, $missingSince, $missingNotes, $contentId]);

            logAction($db, $userId, 'disc_status_updated', 'container_content', $contentId);

            jsonResponse(true, ['message' => 'Disc status updated']);
            break;

        case 'get_movie_container':
            // Check if a movie (copy) is in a container
            $copyId = intval($input['copy_id'] ?? 0);

            if (!$copyId) {
                jsonResponse(false, null, 'Copy ID required');
            }

            $stmt = $db->prepare("
                SELECT
                    c.id as container_id,
                    c.name as container_name,
                    cc.disc_number,
                    cc.disc_label,
                    cc.is_present
                FROM container_contents cc
                JOIN containers c ON cc.container_id = c.id
                WHERE cc.copy_id = ? AND c.user_id = ?
            ");
            $stmt->execute([$copyId, $userId]);
            $container = $stmt->fetch();

            if ($container) {
                jsonResponse(true, $container);
            } else {
                jsonResponse(true, null); // Not in any container
            }
            break;

        case 'get_container_memberships':
            // Returns {movie_id, container_id, container_name} for every movie
            // that has at least one copy inside a container — used to badge
            // collection cards so users know those copies are "claimed" by a box set.
            $stmt = $db->prepare("
                SELECT DISTINCT
                    m.id         AS movie_id,
                    cont.id      AS container_id,
                    cont.name    AS container_name
                FROM copies c
                JOIN container_contents cc ON cc.copy_id = c.id
                JOIN containers cont       ON cont.id    = cc.container_id
                JOIN movies m              ON m.id       = c.movie_id
                WHERE c.user_id = ?
                ORDER BY m.id
            ");
            $stmt->execute([$userId]);
            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'list_shelves':
            // Get all shelves for current user with counts
            $stmt = $db->prepare("
                SELECT
                    s.*,
                    COUNT(DISTINCT sa.id) as assigned_count,
                    COUNT(DISTINCT child.id) as child_count,
                    parent.name as parent_name
                FROM shelves s
                LEFT JOIN shelf_assignments sa ON s.id = sa.shelf_id
                LEFT JOIN shelves child ON child.parent_shelf_id = s.id
                LEFT JOIN shelves parent ON s.parent_shelf_id = parent.id
                WHERE s.user_id = ?
                GROUP BY s.id
                ORDER BY s.position ASC
            ");
            $stmt->execute([$userId]);
            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'create_shelf':
            $name = sanitize($input['name'] ?? '', 100);
            $capacity = intval($input['capacity'] ?? 0);
            $description = sanitize($input['description'] ?? '', 500);
            $theme = sanitize($input['theme'] ?? '', 100);
            $color = sanitize($input['color'] ?? '#667eea', 20);
            $parentShelfId = isset($input['parent_shelf_id']) && $input['parent_shelf_id'] !== '' ? intval($input['parent_shelf_id']) : null;
            $shelfCount    = max(1, intval($input['shelf_count']    ?? 5));
            $itemsPerShelf = max(1, intval($input['items_per_shelf'] ?? 25));
            $capacityMode  = in_array($input['capacity_mode'] ?? '', ['quantity']) ? 'quantity' : 'quantity';

            if (empty($name)) {
                jsonResponse(false, null, 'Shelf name required');
            }

            // If parent shelf specified, verify it exists and belongs to user
            if ($parentShelfId !== null) {
                $stmt = $db->prepare("SELECT id FROM shelves WHERE id = ? AND user_id = ?");
                $stmt->execute([$parentShelfId, $userId]);
                if (!$stmt->fetch()) {
                    jsonResponse(false, null, 'Invalid parent shelf');
                }
            }

            // Get max position
            $stmt = $db->prepare("SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM shelves WHERE user_id = ?");
            $stmt->execute([$userId]);
            $position = $stmt->fetchColumn();

            $stmt = $db->prepare("
                INSERT INTO shelves (user_id, name, position, capacity, description, theme, color,
                                     parent_shelf_id, shelf_count, items_per_shelf, capacity_mode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$userId, $name, $position, $capacity, $description, $theme, $color,
                             $parentShelfId, $shelfCount, $itemsPerShelf, $capacityMode]);

            jsonResponse(true, ['shelf_id' => $db->lastInsertId()]);
            break;

        case 'save_shelf_unit_config': {
            // Update shelf_count + items_per_shelf on a parent (shelf unit) record.
            // Used by the wizard "Save as default for this shelf unit" option.
            $shelfId       = intval($input['shelf_id'] ?? 0);
            $shelfCount    = max(1, intval($input['shelf_count']    ?? 5));
            $itemsPerShelf = max(1, intval($input['items_per_shelf'] ?? 25));
            if (!$shelfId) jsonResponse(false, null, 'shelf_id required');
            $stmt = $db->prepare("SELECT user_id FROM shelves WHERE id = ?");
            $stmt->execute([$shelfId]);
            $row = $stmt->fetch();
            if (!$row || $row['user_id'] != $userId) jsonResponse(false, null, 'Shelf not found');
            $db->prepare("UPDATE shelves SET shelf_count = ?, items_per_shelf = ? WHERE id = ? AND user_id = ?")
               ->execute([$shelfCount, $itemsPerShelf, $shelfId, $userId]);
            jsonResponse(true, ['shelf_id' => $shelfId, 'shelf_count' => $shelfCount, 'items_per_shelf' => $itemsPerShelf]);
            break;
        }

        case 'get_shelf_unit_config': {
            // Return shelf unit config for display in wizard
            $shelfId = intval($input['shelf_id'] ?? 0);
            if (!$shelfId) jsonResponse(false, null, 'shelf_id required');
            $stmt = $db->prepare("SELECT id, name, shelf_count, items_per_shelf, capacity_mode FROM shelves WHERE id = ? AND user_id = ?");
            $stmt->execute([$shelfId, $userId]);
            $row = $stmt->fetch();
            if (!$row) jsonResponse(false, null, 'Shelf not found');
            jsonResponse(true, [
                'shelf_id'       => $row['id'],
                'name'           => $row['name'],
                'shelf_count'    => $row['shelf_count']    ?? 5,
                'items_per_shelf'=> $row['items_per_shelf'] ?? 25,
                'capacity_mode'  => $row['capacity_mode']  ?? 'quantity',
                'total_capacity' => (($row['shelf_count'] ?? 5) * ($row['items_per_shelf'] ?? 25)),
            ]);
            break;
        }

        case 'update_shelf':
            $shelfId = intval($input['shelf_id'] ?? 0);
            $name = sanitize($input['name'] ?? '', 100);
            $capacity = intval($input['capacity'] ?? 0);
            $description = sanitize($input['description'] ?? '', 500);
            $theme = sanitize($input['theme'] ?? '', 100);
            $color = sanitize($input['color'] ?? '#667eea', 20);
            $parentShelfId = isset($input['parent_shelf_id']) && $input['parent_shelf_id'] !== '' ? intval($input['parent_shelf_id']) : null;

            if (!$shelfId || empty($name)) {
                jsonResponse(false, null, 'Shelf ID and name required');
            }

            // Verify ownership
            $stmt = $db->prepare("SELECT user_id FROM shelves WHERE id = ?");
            $stmt->execute([$shelfId]);
            $shelf = $stmt->fetch();

            if (!$shelf || $shelf['user_id'] != $userId) {
                jsonResponse(false, null, 'Shelf not found or access denied');
            }

            // If parent shelf specified, verify it exists, belongs to user, and prevent circular reference
            if ($parentShelfId !== null) {
                if ($parentShelfId === $shelfId) {
                    jsonResponse(false, null, 'A shelf cannot be its own parent');
                }

                $stmt = $db->prepare("SELECT id FROM shelves WHERE id = ? AND user_id = ?");
                $stmt->execute([$parentShelfId, $userId]);
                if (!$stmt->fetch()) {
                    jsonResponse(false, null, 'Invalid parent shelf');
                }

                // Check for circular reference (prevent setting parent to one of this shelf's children)
                $stmt = $db->prepare("SELECT id FROM shelves WHERE parent_shelf_id = ? AND user_id = ?");
                $stmt->execute([$shelfId, $userId]);
                $children = $stmt->fetchAll(PDO::FETCH_COLUMN);
                if (in_array($parentShelfId, $children)) {
                    jsonResponse(false, null, 'Cannot set parent to a child shelf (circular reference)');
                }
            }

            $stmt = $db->prepare("
                UPDATE shelves
                SET name = ?, capacity = ?, description = ?, theme = ?, color = ?, parent_shelf_id = ?
                WHERE id = ? AND user_id = ?
            ");
            $stmt->execute([$name, $capacity, $description, $theme, $color, $parentShelfId, $shelfId, $userId]);

            jsonResponse(true, ['shelf_id' => $shelfId]);
            break;

        case 'delete_shelf':
            $shelfId = intval($input['shelf_id'] ?? 0);

            if (!$shelfId) {
                jsonResponse(false, null, 'Shelf ID required');
            }

            // Verify ownership
            $stmt = $db->prepare("SELECT user_id FROM shelves WHERE id = ?");
            $stmt->execute([$shelfId]);
            $shelf = $stmt->fetch();

            if (!$shelf || $shelf['user_id'] != $userId) {
                jsonResponse(false, null, 'Shelf not found or access denied');
            }

            // Delete shelf (assignments will be cascade deleted)
            $stmt = $db->prepare("DELETE FROM shelves WHERE id = ? AND user_id = ?");
            $stmt->execute([$shelfId, $userId]);

            jsonResponse(true, ['deleted' => true]);
            break;

        case 'reorder_shelves':
            $shelfOrder = $input['shelf_order'] ?? [];

            if (!is_array($shelfOrder)) {
                jsonResponse(false, null, 'Invalid shelf order');
            }

            $db->beginTransaction();

            foreach ($shelfOrder as $index => $shelfId) {
                $stmt = $db->prepare("UPDATE shelves SET position = ? WHERE id = ? AND user_id = ?");
                $stmt->execute([$index, intval($shelfId), $userId]);
            }

            $db->commit();

            jsonResponse(true, ['updated' => count($shelfOrder)]);
            break;

        case 'get_shelf_contents':
            $shelfId = intval($input['shelf_id'] ?? 0);

            if (!$shelfId) {
                jsonResponse(false, null, 'Shelf ID required');
            }

            // Verify ownership
            $stmt = $db->prepare("SELECT user_id FROM shelves WHERE id = ?");
            $stmt->execute([$shelfId]);
            $shelf = $stmt->fetch();

            if (!$shelf || $shelf['user_id'] != $userId) {
                jsonResponse(false, null, 'Shelf not found or access denied');
            }

            // Get assigned items (movies and containers/box sets)
            $stmt = $db->prepare("
                SELECT
                    sa.id as assignment_id,
                    sa.position_in_shelf,
                    sa.notes as assignment_notes,
                    sa.is_container,
                    sa.container_id,
                    c.id as copy_id,
                    c.format,
                    c.edition,
                    c.region,
                    c.condition,
                    m.id as movie_id,
                    m.tmdb_id,
                    m.title,
                    m.display_title,
                    m.year,
                    m.poster_url,
                    m.director,
                    m.genre,
                    m.studio,
                    m.actors,
                    m.runtime,
                    m.rating,
                    m.certification,
                    m.overview,
                    m.media_type,
                    m.number_of_seasons,
                    c.seasons_owned,
                    -- Container info
                    cont.name as container_name,
                    cont.spine_label as container_spine_label,
                    cont.spine_color as container_spine_color,
                    cont.spine_image_url as container_spine_image_url,
                    cont.spine_type as container_spine_type,
                    cont.format as container_format,
                    (SELECT COUNT(*) FROM container_contents cc WHERE cc.container_id = cont.id) as container_movie_count
                FROM shelf_assignments sa
                LEFT JOIN copies c ON sa.copy_id = c.id AND sa.is_container = 0
                LEFT JOIN movies m ON c.movie_id = m.id
                LEFT JOIN containers cont ON sa.container_id = cont.id AND sa.is_container = 1
                WHERE sa.shelf_id = ?
                ORDER BY sa.position_in_shelf ASC
            ");
            $stmt->execute([$shelfId]);

            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'get_unassigned_copies':
            // Get copies not assigned to any shelf AND not in any container
            $stmt = $db->prepare("
                SELECT
                    c.id as copy_id,
                    c.format,
                    c.edition,
                    m.id as movie_id,
                    m.tmdb_id,
                    m.title,
                    m.display_title,
                    m.year,
                    m.poster_url,
                    m.director,
                    m.genre,
                    m.studio,
                    m.actors
                FROM copies c
                JOIN movies m ON c.movie_id = m.id
                LEFT JOIN shelf_assignments sa ON c.id = sa.copy_id
                LEFT JOIN container_contents cc ON c.id = cc.copy_id
                WHERE c.user_id = ?
                    AND sa.id IS NULL
                    AND cc.id IS NULL
                ORDER BY COALESCE(m.display_title, m.title) ASC
            ");
            $stmt->execute([$userId]);

            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'get_unassigned_containers':
            // Get containers not assigned to any shelf
            $stmt = $db->prepare("
                SELECT
                    c.id as container_id,
                    c.name,
                    c.spine_label,
                    c.spine_image_type,
                    c.spine_image_url,
                    c.spine_color,
                    c.format,
                    c.edition,
                    COUNT(cc.id) as movie_count
                FROM containers c
                LEFT JOIN container_contents cc ON c.id = cc.container_id
                LEFT JOIN shelf_assignments sa ON c.id = sa.container_id AND sa.is_container = 1
                WHERE c.user_id = ? AND sa.id IS NULL
                GROUP BY c.id
                ORDER BY c.name ASC
            ");
            $stmt->execute([$userId]);

            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'assign_container_to_shelf':
            // Assign a container (box set) to a shelf
            $shelfId = intval($input['shelf_id'] ?? 0);
            $containerId = intval($input['container_id'] ?? 0);
            $position = intval($input['position'] ?? -1);

            if (!$shelfId || !$containerId) {
                jsonResponse(false, null, 'Shelf ID and container ID required');
            }

            // Verify shelf ownership
            $stmt = $db->prepare("SELECT user_id FROM shelves WHERE id = ?");
            $stmt->execute([$shelfId]);
            $shelf = $stmt->fetch();

            if (!$shelf || $shelf['user_id'] != $userId) {
                jsonResponse(false, null, 'Shelf not found or access denied');
            }

            // Verify container ownership
            $stmt = $db->prepare("SELECT user_id FROM containers WHERE id = ?");
            $stmt->execute([$containerId]);
            $container = $stmt->fetch();

            if (!$container || $container['user_id'] != $userId) {
                jsonResponse(false, null, 'Container not found or access denied');
            }

            // Check if already assigned
            $stmt = $db->prepare("SELECT id FROM shelf_assignments WHERE container_id = ? AND is_container = 1");
            $stmt->execute([$containerId]);
            if ($stmt->fetch()) {
                jsonResponse(false, null, 'Container already assigned to a shelf');
            }

            // If position not specified, add to end
            if ($position < 0) {
                $stmt = $db->prepare("SELECT COALESCE(MAX(position_in_shelf), -1) + 1 as next_pos FROM shelf_assignments WHERE shelf_id = ?");
                $stmt->execute([$shelfId]);
                $position = $stmt->fetchColumn();
            }

            // Assign to shelf
            // Note: copy_id is NULL for container assignments (after migration)
            $stmt = $db->prepare("
                INSERT INTO shelf_assignments (shelf_id, copy_id, container_id, is_container, position_in_shelf)
                VALUES (?, NULL, ?, 1, ?)
            ");
            $stmt->execute([$shelfId, $containerId, $position]);

            $assignmentId = $db->lastInsertId();
            logAction($db, $userId, 'container_assigned_to_shelf', 'shelf_assignment', $assignmentId);

            jsonResponse(true, ['assignment_id' => $assignmentId, 'message' => 'Container assigned to shelf']);
            break;

        case 'assign_to_shelf':
            $shelfId = intval($input['shelf_id'] ?? 0);
            $copyId = intval($input['copy_id'] ?? 0);
            $position = intval($input['position'] ?? -1);

            if (!$shelfId || !$copyId) {
                jsonResponse(false, null, 'Shelf ID and copy ID required');
            }

            // Verify shelf ownership
            $stmt = $db->prepare("SELECT user_id FROM shelves WHERE id = ?");
            $stmt->execute([$shelfId]);
            $shelf = $stmt->fetch();

            if (!$shelf || $shelf['user_id'] != $userId) {
                jsonResponse(false, null, 'Shelf not found or access denied');
            }

            // Verify copy ownership
            $stmt = $db->prepare("SELECT user_id FROM copies WHERE id = ?");
            $stmt->execute([$copyId]);
            $copy = $stmt->fetch();

            if (!$copy || $copy['user_id'] != $userId) {
                jsonResponse(false, null, 'Copy not found or access denied');
            }

            // If position not specified, add to end
            if ($position < 0) {
                $stmt = $db->prepare("SELECT COALESCE(MAX(position_in_shelf), -1) + 1 as next_pos FROM shelf_assignments WHERE shelf_id = ?");
                $stmt->execute([$shelfId]);
                $position = $stmt->fetchColumn();
            }

            // Insert or update assignment
            $stmt = $db->prepare("
                INSERT INTO shelf_assignments (shelf_id, copy_id, position_in_shelf)
                VALUES (?, ?, ?)
                ON CONFLICT(copy_id) DO UPDATE SET shelf_id = ?, position_in_shelf = ?
            ");
            $stmt->execute([$shelfId, $copyId, $position, $shelfId, $position]);

            jsonResponse(true, ['assignment_id' => $db->lastInsertId()]);
            break;

        case 'remove_from_shelf':
            $copyId = intval($input['copy_id'] ?? 0);

            if (!$copyId) {
                jsonResponse(false, null, 'Copy ID required');
            }

            // Verify ownership through shelf
            $stmt = $db->prepare("
                SELECT sa.id
                FROM shelf_assignments sa
                JOIN shelves s ON sa.shelf_id = s.id
                WHERE sa.copy_id = ? AND s.user_id = ?
            ");
            $stmt->execute([$copyId, $userId]);

            if (!$stmt->fetch()) {
                jsonResponse(false, null, 'Assignment not found or access denied');
            }

            $stmt = $db->prepare("DELETE FROM shelf_assignments WHERE copy_id = ?");
            $stmt->execute([$copyId]);

            jsonResponse(true, ['removed' => true]);
            break;

        case 'remove_container_from_shelf':
            $containerId = intval($input['container_id'] ?? 0);

            if (!$containerId) {
                jsonResponse(false, null, 'Container ID required');
            }

            // Verify ownership through shelf
            $stmt = $db->prepare("
                SELECT sa.id
                FROM shelf_assignments sa
                JOIN shelves s ON sa.shelf_id = s.id
                WHERE sa.container_id = ? AND sa.is_container = 1 AND s.user_id = ?
            ");
            $stmt->execute([$containerId, $userId]);

            if (!$stmt->fetch()) {
                jsonResponse(false, null, 'Assignment not found or access denied');
            }

            $stmt = $db->prepare("DELETE FROM shelf_assignments WHERE container_id = ? AND is_container = 1");
            $stmt->execute([$containerId]);

            jsonResponse(true, ['removed' => true]);
            break;

        case 'reorder_shelf_contents':
            $shelfId = intval($input['shelf_id'] ?? 0);
            $copyOrder = $input['copy_order'] ?? [];
            // v3.0.0: Support mixed items (copies + containers)
            $itemOrder = $input['item_order'] ?? [];

            if (!$shelfId) {
                jsonResponse(false, null, 'Shelf ID required');
            }

            // Verify ownership
            $stmt = $db->prepare("SELECT user_id FROM shelves WHERE id = ?");
            $stmt->execute([$shelfId]);
            $shelf = $stmt->fetch();

            if (!$shelf || $shelf['user_id'] != $userId) {
                jsonResponse(false, null, 'Shelf not found or access denied');
            }

            $db->beginTransaction();

            if (!empty($itemOrder) && is_array($itemOrder)) {
                // New format: array of {type: 'copy'|'container', id: N}
                foreach ($itemOrder as $index => $item) {
                    $type = $item['type'] ?? 'copy';
                    $id = intval($item['id'] ?? 0);
                    if ($type === 'container') {
                        $stmt = $db->prepare("UPDATE shelf_assignments SET position_in_shelf = ? WHERE shelf_id = ? AND container_id = ? AND is_container = 1");
                        $stmt->execute([$index, $shelfId, $id]);
                    } else {
                        $stmt = $db->prepare("UPDATE shelf_assignments SET position_in_shelf = ? WHERE shelf_id = ? AND copy_id = ? AND is_container = 0");
                        $stmt->execute([$index, $shelfId, $id]);
                    }
                }
            } elseif (!empty($copyOrder) && is_array($copyOrder)) {
                // Legacy format: array of copy IDs
                foreach ($copyOrder as $index => $copyId) {
                    $stmt = $db->prepare("UPDATE shelf_assignments SET position_in_shelf = ? WHERE shelf_id = ? AND copy_id = ?");
                    $stmt->execute([$index, $shelfId, intval($copyId)]);
                }
            }

            $db->commit();

            $count = !empty($itemOrder) ? count($itemOrder) : count($copyOrder);
            jsonResponse(true, ['updated' => $count]);
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
                    // Return detailed error with debug information
                    $errorData = [
                        'error_message' => $aiResult['error'],
                        'debug_steps' => $aiResult['debug_steps'] ?? [],
                    ];

                    // Include additional debug info if available
                    if (isset($aiResult['http_code'])) {
                        $errorData['http_code'] = $aiResult['http_code'];
                    }
                    if (isset($aiResult['raw_response'])) {
                        $errorData['raw_response'] = $aiResult['raw_response'];
                    }
                    if (isset($aiResult['help'])) {
                        $errorData['help'] = $aiResult['help'];
                    }

                    jsonResponse(false, $errorData, 'AI extraction failed: ' . $aiResult['error']);
                }

                jsonResponse(true, [
                    'ai_extracted' => true,
                    'movies' => $aiResult['movies'],
                    'title' => $title,
                    'movie_count' => count($aiResult['movies']),
                    'debug_steps' => $aiResult['debug_steps'] ?? []
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

        case 'scan_cover_image':
            // Recognize DVD/Blu-ray cover using OpenAI Vision API
            // This keeps the API key secure on the server (not exposed to frontend)

            $base64Image = $input['image'] ?? '';

            if (empty($base64Image)) {
                jsonResponse(false, null, 'Image data required');
            }

            // Check if OpenAI API key is configured
            if (empty(OPENAI_API_KEY)) {
                jsonResponse(false, null, 'OpenAI API not configured. Please add OPENAI_API_KEY to config/secrets.php');
            }

            // Prepare OpenAI Vision API request
            $apiData = [
                'model' => 'gpt-4o', // Vision-capable model
                'messages' => [
                    [
                        'role' => 'user',
                        'content' => [
                            [
                                'type' => 'text',
                                'text' => 'This is a DVD or Blu-ray cover. Extract ONLY the movie title. Return just the title, nothing else. If you cannot determine the title, return "UNKNOWN".'
                            ],
                            [
                                'type' => 'image_url',
                                'image_url' => [
                                    'url' => 'data:image/jpeg;base64,' . $base64Image
                                ]
                            ]
                        ]
                    ]
                ],
                'max_tokens' => 50
            ];

            // Make request to OpenAI
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, 'https://api.openai.com/v1/chat/completions');
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
                jsonResponse(false, null, 'Network error: ' . $curlError);
            }

            if ($httpCode !== 200) {
                $errorData = json_decode($response, true);
                $errorMsg = $errorData['error']['message'] ?? 'OpenAI API request failed';
                jsonResponse(false, null, 'OpenAI API error: ' . $errorMsg);
            }

            $data = json_decode($response, true);
            $title = $data['choices'][0]['message']['content'] ?? '';
            $title = trim($title);

            if (empty($title) || $title === 'UNKNOWN') {
                jsonResponse(false, null, 'Could not recognize movie title from image');
            }

            jsonResponse(true, ['title' => $title]);
            break;

        case 'scan_boxset_titles':
            // Recognize MULTIPLE movie titles from a box set cover/back using OpenAI Vision API
            $base64Image = $input['image'] ?? '';

            if (empty($base64Image)) {
                jsonResponse(false, null, 'Image data required');
            }

            if (empty(OPENAI_API_KEY)) {
                jsonResponse(false, null, 'OpenAI API not configured. Please add OPENAI_API_KEY to config/secrets.php');
            }

            $apiData = [
                'model' => 'gpt-4o',
                'messages' => [
                    [
                        'role' => 'user',
                        'content' => [
                            [
                                'type' => 'text',
                                'text' => 'This is a photo of a DVD/Blu-ray box set. Read ALL individual movie titles visible on the cover, back, or disc list. Return ONLY a JSON array of movie title strings, like ["Movie One", "Movie Two", "Movie Three"]. Do not include the box set name itself, only the individual film titles. If you cannot determine any titles, return [].'
                            ],
                            [
                                'type' => 'image_url',
                                'image_url' => [
                                    'url' => 'data:image/jpeg;base64,' . $base64Image
                                ]
                            ]
                        ]
                    ]
                ],
                'max_tokens' => 500
            ];

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, 'https://api.openai.com/v1/chat/completions');
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
                jsonResponse(false, null, 'Network error: ' . $curlError);
            }

            if ($httpCode !== 200) {
                $errorData = json_decode($response, true);
                $errorMsg = $errorData['error']['message'] ?? 'OpenAI API request failed';
                jsonResponse(false, null, 'OpenAI API error: ' . $errorMsg);
            }

            $data = json_decode($response, true);
            $content = trim($data['choices'][0]['message']['content'] ?? '');

            // Extract JSON array from response (handle markdown code blocks)
            if (preg_match('/\[.*\]/s', $content, $matches)) {
                $titles = json_decode($matches[0], true);
            } else {
                $titles = [];
            }

            if (!is_array($titles)) {
                $titles = [];
            }

            jsonResponse(true, ['titles' => $titles]);
            break;

        case 'scan_boxset_cover_fields':
            // AI-powered box set cover scanning: detects text phrases and suggests field assignments
            // Returns detected phrases with suggested field mappings (title, spine, edition, format, version, etc.)
            $base64Image = $input['image'] ?? '';

            if (empty($base64Image)) {
                jsonResponse(false, null, 'Image data required');
            }

            if (empty(OPENAI_API_KEY)) {
                jsonResponse(false, null, 'OpenAI API not configured');
            }

            $apiData = [
                'model' => 'gpt-4o',
                'messages' => [
                    [
                        'role' => 'user',
                        'content' => [
                            [
                                'type' => 'text',
                                'text' => 'This is a photo of a DVD/Blu-ray box set cover. Analyze ALL visible text and categorize each detected phrase into the most likely field it belongs to. Return a JSON object with these keys:
- "detected_phrases": array of ALL text phrases found on the cover
- "suggested": object with these optional keys, each containing the best-matching phrase:
  - "title": the box set title/name (e.g. "Star Wars: The Complete Trilogy")
  - "spine_label": text that would appear on the spine
  - "edition": edition info (e.g. "Special Edition", "Director\'s Cut", "Collector\'s Edition")
  - "format": physical format (e.g. "DVD", "Blu-ray", "4K UHD")
  - "aspect_ratio": aspect ratio info (e.g. "Widescreen", "Full Screen")
  - "version": version info (e.g. "Theatrical Version", "Director\'s Cut", "Final Cut", "Unrated")
  - "studio": studio name if visible
  - "movie_count": number of movies/films mentioned (as string)
Return ONLY the JSON object, no markdown.'
                            ],
                            [
                                'type' => 'image_url',
                                'image_url' => [
                                    'url' => 'data:image/jpeg;base64,' . $base64Image
                                ]
                            ]
                        ]
                    ]
                ],
                'max_tokens' => 800
            ];

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, 'https://api.openai.com/v1/chat/completions');
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
                jsonResponse(false, null, 'Network error: ' . $curlError);
            }

            if ($httpCode !== 200) {
                $errorData = json_decode($response, true);
                $errorMsg = $errorData['error']['message'] ?? 'OpenAI API request failed';
                jsonResponse(false, null, 'OpenAI API error: ' . $errorMsg);
            }

            $data = json_decode($response, true);
            $content = trim($data['choices'][0]['message']['content'] ?? '');

            // Try to parse JSON from response (handle markdown code blocks)
            $content = preg_replace('/^```json\s*/', '', $content);
            $content = preg_replace('/\s*```$/', '', $content);
            $parsed = json_decode($content, true);

            if (!is_array($parsed)) {
                $parsed = ['detected_phrases' => [], 'suggested' => []];
            }

            jsonResponse(true, $parsed);
            break;

        case 'bulk_update_copies':
            // Bulk update multiple copies at once (for spreadsheet editor)
            $updates = $input['updates'] ?? [];

            if (!is_array($updates) || empty($updates)) {
                jsonResponse(false, null, 'No updates provided');
            }

            $successCount = 0;
            $errors = [];

            foreach ($updates as $update) {
                $copyId = intval($update['copy_id'] ?? 0);
                if (!$copyId) {
                    $errors[] = 'Invalid copy_id';
                    continue;
                }

                // Verify ownership
                $stmt = $db->prepare("SELECT user_id FROM copies WHERE id = ?");
                $stmt->execute([$copyId]);
                $copy = $stmt->fetch();

                if (!$copy || $copy['user_id'] != $userId) {
                    $errors[] = "Copy $copyId not found or access denied";
                    continue;
                }

                $format = sanitize($update['format'] ?? '', 50);
                $edition = sanitize($update['edition'] ?? '', 100);
                $region = sanitize($update['region'] ?? '', 50);
                $condition = sanitize($update['condition'] ?? '', 50);
                $notes = sanitize($update['notes'] ?? '', 500);

                $stmt = $db->prepare("
                    UPDATE copies
                    SET format = CASE WHEN ? != '' THEN ? ELSE format END,
                        edition = ?,
                        region = CASE WHEN ? != '' THEN ? ELSE region END,
                        condition = CASE WHEN ? != '' THEN ? ELSE condition END,
                        notes = ?
                    WHERE id = ? AND user_id = ?
                ");
                $stmt->execute([
                    $format, $format,
                    $edition,
                    $region, $region,
                    $condition, $condition,
                    $notes,
                    $copyId, $userId
                ]);

                $successCount++;
                logAction($db, $userId, 'copy_bulk_updated', 'copy', $copyId);
            }

            jsonResponse(true, ['updated' => $successCount, 'errors' => $errors]);
            break;

        case 'bulk_update_containers':
            // Bulk update multiple box sets at once (for spreadsheet editor)
            $updates = $input['updates'] ?? [];

            if (!is_array($updates) || empty($updates)) {
                jsonResponse(false, null, 'No updates provided');
            }

            $successCount = 0;
            $errors = [];

            foreach ($updates as $update) {
                $containerId = intval($update['container_id'] ?? 0);
                if (!$containerId) {
                    $errors[] = 'Invalid container_id';
                    continue;
                }

                // Verify ownership
                $stmt = $db->prepare("SELECT user_id FROM containers WHERE id = ?");
                $stmt->execute([$containerId]);
                $container = $stmt->fetch();

                if (!$container || $container['user_id'] != $userId) {
                    $errors[] = "Container $containerId not found or access denied";
                    continue;
                }

                $format = sanitize($update['format'] ?? '', 50);
                $edition = sanitize($update['edition'] ?? '', 100);
                $region = sanitize($update['region'] ?? '', 50);
                $condition = sanitize($update['condition'] ?? '', 50);

                $stmt = $db->prepare("
                    UPDATE containers
                    SET format = CASE WHEN ? != '' THEN ? ELSE format END,
                        edition = ?,
                        region = CASE WHEN ? != '' THEN ? ELSE region END,
                        condition = CASE WHEN ? != '' THEN ? ELSE condition END
                    WHERE id = ? AND user_id = ?
                ");
                $stmt->execute([
                    $format, $format,
                    $edition,
                    $region, $region,
                    $condition, $condition,
                    $containerId, $userId
                ]);

                $successCount++;
                logAction($db, $userId, 'container_bulk_updated', 'container', $containerId);
            }

            jsonResponse(true, ['updated' => $successCount, 'errors' => $errors]);
            break;

        case 'list_all_copies_detailed':
            // Get all copies with full movie details for bulk editing spreadsheet
            $stmt = $db->prepare("
                SELECT
                    c.id as copy_id,
                    c.movie_id,
                    c.format,
                    c.edition,
                    c.region,
                    c.condition as copy_condition,
                    c.notes,
                    c.barcode,
                    c.seasons_owned,
                    c.created_at,
                    m.tmdb_id,
                    m.title,
                    m.display_title,
                    m.year,
                    m.poster_url,
                    m.rating,
                    m.runtime,
                    m.genre,
                    m.director,
                    m.actors,
                    m.studio,
                    m.certification,
                    m.media_type,
                    m.overview
                FROM copies c
                JOIN movies m ON c.movie_id = m.id
                WHERE c.user_id = ?
                ORDER BY COALESCE(m.display_title, m.title) ASC
            ");
            $stmt->execute([$userId]);

            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'list_all_containers_detailed':
            // Get all containers with details for bulk editing spreadsheet
            $stmt = $db->prepare("
                SELECT
                    ct.id as container_id,
                    ct.name,
                    ct.spine_label,
                    ct.format,
                    ct.edition,
                    ct.region,
                    ct.condition as container_condition,
                    ct.notes,
                    ct.created_at,
                    (SELECT COUNT(*) FROM container_contents cc WHERE cc.container_id = ct.id) as movie_count
                FROM containers ct
                WHERE ct.user_id = ?
                ORDER BY ct.name ASC
            ");
            $stmt->execute([$userId]);

            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'save_icon':
            // Save app icons to ROOT directory or /admin/ directory
            // Main app uses: /app-icon.png (512x512), /app-icon-192.png, /favicon.ico
            // Admin app uses: /admin/admin-icon.png (512x512), /admin/admin-icon-192.png

            $type = $input['type'] ?? '';
            $target = $input['target'] ?? 'main'; // 'main' or 'admin'

            if ($type === 'favicon') {
                $data = $input['data'] ?? '';
                if (empty($data)) {
                    jsonResponse(false, null, 'Icon data required');
                }

                // Remove data:image/png;base64, prefix
                $data = str_replace('data:image/png;base64,', '', $data);
                $imageData = base64_decode($data);

                if ($imageData === false) {
                    jsonResponse(false, null, 'Invalid image data');
                }

                // Save to root directory as BOTH favicon.png and favicon.ico
                $faviconPngPath = __DIR__ . '/../favicon.png';
                $faviconIcoPath = __DIR__ . '/../favicon.ico';

                $resultPng = file_put_contents($faviconPngPath, $imageData);
                $resultIco = file_put_contents($faviconIcoPath, $imageData);

                if ($resultPng === false || $resultIco === false) {
                    jsonResponse(false, null, 'Failed to write favicon files');
                }

                jsonResponse(true, ['message' => 'Favicon saved successfully']);

            } elseif ($type === 'app') {
                $data192 = $input['data192'] ?? '';
                $data512 = $input['data512'] ?? '';

                if (empty($data192) || empty($data512)) {
                    jsonResponse(false, null, 'Both 192x192 and 512x512 icon data required');
                }

                // Process 192x192 icon
                $data192 = str_replace('data:image/png;base64,', '', $data192);
                $imageData192 = base64_decode($data192);
                if ($imageData192 === false) {
                    jsonResponse(false, null, 'Invalid 192x192 icon data');
                }

                // Process 512x512 icon
                $data512 = str_replace('data:image/png;base64,', '', $data512);
                $imageData512 = base64_decode($data512);
                if ($imageData512 === false) {
                    jsonResponse(false, null, 'Invalid 512x512 icon data');
                }

                // Determine save paths based on target
                if ($target === 'admin') {
                    // Save to /admin/ directory with admin-icon prefix
                    $icon192Path = __DIR__ . '/../admin/admin-icon-192.png';
                    $icon512Path = __DIR__ . '/../admin/admin-icon.png';
                    $successMsg = 'Admin app icons saved successfully';
                } else {
                    // Save to ROOT directory (main app)
                    $icon192Path = __DIR__ . '/../app-icon-192.png';
                    $icon512Path = __DIR__ . '/../app-icon.png';
                    $successMsg = 'App icons saved successfully';
                }

                $result192 = file_put_contents($icon192Path, $imageData192);
                $result512 = file_put_contents($icon512Path, $imageData512);

                if ($result192 === false || $result512 === false) {
                    jsonResponse(false, null, 'Failed to write app icon files');
                }

                jsonResponse(true, ['message' => $successMsg]);

            } else {
                jsonResponse(false, null, 'Invalid icon type. Must be "favicon" or "app"');
            }
            break;

        // ========================================
        // DOCUMENTATION
        // ========================================

        case 'get_current_user':
            // Return current user info for access control
            try {
                $user = authenticateRequest();
                jsonResponse(true, [
                    'email' => $user['email'] ?? null,
                    'username' => $user['username'] ?? null,
                    'is_admin' => $user['is_admin'] ?? false
                ]);
            } catch (Exception $e) {
                jsonResponse(false, null, 'Not logged in');
            }
            break;

        case 'get_documentation':
            // Serve documentation files with access control
            $docName = $input['doc_name'] ?? '';

            if (empty($docName)) {
                jsonResponse(false, null, 'Document name required');
            }

            // Check if user is logged in using token-based auth
            try {
                $user = authenticateRequest();
            } catch (Exception $e) {
                jsonResponse(false, null, 'You must be logged in to view documentation.');
            }

            // Map doc names to files
            $docFiles = [
                'user' => __DIR__ . '/../../USER_GUIDE.md',
                'admin' => __DIR__ . '/../../ADMIN_GUIDE.md',
                'dev' => __DIR__ . '/../../DEV_GUIDE.md',
                'changelog' => __DIR__ . '/../../CHANGELOG.md'
            ];

            if (!isset($docFiles[$docName])) {
                jsonResponse(false, null, 'Invalid document name');
            }

            $filePath = $docFiles[$docName];

            if (!file_exists($filePath)) {
                jsonResponse(false, null, 'Document not found');
            }

            // Access control: Admin and Dev guides restricted to admin users only
            $restrictedDocs = ['admin', 'dev'];
            $isAdmin = $user['is_admin'] ?? false;

            if (in_array($docName, $restrictedDocs)) {
                // Must have admin privileges
                if (!$isAdmin) {
                    jsonResponse(false, null, 'Access denied. This document is restricted to admin users only.');
                }
            }

            // Read and return the documentation
            $content = file_get_contents($filePath);

            if ($content === false) {
                jsonResponse(false, null, 'Failed to read document');
            }

            jsonResponse(true, [
                'content' => $content,
                'name' => $docName
            ]);
            break;

        case 'save_css_styles':
            // Save CSS style adjustments from live editor
            try {
                $user = authenticateRequest();
            } catch (Exception $e) {
                jsonResponse(false, null, 'You must be logged in');
            }

            // Check if user is admin
            $isAdmin = $user['is_admin'] ?? false;
            if (!$isAdmin) {
                jsonResponse(false, null, 'Admin access required');
            }

            $cssData = $input['css'] ?? null;

            if (!$cssData) {
                jsonResponse(false, null, 'CSS data required');
            }

            // Read current styles.css
            $cssFile = __DIR__ . '/../css/styles.css';
            $cssContent = file_get_contents($cssFile);

            if ($cssContent === false) {
                jsonResponse(false, null, 'Failed to read styles.css');
            }

            // Update Grid View styles
            $cssContent = preg_replace(
                '/\.movie-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\([^)]+\)/',
                '.movie-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(' . $cssData['grid']['minWidth'] . 'px',
                $cssContent
            );

            $cssContent = preg_replace(
                '/(\.movie-grid\s*\{[^}]*gap:\s*)[^;]+/',
                '$1' . $cssData['grid']['gap'] . 'rem',
                $cssContent
            );

            $cssContent = preg_replace(
                '/(\.movie-grid\s+\.movie-title\s*\{[^}]*font-size:\s*)[^;]+/',
                '$1' . $cssData['grid']['titleSize'] . 'rem',
                $cssContent
            );

            $cssContent = preg_replace(
                '/(\.movie-grid\s+\.movie-title\s*\{[^}]*line-height:\s*)[^;]+/',
                '$1' . $cssData['grid']['titleLineHeight'],
                $cssContent
            );

            // Update List View styles
            $cssContent = preg_replace(
                '/(\.movie-grid\.list-view\s+\.movie-card\s*\{[^}]*min-height:\s*)[^;]+/',
                '$1' . $cssData['list']['minHeight'] . 'px',
                $cssContent
            );

            $cssContent = preg_replace(
                '/(\.movie-grid\.list-view\s+\.movie-card\s*\{[^}]*max-height:\s*)[^;]+/',
                '$1' . $cssData['list']['maxHeight'] . 'px',
                $cssContent
            );

            $cssContent = preg_replace(
                '/(\.movie-grid\.list-view\s+\.movie-poster-container\s*\{[^}]*width:\s*)[^;]+/',
                '$1' . $cssData['list']['posterWidth'] . 'px',
                $cssContent
            );

            $cssContent = preg_replace(
                '/(\.movie-grid\.list-view\s+\.movie-title\s*\{[^}]*font-size:\s*)[^;]+/',
                '$1' . $cssData['list']['titleSize'] . 'rem',
                $cssContent
            );

            $cssContent = preg_replace(
                '/(\.movie-grid\.list-view\s+\.movie-title\s*\{[^}]*line-height:\s*)[^;]+/',
                '$1' . $cssData['list']['titleLineHeight'],
                $cssContent
            );

            $cssContent = preg_replace(
                '/(\.movie-grid\.list-view\s+\.movie-info\s*\{[^}]*padding:\s*)[^;]+/',
                '$1' . $cssData['list']['infoPadding'] . 'rem',
                $cssContent
            );

            // Update Compact View styles
            $cssContent = preg_replace(
                '/\.movie-grid\.compact-view\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\([^)]+\)/',
                '.movie-grid.compact-view {
    grid-template-columns: repeat(auto-fill, minmax(' . $cssData['compact']['minWidth'] . 'px',
                $cssContent
            );

            $cssContent = preg_replace(
                '/(\.movie-grid\.compact-view\s*\{[^}]*gap:\s*)[^;]+/',
                '$1' . $cssData['compact']['gap'] . 'rem',
                $cssContent
            );

            $cssContent = preg_replace(
                '/(\.movie-grid\.compact-view\s+\.movie-title\s*\{[^}]*font-size:\s*)[^;]+/',
                '$1' . $cssData['compact']['titleSize'] . 'rem',
                $cssContent
            );

            $cssContent = preg_replace(
                '/(\.movie-grid\.compact-view\s+\.movie-title\s*\{[^}]*-webkit-line-clamp:\s*)[^;]+/',
                '$1' . $cssData['compact']['titleLines'],
                $cssContent
            );

            // Write updated CSS back to file
            $result = file_put_contents($cssFile, $cssContent);

            if ($result === false) {
                jsonResponse(false, null, 'Failed to write styles.css');
            }

            jsonResponse(true, ['message' => 'Styles saved successfully', 'bytes_written' => $result]);
            break;

        // ========================================
        // DATABASE MIGRATION
        // ========================================

        case 'run_migration':
            // Run a database migration SQL script
            // SECURITY: Only allow when user is logged in
            $sql = $input['sql'] ?? '';

            if (empty($sql)) {
                jsonResponse(false, null, 'SQL is required');
            }

            try {
                // Begin transaction for atomic migration
                $db->beginTransaction();

                // Execute the migration SQL
                // Note: exec() can handle multiple statements in SQLite
                $result = $db->exec($sql);

                // Commit transaction
                $db->commit();

                error_log('Migration executed successfully. Rows affected: ' . $result);
                logAction($db, $userId, 'migration_executed', 'system', 0);
                jsonResponse(true, [
                    'message' => 'Migration executed successfully',
                    'rows_affected' => $result
                ]);
            } catch (PDOException $e) {
                // Rollback on error
                if ($db->inTransaction()) {
                    $db->rollBack();
                }

                $errorMsg = $e->getMessage();
                $errorCode = $e->getCode();
                error_log('Migration error: ' . $errorMsg);
                error_log('Error code: ' . $errorCode);
                error_log('SQL was: ' . substr($sql, 0, 500));

                jsonResponse(false, null, 'Migration failed: ' . $errorMsg . ' (Code: ' . $errorCode . ')');
            } catch (Exception $e) {
                // Handle other exceptions
                if ($db->inTransaction()) {
                    $db->rollBack();
                }

                error_log('Unexpected migration error: ' . $e->getMessage());
                jsonResponse(false, null, 'Unexpected error: ' . $e->getMessage());
            }
            break;

        // ========================================
        // DEFAULT
        // ========================================

        case 'get_splash_config':
            // Return splash screen configuration (public, no auth required)
            $splashFile = dirname(__DIR__) . '/data/splash-config.json';
            if (file_exists($splashFile)) {
                $splashConfig = json_decode(file_get_contents($splashFile), true);
                jsonResponse(true, $splashConfig ?: []);
            } else {
                // Defaults
                jsonResponse(true, [
                    'enabled' => true,
                    'duration' => 2,
                    'title' => 'CineShelf',
                    'tagline' => 'Your Movie Collection',
                    'logo_url' => '/app-icon-192.png',
                    'bg_color' => ''
                ]);
            }
            break;

        case 'save_splash_config':
            // Save splash screen settings (admin only)
            $splashFile = dirname(__DIR__) . '/data/splash-config.json';
            $config = [
                'enabled'  => (bool)($input['enabled'] ?? true),
                'duration' => max(0, min(10, floatval($input['duration'] ?? 2))),
                'title'    => sanitize($input['title'] ?? 'CineShelf', 100),
                'tagline'  => sanitize($input['tagline'] ?? '', 200),
                'logo_url' => sanitize($input['logo_url'] ?? '/app-icon-192.png', 500),
                'bg_color' => sanitize($input['bg_color'] ?? '', 100)
            ];

            $dataDir = dirname(__DIR__) . '/data';
            if (!is_dir($dataDir)) {
                mkdir($dataDir, 0755, true);
            }

            if (file_put_contents($splashFile, json_encode($config, JSON_PRETTY_PRINT))) {
                jsonResponse(true, ['message' => 'Splash config saved', 'config' => $config]);
            } else {
                jsonResponse(false, null, 'Failed to write splash config');
            }
            break;

        // ========================================
        // PHYSICAL MEDIA EDITIONS (UMDB)
        // Universal edition definitions & components
        // ========================================

        case 'get_editions':
            // Get all editions for a movie (UMDB data)
            $movieId = intval($input['movie_id'] ?? 0);
            if (empty($movieId)) {
                jsonResponse(false, null, 'Movie ID required');
            }

            $stmt = $db->prepare("
                SELECT me.*,
                    u.username as created_by_username,
                    (SELECT COUNT(*) FROM edition_components ec WHERE ec.edition_id = me.id) as component_count
                FROM media_editions me
                LEFT JOIN users u ON me.created_by = u.id
                WHERE me.movie_id = ?
                ORDER BY me.created_at DESC
            ");
            $stmt->execute([$movieId]);
            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'get_edition':
            // Get a single edition with all its components
            $editionId = intval($input['edition_id'] ?? 0);
            if (empty($editionId)) {
                jsonResponse(false, null, 'Edition ID required');
            }

            $stmt = $db->prepare("SELECT * FROM media_editions WHERE id = ?");
            $stmt->execute([$editionId]);
            $edition = $stmt->fetch();

            if (!$edition) {
                jsonResponse(false, null, 'Edition not found');
            }

            // Get components
            $stmt = $db->prepare("
                SELECT * FROM edition_components
                WHERE edition_id = ?
                ORDER BY position ASC, id ASC
            ");
            $stmt->execute([$editionId]);
            $edition['components'] = $stmt->fetchAll();

            jsonResponse(true, $edition);
            break;

        case 'create_edition':
            // Create a new media edition (UMDB)
            $movieId = intval($input['movie_id'] ?? 0);
            $name = sanitize($input['name'] ?? '', 200);
            $format = sanitize($input['format'] ?? '', 50);
            $packageType = sanitize($input['package_type'] ?? '', 50);
            $region = sanitize($input['region'] ?? '', 50);
            $barcode = sanitize($input['barcode'] ?? '', 50);
            $releaseDate = sanitize($input['release_date'] ?? '', 20);
            $distributor = sanitize($input['distributor'] ?? '', 200);
            $country = sanitize($input['country'] ?? '', 100);
            $discCount = intval($input['disc_count'] ?? 1);
            $notes = sanitize($input['notes'] ?? '', 500);
            $umdbReleaseId = sanitize($input['umdb_release_id'] ?? '', 80);

            if (empty($movieId) || empty($name)) {
                jsonResponse(false, null, 'Movie ID and edition name required');
            }

            // Verify movie exists
            $stmt = $db->prepare("SELECT id FROM movies WHERE id = ?");
            $stmt->execute([$movieId]);
            if (!$stmt->fetch()) {
                jsonResponse(false, null, 'Movie not found');
            }

            $stmt = $db->prepare("
                INSERT INTO media_editions (movie_id, umdb_release_id, name, format, package_type, region, barcode, release_date, distributor, country, disc_count, notes, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $movieId, $umdbReleaseId ?: null, $name, $format ?: null, $packageType ?: null, $region ?: null,
                $barcode ?: null, $releaseDate ?: null, $distributor ?: null, $country ?: null,
                $discCount, $notes ?: null, $userId
            ]);

            $editionId = $db->lastInsertId();

            // Auto-create default components if provided
            $components = $input['components'] ?? [];
            if (!empty($components) && is_array($components)) {
                $compStmt = $db->prepare("
                    INSERT INTO edition_components (edition_id, component_type, component_name, description, position)
                    VALUES (?, ?, ?, ?, ?)
                ");
                foreach ($components as $i => $comp) {
                    $compStmt->execute([
                        $editionId,
                        sanitize($comp['component_type'] ?? 'other', 50),
                        sanitize($comp['component_name'] ?? 'Component', 200),
                        sanitize($comp['description'] ?? '', 500),
                        intval($comp['position'] ?? $i)
                    ]);
                }
            }

            logAction($db, $userId, 'edition_created', 'media_edition', $editionId);
            jsonResponse(true, ['edition_id' => $editionId]);
            break;

        case 'update_edition':
            $editionId = intval($input['edition_id'] ?? 0);
            $name = sanitize($input['name'] ?? '', 200);
            $format = sanitize($input['format'] ?? '', 50);
            $packageType = sanitize($input['package_type'] ?? '', 50);
            $region = sanitize($input['region'] ?? '', 50);
            $barcode = sanitize($input['barcode'] ?? '', 50);
            $releaseDate = sanitize($input['release_date'] ?? '', 20);
            $distributor = sanitize($input['distributor'] ?? '', 200);
            $country = sanitize($input['country'] ?? '', 100);
            $discCount = intval($input['disc_count'] ?? 1);
            $notes = sanitize($input['notes'] ?? '', 500);

            if (empty($editionId) || empty($name)) {
                jsonResponse(false, null, 'Edition ID and name required');
            }

            $stmt = $db->prepare("
                UPDATE media_editions
                SET name = ?, format = ?, package_type = ?, region = ?, barcode = ?,
                    release_date = ?, distributor = ?, country = ?, disc_count = ?, notes = ?,
                    updated_at = datetime('now')
                WHERE id = ?
            ");
            $stmt->execute([
                $name, $format ?: null, $packageType ?: null, $region ?: null,
                $barcode ?: null, $releaseDate ?: null, $distributor ?: null, $country ?: null,
                $discCount, $notes ?: null, $editionId
            ]);

            logAction($db, $userId, 'edition_updated', 'media_edition', $editionId);
            jsonResponse(true, ['edition_id' => $editionId]);
            break;

        case 'delete_edition':
            $editionId = intval($input['edition_id'] ?? 0);
            if (empty($editionId)) {
                jsonResponse(false, null, 'Edition ID required');
            }

            // Unlink any copies that reference this edition
            $stmt = $db->prepare("UPDATE copies SET edition_id = NULL WHERE edition_id = ?");
            $stmt->execute([$editionId]);

            // Delete edition (cascades to components and copy_components)
            $stmt = $db->prepare("DELETE FROM media_editions WHERE id = ?");
            $stmt->execute([$editionId]);

            logAction($db, $userId, 'edition_deleted', 'media_edition', $editionId);
            jsonResponse(true, ['deleted' => $editionId]);
            break;

        // ========================================
        // EDITION COMPONENTS (UMDB)
        // ========================================

        case 'add_edition_component':
            $editionId = intval($input['edition_id'] ?? 0);
            $componentType = sanitize($input['component_type'] ?? '', 50);
            $componentName = sanitize($input['component_name'] ?? '', 200);
            $description = sanitize($input['description'] ?? '', 500);
            $position = intval($input['position'] ?? 0);

            if (empty($editionId) || empty($componentType) || empty($componentName)) {
                jsonResponse(false, null, 'Edition ID, component type, and component name required');
            }

            // Verify edition exists
            $stmt = $db->prepare("SELECT id FROM media_editions WHERE id = ?");
            $stmt->execute([$editionId]);
            if (!$stmt->fetch()) {
                jsonResponse(false, null, 'Edition not found');
            }

            $stmt = $db->prepare("
                INSERT INTO edition_components (edition_id, component_type, component_name, description, position)
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([$editionId, $componentType, $componentName, $description ?: null, $position]);

            $componentId = $db->lastInsertId();

            // Auto-create copy_components for all copies linked to this edition
            $stmt = $db->prepare("SELECT id FROM copies WHERE edition_id = ?");
            $stmt->execute([$editionId]);
            $linkedCopies = $stmt->fetchAll();

            if (!empty($linkedCopies)) {
                $insertStmt = $db->prepare("
                    INSERT OR IGNORE INTO copy_components (copy_id, edition_component_id, is_present, condition)
                    VALUES (?, ?, 1, 'Good')
                ");
                foreach ($linkedCopies as $copy) {
                    $insertStmt->execute([$copy['id'], $componentId]);
                }
            }

            jsonResponse(true, ['component_id' => $componentId]);
            break;

        case 'update_edition_component':
            $componentId = intval($input['component_id'] ?? 0);
            $componentType = sanitize($input['component_type'] ?? '', 50);
            $componentName = sanitize($input['component_name'] ?? '', 200);
            $description = sanitize($input['description'] ?? '', 500);
            $position = intval($input['position'] ?? 0);

            if (empty($componentId) || empty($componentName)) {
                jsonResponse(false, null, 'Component ID and name required');
            }

            $stmt = $db->prepare("
                UPDATE edition_components
                SET component_type = ?, component_name = ?, description = ?, position = ?
                WHERE id = ?
            ");
            $stmt->execute([$componentType, $componentName, $description ?: null, $position, $componentId]);

            jsonResponse(true, ['component_id' => $componentId]);
            break;

        case 'delete_edition_component':
            $componentId = intval($input['component_id'] ?? 0);
            if (empty($componentId)) {
                jsonResponse(false, null, 'Component ID required');
            }

            // Cascades to copy_components
            $stmt = $db->prepare("DELETE FROM edition_components WHERE id = ?");
            $stmt->execute([$componentId]);

            jsonResponse(true, ['deleted' => $componentId]);
            break;

        // ========================================
        // COPY COMPONENTS (CineShelf - User-Specific)
        // Track which components user has + condition
        // ========================================

        case 'get_copy_components':
            // Get all component tracking for a specific copy
            $copyId = intval($input['copy_id'] ?? 0);
            if (empty($copyId)) {
                jsonResponse(false, null, 'Copy ID required');
            }

            // Verify ownership
            $stmt = $db->prepare("SELECT user_id, edition_id FROM copies WHERE id = ?");
            $stmt->execute([$copyId]);
            $copy = $stmt->fetch();

            if (!$copy || $copy['user_id'] != $userId) {
                jsonResponse(false, null, 'Copy not found or not authorized');
            }

            if (empty($copy['edition_id'])) {
                jsonResponse(true, ['components' => [], 'edition' => null]);
                break;
            }

            // Get edition info
            $stmt = $db->prepare("SELECT * FROM media_editions WHERE id = ?");
            $stmt->execute([$copy['edition_id']]);
            $edition = $stmt->fetch();

            // Get all edition components with user's tracking data
            $stmt = $db->prepare("
                SELECT
                    ec.id as edition_component_id,
                    ec.component_type,
                    ec.component_name,
                    ec.description,
                    ec.position,
                    COALESCE(cc.is_present, 1) as is_present,
                    COALESCE(cc.condition, 'Good') as user_condition,
                    cc.notes as user_notes,
                    cc.id as copy_component_id
                FROM edition_components ec
                LEFT JOIN copy_components cc ON cc.edition_component_id = ec.id AND cc.copy_id = ?
                WHERE ec.edition_id = ?
                ORDER BY ec.position ASC, ec.id ASC
            ");
            $stmt->execute([$copyId, $copy['edition_id']]);

            jsonResponse(true, [
                'edition' => $edition,
                'components' => $stmt->fetchAll()
            ]);
            break;

        case 'update_copy_component':
            // Toggle is_present or update condition for a user's component
            $copyId = intval($input['copy_id'] ?? 0);
            $editionComponentId = intval($input['edition_component_id'] ?? 0);
            $isPresent = isset($input['is_present']) ? intval($input['is_present']) : 1;
            $condition = sanitize($input['condition'] ?? 'Good', 50);
            $notes = sanitize($input['notes'] ?? '', 500);

            if (empty($copyId) || empty($editionComponentId)) {
                jsonResponse(false, null, 'Copy ID and edition component ID required');
            }

            // Verify ownership
            $stmt = $db->prepare("SELECT user_id FROM copies WHERE id = ?");
            $stmt->execute([$copyId]);
            $copy = $stmt->fetch();

            if (!$copy || $copy['user_id'] != $userId) {
                jsonResponse(false, null, 'Not authorized');
            }

            // Upsert the copy_component record
            $stmt = $db->prepare("
                INSERT INTO copy_components (copy_id, edition_component_id, is_present, condition, notes, updated_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(copy_id, edition_component_id)
                DO UPDATE SET is_present = ?, condition = ?, notes = ?, updated_at = datetime('now')
            ");
            $stmt->execute([
                $copyId, $editionComponentId, $isPresent, $condition, $notes ?: null,
                $isPresent, $condition, $notes ?: null
            ]);

            jsonResponse(true, ['updated' => true]);
            break;

        case 'initialize_copy_components':
            // When linking a copy to an edition, create tracking records for all components
            $copyId = intval($input['copy_id'] ?? 0);
            $editionId = intval($input['edition_id'] ?? 0);

            if (empty($copyId) || empty($editionId)) {
                jsonResponse(false, null, 'Copy ID and edition ID required');
            }

            // Verify ownership
            $stmt = $db->prepare("SELECT user_id FROM copies WHERE id = ?");
            $stmt->execute([$copyId]);
            $copy = $stmt->fetch();

            if (!$copy || $copy['user_id'] != $userId) {
                jsonResponse(false, null, 'Not authorized');
            }

            // Link copy to edition
            $stmt = $db->prepare("UPDATE copies SET edition_id = ? WHERE id = ? AND user_id = ?");
            $stmt->execute([$editionId, $copyId, $userId]);

            // Get all edition components
            $stmt = $db->prepare("SELECT id FROM edition_components WHERE edition_id = ?");
            $stmt->execute([$editionId]);
            $editionComponents = $stmt->fetchAll();

            // Create copy_component records (default: all present, good condition)
            $insertStmt = $db->prepare("
                INSERT OR IGNORE INTO copy_components (copy_id, edition_component_id, is_present, condition)
                VALUES (?, ?, 1, 'Good')
            ");
            foreach ($editionComponents as $comp) {
                $insertStmt->execute([$copyId, $comp['id']]);
            }

            logAction($db, $userId, 'copy_edition_linked', 'copy', $copyId);
            jsonResponse(true, ['linked' => true, 'components_initialized' => count($editionComponents)]);
            break;

        case 'unlink_copy_edition':
            // Remove a copy's link to an edition (and clean up component tracking)
            $copyId = intval($input['copy_id'] ?? 0);

            if (empty($copyId)) {
                jsonResponse(false, null, 'Copy ID required');
            }

            // Verify ownership
            $stmt = $db->prepare("SELECT user_id FROM copies WHERE id = ?");
            $stmt->execute([$copyId]);
            $copy = $stmt->fetch();

            if (!$copy || $copy['user_id'] != $userId) {
                jsonResponse(false, null, 'Not authorized');
            }

            // Remove component tracking records
            $stmt = $db->prepare("DELETE FROM copy_components WHERE copy_id = ?");
            $stmt->execute([$copyId]);

            // Unlink edition
            $stmt = $db->prepare("UPDATE copies SET edition_id = NULL WHERE id = ? AND user_id = ?");
            $stmt->execute([$copyId, $userId]);

            jsonResponse(true, ['unlinked' => true]);
            break;

        // ========================================
        // UMDB — Physical Releases & External ID Lookup
        // ========================================

        case 'find_by_external_id':
            // Lookup a movie/TV show by IMDb or TMDB ID via UMDB
            $externalId = sanitize($input['external_id'] ?? '', 30);
            $externalSource = sanitize($input['external_source'] ?? 'imdb_id', 30);

            if (empty($externalId)) {
                jsonResponse(false, null, 'External ID required');
            }

            $umdbData = umdbFetch('/find/' . urlencode($externalId) . '?external_source=' . urlencode($externalSource));

            if ($umdbData === false) {
                jsonResponse(false, null, 'UMDB find request failed');
            }

            jsonResponse(true, $umdbData);
            break;

        case 'get_releases':
            // Get all physical releases for a UMDB movie
            $umdbId = sanitize($input['umdb_id'] ?? '', 30);

            if (empty($umdbId)) {
                jsonResponse(false, null, 'UMDB ID required');
            }

            $umdbData = umdbFetch('/movie/' . urlencode($umdbId) . '/releases');

            if ($umdbData === false) {
                jsonResponse(false, null, 'Failed to fetch releases from UMDB');
            }

            jsonResponse(true, $umdbData);
            break;

        case 'get_release':
            // Get a single release detail by release ID
            $releaseId = sanitize($input['release_id'] ?? '', 30);

            if (empty($releaseId)) {
                jsonResponse(false, null, 'Release ID required');
            }

            $umdbData = umdbFetch('/releases/' . urlencode($releaseId));

            if ($umdbData === false) {
                jsonResponse(false, null, 'Failed to fetch release from UMDB');
            }

            jsonResponse(true, $umdbData);
            break;

        case 'search_releases':
            // Search physical releases by title and optional format
            $query = sanitize($input['query'] ?? '', 100);
            $format = sanitize($input['format'] ?? '', 50);

            if (empty($query)) {
                jsonResponse(false, null, 'Search query required');
            }

            $params = 'query=' . urlencode($query);
            if (!empty($format)) {
                $params .= '&format=' . urlencode($format);
            }

            $umdbData = umdbFetch('/search/releases?' . $params);

            if ($umdbData === false) {
                jsonResponse(false, null, 'UMDB release search failed');
            }

            jsonResponse(true, $umdbData);
            break;

        // ========================================
        // UMDB TWO-WAY SYNC (v4.1.0)
        // Import, push, sync, and link editions
        // ========================================

        case 'import_umdb_release':
            // Pull a UMDB release into a local media_edition, storing the rel-{uuid} link
            $releaseId = sanitize($input['release_id'] ?? '', 80);
            $movieId = intval($input['movie_id'] ?? 0);

            if (empty($releaseId) || empty($movieId)) {
                jsonResponse(false, null, 'UMDB release ID and movie ID required');
            }

            // Check if this release is already imported
            $stmt = $db->prepare("SELECT id FROM media_editions WHERE umdb_release_id = ?");
            $stmt->execute([$releaseId]);
            $existing = $stmt->fetch();
            if ($existing) {
                jsonResponse(false, null, 'This UMDB release is already imported as edition #' . $existing['id']);
            }

            // Verify movie exists locally
            $stmt = $db->prepare("SELECT id FROM movies WHERE id = ?");
            $stmt->execute([$movieId]);
            if (!$stmt->fetch()) {
                jsonResponse(false, null, 'Movie not found');
            }

            // Fetch release data from UMDB
            $umdbRelease = umdbFetch('/releases/' . urlencode($releaseId));
            if (!$umdbRelease) {
                jsonResponse(false, null, 'Failed to fetch release from UMDB');
            }

            // Map UMDB release fields to local media_edition
            $name = sanitize($umdbRelease['name'] ?? $umdbRelease['title'] ?? 'Imported Release', 200);
            $format = sanitize($umdbRelease['format'] ?? '', 50);
            $packageType = sanitize($umdbRelease['package_type'] ?? '', 50);
            $region = sanitize($umdbRelease['region'] ?? '', 50);
            $barcode = sanitize($umdbRelease['barcode'] ?? $umdbRelease['upc'] ?? '', 50);
            $releaseDate = sanitize($umdbRelease['release_date'] ?? '', 20);
            $distributor = sanitize($umdbRelease['distributor'] ?? $umdbRelease['label'] ?? '', 200);
            $country = sanitize($umdbRelease['country'] ?? '', 100);
            $discCount = intval($umdbRelease['disc_count'] ?? $umdbRelease['discs'] ?? 1);
            $notes = sanitize($umdbRelease['notes'] ?? '', 500);

            $stmt = $db->prepare("
                INSERT INTO media_editions (movie_id, umdb_release_id, name, format, package_type, region, barcode, release_date, distributor, country, disc_count, notes, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $movieId, $releaseId, $name, $format ?: null, $packageType ?: null, $region ?: null,
                $barcode ?: null, $releaseDate ?: null, $distributor ?: null, $country ?: null,
                $discCount, $notes ?: null, $userId
            ]);

            $editionId = $db->lastInsertId();

            // Import components if UMDB provides them
            $components = $umdbRelease['components'] ?? $umdbRelease['contents'] ?? [];
            if (!empty($components) && is_array($components)) {
                $compStmt = $db->prepare("
                    INSERT INTO edition_components (edition_id, component_type, component_name, description, position)
                    VALUES (?, ?, ?, ?, ?)
                ");
                foreach ($components as $i => $comp) {
                    $compStmt->execute([
                        $editionId,
                        sanitize($comp['component_type'] ?? $comp['type'] ?? 'other', 50),
                        sanitize($comp['component_name'] ?? $comp['name'] ?? 'Component', 200),
                        sanitize($comp['description'] ?? '', 500),
                        intval($comp['position'] ?? $i)
                    ]);
                }
            }

            logAction($db, $userId, 'umdb_release_imported', 'media_edition', $editionId, [
                'umdb_release_id' => $releaseId
            ]);
            jsonResponse(true, [
                'edition_id' => $editionId,
                'umdb_release_id' => $releaseId,
                'components_imported' => count($components)
            ]);
            break;

        case 'push_edition_to_umdb':
            // Push a locally-created edition to UMDB and store the returned rel-{uuid}
            if (empty(UMDB_API_KEY)) {
                jsonResponse(false, null, 'UMDB_API_KEY is not configured. Set it in Railway environment variables to enable pushing editions to UMDB.');
            }

            $editionId = intval($input['edition_id'] ?? 0);

            if (empty($editionId)) {
                jsonResponse(false, null, 'Edition ID required');
            }

            // Get the local edition (include extra movie fields for auto-creation in UMDB)
            $stmt = $db->prepare("
                SELECT me.*, m.tmdb_id, m.imdb_id, m.title as movie_title,
                       m.year as movie_year, m.poster_url, m.overview, m.runtime,
                       m.director, m.genre, m.rating as movie_rating,
                       m.media_type, m.certification
                FROM media_editions me
                JOIN movies m ON m.id = me.movie_id
                WHERE me.id = ?
            ");
            $stmt->execute([$editionId]);
            $edition = $stmt->fetch();

            if (!$edition) {
                jsonResponse(false, null, 'Edition not found');
            }

            if (!empty($edition['umdb_release_id'])) {
                jsonResponse(false, null, 'This edition is already linked to UMDB release: ' . $edition['umdb_release_id']);
            }

            // Get components
            $stmt = $db->prepare("SELECT * FROM edition_components WHERE edition_id = ? ORDER BY position ASC");
            $stmt->execute([$editionId]);
            $localComponents = $stmt->fetchAll();

            // Build UMDB release payload
            $payload = [
                'name' => $edition['name'],
                'format' => $edition['format'],
                'package_type' => $edition['package_type'],
                'region' => $edition['region'],
                'barcode' => $edition['barcode'],
                'release_date' => $edition['release_date'],
                'distributor' => $edition['distributor'],
                'country' => $edition['country'],
                'disc_count' => intval($edition['disc_count']),
                'notes' => $edition['notes'],
            ];

            // Include external IDs for UMDB to link the movie
            if (!empty($edition['tmdb_id'])) {
                if (isUmdbId($edition['tmdb_id'])) {
                    // Movie was imported from UMDB — send the UMDB movie ID so it can resolve
                    $payload['movie_id'] = $edition['tmdb_id'];
                } else {
                    $payload['tmdb_id'] = $edition['tmdb_id'];
                }
            }
            if (!empty($edition['imdb_id'])) {
                $payload['imdb_id'] = $edition['imdb_id'];
            }

            // Include components
            if (!empty($localComponents)) {
                $payload['components'] = array_map(function($c) {
                    return [
                        'type' => $c['component_type'],
                        'name' => $c['component_name'],
                        'description' => $c['description'],
                        'position' => intval($c['position']),
                    ];
                }, $localComponents);
            }

            $movieAutoCreated = false;
            $umdbResult = umdbPost('/releases', $payload);

            if (!$umdbResult) {
                $detail = $GLOBALS['_umdb_last_error'] ?? '';

                // If 422 because movie isn't in UMDB, auto-create the movie and retry
                if (strpos($detail, '422') !== false && strpos($detail, 'Could not resolve movie') !== false) {
                    // Build movie payload from local data
                    $moviePayload = [
                        'title' => $edition['movie_title'],
                        'year' => intval($edition['movie_year'] ?? 0),
                        'overview' => $edition['overview'] ?? '',
                        'runtime' => intval($edition['runtime'] ?? 0),
                        'director' => $edition['director'] ?? '',
                        'genre' => $edition['genre'] ?? '',
                        'rating' => floatval($edition['movie_rating'] ?? 0),
                        'media_type' => $edition['media_type'] ?: 'movie',
                        'certification' => $edition['certification'] ?? '',
                        'poster_url' => $edition['poster_url'] ?? '',
                    ];
                    if (!empty($edition['tmdb_id']) && !isUmdbId($edition['tmdb_id'])) {
                        $moviePayload['tmdb_id'] = $edition['tmdb_id'];
                    }
                    if (!empty($edition['imdb_id'])) {
                        $moviePayload['imdb_id'] = $edition['imdb_id'];
                    }

                    $GLOBALS['_umdb_last_error'] = null;
                    $movieResult = umdbPost('/movies', $moviePayload);

                    if ($movieResult && !empty($movieResult['id'])) {
                        // Movie created — retry release push with the new UMDB movie ID
                        $payload['movie_id'] = $movieResult['id'];
                        unset($payload['tmdb_id']);
                        unset($payload['imdb_id']);

                        $GLOBALS['_umdb_last_error'] = null;
                        $umdbResult = umdbPost('/releases', $payload);

                        if (!$umdbResult) {
                            $retryDetail = $GLOBALS['_umdb_last_error'] ?? '';
                            jsonResponse(false, null, 'Movie was added to UMDB but edition push failed' . ($retryDetail ? " — $retryDetail" : ''));
                        }
                        $movieAutoCreated = true;
                        // $umdbResult is now set — fall through to success handling below
                    } else {
                        $movieErr = $GLOBALS['_umdb_last_error'] ?? '';
                        jsonResponse(false, null, 'Could not auto-add movie to UMDB' . ($movieErr ? " — $movieErr" : '') . '. Original error: ' . $detail);
                    }
                } else {
                    $msg = 'Failed to push edition to UMDB';
                    $msg .= $detail ? " — $detail" : ' — the UMDB service may be unavailable';
                    jsonResponse(false, null, $msg);
                }
            }

            // API returns { "duplicate": bool, "edition": { "id": "rel-...", ... } }
            $isDuplicate = !empty($umdbResult['duplicate']);
            $editionData = $umdbResult['edition'] ?? null;

            // Extract the rel-{uuid} from the nested edition object, with fallbacks
            $umdbReleaseId = null;
            if ($editionData && is_array($editionData)) {
                $umdbReleaseId = $editionData['id'] ?? $editionData['release_id'] ?? null;
            }
            // Fallback: check top-level keys for backwards compatibility
            if (empty($umdbReleaseId)) {
                $umdbReleaseId = $umdbResult['id'] ?? $umdbResult['release_id'] ?? null;
            }

            if (empty($umdbReleaseId)) {
                jsonResponse(false, null, 'UMDB did not return a release ID');
            }

            // Store the link
            $stmt = $db->prepare("UPDATE media_editions SET umdb_release_id = ?, updated_at = datetime('now') WHERE id = ?");
            $stmt->execute([$umdbReleaseId, $editionId]);

            logAction($db, $userId, 'edition_pushed_to_umdb', 'media_edition', $editionId, [
                'umdb_release_id' => $umdbReleaseId,
                'duplicate' => $isDuplicate,
                'movie_auto_created' => $movieAutoCreated
            ]);
            jsonResponse(true, [
                'edition_id' => $editionId,
                'umdb_release_id' => $umdbReleaseId,
                'duplicate' => $isDuplicate,
                'movie_auto_created' => $movieAutoCreated
            ]);
            break;

        case 'sync_edition_from_umdb':
            // Re-pull data from UMDB for an already-linked edition
            $editionId = intval($input['edition_id'] ?? 0);

            if (empty($editionId)) {
                jsonResponse(false, null, 'Edition ID required');
            }

            $stmt = $db->prepare("SELECT * FROM media_editions WHERE id = ?");
            $stmt->execute([$editionId]);
            $edition = $stmt->fetch();

            if (!$edition) {
                jsonResponse(false, null, 'Edition not found');
            }

            if (empty($edition['umdb_release_id'])) {
                jsonResponse(false, null, 'This edition is not linked to UMDB');
            }

            // Fetch fresh data from UMDB
            $umdbRelease = umdbFetch('/releases/' . urlencode($edition['umdb_release_id']));
            if (!$umdbRelease) {
                jsonResponse(false, null, 'Failed to fetch release from UMDB');
            }

            // Update local edition with UMDB data
            $stmt = $db->prepare("
                UPDATE media_editions
                SET name = ?, format = ?, package_type = ?, region = ?, barcode = ?,
                    release_date = ?, distributor = ?, country = ?, disc_count = ?, notes = ?,
                    updated_at = datetime('now')
                WHERE id = ?
            ");
            $stmt->execute([
                sanitize($umdbRelease['name'] ?? $umdbRelease['title'] ?? $edition['name'], 200),
                sanitize($umdbRelease['format'] ?? $edition['format'] ?? '', 50) ?: null,
                sanitize($umdbRelease['package_type'] ?? $edition['package_type'] ?? '', 50) ?: null,
                sanitize($umdbRelease['region'] ?? $edition['region'] ?? '', 50) ?: null,
                sanitize($umdbRelease['barcode'] ?? $umdbRelease['upc'] ?? $edition['barcode'] ?? '', 50) ?: null,
                sanitize($umdbRelease['release_date'] ?? $edition['release_date'] ?? '', 20) ?: null,
                sanitize($umdbRelease['distributor'] ?? $umdbRelease['label'] ?? $edition['distributor'] ?? '', 200) ?: null,
                sanitize($umdbRelease['country'] ?? $edition['country'] ?? '', 100) ?: null,
                intval($umdbRelease['disc_count'] ?? $umdbRelease['discs'] ?? $edition['disc_count'] ?? 1),
                sanitize($umdbRelease['notes'] ?? $edition['notes'] ?? '', 500) ?: null,
                $editionId
            ]);

            // Sync components: merge UMDB components with existing local ones
            $umdbComponents = $umdbRelease['components'] ?? $umdbRelease['contents'] ?? [];
            $componentsAdded = 0;

            if (!empty($umdbComponents) && is_array($umdbComponents)) {
                // Get existing component names to avoid duplicates
                $stmt = $db->prepare("SELECT component_name FROM edition_components WHERE edition_id = ?");
                $stmt->execute([$editionId]);
                $existingNames = array_column($stmt->fetchAll(), 'component_name');

                $compStmt = $db->prepare("
                    INSERT INTO edition_components (edition_id, component_type, component_name, description, position)
                    VALUES (?, ?, ?, ?, ?)
                ");
                foreach ($umdbComponents as $i => $comp) {
                    $compName = sanitize($comp['component_name'] ?? $comp['name'] ?? 'Component', 200);
                    if (!in_array($compName, $existingNames)) {
                        $compStmt->execute([
                            $editionId,
                            sanitize($comp['component_type'] ?? $comp['type'] ?? 'other', 50),
                            $compName,
                            sanitize($comp['description'] ?? '', 500),
                            intval($comp['position'] ?? $i)
                        ]);
                        $componentsAdded++;
                    }
                }
            }

            logAction($db, $userId, 'edition_synced_from_umdb', 'media_edition', $editionId, [
                'umdb_release_id' => $edition['umdb_release_id'],
                'components_added' => $componentsAdded
            ]);
            jsonResponse(true, [
                'edition_id' => $editionId,
                'umdb_release_id' => $edition['umdb_release_id'],
                'components_added' => $componentsAdded
            ]);
            break;

        case 'link_edition_to_umdb':
            // Manually link an existing local edition to a UMDB release ID
            $editionId = intval($input['edition_id'] ?? 0);
            $releaseId = sanitize($input['release_id'] ?? '', 80);

            if (empty($editionId) || empty($releaseId)) {
                jsonResponse(false, null, 'Edition ID and UMDB release ID required');
            }

            // Verify edition exists
            $stmt = $db->prepare("SELECT id, umdb_release_id FROM media_editions WHERE id = ?");
            $stmt->execute([$editionId]);
            $edition = $stmt->fetch();

            if (!$edition) {
                jsonResponse(false, null, 'Edition not found');
            }

            // Check this release ID isn't already used by another edition
            $stmt = $db->prepare("SELECT id FROM media_editions WHERE umdb_release_id = ? AND id != ?");
            $stmt->execute([$releaseId, $editionId]);
            if ($stmt->fetch()) {
                jsonResponse(false, null, 'This UMDB release is already linked to another edition');
            }

            // Verify the release exists on UMDB
            $umdbRelease = umdbFetch('/releases/' . urlencode($releaseId));
            if (!$umdbRelease) {
                jsonResponse(false, null, 'UMDB release not found — verify the release ID');
            }

            $stmt = $db->prepare("UPDATE media_editions SET umdb_release_id = ?, updated_at = datetime('now') WHERE id = ?");
            $stmt->execute([$releaseId, $editionId]);

            logAction($db, $userId, 'edition_linked_to_umdb', 'media_edition', $editionId, [
                'umdb_release_id' => $releaseId
            ]);
            jsonResponse(true, [
                'edition_id' => $editionId,
                'umdb_release_id' => $releaseId
            ]);
            break;

        case 'unlink_edition_from_umdb':
            // Remove the UMDB link from a local edition (keeps local data)
            $editionId = intval($input['edition_id'] ?? 0);

            if (empty($editionId)) {
                jsonResponse(false, null, 'Edition ID required');
            }

            $stmt = $db->prepare("SELECT id, umdb_release_id FROM media_editions WHERE id = ?");
            $stmt->execute([$editionId]);
            $edition = $stmt->fetch();

            if (!$edition) {
                jsonResponse(false, null, 'Edition not found');
            }

            $stmt = $db->prepare("UPDATE media_editions SET umdb_release_id = NULL, updated_at = datetime('now') WHERE id = ?");
            $stmt->execute([$editionId]);

            logAction($db, $userId, 'edition_unlinked_from_umdb', 'media_edition', $editionId, [
                'old_umdb_release_id' => $edition['umdb_release_id']
            ]);
            jsonResponse(true, ['edition_id' => $editionId, 'unlinked' => true]);
            break;

        case 'seed_fight_club_test':
            // Admin-only: Create 3 Fight Club editions for testing
            if (!$currentUser['is_admin']) {
                jsonResponse(false, null, 'Admin access required');
            }

            $tmdbId = '550'; // Fight Club TMDB ID

            // 1. Find or create the Fight Club movie
            $stmt = $db->prepare("SELECT id FROM movies WHERE tmdb_id = ?");
            $stmt->execute([$tmdbId]);
            $movie = $stmt->fetch();

            if (!$movie) {
                $detail = buildDetailUrl($tmdbId, 'movie', 'credits,release_dates');
                $response = fetchUrl($detail['url'], $detail['headers']);
                if ($response === false) {
                    jsonResponse(false, null, 'Failed to fetch Fight Club from TMDB');
                }
                $data = json_decode($response, true);
                $genres = implode(', ', array_column($data['genres'] ?? [], 'name'));
                $director = '';
                foreach (($data['credits']['crew'] ?? []) as $person) {
                    if ($person['job'] === 'Director') { $director = $person['name']; break; }
                }
                $actors = implode(', ', array_column(array_slice($data['credits']['cast'] ?? [], 0, 5), 'name'));
                $studio = $data['production_companies'][0]['name'] ?? '';
                $certification = '';
                foreach (($data['release_dates']['results'] ?? []) as $country) {
                    if ($country['iso_3166_1'] === 'US') {
                        foreach ($country['release_dates'] as $rel) {
                            if (!empty($rel['certification'])) { $certification = $rel['certification']; break 2; }
                        }
                    }
                }
                $stmt = $db->prepare("
                    INSERT INTO movies (tmdb_id, title, year, poster_url, overview, rating, runtime, genre, director, actors, studio, certification, media_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'movie')
                ");
                $stmt->execute([
                    $tmdbId, $data['title'],
                    intval(substr($data['release_date'] ?? '', 0, 4)),
                    resolveImageUrl($data['poster_path'] ?? null),
                    $data['overview'] ?? null, $data['vote_average'] ?? null,
                    $data['runtime'] ?? null, $genres, $director, $actors, $studio, $certification
                ]);
                $movieId = $db->lastInsertId();
            } else {
                $movieId = $movie['id'];
            }

            // 2. Define the 3 editions
            $editions = [
                [
                    'name'         => 'Fight Club DVD (1999)',
                    'format'       => 'DVD',
                    'package_type' => 'Keep Case',
                    'region'       => 'Region 1',
                    'country'      => 'US',
                    'distributor'  => '20th Century Fox',
                    'disc_count'   => 1,
                    'barcode'      => '024543005483',
                    'release_date' => '2000-06-06',
                    'notes'        => 'Standard DVD release',
                    'copy_format'  => 'DVD',
                    'copy_edition' => '',
                    'copy_condition'=> 'Good',
                    'copy_extras'  => ['aspect_ratio' => 'Widescreen', 'feature_count' => 'Single'],
                    'components'   => [
                        ['type' => 'disc',   'name' => 'Feature Film DVD'],
                        ['type' => 'case',   'name' => 'Keep Case'],
                        ['type' => 'insert', 'name' => 'Chapter Insert'],
                    ],
                ],
                [
                    'name'         => 'Fight Club Steelbook',
                    'format'       => 'Blu-ray',
                    'package_type' => 'Steelbook',
                    'region'       => 'Region A',
                    'country'      => 'US',
                    'distributor'  => '20th Century Fox',
                    'disc_count'   => 1,
                    'barcode'      => '024543656159',
                    'release_date' => '2014-10-07',
                    'notes'        => 'Steelbook edition with collector booklet',
                    'copy_format'  => 'Blu-ray',
                    'copy_edition' => '',
                    'copy_condition'=> 'Like New',
                    'copy_extras'  => ['aspect_ratio' => 'Widescreen', 'feature_count' => 'Single', 'has_booklet' => 1],
                    'components'   => [
                        ['type' => 'disc',     'name' => 'Feature Film Blu-ray'],
                        ['type' => 'case',     'name' => 'Steelbook Case'],
                        ['type' => 'booklet',  'name' => 'Collector\'s Booklet'],
                    ],
                ],
                [
                    'name'         => 'Fight Club 10th Anniversary Collector\'s Edition',
                    'format'       => 'Blu-ray',
                    'package_type' => 'Digipack',
                    'region'       => 'Region A',
                    'country'      => 'US',
                    'distributor'  => '20th Century Fox',
                    'disc_count'   => 2,
                    'barcode'      => '024543622543',
                    'release_date' => '2009-11-10',
                    'notes'        => 'Collector\'s Edition with bonus disc, booklet, and slipcover sleeve',
                    'copy_format'  => 'Blu-ray',
                    'copy_edition' => "Collector's Edition",
                    'copy_condition'=> 'Mint',
                    'copy_extras'  => [
                        'aspect_ratio' => 'Widescreen', 'feature_count' => 'Single + Bonus',
                        'has_booklet' => 1, 'has_slipcover' => 1, 'has_bonus_disc' => 1, 'bonus_disc_count' => 1
                    ],
                    'components'   => [
                        ['type' => 'disc',      'name' => 'Feature Film Blu-ray'],
                        ['type' => 'disc',      'name' => 'Bonus Features Disc'],
                        ['type' => 'booklet',   'name' => 'Collector\'s Booklet'],
                        ['type' => 'slipcover', 'name' => 'Slipcover Sleeve'],
                        ['type' => 'case',      'name' => 'Digipack Case'],
                    ],
                ],
            ];

            $results = [];

            foreach ($editions as $ed) {
                // Check if edition already exists (by name + movie)
                $chk = $db->prepare("SELECT id FROM media_editions WHERE movie_id = ? AND name = ?");
                $chk->execute([$movieId, $ed['name']]);
                $existing = $chk->fetch();

                if ($existing) {
                    $editionId = $existing['id'];
                } else {
                    // Create edition
                    $stmt = $db->prepare("
                        INSERT INTO media_editions (movie_id, name, format, package_type, region, barcode, release_date, distributor, country, disc_count, notes, created_by)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ");
                    $stmt->execute([
                        $movieId, $ed['name'], $ed['format'], $ed['package_type'],
                        $ed['region'], $ed['barcode'], $ed['release_date'],
                        $ed['distributor'], $ed['country'], $ed['disc_count'],
                        $ed['notes'], $userId
                    ]);
                    $editionId = $db->lastInsertId();

                    // Create components
                    $compStmt = $db->prepare("
                        INSERT INTO edition_components (edition_id, component_type, component_name, position)
                        VALUES (?, ?, ?, ?)
                    ");
                    foreach ($ed['components'] as $i => $comp) {
                        $compStmt->execute([$editionId, $comp['type'], $comp['name'], $i]);
                    }
                }

                // Create copy linked to edition
                $extras = $ed['copy_extras'];
                $stmt = $db->prepare("
                    INSERT INTO copies (user_id, movie_id, edition_id, format, edition, region, condition,
                        aspect_ratio, package_type, feature_count,
                        has_slipcover, has_booklet, has_bonus_disc, bonus_disc_count, has_digital_copy, has_3d)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
                ");
                $stmt->execute([
                    $userId, $movieId, $editionId,
                    $ed['copy_format'], $ed['copy_edition'], $ed['region'], $ed['copy_condition'],
                    $extras['aspect_ratio'] ?? null, $ed['package_type'] ?? null,
                    $extras['feature_count'] ?? 'Single',
                    intval($extras['has_slipcover'] ?? 0), intval($extras['has_booklet'] ?? 0),
                    intval($extras['has_bonus_disc'] ?? 0), intval($extras['bonus_disc_count'] ?? 0)
                ]);
                $copyId = $db->lastInsertId();

                // Initialize copy_components (mark all as present)
                $compStmt = $db->prepare("SELECT id FROM edition_components WHERE edition_id = ?");
                $compStmt->execute([$editionId]);
                $editionComps = $compStmt->fetchAll();
                $initStmt = $db->prepare("
                    INSERT OR IGNORE INTO copy_components (copy_id, edition_component_id, is_present, condition)
                    VALUES (?, ?, 1, ?)
                ");
                foreach ($editionComps as $comp) {
                    $initStmt->execute([$copyId, $comp['id'], $ed['copy_condition']]);
                }

                logAction($db, $userId, 'copy_added', 'copy', $copyId);

                $results[] = [
                    'edition_name' => $ed['name'],
                    'edition_id'   => $editionId,
                    'copy_id'      => $copyId,
                    'components'   => count($ed['components']),
                ];
            }

            jsonResponse(true, [
                'movie_id' => $movieId,
                'editions' => $results,
                'message'  => 'Created 3 Fight Club test editions with copies and component tracking'
            ]);
            break;

        // ================================================================
        // SHELF LAYOUT PROFILES (v5.0.0)
        // ================================================================

        case 'list_shelf_layouts':
            // Return all layout profiles for the current user
            $stmt = $db->prepare("
                SELECT slp.*, COUNT(sle.id) as entry_count
                FROM shelf_layout_profiles slp
                LEFT JOIN shelf_layout_entries sle ON slp.id = sle.layout_id
                WHERE slp.user_id = ?
                GROUP BY slp.id
                ORDER BY slp.created_at ASC
            ");
            $stmt->execute([$userId]);
            $layouts = $stmt->fetchAll();
            jsonResponse(true, $layouts);
            break;

        case 'create_shelf_layout':
            $layoutName = sanitize($input['name'] ?? '', 100);
            if (empty($layoutName)) {
                jsonResponse(false, null, 'Layout name required');
            }
            // Deactivate any current active layout
            $db->prepare("UPDATE shelf_layout_profiles SET is_active = 0 WHERE user_id = ?")->execute([$userId]);
            $stmt = $db->prepare("
                INSERT INTO shelf_layout_profiles (user_id, name, is_active)
                VALUES (?, ?, 1)
            ");
            $stmt->execute([$userId, $layoutName]);
            $layoutId = $db->lastInsertId();
            jsonResponse(true, ['layout_id' => $layoutId, 'name' => $layoutName]);
            break;

        case 'create_empty_layout':
            // Create a blank layout profile with no entries (no cloning of shelves or entries)
            $layoutName = sanitize($input['name'] ?? '', 100);
            if (empty($layoutName)) {
                jsonResponse(false, null, 'Layout name required');
            }
            $setActive = !empty($input['set_active']);
            if ($setActive) {
                $db->prepare("UPDATE shelf_layout_profiles SET is_active = 0 WHERE user_id = ?")->execute([$userId]);
            }
            $stmt = $db->prepare("
                INSERT INTO shelf_layout_profiles (user_id, name, is_active)
                VALUES (?, ?, ?)
            ");
            $stmt->execute([$userId, $layoutName, $setActive ? 1 : 0]);
            $newLayoutId = $db->lastInsertId();
            jsonResponse(true, ['layout_id' => $newLayoutId, 'name' => $layoutName, 'is_active' => $setActive]);
            break;

        case 'rename_shelf_layout':
            $layoutId = intval($input['layout_id'] ?? 0);
            $layoutName = sanitize($input['name'] ?? '', 100);
            if (!$layoutId || empty($layoutName)) {
                jsonResponse(false, null, 'Layout ID and name required');
            }
            $stmt = $db->prepare("SELECT user_id FROM shelf_layout_profiles WHERE id = ?");
            $stmt->execute([$layoutId]);
            $layout = $stmt->fetch();
            if (!$layout || $layout['user_id'] != $userId) {
                jsonResponse(false, null, 'Layout not found or access denied');
            }
            $db->prepare("UPDATE shelf_layout_profiles SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$layoutName, $layoutId]);
            jsonResponse(true, ['layout_id' => $layoutId]);
            break;

        case 'delete_shelf_layout':
            $layoutId = intval($input['layout_id'] ?? 0);
            if (!$layoutId) {
                jsonResponse(false, null, 'Layout ID required');
            }
            $stmt = $db->prepare("SELECT user_id, is_active FROM shelf_layout_profiles WHERE id = ?");
            $stmt->execute([$layoutId]);
            $layout = $stmt->fetch();
            if (!$layout || $layout['user_id'] != $userId) {
                jsonResponse(false, null, 'Layout not found or access denied');
            }
            $db->prepare("DELETE FROM shelf_layout_profiles WHERE id = ?")->execute([$layoutId]);
            jsonResponse(true, ['deleted' => $layoutId]);
            break;

        case 'set_active_shelf_layout':
            // layout_id = integer to activate, or null/"" to revert to default (no active layout)
            $layoutId = isset($input['layout_id']) && $input['layout_id'] !== '' ? intval($input['layout_id']) : null;
            // Deactivate all layouts for this user first
            $db->prepare("UPDATE shelf_layout_profiles SET is_active = 0 WHERE user_id = ?")->execute([$userId]);
            if ($layoutId !== null) {
                $stmt = $db->prepare("SELECT user_id FROM shelf_layout_profiles WHERE id = ?");
                $stmt->execute([$layoutId]);
                $layout = $stmt->fetch();
                if (!$layout || $layout['user_id'] != $userId) {
                    jsonResponse(false, null, 'Layout not found or access denied');
                }
                $db->prepare("UPDATE shelf_layout_profiles SET is_active = 1 WHERE id = ?")->execute([$layoutId]);
            }
            jsonResponse(true, ['active_layout_id' => $layoutId]);
            break;

        case 'duplicate_shelf_layout':
            $layoutId = intval($input['layout_id'] ?? 0);
            $newName = sanitize($input['name'] ?? '', 100);
            if (!$layoutId) {
                jsonResponse(false, null, 'Layout ID required');
            }
            $stmt = $db->prepare("SELECT * FROM shelf_layout_profiles WHERE id = ? AND user_id = ?");
            $stmt->execute([$layoutId, $userId]);
            $srcLayout = $stmt->fetch();
            if (!$srcLayout) {
                jsonResponse(false, null, 'Layout not found or access denied');
            }
            $copyName = $newName ?: ($srcLayout['name'] . ' (copy)');
            $db->prepare("INSERT INTO shelf_layout_profiles (user_id, name, is_active) VALUES (?, ?, 0)")
               ->execute([$userId, $copyName]);
            $newLayoutId = $db->lastInsertId();
            // Copy entries
            $stmt = $db->prepare("SELECT * FROM shelf_layout_entries WHERE layout_id = ?");
            $stmt->execute([$layoutId]);
            $entries = $stmt->fetchAll();
            $ins = $db->prepare("INSERT INTO shelf_layout_entries (layout_id, shelf_id, copy_id, container_id, is_container, position_in_shelf) VALUES (?, ?, ?, ?, ?, ?)");
            foreach ($entries as $e) {
                $ins->execute([$newLayoutId, $e['shelf_id'], $e['copy_id'], $e['container_id'], $e['is_container'], $e['position_in_shelf']]);
            }
            jsonResponse(true, ['layout_id' => $newLayoutId, 'name' => $copyName]);
            break;

        case 'save_current_to_layout':
            // Snapshot current shelf_assignments into the given layout (overwrites existing entries)
            $layoutId = intval($input['layout_id'] ?? 0);
            if (!$layoutId) {
                jsonResponse(false, null, 'Layout ID required');
            }
            $stmt = $db->prepare("SELECT user_id FROM shelf_layout_profiles WHERE id = ?");
            $stmt->execute([$layoutId]);
            $layout = $stmt->fetch();
            if (!$layout || $layout['user_id'] != $userId) {
                jsonResponse(false, null, 'Layout not found or access denied');
            }
            // Clear existing entries for this layout
            $db->prepare("DELETE FROM shelf_layout_entries WHERE layout_id = ?")->execute([$layoutId]);
            // Copy current shelf_assignments (only for shelves owned by this user)
            $stmt = $db->prepare("
                SELECT sa.shelf_id, sa.copy_id, sa.container_id, sa.is_container, sa.position_in_shelf
                FROM shelf_assignments sa
                JOIN shelves s ON sa.shelf_id = s.id
                WHERE s.user_id = ?
                ORDER BY sa.shelf_id, sa.position_in_shelf
            ");
            $stmt->execute([$userId]);
            $assignments = $stmt->fetchAll();
            $ins = $db->prepare("INSERT INTO shelf_layout_entries (layout_id, shelf_id, copy_id, container_id, is_container, position_in_shelf) VALUES (?, ?, ?, ?, ?, ?)");
            foreach ($assignments as $a) {
                $ins->execute([$layoutId, $a['shelf_id'], $a['copy_id'], $a['container_id'], $a['is_container'], $a['position_in_shelf']]);
            }
            $db->prepare("UPDATE shelf_layout_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$layoutId]);
            jsonResponse(true, ['saved' => count($assignments)]);
            break;

        case 'apply_shelf_layout':
            // Apply a saved layout: replace shelf_assignments with entries from this layout
            $layoutId = intval($input['layout_id'] ?? 0);
            if (!$layoutId) {
                jsonResponse(false, null, 'Layout ID required');
            }
            $stmt = $db->prepare("SELECT user_id FROM shelf_layout_profiles WHERE id = ?");
            $stmt->execute([$layoutId]);
            $layout = $stmt->fetch();
            if (!$layout || $layout['user_id'] != $userId) {
                jsonResponse(false, null, 'Layout not found or access denied');
            }
            // Get entries for this layout
            $stmt = $db->prepare("SELECT * FROM shelf_layout_entries WHERE layout_id = ? ORDER BY shelf_id, position_in_shelf");
            $stmt->execute([$layoutId]);
            $entries = $stmt->fetchAll();

            $db->beginTransaction();
            try {
                // Remove all current assignments for this user's shelves
                $stmt = $db->prepare("
                    DELETE FROM shelf_assignments
                    WHERE shelf_id IN (SELECT id FROM shelves WHERE user_id = ?)
                ");
                $stmt->execute([$userId]);
                // Reinsert from layout entries
                $ins = $db->prepare("
                    INSERT OR REPLACE INTO shelf_assignments (shelf_id, copy_id, container_id, is_container, position_in_shelf)
                    VALUES (?, ?, ?, ?, ?)
                ");
                foreach ($entries as $e) {
                    $ins->execute([$e['shelf_id'], $e['copy_id'], $e['container_id'], $e['is_container'], $e['position_in_shelf']]);
                }
                $db->commit();
            } catch (Exception $ex) {
                $db->rollBack();
                jsonResponse(false, null, 'Failed to apply layout: ' . $ex->getMessage());
            }
            jsonResponse(true, ['applied' => count($entries)]);
            break;

        case 'get_active_shelf_layout':
            // Return the active layout id and name for this user (or null)
            $stmt = $db->prepare("SELECT id, name FROM shelf_layout_profiles WHERE user_id = ? AND is_active = 1 LIMIT 1");
            $stmt->execute([$userId]);
            $active = $stmt->fetch();
            jsonResponse(true, $active ?: null);
            break;

        // ================================================================
        // USER TAGGING SYSTEM (v5.1.0)
        // ================================================================

        case 'list_user_tags':
            $stmt = $db->prepare("SELECT * FROM user_tags WHERE user_id = ? ORDER BY name");
            $stmt->execute([$userId]);
            jsonResponse(true, $stmt->fetchAll());
            break;

        case 'create_user_tag':
            $tagName = sanitize($input['name'] ?? '', 60);
            $tagColor = sanitize($input['color'] ?? '#667eea', 20);
            if (empty($tagName)) { jsonResponse(false, null, 'Tag name required'); }
            try {
                $db->prepare("INSERT INTO user_tags (user_id, name, color) VALUES (?, ?, ?)")->execute([$userId, $tagName, $tagColor]);
                jsonResponse(true, ['tag_id' => $db->lastInsertId(), 'name' => $tagName]);
            } catch (PDOException $e) {
                jsonResponse(false, null, 'Tag already exists');
            }
            break;

        case 'delete_user_tag':
            $tagId = intval($input['tag_id'] ?? 0);
            if (!$tagId) { jsonResponse(false, null, 'Tag ID required'); }
            $chk = $db->prepare("SELECT user_id FROM user_tags WHERE id = ?"); $chk->execute([$tagId]);
            $t = $chk->fetch();
            if (!$t || $t['user_id'] != $userId) { jsonResponse(false, null, 'Tag not found'); }
            $db->prepare("DELETE FROM user_tags WHERE id = ?")->execute([$tagId]);
            jsonResponse(true, ['deleted' => $tagId]);
            break;

        case 'set_entity_tags':
            // Replace all tags for an entity with the given tag_ids array
            $entityType = sanitize($input['entity_type'] ?? '', 20);
            $entityId = intval($input['entity_id'] ?? 0);
            $tagIds = array_map('intval', $input['tag_ids'] ?? []);
            if (!in_array($entityType, ['movie','copy','container']) || !$entityId) {
                jsonResponse(false, null, 'entity_type (movie|copy|container) and entity_id required');
            }
            $db->prepare("DELETE FROM user_tag_links WHERE user_id = ? AND entity_type = ? AND entity_id = ?")
               ->execute([$userId, $entityType, $entityId]);
            if (!empty($tagIds)) {
                $ins = $db->prepare("INSERT OR IGNORE INTO user_tag_links (user_id, entity_type, entity_id, tag_id) VALUES (?, ?, ?, ?)");
                foreach ($tagIds as $tid) { $ins->execute([$userId, $entityType, $entityId, $tid]); }
            }
            jsonResponse(true, ['entity_type' => $entityType, 'entity_id' => $entityId, 'tag_count' => count($tagIds)]);
            break;

        case 'get_entity_tags':
            $entityType = sanitize($input['entity_type'] ?? '', 20);
            $entityId = intval($input['entity_id'] ?? 0);
            if (!in_array($entityType, ['movie','copy','container']) || !$entityId) {
                jsonResponse(false, null, 'entity_type and entity_id required');
            }
            $stmt = $db->prepare("
                SELECT ut.id, ut.name, ut.color
                FROM user_tag_links utl
                JOIN user_tags ut ON utl.tag_id = ut.id
                WHERE utl.user_id = ? AND utl.entity_type = ? AND utl.entity_id = ?
            ");
            $stmt->execute([$userId, $entityType, $entityId]);
            jsonResponse(true, $stmt->fetchAll());
            break;

        // ================================================================
        // METADATA BACKFILL (v5.1.0)
        // ================================================================

        case 'get_metadata_status':
            // Counts of movies in user library vs. how many have enriched metadata
            $total = $db->prepare("SELECT COUNT(DISTINCT c.movie_id) FROM copies c WHERE c.user_id = ?");
            $total->execute([$userId]); $totalCount = intval($total->fetchColumn());
            $withDirs = $db->prepare("SELECT COUNT(DISTINCT mp.movie_id) FROM movie_people mp JOIN copies c ON mp.movie_id = c.movie_id WHERE c.user_id = ? AND mp.role = 'director'");
            $withDirs->execute([$userId]); $dirsCount = intval($withDirs->fetchColumn());
            $withGenres = $db->prepare("SELECT COUNT(DISTINCT mg.movie_id) FROM movie_genres mg JOIN copies c ON mg.movie_id = c.movie_id WHERE c.user_id = ?");
            $withGenres->execute([$userId]); $genresCount = intval($withGenres->fetchColumn());
            $withStudios = $db->prepare("SELECT COUNT(DISTINCT ms.movie_id) FROM movie_studios ms JOIN copies c ON ms.movie_id = c.movie_id WHERE c.user_id = ?");
            $withStudios->execute([$userId]); $studiosCount = intval($withStudios->fetchColumn());
            $withCerts = $db->prepare("SELECT COUNT(DISTINCT mc.movie_id) FROM movie_certifications mc JOIN copies c ON mc.movie_id = c.movie_id WHERE c.user_id = ?");
            $withCerts->execute([$userId]); $certsCount = intval($withCerts->fetchColumn());
            jsonResponse(true, [
                'total_movies' => $totalCount,
                'with_directors' => $dirsCount,
                'with_genres' => $genresCount,
                'with_studios' => $studiosCount,
                'with_certifications' => $certsCount,
                'complete_pct' => $totalCount > 0 ? round(($dirsCount / $totalCount) * 100) : 0,
            ]);
            break;

        case 'backfill_movie_metadata':
            // Fetch TMDB details for movies in this user's library that are missing enriched metadata.
            // Processes up to $batchSize movies per request to avoid timeouts.
            // Safe to call repeatedly — skips already-enriched movies.
            $batchSize = intval($input['batch_size'] ?? 50);
            if ($batchSize < 1 || $batchSize > 100) $batchSize = 50;

            // Find movies in user library that don't have director metadata yet
            $stmt = $db->prepare("
                SELECT DISTINCT m.id, m.tmdb_id, m.media_type, m.director, m.genre, m.studio, m.certification
                FROM copies c
                JOIN movies m ON c.movie_id = m.id
                WHERE c.user_id = ?
                  AND m.id NOT IN (SELECT DISTINCT movie_id FROM movie_people WHERE role = 'director')
                LIMIT ?
            ");
            $stmt->execute([$userId, $batchSize]);
            $toProcess = $stmt->fetchAll();

            $processed = 0; $skipped = 0; $errors = [];

            foreach ($toProcess as $movie) {
                $tmdbId = $movie['tmdb_id'];
                $mediaType = $movie['media_type'] ?? 'movie';

                // Skip if no TMDB API key
                if (empty(TMDB_API_KEY)) {
                    // Fall back to parsing existing text fields from movies table
                    _backfillFromExistingFields($db, $movie);
                    $processed++;
                    continue;
                }

                $appendTo = $mediaType === 'tv' ? 'credits,content_ratings' : 'credits,release_dates';
                $url = TMDB_BASE_URL . '/' . $mediaType . '/' . $tmdbId . '?api_key=' . TMDB_API_KEY . '&append_to_response=' . $appendTo;
                $raw = @file_get_contents($url);
                if (!$raw) { $errors[] = $tmdbId; $skipped++; continue; }
                $data = json_decode($raw, true);
                if (!$data) { $errors[] = $tmdbId; $skipped++; continue; }

                $db->beginTransaction();
                try {
                    $movieId = $movie['id'];

                    // Directors from credits
                    $crew = $data['credits']['crew'] ?? [];
                    foreach ($crew as $person) {
                        if (($person['job'] ?? '') === 'Director' || ($person['department'] ?? '') === 'Directing') {
                            $db->prepare("INSERT OR IGNORE INTO movie_people (movie_id, name, role, sort_order) VALUES (?, ?, 'director', ?)")
                               ->execute([$movieId, $person['name'], $person['order'] ?? 0]);
                        }
                    }

                    // Genres
                    foreach (($data['genres'] ?? []) as $g) {
                        $db->prepare("INSERT OR IGNORE INTO movie_genres (movie_id, name, tmdb_genre_id) VALUES (?, ?, ?)")
                           ->execute([$movieId, $g['name'], $g['id']]);
                    }

                    // Studios / production companies (top 2)
                    $companies = array_slice($data['production_companies'] ?? [], 0, 2);
                    foreach ($companies as $i => $co) {
                        $db->prepare("INSERT OR IGNORE INTO movie_studios (movie_id, name, sort_order) VALUES (?, ?, ?)")
                           ->execute([$movieId, $co['name'], $i]);
                    }

                    // US certification
                    $cert = '';
                    if ($mediaType === 'tv') {
                        foreach (($data['content_ratings']['results'] ?? []) as $r) {
                            if ($r['iso_3166_1'] === 'US') { $cert = $r['rating'] ?? ''; break; }
                        }
                    } else {
                        foreach (($data['release_dates']['results'] ?? []) as $r) {
                            if ($r['iso_3166_1'] === 'US') {
                                foreach (($r['release_dates'] ?? []) as $rd) {
                                    if (!empty($rd['certification'])) { $cert = $rd['certification']; break; }
                                }
                                break;
                            }
                        }
                    }
                    if (!empty($cert)) {
                        $db->prepare("INSERT OR REPLACE INTO movie_certifications (movie_id, region, certification) VALUES (?, 'US', ?)")
                           ->execute([$movieId, $cert]);
                    } elseif (!empty($movie['certification'])) {
                        // Fall back to certification already stored in movies.certification
                        $db->prepare("INSERT OR IGNORE INTO movie_certifications (movie_id, region, certification, source) VALUES (?, 'US', ?, 'movies_table')")
                           ->execute([$movieId, $movie['certification']]);
                    }

                    $db->commit();
                    $processed++;
                } catch (Exception $ex) {
                    $db->rollBack();
                    $errors[] = $tmdbId . ': ' . $ex->getMessage();
                    $skipped++;
                }
            }

            // Also seed from existing movies table fields for any remaining un-seeded movies
            // (handles the no-TMDB-key case and pre-enriched movies)
            $quickSeed = $db->prepare("
                SELECT DISTINCT m.id, m.director, m.genre, m.studio, m.certification
                FROM copies c JOIN movies m ON c.movie_id = m.id
                WHERE c.user_id = ?
                  AND m.id NOT IN (SELECT DISTINCT movie_id FROM movie_people WHERE role = 'director')
                LIMIT 200
            ");
            $quickSeed->execute([$userId]);
            foreach ($quickSeed->fetchAll() as $m) {
                _backfillFromExistingFields($db, $m);
            }

            jsonResponse(true, [
                'processed' => $processed,
                'skipped' => $skipped,
                'errors' => $errors,
                'remaining' => max(0, count($toProcess) - $processed - $skipped),
            ]);
            break;

        // ================================================================
        // RECIPE-BASED LAYOUT WIZARD (v5.1.0)
        // ================================================================

        case 'generate_recipe_plan':
            /*
             * Recipe JSON format:
             * {
             *   "sections": [
             *     { "id":"s1", "type":"genre|director|studio|certification|user_tag",
             *       "values":["Action","Thriller"],   <- string values OR tag IDs (int) for user_tag
             *       "sort":"title|year|rating",       <- item sort order within section
             *       "direction":"top|bottom"          <- top = add from start, bottom = append at end
             *     }, ...
             *   ],
             *   "remainder": { "sort":"title", "include_wishlist":false }
             * }
             */
            $recipe         = $input['recipe'] ?? [];
            $targetShelves  = $input['target_shelf_ids'] ?? [];
            $includeWishlist = !empty($input['options']['include_wishlist'] ?? $input['include_wishlist'] ?? false);
            $includeBoxsets  = !empty($input['options']['include_boxsets'] ?? $input['include_boxsets'] ?? false);

            if (empty($recipe['sections'])) {
                jsonResponse(false, null, 'recipe.sections required');
            }

            // --- Build full item pool ---
            $poolSql = "
                SELECT c.id as copy_id, m.id as movie_id, m.title, m.rating, m.year,
                       m.director, m.genre, m.studio, m.certification
                FROM copies c
                JOIN movies m ON c.movie_id = m.id
                WHERE c.user_id = ?
            ";
            $poolStmt = $db->prepare($poolSql);
            $poolStmt->execute([$userId]);
            $allCopies = $poolStmt->fetchAll();

            if ($includeWishlist) {
                $wPool = $db->prepare("SELECT NULL as copy_id, m.id as movie_id, m.title, m.rating, m.year, m.director, m.genre, m.studio, m.certification FROM wishlists w JOIN movies m ON w.movie_id = m.id WHERE w.user_id = ?");
                $wPool->execute([$userId]);
                $allCopies = array_merge($allCopies, $wPool->fetchAll());
            }

            $allContainers = [];
            if ($includeBoxsets) {
                $bPool = $db->prepare("SELECT id as container_id, name as title FROM containers WHERE user_id = ?");
                $bPool->execute([$userId]);
                $allContainers = $bPool->fetchAll();
            }

            if (empty($allCopies)) {
                jsonResponse(false, null, 'No items found in your collection. Add some movies first.');
            }

            // Enrich copies with metadata table values for precise matching
            // array_values() is required: array_unique() preserves original keys, causing
            // PDO positional binding to use key as 1-based index → SQLITE_RANGE error.
            $movieIds = array_values(array_unique(array_column($allCopies, 'movie_id')));
            $enriched = []; // movie_id => [directors[], genres[], studios[], cert]
            if (!empty($movieIds)) {
                $ph = implode(',', array_fill(0, count($movieIds), '?'));
                $dirs = $db->prepare("SELECT movie_id, name FROM movie_people WHERE role = 'director' AND movie_id IN ($ph)");
                $dirs->execute($movieIds);
                foreach ($dirs->fetchAll() as $r) { $enriched[$r['movie_id']]['directors'][] = $r['name']; }

                $gens = $db->prepare("SELECT movie_id, name FROM movie_genres WHERE movie_id IN ($ph)");
                $gens->execute($movieIds);
                foreach ($gens->fetchAll() as $r) { $enriched[$r['movie_id']]['genres'][] = $r['name']; }

                $stus = $db->prepare("SELECT movie_id, name FROM movie_studios WHERE movie_id IN ($ph)");
                $stus->execute($movieIds);
                foreach ($stus->fetchAll() as $r) { $enriched[$r['movie_id']]['studios'][] = $r['name']; }

                $certs = $db->prepare("SELECT movie_id, certification FROM movie_certifications WHERE region = 'US' AND movie_id IN ($ph)");
                $certs->execute($movieIds);
                foreach ($certs->fetchAll() as $r) { $enriched[$r['movie_id']]['cert'] = $r['certification']; }
            }

            // Fetch user tag links for this user
            $tagLinksStmt = $db->prepare("SELECT entity_id, tag_id FROM user_tag_links WHERE user_id = ? AND entity_type = 'movie'");
            $tagLinksStmt->execute([$userId]);
            $tagsByMovie = []; // movie_id => [tag_id...]
            foreach ($tagLinksStmt->fetchAll() as $r) { $tagsByMovie[$r['entity_id']][] = $r['tag_id']; }

            // Helper: does a copy match a section?
            // Empty values[] means "match any item that has ANY value for this type".
            $itemMatchesSection = function($copy, $section) use ($enriched, $tagsByMovie) {
                $movieId = $copy['movie_id'];
                $type    = $section['type'] ?? '';
                $values  = $section['values'] ?? [];
                $lc = fn($s) => strtolower(trim((string)$s));

                switch ($type) {
                    case 'genre':
                        $genres = array_map($lc, $enriched[$movieId]['genres'] ?? []);
                        if (empty($genres)) {
                            $genres = array_values(array_filter(array_map('trim', explode(',', $copy['genre'] ?? ''))));
                            $genres = array_map($lc, $genres);
                        }
                        if (empty($values)) return !empty($genres);
                        foreach ($values as $v) { if (in_array($lc($v), $genres)) return true; }
                        return false;

                    case 'director':
                        $dirs = array_map($lc, $enriched[$movieId]['directors'] ?? []);
                        if (empty($dirs) && !empty($copy['director'])) {
                            $dirs = array_map($lc, array_filter(array_map('trim', explode(',', $copy['director']))));
                        }
                        if (empty($values)) return !empty($dirs);
                        foreach ($values as $v) { if (in_array($lc($v), $dirs)) return true; }
                        return false;

                    case 'studio':
                        $studios = array_map($lc, $enriched[$movieId]['studios'] ?? []);
                        if (empty($studios) && !empty($copy['studio'])) {
                            $studios = [strtolower(trim($copy['studio']))];
                        }
                        if (empty($values)) return !empty($studios);
                        foreach ($values as $v) { if (in_array($lc($v), $studios)) return true; }
                        return false;

                    case 'certification':
                        $cert = $enriched[$movieId]['cert'] ?? $copy['certification'] ?? '';
                        if (empty($values)) return !empty(trim($cert));
                        foreach ($values as $v) { if ($lc($cert) === $lc($v)) return true; }
                        return false;

                    case 'user_tag':
                        $myTags = $tagsByMovie[$movieId] ?? [];
                        if (empty($values)) return !empty($myTags);
                        foreach ($values as $v) { if (in_array(intval($v), $myTags)) return true; }
                        return false;
                }
                return false;
            };

            // Sort helper
            $sortItems = function(&$items, $sort) {
                usort($items, function($a, $b) use ($sort) {
                    switch ($sort) {
                        case 'year':   return intval($a['year'] ?? 0) <=> intval($b['year'] ?? 0);
                        case 'rating': return floatval($b['rating'] ?? 0) <=> floatval($a['rating'] ?? 0);
                        default:       return strcmp($a['title'] ?? '', $b['title'] ?? '');
                    }
                });
            };

            // --- Assign items to sections ---
            $claimed = []; // copy_id => true (or null for wishlist items)
            $topSections    = []; // [['name'=>..., 'items'=>[...]]]
            $bottomSections = [];

            foreach ($recipe['sections'] as $section) {
                $sectionItems = [];
                foreach ($allCopies as $copy) {
                    $itemKey = $copy['copy_id'] ?? ('w' . $copy['movie_id']);
                    if (isset($claimed[$itemKey])) continue;
                    if ($itemMatchesSection($copy, $section)) {
                        $sectionItems[] = [
                            'copy_id'      => $copy['copy_id'],
                            'title'        => $copy['title'],
                            'container_id' => null,
                            'is_container' => 0,
                        ];
                        $claimed[$itemKey] = true;
                    }
                }
                $sortItems($sectionItems, $section['sort'] ?? 'title');
                $entry = ['name' => $section['id'] ?? 'Section', 'section_type' => $section['type'], 'items' => $sectionItems];
                if (($section['direction'] ?? 'top') === 'bottom') {
                    $bottomSections[] = $entry;
                } else {
                    $topSections[] = $entry;
                }
            }

            // --- Remainder ---
            $remainSort = $recipe['remainder']['sort'] ?? 'title';
            $remainItems = [];
            foreach ($allCopies as $copy) {
                $itemKey = $copy['copy_id'] ?? ('w' . $copy['movie_id']);
                if (!isset($claimed[$itemKey])) {
                    $remainItems[] = ['copy_id' => $copy['copy_id'], 'title' => $copy['title'], 'container_id' => null, 'is_container' => 0];
                    $claimed[$itemKey] = true;
                }
            }
            // Add boxsets to remainder
            foreach ($allContainers as $con) {
                $cKey = 'c' . $con['container_id'];
                if (!isset($claimed[$cKey])) {
                    $remainItems[] = ['copy_id' => null, 'title' => $con['title'], 'container_id' => $con['container_id'], 'is_container' => 1];
                    $claimed[$cKey] = true;
                }
            }
            $sortItems($remainItems, $remainSort);

            // --- Build ordered item stream: top sections, remainder, bottom sections ---
            $orderedSections = array_merge($topSections, [['name' => 'Everything Else', 'section_type' => 'remainder', 'items' => $remainItems]], $bottomSections);

            // --- Fetch target shelves ---
            if (!empty($targetShelves)) {
                $ph = implode(',', array_fill(0, count($targetShelves), '?'));
                $shQ = $db->prepare("SELECT id, name, capacity FROM shelves WHERE user_id = ? AND id IN ($ph) ORDER BY position");
                $shQ->execute(array_merge([$userId], array_map('intval', $targetShelves)));
            } else {
                $shQ = $db->prepare("SELECT id, name, capacity FROM shelves WHERE user_id = ? AND parent_shelf_id IS NULL ORDER BY position");
                $shQ->execute([$userId]);
            }
            $recipeShelfList = $shQ->fetchAll();
            if (empty($recipeShelfList)) {
                jsonResponse(false, null, 'No shelves found. Create at least one shelf in the Shelves tab first.');
            }
            $defCap = 65;

            // For bottom sections: reserve space at the END of the last shelf
            $totalBottom = array_sum(array_map(fn($s) => count($s['items']), $bottomSections));
            $totalCapacity = array_sum(array_map(fn($sh) => (max(1, $sh['capacity'] > 0 ? $sh['capacity'] : $defCap)), $recipeShelfList));

            // --- Fill shelves ---
            $recipePlacement = [];
            foreach ($recipeShelfList as $sh) {
                $recipePlacement[$sh['id']] = ['shelf' => $sh, 'items' => []];
            }
            $shQueueR = array_values($recipeShelfList);
            $shIdxR   = 0;
            $usableCapacity = $totalCapacity - $totalBottom;

            $topAndRemainder = array_merge($topSections, [['name' => 'Everything Else', 'section_type' => 'remainder', 'items' => $remainItems]]);
            $placedTop = 0;
            foreach ($topAndRemainder as $section) {
                foreach ($section['items'] as $item) {
                    while ($shIdxR < count($shQueueR)) {
                        $sh = $shQueueR[$shIdxR];
                        $cap = max(1, $sh['capacity'] > 0 ? $sh['capacity'] : $defCap);
                        $usable = ($placedTop < $usableCapacity) ? min($cap, $usableCapacity - $placedTop) : 0;
                        if (count($recipePlacement[$sh['id']]['items']) < $usable || ($usable <= 0 && count($recipePlacement[$sh['id']]['items']) < $cap)) break;
                        $shIdxR++;
                    }
                    if ($shIdxR >= count($shQueueR)) break;
                    $recipePlacement[$shQueueR[$shIdxR]['id']]['items'][] = $item;
                    $placedTop++;
                }
            }

            // Place bottom sections at the END (append after remainder in reverse)
            foreach ($bottomSections as $bSec) {
                foreach ($bSec['items'] as $item) {
                    while ($shIdxR < count($shQueueR)) {
                        $sh = $shQueueR[$shIdxR];
                        $cap = max(1, $sh['capacity'] > 0 ? $sh['capacity'] : $defCap);
                        if (count($recipePlacement[$sh['id']]['items']) < $cap) break;
                        $shIdxR++;
                    }
                    if ($shIdxR >= count($shQueueR)) break;
                    $recipePlacement[$shQueueR[$shIdxR]['id']]['items'][] = $item;
                }
            }

            // Build output
            $recipePlacementOut = [];
            foreach ($recipePlacement as $shelfId => $data) {
                if (!empty($data['items'])) {
                    $recipePlacementOut[] = ['shelf_id' => $shelfId, 'shelf_name' => $data['shelf']['name'], 'ordered_items' => array_values($data['items'])];
                }
            }
            $unplaced = ($placedTop + $totalBottom) > $totalCapacity ? max(0, ($placedTop + $totalBottom) - $totalCapacity) : 0;

            jsonResponse(true, [
                'sections'         => array_values(array_filter($orderedSections, fn($s) => !empty($s['items']))),
                'placement'        => $recipePlacementOut,
                'total_items'      => array_sum(array_map(fn($s) => count($s['items']), $orderedSections)),
                'shelves_used'     => count($recipePlacementOut),
                'unplaced_estimate'=> $unplaced,
            ]);
            break;

        // ---------------------------------------------------------------
        // METADATA VALUE SEARCH — for typeahead in recipe wizard
        // ---------------------------------------------------------------
        case 'search_metadata_values':
        case 'list_metadata_values': {
            $type = trim($input['type'] ?? '');
            $q    = trim($input['q'] ?? '');
            $allowed = ['director', 'studio', 'genre', 'cert', 'tag'];
            if (!in_array($type, $allowed)) {
                jsonResponse(false, null, 'Invalid type. Must be one of: ' . implode(', ', $allowed));
            }
            $likeQ   = '%' . $q . '%';
            $results = [];
            switch ($type) {
                case 'director':
                    $st = $db->prepare(
                        "SELECT DISTINCT mp.name FROM movie_people mp
                         JOIN copies c ON mp.movie_id = c.movie_id
                         WHERE c.user_id = ? AND mp.role = 'director'
                           AND (? = '' OR mp.name LIKE ?)
                         ORDER BY mp.name LIMIT 30"
                    );
                    $st->execute([$userId, $q, $likeQ]);
                    $results = array_map(fn($r) => ['id' => $r['name'], 'name' => $r['name']], $st->fetchAll(PDO::FETCH_ASSOC));
                    if (empty($results)) {
                        // Fallback: movies.director text field
                        $st2 = $db->prepare(
                            "SELECT DISTINCT m.director as name FROM movies m
                             JOIN copies c ON m.id = c.movie_id
                             WHERE c.user_id = ? AND m.director != ''
                               AND (? = '' OR m.director LIKE ?)
                             ORDER BY m.director LIMIT 30"
                        );
                        $st2->execute([$userId, $q, $likeQ]);
                        $results = array_map(fn($r) => ['id' => $r['name'], 'name' => $r['name']], $st2->fetchAll(PDO::FETCH_ASSOC));
                    }
                    break;
                case 'studio':
                    $st = $db->prepare(
                        "SELECT DISTINCT ms.name FROM movie_studios ms
                         JOIN copies c ON ms.movie_id = c.movie_id
                         WHERE c.user_id = ? AND (? = '' OR ms.name LIKE ?)
                         ORDER BY ms.name LIMIT 30"
                    );
                    $st->execute([$userId, $q, $likeQ]);
                    $results = array_map(fn($r) => ['id' => $r['name'], 'name' => $r['name']], $st->fetchAll(PDO::FETCH_ASSOC));
                    if (empty($results)) {
                        $st2 = $db->prepare(
                            "SELECT DISTINCT m.studio as name FROM movies m
                             JOIN copies c ON m.id = c.movie_id
                             WHERE c.user_id = ? AND m.studio != ''
                               AND (? = '' OR m.studio LIKE ?)
                             ORDER BY m.studio LIMIT 30"
                        );
                        $st2->execute([$userId, $q, $likeQ]);
                        $results = array_map(fn($r) => ['id' => $r['name'], 'name' => $r['name']], $st2->fetchAll(PDO::FETCH_ASSOC));
                    }
                    break;
                case 'genre':
                    $st = $db->prepare(
                        "SELECT DISTINCT mg.name FROM movie_genres mg
                         JOIN copies c ON mg.movie_id = c.movie_id
                         WHERE c.user_id = ? AND (? = '' OR mg.name LIKE ?)
                         ORDER BY mg.name LIMIT 30"
                    );
                    $st->execute([$userId, $q, $likeQ]);
                    $results = array_map(fn($r) => ['id' => $r['name'], 'name' => $r['name']], $st->fetchAll(PDO::FETCH_ASSOC));
                    if (empty($results)) {
                        $st2 = $db->prepare(
                            "SELECT DISTINCT m.genre as name FROM movies m
                             JOIN copies c ON m.id = c.movie_id
                             WHERE c.user_id = ? AND m.genre != ''
                               AND (? = '' OR m.genre LIKE ?)
                             ORDER BY m.genre LIMIT 30"
                        );
                        $st2->execute([$userId, $q, $likeQ]);
                        $results = array_map(fn($r) => ['id' => $r['name'], 'name' => $r['name']], $st2->fetchAll(PDO::FETCH_ASSOC));
                    }
                    break;
                case 'cert':
                    $st = $db->prepare(
                        "SELECT DISTINCT mc.certification as name FROM movie_certifications mc
                         JOIN copies c ON mc.movie_id = c.movie_id
                         WHERE c.user_id = ? AND (? = '' OR mc.certification LIKE ?)
                         ORDER BY mc.certification LIMIT 20"
                    );
                    $st->execute([$userId, $q, $likeQ]);
                    $results = array_map(fn($r) => ['id' => $r['name'], 'name' => $r['name']], $st->fetchAll(PDO::FETCH_ASSOC));
                    if (empty($results)) {
                        $st2 = $db->prepare(
                            "SELECT DISTINCT m.certification as name FROM movies m
                             JOIN copies c ON m.id = c.movie_id
                             WHERE c.user_id = ? AND m.certification != ''
                               AND (? = '' OR m.certification LIKE ?)
                             ORDER BY m.certification LIMIT 20"
                        );
                        $st2->execute([$userId, $q, $likeQ]);
                        $results = array_map(fn($r) => ['id' => $r['name'], 'name' => $r['name']], $st2->fetchAll(PDO::FETCH_ASSOC));
                    }
                    break;
                case 'tag':
                    $st = $db->prepare(
                        "SELECT id, name FROM user_tags
                         WHERE user_id = ? AND (? = '' OR name LIKE ?)
                         ORDER BY name LIMIT 30"
                    );
                    $st->execute([$userId, $q, $likeQ]);
                    $results = $st->fetchAll(PDO::FETCH_ASSOC);
                    break;
            }
            $empty = empty($results);
            jsonResponse(true, [
                'results'    => array_values($results),
                'type'       => $type,
                'q'          => $q,
                'empty_hint' => $empty ? 'No values found. Run Metadata Backfill in Admin Tools for best results.' : null,
            ]);
            break;
        }

        // ---------------------------------------------------------------
        // METADATA CLOUD — word cloud with counts for picker modal
        // ---------------------------------------------------------------
        case 'list_metadata_cloud':
        case 'search_metadata_cloud': {
            $type  = trim($input['type'] ?? '');
            $q     = trim($input['q'] ?? '');
            $limit = max(1, min(500, intval($input['limit'] ?? 200)));
            $allowed = ['director', 'studio', 'genre', 'cert', 'tag'];
            if (!in_array($type, $allowed)) {
                jsonResponse(false, null, 'Invalid type');
            }
            $likeQ  = '%' . $q . '%';
            $results = [];
            switch ($type) {
                case 'director':
                    $st = $db->prepare(
                        "SELECT mp.name, COUNT(DISTINCT c.id) as cnt
                         FROM movie_people mp
                         JOIN copies c ON mp.movie_id = c.movie_id
                         WHERE c.user_id = ? AND mp.role = 'director'
                           AND (? = '' OR mp.name LIKE ?)
                         GROUP BY mp.name ORDER BY cnt DESC, mp.name ASC LIMIT ?"
                    );
                    $st->execute([$userId, $q, $likeQ, $limit]);
                    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
                    if (empty($rows)) {
                        $st2 = $db->prepare(
                            "SELECT m.director as name, COUNT(DISTINCT c.id) as cnt
                             FROM movies m JOIN copies c ON m.id = c.movie_id
                             WHERE c.user_id = ? AND m.director != ''
                               AND (? = '' OR m.director LIKE ?)
                             GROUP BY m.director ORDER BY cnt DESC, m.director ASC LIMIT ?"
                        );
                        $st2->execute([$userId, $q, $likeQ, $limit]);
                        $rows = $st2->fetchAll(PDO::FETCH_ASSOC);
                    }
                    $results = $rows;
                    break;
                case 'studio':
                    $st = $db->prepare(
                        "SELECT ms.name, COUNT(DISTINCT c.id) as cnt
                         FROM movie_studios ms
                         JOIN copies c ON ms.movie_id = c.movie_id
                         WHERE c.user_id = ? AND (? = '' OR ms.name LIKE ?)
                         GROUP BY ms.name ORDER BY cnt DESC, ms.name ASC LIMIT ?"
                    );
                    $st->execute([$userId, $q, $likeQ, $limit]);
                    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
                    if (empty($rows)) {
                        $st2 = $db->prepare(
                            "SELECT m.studio as name, COUNT(DISTINCT c.id) as cnt
                             FROM movies m JOIN copies c ON m.id = c.movie_id
                             WHERE c.user_id = ? AND m.studio != ''
                               AND (? = '' OR m.studio LIKE ?)
                             GROUP BY m.studio ORDER BY cnt DESC, m.studio ASC LIMIT ?"
                        );
                        $st2->execute([$userId, $q, $likeQ, $limit]);
                        $rows = $st2->fetchAll(PDO::FETCH_ASSOC);
                    }
                    $results = $rows;
                    break;
                case 'genre':
                    $st = $db->prepare(
                        "SELECT mg.name, COUNT(DISTINCT c.id) as cnt
                         FROM movie_genres mg
                         JOIN copies c ON mg.movie_id = c.movie_id
                         WHERE c.user_id = ? AND (? = '' OR mg.name LIKE ?)
                         GROUP BY mg.name ORDER BY cnt DESC, mg.name ASC LIMIT ?"
                    );
                    $st->execute([$userId, $q, $likeQ, $limit]);
                    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
                    if (empty($rows)) {
                        $st2 = $db->prepare(
                            "SELECT m.genre as name, COUNT(DISTINCT c.id) as cnt
                             FROM movies m JOIN copies c ON m.id = c.movie_id
                             WHERE c.user_id = ? AND m.genre != ''
                               AND (? = '' OR m.genre LIKE ?)
                             GROUP BY m.genre ORDER BY cnt DESC, m.genre ASC LIMIT ?"
                        );
                        $st2->execute([$userId, $q, $likeQ, $limit]);
                        $rows = $st2->fetchAll(PDO::FETCH_ASSOC);
                    }
                    $results = $rows;
                    break;
                case 'cert':
                    $st = $db->prepare(
                        "SELECT mc.certification as name, COUNT(DISTINCT c.id) as cnt
                         FROM movie_certifications mc
                         JOIN copies c ON mc.movie_id = c.movie_id
                         WHERE c.user_id = ? AND (? = '' OR mc.certification LIKE ?)
                         GROUP BY mc.certification ORDER BY cnt DESC, mc.certification ASC LIMIT ?"
                    );
                    $st->execute([$userId, $q, $likeQ, $limit]);
                    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
                    if (empty($rows)) {
                        $st2 = $db->prepare(
                            "SELECT m.certification as name, COUNT(DISTINCT c.id) as cnt
                             FROM movies m JOIN copies c ON m.id = c.movie_id
                             WHERE c.user_id = ? AND m.certification != ''
                               AND (? = '' OR m.certification LIKE ?)
                             GROUP BY m.certification ORDER BY cnt DESC, m.certification ASC LIMIT ?"
                        );
                        $st2->execute([$userId, $q, $likeQ, $limit]);
                        $rows = $st2->fetchAll(PDO::FETCH_ASSOC);
                    }
                    $results = $rows;
                    break;
                case 'tag':
                    $st = $db->prepare(
                        "SELECT ut.name,
                                (SELECT COUNT(*) FROM user_tag_links utl WHERE utl.tag_id = ut.id) as cnt
                         FROM user_tags ut
                         WHERE ut.user_id = ? AND (? = '' OR ut.name LIKE ?)
                         ORDER BY cnt DESC, ut.name ASC LIMIT ?"
                    );
                    $st->execute([$userId, $q, $likeQ, $limit]);
                    $results = $st->fetchAll(PDO::FETCH_ASSOC);
                    break;
            }
            $empty = empty($results);
            jsonResponse(true, [
                'items'      => array_values($results), // [{name, cnt}]
                'type'       => $type,
                'q'          => $q,
                'empty_hint' => $empty ? 'No values found. Run Metadata Backfill in Admin Tools for best results.' : null,
            ]);
            break;
        }

        case 'apply_recipe_as_new_layout':
            $recipeData   = $input['recipe'] ?? null;
            $planData     = $input['plan'] ?? [];
            $layoutName   = sanitize($input['layout_name'] ?? '', 100);
            $setActiveR   = !empty($input['set_active']);

            if (empty($layoutName)) { jsonResponse(false, null, 'layout_name required'); }
            if (empty($planData['placement'])) { jsonResponse(false, null, 'plan.placement required'); }

            $db->beginTransaction();
            try {
                if ($setActiveR) {
                    $db->prepare("UPDATE shelf_layout_profiles SET is_active = 0 WHERE user_id = ?")->execute([$userId]);
                }
                $db->prepare("INSERT INTO shelf_layout_profiles (user_id, name, is_active, recipe_json) VALUES (?, ?, ?, ?)")
                   ->execute([$userId, $layoutName, $setActiveR ? 1 : 0, $recipeData ? json_encode($recipeData) : null]);
                $newLid = $db->lastInsertId();

                $ins = $db->prepare("INSERT INTO shelf_layout_entries (layout_id, shelf_id, copy_id, container_id, is_container, position_in_shelf) VALUES (?, ?, ?, ?, ?, ?)");
                $totalR = 0;
                foreach ($planData['placement'] as $shelfPlan) {
                    $shelfId = intval($shelfPlan['shelf_id'] ?? 0);
                    if (!$shelfId) continue;
                    $chk = $db->prepare("SELECT id FROM shelves WHERE id = ? AND user_id = ?");
                    $chk->execute([$shelfId, $userId]);
                    if (!$chk->fetch()) continue;
                    $pos = 0;
                    foreach (($shelfPlan['ordered_items'] ?? []) as $item) {
                        $cId = !empty($item['copy_id']) ? intval($item['copy_id']) : null;
                        $contId = !empty($item['container_id']) ? intval($item['container_id']) : null;
                        $isCont = !empty($item['is_container']) ? 1 : 0;
                        $ins->execute([$newLid, $shelfId, $cId, $contId, $isCont, $pos++]);
                        $totalR++;
                    }
                }
                $db->commit();
            } catch (Exception $ex) {
                $db->rollBack();
                jsonResponse(false, null, 'Failed: ' . $ex->getMessage());
            }
            jsonResponse(true, ['layout_id' => $newLid, 'name' => $layoutName, 'entries' => $totalR]);
            break;

        // ================================================================
        // AI ORGANIZATION WIZARD - DETERMINISTIC PLANNER (v5.0.0)
        // ================================================================

        case 'generate_shelf_plan':
            // Deterministic planner: groups the user's collection by strategy,
            // then assigns items to shelves respecting capacity.
            $strategy   = sanitize($input['strategy'] ?? 'genre', 50);
            $includeWishlist  = !empty($input['include_wishlist']);
            $includeBoxsets   = !empty($input['include_boxsets']);
            $expandBoxsets    = !empty($input['expand_boxsets']);
            $minRating  = isset($input['min_rating']) ? floatval($input['min_rating']) : 0;
            $targetShelves = $input['target_shelves'] ?? []; // array of shelf IDs; empty = all user shelves

            // --- Fetch movies in the collection ---
            // Uses actual DB columns: genre (TEXT, comma-sep), rating (REAL), year (INT), studio (TEXT)
            $sql = "
                SELECT m.id as movie_id, m.title, m.genre, m.director,
                       m.studio, m.rating, m.year,
                       c.id as copy_id, c.format
                FROM copies c
                JOIN movies m ON c.movie_id = m.id
                WHERE c.user_id = ?
            ";
            $params = [$userId];
            if ($minRating > 0) {
                $sql .= " AND (m.rating IS NULL OR m.rating >= ?)";
                $params[] = $minRating;
            }
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $copies = $stmt->fetchAll();

            // Optionally include wishlist items
            if ($includeWishlist) {
                $wStmt = $db->prepare("
                    SELECT m.id as movie_id, m.title, m.genre, m.director,
                           m.studio, m.rating, m.year,
                           NULL as copy_id, NULL as format
                    FROM wishlists w JOIN movies m ON w.movie_id = m.id
                    WHERE w.user_id = ?
                ");
                $wStmt->execute([$userId]);
                $copies = array_merge($copies, $wStmt->fetchAll());
            }

            // Include/exclude boxsets (containers.name is the correct column)
            $boxsets = [];
            if ($includeBoxsets) {
                $bStmt = $db->prepare("SELECT id, name FROM containers WHERE user_id = ?");
                $bStmt->execute([$userId]);
                $boxsets = $bStmt->fetchAll();
            }

            // --- Group by strategy ---
            $groups = [];

            foreach ($copies as $c) {
                $key = 'Uncategorized';
                switch ($strategy) {
                    case 'genre':
                        // genre stored as comma-separated text: "Action, Thriller"
                        $genreStr = trim($c['genre'] ?? '');
                        $key = !empty($genreStr)
                            ? trim(explode(',', $genreStr)[0])
                            : 'Uncategorized';
                        break;
                    case 'director':
                        $key = !empty($c['director']) ? trim($c['director']) : 'Unknown Director';
                        break;
                    case 'studio':
                        $key = !empty($c['studio']) ? trim($c['studio']) : 'Unknown Studio';
                        break;
                    case 'franchise':
                        // No collection/franchise field in DB; group by title first letter
                        $key = !empty($c['title']) ? strtoupper(substr($c['title'], 0, 1)) : '#';
                        break;
                    case 'decade':
                        $yr = intval($c['year'] ?? 0);
                        $key = $yr > 0 ? (floor($yr / 10) * 10) . 's' : 'Unknown';
                        break;
                    case 'awards':
                        $rating = floatval($c['rating'] ?? 0);
                        $key = $rating >= 8.0 ? 'Top Rated (8+)' : ($rating >= 7.0 ? 'Highly Rated (7+)' : 'Other');
                        break;
                    default:
                        $key = 'Collection';
                }
                if (!isset($groups[$key])) $groups[$key] = [];
                $groups[$key][] = ['copy_id' => $c['copy_id'], 'title' => $c['title'], 'container_id' => null, 'is_container' => 0];
            }

            // Add boxsets as a unit if requested
            if ($includeBoxsets && !$expandBoxsets) {
                if (!isset($groups['Box Sets'])) $groups['Box Sets'] = [];
                foreach ($boxsets as $b) {
                    $groups['Box Sets'][] = ['copy_id' => null, 'title' => $b['name'], 'container_id' => $b['id'], 'is_container' => 1];
                }
            }

            // Sort groups alphabetically; sort items within group by title
            ksort($groups);
            foreach ($groups as &$g) {
                usort($g, fn($a, $b) => strcmp($a['title'], $b['title']));
            }
            unset($g);

            // Remove empty groups
            $groups = array_filter($groups, fn($g) => count($g) > 0);

            // --- Fetch target shelves ---
            if (!empty($targetShelves)) {
                $placeholders = implode(',', array_fill(0, count($targetShelves), '?'));
                $shStmt = $db->prepare("SELECT id, name, capacity FROM shelves WHERE user_id = ? AND id IN ($placeholders) ORDER BY position");
                $shStmt->execute(array_merge([$userId], array_map('intval', $targetShelves)));
            } else {
                $shStmt = $db->prepare("SELECT id, name, capacity FROM shelves WHERE user_id = ? ORDER BY position");
                $shStmt->execute([$userId]);
            }
            $availableShelves = $shStmt->fetchAll();
            $defaultCapacity = 65; // user preference; overridden per-shelf by shelf.capacity

            // --- Place items into shelves (left-to-right, wrap to next shelf) ---
            $placement = []; // [shelf_id => [items...]]
            foreach ($availableShelves as $sh) {
                $placement[$sh['id']] = ['shelf' => $sh, 'items' => []];
            }

            $shelfQueue = array_values($availableShelves);
            $shelfIdx = 0;
            $sections = [];

            foreach ($groups as $groupName => $items) {
                $section = ['name' => $groupName, 'items' => []];
                foreach ($items as $item) {
                    // Advance to a shelf with space
                    while ($shelfIdx < count($shelfQueue)) {
                        $sh = $shelfQueue[$shelfIdx];
                        $cap = $sh['capacity'] > 0 ? $sh['capacity'] : $defaultCapacity;
                        if (count($placement[$sh['id']]['items']) < $cap) break;
                        $shelfIdx++;
                    }
                    if ($shelfIdx >= count($shelfQueue)) break; // No more shelf space
                    $placement[$shelfQueue[$shelfIdx]['id']]['items'][] = $item;
                    $section['items'][] = $item;
                }
                if (!empty($section['items'])) $sections[] = $section;
            }

            // Build placement output
            $placementOut = [];
            foreach ($placement as $shelfId => $data) {
                if (!empty($data['items'])) {
                    $placementOut[] = [
                        'shelf_id' => $shelfId,
                        'shelf_name' => $data['shelf']['name'],
                        'ordered_items' => array_values($data['items'])
                    ];
                }
            }

            jsonResponse(true, [
                'strategy' => $strategy,
                'sections' => array_values($sections),
                'placement' => $placementOut,
                'total_items' => array_sum(array_map('count', $groups)),
                'shelves_used' => count($placementOut),
            ]);
            break;

        case 'apply_wizard_plan':
            // Create a new layout profile from a generated plan and optionally set it active
            $planName   = sanitize($input['name'] ?? '', 100);
            $placement  = $input['placement'] ?? [];
            $setActive  = !empty($input['set_active']);

            if (empty($planName)) {
                jsonResponse(false, null, 'Plan name required');
            }
            if (empty($placement)) {
                jsonResponse(false, null, 'Placement data required');
            }

            $db->beginTransaction();
            try {
                if ($setActive) {
                    $db->prepare("UPDATE shelf_layout_profiles SET is_active = 0 WHERE user_id = ?")->execute([$userId]);
                }
                $db->prepare("INSERT INTO shelf_layout_profiles (user_id, name, is_active) VALUES (?, ?, ?)")
                   ->execute([$userId, $planName, $setActive ? 1 : 0]);
                $newLayoutId = $db->lastInsertId();

                $ins = $db->prepare("INSERT INTO shelf_layout_entries (layout_id, shelf_id, copy_id, container_id, is_container, position_in_shelf) VALUES (?, ?, ?, ?, ?, ?)");
                $pos = 0;
                $total = 0;
                foreach ($placement as $shelfPlan) {
                    $shelfId = intval($shelfPlan['shelf_id'] ?? 0);
                    if (!$shelfId) continue;
                    // Verify shelf belongs to user
                    $chk = $db->prepare("SELECT id FROM shelves WHERE id = ? AND user_id = ?");
                    $chk->execute([$shelfId, $userId]);
                    if (!$chk->fetch()) continue;
                    $pos = 0;
                    foreach (($shelfPlan['ordered_items'] ?? []) as $item) {
                        $copyId = !empty($item['copy_id']) ? intval($item['copy_id']) : null;
                        $containerId = !empty($item['container_id']) ? intval($item['container_id']) : null;
                        $isContainer = !empty($item['is_container']) ? 1 : 0;
                        $ins->execute([$newLayoutId, $shelfId, $copyId, $containerId, $isContainer, $pos++]);
                        $total++;
                    }
                }
                $db->commit();
            } catch (Exception $ex) {
                $db->rollBack();
                jsonResponse(false, null, 'Failed to save plan: ' . $ex->getMessage());
            }

            jsonResponse(true, ['layout_id' => $newLayoutId, 'name' => $planName, 'entries' => $total]);
            break;

        case 'generate_shelf_plan_ai':
            // AI-enhanced planner: calls OpenAI to generate theme-based group names,
            // then runs the same deterministic placement algorithm.
            // Falls back to generate_shelf_plan result if AI is unavailable.
            $strategy  = sanitize($input['strategy'] ?? 'genre', 50);
            $targetShelves = $input['target_shelves'] ?? [];
            $includeWishlist = !empty($input['include_wishlist']);
            $minRating = isset($input['min_rating']) ? floatval($input['min_rating']) : 0;

            // 1. Run deterministic plan first (always available as fallback)
            $deterministicInput = [
                'strategy' => $strategy,
                'target_shelves' => $targetShelves,
                'include_wishlist' => $includeWishlist,
                'min_rating' => $minRating,
                'include_boxsets' => $input['include_boxsets'] ?? false,
                'expand_boxsets' => $input['expand_boxsets'] ?? false,
            ];

            // Build the deterministic result inline (reuse logic via recursive call simulation)
            // We call our own endpoint internally to reuse the generate_shelf_plan handler
            $deterministicResult = null;
            $internalInput = $deterministicInput;
            $origAction = $action;

            // Re-run deterministic plan by temporarily overriding input and catching output
            // Since we can't call ourselves, we duplicate the core grouping logic here
            $GENRES_AI = [
                12 => 'Adventure', 14 => 'Fantasy', 16 => 'Animation', 18 => 'Drama',
                27 => 'Horror', 28 => 'Action', 35 => 'Comedy', 36 => 'History',
                37 => 'Western', 53 => 'Thriller', 80 => 'Crime', 99 => 'Documentary',
                878 => 'Science Fiction', 9648 => 'Mystery', 10402 => 'Music',
                10749 => 'Romance', 10751 => 'Family', 10752 => 'War'
            ];

            $sqlAI = "SELECT m.id as movie_id, m.title, m.genre, m.director, m.studio, m.rating, m.year, c.id as copy_id FROM copies c JOIN movies m ON c.movie_id = m.id WHERE c.user_id = ?";
            $paramsAI = [$userId];
            if ($minRating > 0) { $sqlAI .= " AND (m.rating IS NULL OR m.rating >= ?)"; $paramsAI[] = $minRating; }
            $stmtAI = $db->prepare($sqlAI);
            $stmtAI->execute($paramsAI);
            $copiesAI = $stmtAI->fetchAll();

            $groupsAI = [];
            foreach ($copiesAI as $c) {
                $key = 'Uncategorized';
                if ($strategy === 'genre') {
                    $genreStrAI = trim($c['genre'] ?? '');
                    $key = !empty($genreStrAI) ? trim(explode(',', $genreStrAI)[0]) : 'Uncategorized';
                } elseif ($strategy === 'director') {
                    $key = !empty($c['director']) ? trim($c['director']) : 'Unknown Director';
                } elseif ($strategy === 'studio') {
                    $key = !empty($c['studio']) ? trim($c['studio']) : 'Unknown Studio';
                } elseif ($strategy === 'franchise') {
                    $key = !empty($c['title']) ? strtoupper(substr($c['title'], 0, 1)) : '#';
                } elseif ($strategy === 'decade') {
                    $yr = intval($c['year'] ?? 0);
                    $key = $yr > 0 ? (floor($yr / 10) * 10) . 's' : 'Unknown';
                } elseif ($strategy === 'awards') {
                    $rating = floatval($c['rating'] ?? 0);
                    $key = $rating >= 8.0 ? 'Top Rated (8+)' : ($rating >= 7.0 ? 'Highly Rated (7+)' : 'Other');
                }
                if (!isset($groupsAI[$key])) $groupsAI[$key] = [];
                $groupsAI[$key][] = $c['title'];
            }
            ksort($groupsAI);

            // 2. Try AI enhancement if OpenAI key is available
            $aiEnhanced = false;
            $aiSectionNames = [];
            if (!empty(OPENAI_API_KEY) && count($groupsAI) > 0) {
                $groupSummary = [];
                foreach ($groupsAI as $gname => $titles) {
                    $sample = array_slice($titles, 0, 5);
                    $groupSummary[] = "$gname: " . implode(', ', $sample) . (count($titles) > 5 ? '...' : '');
                }

                // Prompt template (kept minimal for cost — gpt-4o-mini)
                $prompt = "You are a creative film librarian. Given these movie groups for a physical shelf organizer, suggest an improved, evocative section name for each group (max 30 chars). Keep the same grouping, just rename them creatively. Return ONLY a JSON object mapping old name to new name.\n\nGroups:\n" . implode("\n", $groupSummary);

                $aiPayload = json_encode([
                    'model' => 'gpt-4o-mini',
                    'messages' => [
                        ['role' => 'system', 'content' => 'Return only valid JSON. No explanation.'],
                        ['role' => 'user', 'content' => $prompt]
                    ],
                    'max_tokens' => 500,
                    'temperature' => 0.7,
                ]);

                $ch = curl_init(OPENAI_API_URL);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_POST, true);
                curl_setopt($ch, CURLOPT_POSTFIELDS, $aiPayload);
                curl_setopt($ch, CURLOPT_TIMEOUT, 20);
                curl_setopt($ch, CURLOPT_HTTPHEADER, [
                    'Content-Type: application/json',
                    'Authorization: Bearer ' . OPENAI_API_KEY,
                ]);
                $aiRaw = curl_exec($ch);
                $aiHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);

                if ($aiHttpCode === 200 && $aiRaw) {
                    $aiResp = json_decode($aiRaw, true);
                    $aiText = $aiResp['choices'][0]['message']['content'] ?? '';
                    // Strip markdown code fences if present
                    $aiText = preg_replace('/^```(?:json)?\s*/i', '', trim($aiText));
                    $aiText = preg_replace('/\s*```$/', '', $aiText);
                    $nameMap = json_decode($aiText, true);
                    if (is_array($nameMap)) {
                        $aiSectionNames = $nameMap;
                        $aiEnhanced = true;
                    }
                }
            }

            // Rename groups using AI names (fall back to original if not mapped)
            $renamedGroups = [];
            foreach ($groupsAI as $orig => $titles) {
                $newName = $aiEnhanced && isset($aiSectionNames[$orig]) ? $aiSectionNames[$orig] : $orig;
                $renamedGroups[$newName] = $titles;
            }

            // Fetch shelves for placement
            if (!empty($targetShelves)) {
                $ph = implode(',', array_fill(0, count($targetShelves), '?'));
                $shStmtAI = $db->prepare("SELECT id, name, capacity FROM shelves WHERE user_id = ? AND id IN ($ph) ORDER BY position");
                $shStmtAI->execute(array_merge([$userId], array_map('intval', $targetShelves)));
            } else {
                $shStmtAI = $db->prepare("SELECT id, name, capacity FROM shelves WHERE user_id = ? ORDER BY position");
                $shStmtAI->execute([$userId]);
            }
            $availableShelvesAI = $shStmtAI->fetchAll();
            $defCap = 65;

            $placementAI = [];
            foreach ($availableShelvesAI as $sh) {
                $placementAI[$sh['id']] = ['shelf' => $sh, 'items' => []];
            }
            $shQueueAI = array_values($availableShelvesAI);
            $shIdxAI = 0;
            $sectionsAI = [];

            // Rebuild items array from grouped titles (copy_id lookup)
            $titleToCopy = [];
            foreach ($copiesAI as $c) { $titleToCopy[$c['title']] = $c['copy_id']; }

            foreach ($renamedGroups as $gname => $titles) {
                $section = ['name' => $gname, 'items' => []];
                foreach ($titles as $title) {
                    while ($shIdxAI < count($shQueueAI)) {
                        $sh = $shQueueAI[$shIdxAI];
                        $cap = $sh['capacity'] > 0 ? $sh['capacity'] : $defCap;
                        if (count($placementAI[$sh['id']]['items']) < $cap) break;
                        $shIdxAI++;
                    }
                    if ($shIdxAI >= count($shQueueAI)) break;
                    $item = ['copy_id' => $titleToCopy[$title] ?? null, 'title' => $title, 'container_id' => null, 'is_container' => 0];
                    $placementAI[$shQueueAI[$shIdxAI]['id']]['items'][] = $item;
                    $section['items'][] = $item;
                }
                if (!empty($section['items'])) $sectionsAI[] = $section;
            }

            $placementOutAI = [];
            foreach ($placementAI as $shelfId => $data) {
                if (!empty($data['items'])) {
                    $placementOutAI[] = ['shelf_id' => $shelfId, 'shelf_name' => $data['shelf']['name'], 'ordered_items' => array_values($data['items'])];
                }
            }

            jsonResponse(true, [
                'strategy' => $strategy,
                'ai_enhanced' => $aiEnhanced,
                'sections' => array_values($sectionsAI),
                'placement' => $placementOutAI,
                'total_items' => array_sum(array_map('count', $groupsAI)),
                'shelves_used' => count($placementOutAI),
            ]);
            break;

        default:
            jsonResponse(false, null, 'Unknown action: ' . $action);
    }

} catch (Exception $e) {
    error_log('CineShelf API Error: ' . $e->getMessage());
    error_log('Stack trace: ' . $e->getTraceAsString());
    jsonResponse(false, null, 'Server error: ' . $e->getMessage());
}