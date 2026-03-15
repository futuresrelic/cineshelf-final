# CineShelf Developer Guide

**Version:** 2.9.0
**Last Updated:** February 14, 2026
**Repository:** https://github.com/futuresrelic/cineshelf-final

---

## 📚 Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [API Keys & Configuration](#3-api-keys--configuration)
4. [Database Schema](#4-database-schema)
5. [AI Cover Scanner](#5-ai-cover-scanner)
6. [Movie Matching System](#6-movie-matching-system)
7. [Shelf Management](#7-shelf-management)
8. [Core Features](#8-core-features)
9. [Version Management & Cache Busting](#85-version-management--cache-busting)
10. [Bulk Data Editor](#86-bulk-data-editor)
11. [Box Set AI Cover Scanning](#87-box-set-ai-cover-scanning)
12. [Box Set Movie Scanner](#88-box-set-movie-scanner)
13. [Development Setup](#9-development-setup)
14. [Deployment](#10-deployment)
15. [API Reference](#11-api-reference)
16. [Troubleshooting](#12-troubleshooting)

---

## 1. Project Overview

**CineShelf** is a Progressive Web Application for managing physical movie collections (DVDs, Blu-rays, 4K discs). It combines traditional collection management with modern features like AI-powered cover scanning and physical shelf organization.

### Key Technologies

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Backend**: PHP 8.x with SQLite
- **Database**: SQLite 3 (WAL mode for concurrency)
- **APIs**: TMDB, OpenAI Vision, Google OAuth 2.0
- **Deployment**: Railway (PaaS)

### Core Features

1. ✅ **Collection Management** - Track movies with format, edition, condition
2. 📸 **AI Cover Scanner** - Scan DVD covers with phone camera (OpenAI Vision)
3. 📚 **Physical Shelf Organization** - Map digital collection to physical shelves
4. 🎯 **Wishlist** - Track movies you want with priority levels
5. 📥 **CSV Import** - Bulk import from spreadsheets
6. 🎮 **Trivia Game** - AI-generated movie trivia
7. 👥 **Multi-User Groups** - Share collections with family
8. 🔐 **Google OAuth** - Secure authentication

---

## 2. Architecture

### File Structure

```
cineshelf-final/
├── cineshelf.futuresrelic.com/          # Web root
│   ├── index.html                        # Main SPA entry point
│   ├── service-worker.js                 # PWA offline support
│   ├── manifest.php                      # PWA manifest
│   │
│   ├── api/                              # Backend
│   │   ├── api.php                       # Main API router (3000+ lines)
│   │   ├── auth.php                      # OAuth handler
│   │   └── schema.sql                    # Database schema
│   │
│   ├── config/                           # Configuration
│   │   ├── config.php                    # App config & DB functions
│   │   └── oauth-config.php              # OAuth credentials
│   │
│   ├── js/                               # Frontend JavaScript
│   │   ├── app.js                        # Main app (4800+ lines)
│   │   ├── cover-scanner.js              # AI scanner
│   │   ├── trivia.js                     # Trivia game
│   │   └── auth.js                       # Auth frontend
│   │
│   ├── css/
│   │   └── styles.css                    # Main stylesheet (3300+ lines)
│   │
│   ├── admin/                            # Admin tools
│   │   ├── index.html                    # Admin panel
│   │   ├── backfill-metadata.php         # Metadata backfill tool
│   │   ├── database-tools/               # DB utilities
│   │   ├── migration-tools/              # Schema migrations
│   │   └── data-tools/                   # Data cleanup
│   │
│   └── data/                             # Data directory (persistent)
│       ├── cineshelf.sqlite              # Main database
│       └── php-errors.log                # Error logs
│
├── DEV_GUIDE.md                          # This file
├── USER_GUIDE.md                         # User documentation
├── ADMIN_GUIDE.md                        # Admin documentation
└── CHANGELOG.md                          # Version history
```

### Request Flow

```
User Browser
    ↓
index.html (SPA loads)
    ↓
app.js initializes
    ↓
API Call: fetch('/api/api.php', {action: 'get_collection'})
    ↓
api.php receives POST request
    ↓
config.php provides getDb() connection
    ↓
Query SQLite database
    ↓
Return JSON response
    ↓
app.js updates DOM
```

### Data Flow

```
[Collection Tab]
  ↓
  GET /api/api.php {action: 'get_collection'}
  ↓
  SELECT * FROM copies JOIN movies WHERE user_id = ?
  ↓
  JSON response with movie + copy data
  ↓
  Render grid/list view

[Add Movie]
  ↓
  Search TMDB API
  ↓
  User selects match
  ↓
  POST {action: 'add_to_collection', tmdb_id: 123}
  ↓
  INSERT INTO movies (if not exists)
  ↓
  INSERT INTO copies
  ↓
  Refresh collection view
```

---

## 3. API Keys & Configuration

### Required Environment Variables

CineShelf uses environment variables for secure configuration. **Never commit API keys to git.**

```bash
# Database (optional - defaults to data/cineshelf.sqlite)
DB_PATH=/app/data/cineshelf.sqlite

# TMDB API (required for movie metadata)
TMDB_API_KEY=8039283176a74ffd71a1658c6f84a051

# Google OAuth (required for authentication)
GOOGLE_CLIENT_ID=754407099284-tqu2gj2b2ifm01ti34eqto6mejou75pr.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_REDIRECT_URI=https://cineshelf-final-production.up.railway.app/api/auth.php

# OpenAI (required for AI cover scanner)
OPENAI_API_KEY=sk-proj-[your_key_here]

# OMDb API (optional - enables OMDB tab in Scan & Match; free key at omdbapi.com)
OMDB_API_KEY=

# Debug Mode (optional - defaults to false)
DEBUG_MODE=false
```

### How to Obtain API Keys

#### 1. TMDB API Key (FREE)

**Purpose**: Fetch movie metadata (titles, posters, cast, genres)

**Steps**:
1. Create account at https://www.themoviedb.org/
2. Go to Settings → API
3. Request API key (free tier includes 40 requests/10 seconds)
4. Copy the v3 API key (NOT v4 Bearer token)

**Current Key**: `8039283176a74ffd71a1658c6f84a051`  
**Rate Limit**: 40 requests per 10 seconds  
**Cost**: Free forever

#### 2. Google OAuth Credentials (FREE)

**Purpose**: User authentication via Google accounts

**Steps**:
1. Go to https://console.cloud.google.com/
2. Create new project: "CineShelf"
3. Enable APIs: Google+ API
4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
5. Application type: Web application
6. Authorized redirect URIs:
   ```
   https://yourdomain.com/api/auth.php
   http://localhost:8000/api/auth.php (for dev)
   ```
7. Copy Client ID and Client Secret

**Current Credentials**:
- Client ID: `754407099284-tqu2gj2b2ifm01ti34eqto6mejou75pr.apps.googleusercontent.com`
- Client Secret: `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`
- Redirect URI: `https://cineshelf-final-production.up.railway.app/api/auth.php`

**IMPORTANT**: Update redirect URI when changing domains!

#### 3. OpenAI API Key (PAID)

**Purpose**: AI-powered DVD cover recognition

**Steps**:
1. Create account at https://platform.openai.com/
2. Add payment method (required for API access)
3. Go to API Keys
4. Create new secret key
5. Copy key (starts with `sk-proj-` or `sk-`)

**Model Used**: `gpt-4o-mini` (vision model)  
**Cost**: ~$0.01-0.02 per image scan  
**Monthly Estimate**: $5-10 for casual use

**Image Quality Settings**:
```javascript
// cover-scanner.js
canvas.toDataURL('image/jpeg', 0.8) // 80% quality
// Balances cost vs. accuracy
```

### Configuration Files

#### config/config.php

Main configuration file:

```php
// Load from environment variables first
$tmdbKey = getenv('TMDB_API_KEY');
$openaiKey = getenv('OPENAI_API_KEY');

// Fallback to hardcoded (not recommended for production)
if (!$tmdbKey) {
    $tmdbKey = '8039283176a74ffd71a1658c6f84a051';
    error_log('WARNING: Using hardcoded TMDB_API_KEY');
}

define('TMDB_API_KEY', $tmdbKey);
define('TMDB_BASE_URL', 'https://api.themoviedb.org/3');
define('TMDB_IMAGE_BASE', 'https://image.tmdb.org/t/p/w500');
define('OPENAI_API_KEY', $openaiKey ?: '');
define('OPENAI_MODEL', 'gpt-4o-mini');
```

**Key Functions**:
- `getDb()` - Returns PDO connection with optimizations
- `sanitize($str)` - Input sanitization
- `jsonResponse($ok, $data, $error)` - Standard API response
- `logAction($db, $userId, $action)` - Audit logging

#### config/oauth-config.php

OAuth-specific configuration:

```php
$googleClientId = getenv('GOOGLE_CLIENT_ID');
$googleClientSecret = getenv('GOOGLE_CLIENT_SECRET');
$googleRedirectUri = getenv('GOOGLE_REDIRECT_URI');

define('GOOGLE_AUTH_URL', 'https://accounts.google.com/o/oauth2/v2/auth');
define('GOOGLE_TOKEN_URL', 'https://oauth2.googleapis.com/token');
define('GOOGLE_USERINFO_URL', 'https://www.googleapis.com/oauth2/v2/userinfo');
define('SESSION_LIFETIME', 30 * 24 * 60 * 60); // 30 days
```

### Setting Environment Variables

#### Railway (Production)

1. Go to Railway project dashboard
2. Click "Variables" tab
3. Add each variable:
   ```
   TMDB_API_KEY=your_key
   OPENAI_API_KEY=sk-your_key
   GOOGLE_CLIENT_ID=your_id
   GOOGLE_CLIENT_SECRET=your_secret
   GOOGLE_REDIRECT_URI=https://your-domain.up.railway.app/api/auth.php
   ```
4. Deploy - Railway auto-restarts with new vars

#### Local Development

**Option A: Shell export**
```bash
export TMDB_API_KEY="8039283176a74ffd71a1658c6f84a051"
export OPENAI_API_KEY="sk-your-key"
php -S localhost:8000
```

**Option B: Create config/secrets.php**
```php
<?php
return [
    'TMDB_API_KEY' => '8039283176a74ffd71a1658c6f84a051',
    'OPENAI_API_KEY' => 'sk-your-key',
    'GOOGLE_CLIENT_ID' => 'your_id',
    'GOOGLE_CLIENT_SECRET' => 'your_secret',
    'GOOGLE_REDIRECT_URI' => 'http://localhost:8000/api/auth.php'
];
```

**Add to .gitignore:**
```
config/secrets.php
.env
```

---

## 4. Database Schema

CineShelf uses SQLite with the following optimizations:

```sql
PRAGMA foreign_keys = ON;           -- Enforce relationships
PRAGMA journal_mode = WAL;          -- Write-Ahead Logging
PRAGMA synchronous = NORMAL;        -- Balance speed/safety
PRAGMA temp_store = MEMORY;         -- Temp tables in RAM
PRAGMA cache_size = 10000;          -- 10MB cache
```

### Core Tables

#### users
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    google_id TEXT UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    is_admin INTEGER DEFAULT 0,
    settings_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose**: User accounts  
**Auth**: Google OAuth or legacy username

#### movies
```sql
CREATE TABLE movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdb_id INTEGER UNIQUE,
    title TEXT NOT NULL,
    display_title TEXT,              -- User-custom title
    year INTEGER,
    director TEXT,
    actors TEXT,                      -- Top 5, comma-separated
    studio TEXT,
    genre TEXT,                       -- Comma-separated
    runtime INTEGER,
    rated TEXT,                       -- PG, PG-13, R, etc.
    poster_url TEXT,
    backdrop_url TEXT,
    overview TEXT,
    media_type TEXT DEFAULT 'movie',  -- 'movie' or 'tv'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_movies_tmdb_id ON movies(tmdb_id);
```

**Purpose**: Movie metadata (shared across all users)  
**Source**: TMDB API

#### copies
```sql
CREATE TABLE copies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    format TEXT CHECK(format IN ('DVD', 'Blu-ray', '4K', 'Digital')),
    edition TEXT,                     -- Special Edition, Director's Cut
    region TEXT,                      -- Region A, Region 1, etc.
    condition TEXT CHECK(condition IN ('New', 'Like New', 'Good', 'Fair', 'Poor')),
    purchase_date TEXT,
    purchase_price REAL,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_copies_user_movie ON copies(user_id, movie_id);
```

**Purpose**: User's physical copies  
**Key**: One user can own multiple copies of same movie (different formats)

#### shelves
```sql
CREATE TABLE shelves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,               -- "Living Room Shelf"
    description TEXT,
    color TEXT DEFAULT '#667eea',     -- Hex color
    icon TEXT DEFAULT '📚',           -- Emoji icon
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Purpose**: Physical shelf locations

#### shelf_assignments
```sql
CREATE TABLE shelf_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shelf_id INTEGER NOT NULL,
    copy_id INTEGER NOT NULL,
    position_in_shelf INTEGER,        -- Order on shelf (left to right)
    notes TEXT,
    assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE,
    FOREIGN KEY (copy_id) REFERENCES copies(id) ON DELETE CASCADE,
    UNIQUE(shelf_id, copy_id)         -- Copy can only be on one shelf
);

CREATE INDEX idx_shelf_assignments_shelf ON shelf_assignments(shelf_id);
CREATE INDEX idx_shelf_assignments_copy ON shelf_assignments(copy_id);
```

**Purpose**: Map copies to physical shelves

#### wishlist
```sql
CREATE TABLE wishlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    movie_id INTEGER NOT NULL,
    priority INTEGER DEFAULT 1,       -- 1=High, 2=Medium, 3=Low
    target_format TEXT,               -- Preferred format
    notes TEXT,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    UNIQUE(user_id, movie_id)
);
```

**Purpose**: Movies user wants to buy

#### unresolved_copies
```sql
CREATE TABLE unresolved_copies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,              -- From scanner or CSV
    format TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Purpose**: Scanned titles pending TMDB match

### Supporting Tables

- `groups` - User groups for sharing
- `group_members` - Group membership
- `trivia_sessions` - Trivia game sessions
- `trivia_questions` - AI-generated questions
- `audit_log` - Action history

### Relationships

```
users (1) ──< (many) copies
movies (1) ──< (many) copies
copies (1) ──< (1) shelf_assignments
shelves (1) ──< (many) shelf_assignments

users (1) ──< (many) wishlist
movies (1) ──< (many) wishlist

users (1) ──< (many) unresolved_copies
```

---

## 5. AI Cover Scanner

### Overview

The AI Cover Scanner uses OpenAI's Vision API (GPT-4V) to recognize movie titles from DVD/Blu-ray covers captured via phone camera.

### Architecture

```
┌─────────────────┐
│ User's Phone    │
│ Camera          │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ HTML5 getUserMedia()    │
│ <video> live preview    │
└────────┬────────────────┘
         │
         ▼ [User clicks "Capture"]
┌─────────────────────────┐
│ Canvas draws video frame│
│ Convert to JPEG (80%)   │
│ Encode base64           │
└────────┬────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ POST /api/api.php                │
│ {                                │
│   action: 'scan_cover_image',   │
│   image: 'base64_jpeg_data...'   │
│ }                                │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ api.php backend                  │
│ - Validate image data            │
│ - Call OpenAI Vision API         │
│ - Extract title from response    │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ OpenAI Vision API                │
│ Model: gpt-4o-mini               │
│ Prompt: "What movie title is on  │
│         this DVD cover? Reply    │
│         with ONLY the title."    │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Response: "Inception"            │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Add to batch list                │
│ (localStorage)                   │
└────────┬─────────────────────────┘
         │
         ▼ [User clicks "Process Batch"]
┌──────────────────────────────────┐
│ Add all titles to                │
│ unresolved_copies table          │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Navigate to "Resolve" tab        │
│ User matches with TMDB           │
└──────────────────────────────────┘
```

### Frontend Implementation (cover-scanner.js)

#### Opening Scanner

```javascript
async function openScanner() {
    // Detect iOS (requires special handling)
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    // Request camera access
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: { ideal: 'environment' },  // Rear camera
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        }
    });

    video.srcObject = stream;

    // iOS requires these attributes
    if (iOS) {
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
    }

    await video.play();
}
```

#### Capturing Image

```javascript
async function captureAndAnalyze() {
    // Draw video frame to canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Convert to base64 JPEG
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    const base64Image = imageData.split(',')[1];

    // Send to backend
    const title = await recognizeWithAI(base64Image);

    if (title) {
        addToBatchList(title);
        flashSuccessIndicator();
    }
}
```

#### API Call

```javascript
async function recognizeWithAI(base64Image) {
    const response = await fetch('/api/api.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            action: 'scan_cover_image',
            image: base64Image
        })
    });

    const result = await response.json();
    return result.data?.title;
}
```

### Backend Implementation (api.php)

```php
case 'scan_cover_image':
    $base64Image = $input['image'] ?? '';

    if (empty($base64Image)) {
        jsonResponse(false, null, 'No image provided');
    }

    if (empty(OPENAI_API_KEY)) {
        jsonResponse(false, null, 'OpenAI API key not configured');
    }

    $title = recognizeCoverWithOpenAI($base64Image);
    jsonResponse(true, ['title' => $title]);

function recognizeCoverWithOpenAI($base64Image) {
    $ch = curl_init('https://api.openai.com/v1/chat/completions');

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . OPENAI_API_KEY
        ],
        CURLOPT_POSTFIELDS => json_encode([
            'model' => 'gpt-4o-mini',
            'messages' => [[
                'role' => 'user',
                'content' => [
                    [
                        'type' => 'text',
                        'text' => 'What is the movie title on this DVD/Blu-ray cover? Reply with ONLY the title, nothing else. If you cannot determine the title, reply with "UNKNOWN".'
                    ],
                    [
                        'type' => 'image_url',
                        'image_url' => [
                            'url' => 'data:image/jpeg;base64,' . $base64Image
                        ]
                    ]
                ]
            ]],
            'max_tokens' => 50,
            'temperature' => 0.1  // Low temperature for consistency
        ])
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        error_log("OpenAI API error: HTTP $httpCode");
        return 'UNKNOWN';
    }

    $data = json_decode($response, true);
    $title = $data['choices'][0]['message']['content'] ?? 'UNKNOWN';

    return trim($title);
}
```

### Batch Processing

```javascript
let scanList = []; // Array of {id, title, timestamp}

function addToBatchList(title) {
    const id = Date.now();
    scanList.push({ id, title, timestamp: new Date().toISOString() });

    // Save to localStorage (persist across page reloads)
    localStorage.setItem('cineshelf_scan_batch', JSON.stringify(scanList));

    renderBatchList();
    updateBatchCount();
}

async function processBatch() {
    // Add all titles as unresolved
    for (const item of scanList) {
        await fetch('/api/api.php', {
            method: 'POST',
            body: JSON.stringify({
                action: 'add_unresolved',
                title: item.title
            })
        });
    }

    // Clear batch
    scanList = [];
    localStorage.removeItem('cineshelf_scan_batch');

    // Navigate to Resolve tab
    App.switchTab('resolve');

    alert(`✅ ${count} titles added to Resolve tab!`);
}
```

### Camera Permissions

**iOS Safari:**
- Requires HTTPS (or localhost)
- User must grant permission in Safari settings
- Special video attributes required

**Android Chrome:**
- Requires HTTPS (or localhost)
- Permission prompt on first use

**Error Handling:**
```javascript
try {
    stream = await navigator.mediaDevices.getUserMedia({...});
} catch (error) {
    if (error.name === 'NotAllowedError') {
        if (isIOS()) {
            alert('Camera permission denied. Go to Settings > Safari > Camera');
        } else {
            alert('Camera permission denied. Check browser settings.');
        }
    } else if (error.name === 'NotFoundError') {
        alert('No camera found on this device');
    } else if (error.name === 'OverconstrainedError') {
        alert('Camera constraints not supported. Try different device.');
    }
}
```

### Cost Optimization

**Image Quality:**
```javascript
canvas.toDataURL('image/jpeg', 0.8)
// 80% quality = good balance of size vs. accuracy
// Lower = cheaper but less accurate
// Higher = more expensive but better accuracy
```

**Batch Processing:**
- Scan 10-20 covers
- Process all at once
- Reduces per-scan overhead

**Estimated Costs:**
- GPT-4V Mini: $0.01-0.02 per image
- 100 scans = $1-2
- 1000 scans = $10-20

---

## 6. Movie Matching System

### Overview

When movies are scanned or imported, they need to be matched with TMDB to get complete metadata (poster, cast, genres, etc.).

### Matching Flow

```
1. User Action
   ├─ Scan DVD cover → title added to batch
   ├─ Import CSV → titles parsed
   └─ Manual entry → title typed

2. Add to unresolved_copies
   INSERT INTO unresolved_copies (user_id, title, format)

3. Navigate to "Resolve" tab
   Load all unresolved for current user

4. For each unresolved:
   ├─ Search TMDB API
   ├─ Show top 5 matches with posters
   └─ User clicks correct match

5. User confirms match
   ├─ Fetch full movie data from TMDB
   │   - Title, year, runtime
   │   - Cast (top 5 actors)
   │   - Crew (director)
   │   - Genres (comma-separated)
   │   - Studio (first production company)
   │   - Posters (w500 size)
   ├─ INSERT INTO movies (if doesn't exist)
   └─ INSERT INTO copies

6. Delete from unresolved_copies
   Resolved! Movie now in collection
```

### TMDB Search API

**Endpoint:** `GET /search/movie?api_key={key}&query={title}`

```php
function searchTMDB($title) {
    $url = TMDB_BASE_URL . '/search/movie?' . http_build_query([
        'api_key' => TMDB_API_KEY,
        'query' => $title,
        'language' => 'en-US',
        'page' => 1
    ]);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    $response = curl_exec($ch);
    curl_close($ch);

    $data = json_decode($response, true);
    return $data['results'] ?? [];
}
```

**Example Response:**
```json
{
  "page": 1,
  "results": [
    {
      "id": 27205,
      "title": "Inception",
      "release_date": "2010-07-16",
      "poster_path": "/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
      "overview": "Cobb, a skilled thief who commits corporate espionage...",
      "vote_average": 8.4,
      "genre_ids": [28, 878, 53]
    },
    {
      "id": 198663,
      "title": "Inception: The Cobol Job",
      "release_date": "2010-05-05",
      "poster_path": "/..."
    }
  ],
  "total_results": 2
}
```

### Fetching Full Movie Data

**Endpoint:** `GET /movie/{tmdb_id}?api_key={key}&append_to_response=credits`

```php
function fetchMovieDetails($tmdbId) {
    $url = TMDB_BASE_URL . "/movie/{$tmdbId}?" . http_build_query([
        'api_key' => TMDB_API_KEY,
        'append_to_response' => 'credits',  // Include cast & crew
        'language' => 'en-US'
    ]);

    $response = file_get_contents($url);
    return json_decode($response, true);
}
```

**Extract Metadata:**

```php
$data = fetchMovieDetails($tmdbId);

// Director
$director = '';
foreach ($data['credits']['crew'] as $person) {
    if ($person['job'] === 'Director') {
        $director = $person['name'];
        break;
    }
}

// Top 5 Actors
$topActors = array_slice($data['credits']['cast'], 0, 5);
$actors = implode(', ', array_column($topActors, 'name'));

// Studio (first production company)
$studio = '';
if (!empty($data['production_companies'])) {
    $studio = $data['production_companies'][0]['name'];
}

// Genres
$genreNames = array_column($data['genres'], 'name');
$genres = implode(', ', $genreNames);

// Insert into movies table
$stmt = $db->prepare("
    INSERT INTO movies (
        tmdb_id, title, year, director, actors, studio, genre,
        runtime, rated, poster_url, backdrop_url, overview
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tmdb_id) DO UPDATE SET
        director = excluded.director,
        actors = excluded.actors,
        studio = excluded.studio,
        genre = excluded.genre
");

$stmt->execute([
    $data['id'],
    $data['title'],
    (int) substr($data['release_date'], 0, 4),
    $director,
    $actors,
    $studio,
    $genres,
    $data['runtime'],
    $data['rated'] ?? '',
    TMDB_IMAGE_BASE . $data['poster_path'],
    TMDB_IMAGE_BASE . $data['backdrop_path'],
    $data['overview']
]);
```

### Backfill Metadata Tool

**Location:** `/admin/backfill-metadata.php`

**Purpose:** Fetch missing metadata for existing movies

**When to Use:**
- After CSV import (often missing actors, genres)
- Database migration
- TMDB data updates

**Process:**

```php
// 1. Count movies missing metadata
$stmt = $db->query("
    SELECT COUNT(*) FROM movies
    WHERE actors IS NULL OR actors = ''
       OR studio IS NULL OR studio = ''
       OR director IS NULL OR director = ''
       OR genre IS NULL OR genre = ''
");
$missingCount = $stmt->fetchColumn();

// 2. Process in batches of 10
for ($offset = 0; $offset < $missingCount; $offset += 10) {
    $stmt = $db->prepare("
        SELECT id, tmdb_id, title FROM movies
        WHERE actors IS NULL OR actors = ''
           OR studio IS NULL OR studio = ''
        LIMIT 10 OFFSET ?
    ");
    $stmt->execute([$offset]);
    $movies = $stmt->fetchAll();

    foreach ($movies as $movie) {
        // Fetch from TMDB
        $data = fetchMovieDetails($movie['tmdb_id']);

        // Update movie
        updateMovieMetadata($db, $movie['id'], $data);

        // Rate limiting: 40 requests / 10 seconds
        usleep(250000); // 250ms delay
    }

    // Update progress bar
    $percent = round(($offset / $missingCount) * 100);
    echo json_encode(['progress' => $percent]);
}
```

**Handling 404 Errors:**

```php
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if ($httpCode === 404) {
    // Movie not in TMDB (obscure title, foreign film, etc.)
    // Mark as "N/A" so it won't be retried
    $db->prepare("
        UPDATE movies
        SET actors = 'N/A', studio = 'N/A', director = 'N/A', genre = 'N/A'
        WHERE id = ?
    ")->execute([$movie['id']]);

    $logs[] = "Skipped: {$movie['title']} (not found in TMDB)";
}
```

### Rate Limiting

**TMDB Free Tier:**
- 40 requests per 10 seconds
- ~240 requests per minute
- No daily limit

**Backfill Strategy:**
- Batch size: 10 movies
- Delay between batches: 500ms
- Allows ~20 movies/second (120/minute)
- Well under rate limit

**Error Handling:**
```php
if ($httpCode === 429) {
    // Rate limit exceeded
    sleep(10); // Wait 10 seconds
    retry($tmdbId);
}
```

---

## 7. Shelf Management

### Overview

Shelves represent physical storage locations. Users can organize their collection to mirror their real-world setup.

**Example Use Cases:**
- "Living Room Shelf" - General collection
- "Kubrick Collection" - Director-specific box set
- "Disney Animation" - Genre/studio collection
- "Kids' Movies" - Content-based organization

### Database Structure

```sql
-- Define shelf
CREATE TABLE shelves (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    name TEXT,              -- "Kubrick Collection"
    description TEXT,       -- "Stanley Kubrick films"
    color TEXT,            -- "#667eea" (for visual view)
    icon TEXT              -- "🎬" (emoji)
);

-- Assign movies to shelf
CREATE TABLE shelf_assignments (
    shelf_id INTEGER,
    copy_id INTEGER,
    position_in_shelf INTEGER,  -- Order (left to right)
    notes TEXT
);
```

**Example Data:**
```sql
INSERT INTO shelves (user_id, name, description, color, icon) VALUES
(1, 'Kubrick Collection', 'Stanley Kubrick masterpieces', '#667eea', '🎬'),
(1, 'Disney Animation', 'Classic Disney animated films', '#764ba2', '🏰'),
(1, 'Living Room', 'Main collection shelf', '#10b981', '📚');

INSERT INTO shelf_assignments (shelf_id, copy_id, position_in_shelf) VALUES
(1, 42, 0),  -- 2001: A Space Odyssey
(1, 43, 1),  -- A Clockwork Orange
(1, 44, 2);  -- The Shining
```

### View Modes

#### 1. List View

Traditional table view:

```
+---------------------------+-------+-------------+
| Shelf Name                | Count | Actions     |
+---------------------------+-------+-------------+
| 🎬 Kubrick Collection     | 10    | View | Edit |
| 🏰 Disney Animation        | 25    | View | Edit |
| 📚 Living Room            | 150   | View | Edit |
+---------------------------+-------+-------------+
```

#### 2. Visual View

Simulates physical bookshelf with vertical "spines":

```
🎬 Kubrick Collection (10 movies)
[────────────────────────────────────────]
 ║ ║ ║ ║ ║ ║ ║ ║ ║ ║
 ║ ║ ║ ║ ║ ║ ║ ║ ║ ║
 2 A T F D E F T S T
 0 . . u r o y K h h
 0 C h l . e e u i e
 1 l e l . . s b n K
 : o .   . . .   i i
 A c S . . . . . n d
   k h . . . . . g
   w i . . . . .
   o n . . . . .
   r i . . . . .
   k n . . . . .
     g . . . . .
```

**CSS Implementation:**
```css
.visual-shelf-spines {
    display: flex;
    gap: 2px;
    min-height: 200px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 1rem;
}

.movie-spine {
    min-width: 40px;
    width: 40px;
    height: 180px;
    background: #667eea;  /* Shelf color */
    border-radius: 4px;
    cursor: pointer;
    box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
}

.spine-title {
    writing-mode: vertical-rl;      /* Vertical text */
    text-orientation: mixed;
    font-size: 0.75rem;
    font-weight: 600;
    color: white;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
    padding: 0.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
}
```

**JavaScript Rendering:**
```javascript
async function renderShelvesVisual() {
    // Fetch shelves with their contents
    const shelvesWithMovies = await Promise.all(
        shelves.map(async (shelf) => {
            const contents = await apiCall('get_shelf_contents', {
                shelf_id: shelf.id
            });
            return { ...shelf, movies: contents || [] };
        })
    );

    // Render each shelf
    container.innerHTML = shelvesWithMovies.map(shelf => `
        <div class="visual-shelf">
            <h3 style="color: ${shelf.color}">
                ${shelf.icon} ${shelf.name}
                <span style="opacity: 0.6">(${shelf.movies.length} movies)</span>
            </h3>
            <div class="visual-shelf-spines">
                ${shelf.movies.map(movie => `
                    <div class="movie-spine"
                         style="background: ${shelf.color}"
                         data-copy-id="${movie.copy_id}"
                         title="${movie.display_title || movie.title}">
                        <span class="spine-title">
                            ${movie.display_title || movie.title}
                        </span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}
```

### Multi-Select Assignment

**Problem:** Manually adding 50 movies one-by-one is tedious

**Solution:** Multi-select with filters

```javascript
// State
let selectedCopyIds = new Set();
let filteredUnassignedMovies = [];

// Select movie
function toggleMovieSelection(copyId) {
    if (selectedCopyIds.has(copyId)) {
        selectedCopyIds.delete(copyId);
    } else {
        selectedCopyIds.add(copyId);
    }
    renderUnassignedMovies();
}

// Select all filtered results
function selectAllUnassigned() {
    filteredUnassignedMovies.forEach(item => {
        selectedCopyIds.add(item.copy_id);
    });
    renderUnassignedMovies();
}

// Deselect all
function deselectAllUnassigned() {
    selectedCopyIds.clear();
    renderUnassignedMovies();
}
```

**UI:**
```html
<div class="unassigned-movie-card selected" data-copy-id="42">
    <input type="checkbox" checked class="movie-checkbox">
    <img src="poster.jpg">
    <h4>Inception</h4>
</div>
```

### Filter System

```javascript
let unassignedFilter = {
    search: '',
    sort: 'title',
    director: 'all',
    genre: 'all',
    studio: 'all'
};

function renderUnassignedMovies() {
    let filtered = [...unassignedMovies];

    // Apply search
    if (unassignedFilter.search) {
        const search = unassignedFilter.search.toLowerCase();
        filtered = filtered.filter(item =>
            item.title.toLowerCase().includes(search) ||
            item.display_title?.toLowerCase().includes(search)
        );
    }

    // Apply director filter
    if (unassignedFilter.director !== 'all') {
        filtered = filtered.filter(item =>
            item.director === unassignedFilter.director
        );
    }

    // Apply genre filter
    if (unassignedFilter.genre !== 'all') {
        filtered = filtered.filter(item =>
            item.genre?.includes(unassignedFilter.genre)
        );
    }

    // Apply studio filter
    if (unassignedFilter.studio !== 'all') {
        filtered = filtered.filter(item =>
            item.studio?.includes(unassignedFilter.studio)
        );
    }

    // Apply sort
    filtered.sort((a, b) => {
        switch (unassignedFilter.sort) {
            case 'title':
                return a.title.localeCompare(b.title);
            case 'year':
                return (b.year || 0) - (a.year || 0);
            case 'director':
                return (a.director || '').localeCompare(b.director || '');
        }
    });

    // Store for "Select All"
    filteredUnassignedMovies = filtered;

    // Render HTML...
}
```

**Populate Filter Dropdowns:**
```javascript
function updateUnassignedFilters() {
    // Get unique directors
    const directors = new Set();
    unassignedMovies.forEach(item => {
        if (item.director && item.director !== 'N/A') {
            directors.add(item.director);
        }
    });

    document.getElementById('unassignedDirectorFilter').innerHTML =
        '<option value="all">All Directors</option>' +
        Array.from(directors).sort().map(d =>
            `<option value="${d}">${d}</option>`
        ).join('');

    // Same for genres, studios...
}
```

### Bulk Assignment

```javascript
async function confirmAssignToShelf() {
    const shelfId = parseInt(document.getElementById('assignShelfSelect').value);
    const copyIds = Array.from(selectedCopyIds);

    let successCount = 0;
    let errorCount = 0;

    for (const copyId of copyIds) {
        try {
            await apiCall('assign_to_shelf', {
                shelf_id: shelfId,
                copy_id: copyId
            });
            successCount++;
        } catch (e) {
            errorCount++;
        }
    }

    showToast(`${successCount} movie(s) assigned to shelf!`, 'success');

    // Clear selection
    selectedCopyIds.clear();

    // Reload unassigned list
    const unassigned = await apiCall('get_unassigned_copies');
    unassignedMovies = unassigned;

    // Reset filters
    unassignedFilter = {
        search: '',
        sort: 'title',
        director: 'all',
        genre: 'all',
        studio: 'all'
    };

    renderUnassignedMovies();

    // Refresh shelf view
    await loadShelves();
    if (shelfView === 'visual') {
        await renderShelvesVisual();
    }
}
```

**Example Workflow:**
1. User creates shelf: "Disney Animation"
2. Clicks "View Unassigned Movies"
3. Filters by Studio: "Walt Disney Pictures"
4. Clicks "Select All" (selects 25 movies)
5. Clicks "Assign Selected to Shelf"
6. Chooses "Disney Animation"
7. All 25 movies assigned instantly!

### Hierarchical Shelves (v2.2.14+)

**NEW:** Shelves now support unlimited nesting levels for complex organization.

**Database Schema:**
```sql
CREATE TABLE shelves (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    name TEXT,
    description TEXT,
    color TEXT,
    icon TEXT,
    parent_shelf_id INTEGER DEFAULT NULL,  -- NEW: References parent shelf
    FOREIGN KEY (parent_shelf_id) REFERENCES shelves(id) ON DELETE CASCADE
);
```

**Example Hierarchical Structure:**
```
📚 Shelves (parent)
├── 🎬 Directors (parent)
│   ├── 🎥 Kubrick Collection (5 movies)
│   ├── 🎞️ Tarantino Films (8 movies)
│   └── 🌟 Spielberg Classics (12 movies)
└── 🏰 Animation (parent)
    ├── 🦁 Disney Collection (25 movies)
    └── 🎨 Pixar Films (15 movies)
```

**Key Features:**
1. **Infinite Nesting** - No depth limit
2. **Recursive Aggregation** - Parent shelves show all movies from children
3. **Automatic Deduplication** - Same movie in multiple children shown once
4. **Visual Indentation** - UI shows hierarchy clearly

**Implementation:**
```javascript
// Recursive function to get all movies from shelf + descendants
const getAllMoviesRecursive = (shelfId) => {
    const directMovies = shelfMoviesMap[shelfId] || [];
    const children = childShelvesByParent[shelfId] || [];

    let allMovies = [...directMovies];

    // Recursively collect from children
    children.forEach(child => {
        const childMovies = getAllMoviesRecursive(child.id);
        allMovies = allMovies.concat(childMovies);
    });

    // Deduplicate by movie_id
    const uniqueMovies = [];
    const seenIds = new Set();
    allMovies.forEach(movie => {
        if (!seenIds.has(movie.movie_id)) {
            seenIds.add(movie.movie_id);
            uniqueMovies.push(movie);
        }
    });

    return uniqueMovies;
};
```

### Box Set System (v2.2.15+)

**NEW:** Multi-movie containers for box sets, trilogies, and double features.

**Overview:**
The box set system allows users to represent physical media containing multiple movies in a single case. For example, "The Matrix Trilogy" box set contains 3 movies but occupies one physical spine on a shelf.

**Database Tables:**

```sql
CREATE TABLE containers (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,                -- "The Matrix Trilogy"
    spine_label TEXT,                  -- "THE MATRIX TRILOGY"
    format TEXT,                       -- "Blu-ray Box Set"
    edition TEXT,                      -- "Ultimate Collection"
    condition TEXT,                    -- "Mint", "Like New", etc.
    notes TEXT,
    created_at TEXT
);

CREATE TABLE container_contents (
    id INTEGER PRIMARY KEY,
    container_id INTEGER NOT NULL,
    copy_id INTEGER NOT NULL,          -- FK to copies table
    disc_number INTEGER DEFAULT 1,     -- Disc 1, 2, 3, etc.
    created_at TEXT
);
```

**Key Relationships:**
```
containers (1) ──< (many) container_contents
container_contents (many) >── (1) copies
copies (many) >── (1) movies
```

**State Management:**

The box set creation flow maintains state through three key variables in app.js:

```javascript
let currentContainerId = null;  // Active container being created/edited
let currentContainer = null;    // Full container data object
let boxSetMovies = [];         // Local array of movies added to box set
```

**Critical State Preservation Pattern:**

```javascript
function closeBoxSetDetails() {
    document.getElementById('boxSetDetailsModal').classList.remove('active');

    // DON'T clear state if we're in creation mode
    const step2 = document.getElementById('boxSetStep2');
    const isCreating = step2 && step2.style.display !== 'none';

    if (!isCreating) {
        currentContainerId = null;
        currentContainer = null;
    }
}
```

This pattern prevents the "ERROR: No container selected" bug by checking if the user is mid-creation before clearing state.

**Edit Mode Implementation:**

```javascript
async function editBoxSet() {
    if (!currentContainerId || !currentContainer) return;

    // Close details modal
    document.getElementById('boxSetDetailsModal').classList.remove('active');

    // Navigate to Add tab and show Step 2
    switchTab('add');
    document.getElementById('boxSetStep1').style.display = 'none';
    document.getElementById('boxSetStep2').style.display = 'block';

    // Fetch existing movies from backend
    const data = await apiCall('get_container_contents', {
        container_id: currentContainerId
    });

    // Populate local state
    boxSetMovies = data.movies.map((m, index) => ({
        movie_id: m.movie_id,
        title: m.title,
        year: m.year,
        poster_url: m.poster_url,
        tmdb_id: m.tmdb_id,
        copy_id: m.copy_id,
        disc_number: m.disc_number || (index + 1)
    }));

    // Update UI
    updateBoxSetMoviesList();
    showToast(`Continue adding movies to "${currentContainer.name}"`, 'info');
}
```

**API Endpoints:**

- `create_container` - Create new box set
- `add_movie_to_container` - Add movie to box set
- `get_container_contents` - Fetch all movies in box set
- `update_container` - Edit box set details
- `delete_container` - Remove box set (keeps movies)
- `list_containers` - Get all user's box sets

**Two-Step Creation Flow:**

1. **Step 1:** Define box set
   - Name, format, condition, notes
   - Creates container record via `create_container`
   - Returns `container_id`

2. **Step 2:** Add movies
   - Search TMDB for movies
   - Click to add each movie
   - Creates copy + links via `add_movie_to_container`
   - Updates `boxSetMovies` array
   - Real-time display of added movies

**Common Pitfalls:**

1. **Clearing state too early** - Always check if user is in creation mode
2. **DOM element timing** - Elements in Step 2 don't exist until shown
3. **Copy vs Movie IDs** - Box sets link to `copies`, not `movies` directly
4. **Duplicate prevention** - Check if movie already added to current box set

### Collection Tab Shelf Filtering (v2.2.14+)

**NEW:** Filter Collection view by any shelf with full hierarchical support.

**UI Location:** Collection tab → Shelf dropdown (before Sort dropdown)

**Features:**
- **"All Movies"** - Default, shows full collection
- **Hierarchical Dropdown** - Indented list showing shelf structure
- **Recursive Filtering** - Parent shelves show all descendant movies
- **Maintains Sort/View** - Sorting and view modes preserved when filtering

**Implementation:**
```javascript
async function filterByShelf() {
    const shelfFilter = document.getElementById('shelfFilter');
    const selectedShelfId = shelfFilter.value;

    if (!selectedShelfId) {
        // Show all movies
        collection = [...originalCollection];
        renderCollection();
        return;
    }

    // Get shelf contents with hierarchical aggregation
    const shelfContents = await apiCall('get_shelf_contents', {
        shelf_id: parseInt(selectedShelfId)
    });

    // Get all child shelves recursively
    const childShelves = getAllChildShelves(selectedShelfId);

    // Fetch contents for all children
    const childContents = await Promise.all(
        childShelves.map(id => apiCall('get_shelf_contents', { shelf_id: id }))
    );

    // Combine and deduplicate
    let allMovies = [...shelfContents];
    childContents.forEach(contents => {
        allMovies = allMovies.concat(contents);
    });

    // Filter collection to matched movies only
    const uniqueMovieIds = new Set(allMovies.map(m => m.movie_id));
    collection = originalCollection.filter(group =>
        uniqueMovieIds.has(group.movie.movie_id)
    );

    renderCollection();
}
```

**User Experience:**
1. User selects "Directors" from dropdown
2. Collection view shows all movies from Kubrick + Tarantino + Spielberg shelves
3. Duplicates automatically removed
4. Sorting still works (sort by title, year, etc.)
5. View modes still work (grid, list, compact)

### Shelf Setup Wizard

The Shelf Setup Wizard (`wizardCreate()` in app.js) provides a guided flow to batch-create shelves and automatically populate them with matching films.

**Flow:**
1. **Step 1** — Choose organization category: Directors, Studios, Genres, or Mixed (all three). Optionally select a parent shelf to nest under.
2. **Step 2** — Smart checklist: top directors/studios/genres from the user's collection, sorted by film count. Top 10 pre-checked, with "Show N more" to reveal the rest.
3. **Step 3** — Review selected items with category color coding (blue = director, gold = studio, green = genre).
4. **Create** — Bulk creates all selected shelves AND automatically assigns matching unassigned films.

**Auto-population logic (wizardCreate):**
- Before creating shelves, fetches all unassigned copies via `get_unassigned_copies` API
- This excludes copies already on a shelf and copies inside box sets (containers)
- For each new shelf, filters unassigned copies by the matching criterion:
  - **Directors**: exact match on `copy.director`
  - **Studios**: exact match on `copy.studio`, or partial match on `copy.production_companies`
  - **Genres**: substring match on `copy.genre` (comma-separated genre list)
- Assigns each match via `assign_to_shelf` API endpoint
- Tracks assigned copy IDs during the run to prevent double-assignment (e.g., if a film matches both a director and a genre shelf, it goes to whichever is created first)
- Completion screen shows count of shelves created and films assigned

**Key functions:** `showShelfWizard()`, `wizardStep1()`, `wizardStep2()`, `wizardGoStep3()`, `wizardStep3()`, `wizardCreate()`

---

## 8. Core Features

### 1. Collection Management

**Main Tab:** Collection (contains three sub-views as of v2.3.0)

**Sub-views** (switched via pill-style nav buttons inside the Collection tab):

| Sub-view | State value | Content | Controls visible |
|---|---|---|---|
| Movies | `'movies'` | Collection grid | All filter/sort/view controls |
| Wishlist | `'wishlist'` | Wishlist grid | Browse Lists button |
| Box Sets | `'boxsets'` | Box sets list | Create Box Set button |
| Shelf View | `'shelfview'` | Hierarchical shelf browser | Back button + breadcrumb |
| Bulk Editor | `'bulkeditor'` | Spreadsheet/table view | Data type toggle, title search, save/fetch buttons |

**Shelf View state:**
- `shelfViewStack` — array of `{id, name}` representing the drill-in path; `id: null` = root
- `loadShelfViewBrowse()` — resets stack to root and calls `renderShelfViewLevel()`
- `renderShelfViewLevel()` — renders breadcrumb + child shelves + direct movies at current level
- `shelfViewDrillIn(id, name)` — pushes a shelf onto the stack and re-renders
- `shelfViewBack()` — pops from stack and re-renders
- `shelfViewGoTo(index)` — truncates stack to given breadcrumb index and re-renders

**Key state:** `currentCollectionSubview` — tracks active sub-view (`'movies'` | `'wishlist'` | `'physical'`)

**Key function:** `switchCollectionView(view)` — updates button active states, shows/hides sub-panels, controls filter visibility, updates section header, loads data

**Legacy stubs:** `<section id="wishlist">` and `<section id="boxsets">` remain as empty DOM elements so `getElementById` calls never break. `switchTab('wishlist')` and `switchTab('boxsets')` both redirect to the appropriate sub-view inside Collection.

**Features (Movies sub-view):**
- Grid/List/Compact view toggle
- Sort by: Title, Year, Format, Director
- Search by title
- Advanced filter bar (shelf, genre, format, decade)
- Quick stats (total movies, formats)
- Edit copy details (format, edition, condition)
- Delete copies

**Features (Wishlist sub-view):**
- Priority levels (High, Medium, Low)
- Target format (DVD, Blu-ray, 4K)
- Notes field
- Move to collection button
- Browse preset lists button

**Features (Physical Media sub-view):**
- View owned box sets / containers (DVD, Blu-ray, VHS, 4K, 16mm, etc.)
- Create new box set
- Edit / delete box sets
- Movies inside box sets are also reflected individually in the Movies sub-view

**API Actions:**
- `get_collection` - Fetch all user's copies
- `add_to_collection` - Add new movie
- `edit_copy` - Update copy details
- `delete_copy` - Remove from collection

### 2. Wishlist

**Location:** Collection tab → Wishlist sub-view (v2.3.0+; previously its own tab)

**Features:**
- Priority levels (High, Medium, Low)
- Target format (DVD, Blu-ray, 4K)
- Notes field
- Move to collection button

**API Actions:**
- `add_to_wishlist`
- `get_wishlist`
- `remove_from_wishlist`
- `move_to_collection` - Convert wishlist → collection

### 3. CSV Import

**Location:** Admin Panel → Import CSV

**Format:**
```csv
Title,Year,Format,Edition,Region,Condition
Inception,2010,Blu-ray,Special Edition,Region A,Like New
The Matrix,1999,4K,,,New
```

**Process:**
1. Upload CSV file
2. Backend parses with PHP `fgetcsv()`
3. For each row:
   - Search TMDB
   - Show top 5 matches
   - User confirms match
   - Create movie + copy
4. Batch import summary

**API Action:** `admin_import_user_csv`

### 4. Trivia Game

**Location:** Trivia tab

**Features:**
- Multiple game modes (Easy, Normal, Hard)
- AI-generated questions about your collection
- Leaderboard
- Session tracking

**How It Works:**
1. User starts trivia session
2. Backend generates questions using OpenAI:
   ```
   Prompt: "Generate 10 trivia questions about these movies: [list]"
   ```
3. Store questions in `trivia_questions` table
4. Present one-by-one to user
5. Track score in `trivia_sessions`

---

## 8.5. Version Management & Cache Busting

CineShelf uses a sophisticated version management and cache busting system to ensure users always get the latest version of the app, especially important for PWA installations.

### Overview

The system addresses a common PWA challenge: **How to force updates when the app changes?**

**Key Components:**
1. **version.json** - Single source of truth for version number
2. **Dynamic manifest** - Icons versioned with ?v= query params
3. **Service Worker** - Network-first strategy to avoid stale cache
4. **Script loader** - JS/CSS files loaded with version params
5. **Force update button** - Manual cache clearing when needed

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Version Flow                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  version.json ──┬──> manifest.php?v=2.2.14                  │
│  (2.2.14)       ├──> app-icon.png?v=2.2.14                  │
│                 ├──> index.html (loads scripts with ?v)      │
│                 └──> get-version.php (API endpoint)          │
│                                                               │
│  Service Worker: Network-first (never caches API/admin)     │
│  Force Update: Clear caches + reload                         │
└─────────────────────────────────────────────────────────────┘
```

### 1. version.json (+ persistent volume copy)

**Source file:** `/version.json` — committed to git, used as the baseline version on fresh deploys

**Volume file:** `/data/version.json` — written by `bump-version.php`, lives on the Railway persistent volume. **This file survives redeploys.** All version-reading scripts check here first.

**Priority:** `data/version.json` (volume) → `version.json` (source fallback)

**Structure:**
```json
{
    "version": "2.4.0",
    "updated": "2026-02-10T12:00:00+00:00"
}
```

**Purpose:**
- `version.json` (source): baseline version shipped with the repo
- `data/version.json` (volume): persisted bumped version — survives Railway deploys
- Read by `manifest.php`, `get-version.php`, `config.php`, `manifest-admin.php`
- Written by `admin/bump-version.php`

**How it works on Railway:**
1. First deploy: no `data/version.json` yet → falls back to `version.json`
2. Admin bumps version → `bump-version.php` creates/updates `data/version.json` on the volume
3. Subsequent deploys: `data/version.json` is still there → bumped version is preserved

### 2. Version API Endpoint

**File:** `/get-version.php`

**Purpose:** Returns current version to client-side code

**Usage:**
```javascript
const response = await fetch('/get-version.php');
const data = await response.json();
console.log(data.version); // "2.2.14"
```

**Headers:**
```php
header('Cache-Control: no-cache, no-store, must-revalidate');
```
Ensures version check always hits server, never cached.

### 3. Dynamic Manifest Cache Busting

**File:** `/manifest.php`

**Problem:** PWAs cache the manifest.json, which includes icon URLs. When you update app icons, users might still see old icons even after months.

**Solution:** Append version to icon URLs:

```php
$manifest = [
    "icons" => [
        [
            "src" => "/app-icon.png?v=" . $version,
            "sizes" => "512x512",
            "type" => "image/png",
            "purpose" => "any maskable"
        ],
        [
            "src" => "/app-icon-192.png?v=" . $version,
            "sizes" => "192x192",
            "type" => "image/png",
            "purpose" => "any"
        ]
    ]
];
```

**How It Works:**
1. When version bumps (2.2.14 → 2.2.15), icon URLs change
2. Browser sees `/app-icon.png?v=2.2.15` as different from `/app-icon.png?v=2.2.14`
3. Forces icon re-download
4. PWA home screen icon updates

**Admin PWA Manifest:** `/admin/manifest-admin.php` uses same technique for admin icons.

### 4. Script & CSS Cache Busting

**File:** `/index.html` (lines 1056-1078)

**Problem:** Browsers aggressively cache JS/CSS files. Users might see outdated UI.

**Solution:** Load scripts with version parameter:

```javascript
// Fetch version and load scripts
fetch('/get-version.php?t=' + Date.now())
    .then(r => r.json())
    .then(data => {
        const v = data.version;
        console.log('[ScriptLoader] Loading scripts with version:', v);

        // Load each script with version
        const scripts = [
            `/js/app.js?v=${v}`,
            `/js/trivia.js?v=${v}`,
            `/js/cover-scanner.js?v=${v}`
        ];

        scripts.forEach(src => {
            const script = document.createElement('script');
            script.src = src;
            script.async = false; // Maintain order
            document.body.appendChild(script);
        });
    });
```

**CSS:**
```html
<link rel="stylesheet" href="/css/styles.css?v=2.2.14">
```

### 5. Service Worker Strategy

**File:** `/service-worker.js`

**Strategy:** Network-first (when online)

**Why Not Cache-First?**
- Cache-first means users see stale content
- PWAs default to showing cached files even when online
- Hard to force updates without aggressive cache clearing

**Implementation:**
```javascript
const CACHE_NAME = 'cineshelf-offline-v2';

// NEVER cache these paths
const neverCache = [
    '/api/',
    '/data/',
    '/admin/',
    'get-version.php',
    'bump-version.php',
    '/manifest.php',
    '/app-icon.png',
    'icon-',
    '/favicon.ico'
];

// Network-first fetch strategy
event.respondWith(
    fetch(request)
        .then(response => {
            // Update cache in background for offline use
            if (response.status === 200) {
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(request, response.clone());
                });
            }
            return response;
        })
        .catch(() => {
            // Fallback to cache when offline
            return caches.match(request);
        })
);
```

**Key Points:**
- **Online:** Always fetch from network, update cache in background
- **Offline:** Use cache as fallback
- **Admin/API:** Never cached at all
- **Icons/Manifest:** Never cached (always fresh)

### 6. Version Bumping

**Manual Method:**

Visit `/admin/bump-version.php` in browser:

**Response:**
```json
{
    "success": true,
    "oldVersion": "2.2.14",
    "newVersion": "2.2.15",
    "message": "Version bumped from 2.2.14 to 2.2.15"
}
```

**Automatic Method:**

Use Version Manager UI at `/admin/version-manager.html`:

**Features:**
- Display current version
- Bump button (increments patch)
- Force update (clears all caches)
- Version history

**Versioning Scheme:** Semantic Versioning (MAJOR.MINOR.PATCH)
- MAJOR: Breaking changes (manual)
- MINOR: New features (manual)
- PATCH: Bug fixes (auto-incremented)

### 7. Force Update Mechanism

**Location:** Bottom-right of index.html (floating button)

**When It Appears:**
- On page load, app checks `localStorage.getItem('cineshelf-version')`
- Compares to server version via `/get-version.php`
- If mismatch detected, shows 🔄 button

**What It Does:**
```javascript
async function forceUpdate() {
    // 1. Unregister all service workers
    if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (let reg of regs) {
            await reg.unregister();
        }
    }

    // 2. Clear all caches
    if ('caches' in window) {
        const names = await caches.keys();
        for (let name of names) {
            await caches.delete(name);
        }
    }

    // 3. Clear localStorage (preserves auth)
    localStorage.removeItem('cineshelf-version');

    // 4. Hard reload from server
    window.location.reload(true);
}
```

**User Flow:**
1. Developer bumps version (2.2.14 → 2.2.15)
2. User visits app
3. App detects version mismatch
4. Shows 🔄 button
5. User clicks → full cache clear → fresh reload

### 8. Best Practices

**When Deploying Changes:**

1. **For UI/JS changes:**
   ```bash
   # Visit admin panel
   http://yourdomain.com/admin/bump-version.php
   ```
   - Increments patch version
   - Forces browser to re-download scripts

2. **For icon changes:**
   - Update icons via Icon Manager
   - Bump version
   - Manifest will reference new ?v= param
   - Users will see new icon within 24-48 hours

3. **For database schema changes:**
   - Run migration script FIRST
   - Then bump version
   - Schema changes don't need cache busting

4. **For major releases:**
   - Manually edit version.json
   - Change MAJOR or MINOR number
   - Update CHANGELOG.md

**Testing Updates:**

```bash
# 1. Clear your own cache
# Use Force Update button

# 2. Test in incognito
# Fresh session, no cache

# 3. Check network tab
# Verify ?v= params are current
# Verify no 304 (cached) responses

# 4. Check PWA icon
# Uninstall → reinstall app
# Verify new icon appears
```

### 9. Troubleshooting

**Problem:** Users report seeing old UI

**Solution:**
1. Check version.json was updated
2. Verify manifest.php returns correct ?v= params
3. Ask user to force update (🔄 button)
4. Check service worker not caching excessively

**Problem:** Icons not updating on home screen

**Solution:**
1. PWA icon updates are controlled by OS
2. Android: Can take 24-48 hours
3. iOS: Must reinstall app (Settings → Remove from Home Screen)
4. Verify manifest.php has correct version

**Problem:** Scripts loaded without ?v=

**Solution:**
1. Check index.html script loader
2. Verify get-version.php is accessible
3. Check browser console for errors
4. Fallback loads scripts without version

**Problem:** Force update button doesn't appear

**Solution:**
1. Check localStorage has 'cineshelf-version'
2. Verify get-version.php returns different version
3. Look for JS errors in console

### 10. Files Reference

| File | Purpose |
|------|---------|
| `/version.json` | Version number storage |
| `/get-version.php` | Version API endpoint |
| `/manifest.php` | Dynamic manifest with versioned icons |
| `/admin/manifest-admin.php` | Admin PWA manifest |
| `/admin/bump-version.php` | Increment version script |
| `/admin/version-manager.html` | UI for version management |
| `/service-worker.js` | Network-first caching strategy |
| `/index.html` (lines 1056-1078) | Script loader with cache busting |
| `/index.html` (lines 1148-1210) | Force update button |

---

## 8.6. Bulk Data Editor

### Overview

The Bulk Data Editor (v2.9.0+) adds a spreadsheet-style sub-view to the Collection tab, allowing users to view and edit multiple copies or box sets in a table format. This is significantly faster than editing items one-by-one through the detail modal.

### Architecture

```
┌─────────────────────────────────────┐
│ Collection Tab → Bulk Editor (📊)   │
├─────────────────────────────────────┤
│ [Individual Copies] [Box Sets]      │  ← Data type toggle
│ [Search by title...        ]        │  ← Title filter
│ [Fetch Missing Data] [Save Changes] │  ← Action buttons
├─────────────────────────────────────┤
│ Title  │ Format │ Edition │ Region  │  ← Table headers
│────────┼────────┼─────────┼─────────│
│ Alien  │ Blu-ray│ Dir.Cut │ Region A│  ← Inline editable
│ Jaws   │ 4K     │ Std     │ Region A│  ← Inline editable
│ ...    │ ...    │ ...     │ ...     │
└─────────────────────────────────────┘
```

### Data Flow

```
1. User clicks Bulk Editor (📊) sub-view button
   ↓
2. Frontend calls list_all_copies_detailed or list_all_containers_detailed
   ↓
3. Backend returns all copies/containers with full metadata
   ↓
4. Frontend renders spreadsheet table with inline editable fields
   ↓
5. User edits fields → changes tracked in local state (modified row count shown)
   ↓
6. User clicks "Save Changes"
   ↓
7. Frontend calls bulk_update_copies or bulk_update_containers with changed rows
   ↓
8. Backend batch-updates all modified records
```

### API Endpoints

#### `list_all_copies_detailed`

Returns all copies for the current user with full movie metadata, suitable for spreadsheet rendering.

**Request:**
```json
{
    "action": "list_all_copies_detailed"
}
```

**Response:**
```json
{
    "ok": true,
    "data": [
        {
            "copy_id": 42,
            "movie_id": 10,
            "title": "Alien",
            "year": 1979,
            "poster_url": "https://image.tmdb.org/t/p/w500/...",
            "format": "Blu-ray",
            "edition": "Director's Cut",
            "region": "Region A",
            "condition": "Like New",
            "notes": ""
        }
    ]
}
```

#### `list_all_containers_detailed`

Returns all box sets/containers for the current user with metadata.

**Request:**
```json
{
    "action": "list_all_containers_detailed"
}
```

**Response:**
```json
{
    "ok": true,
    "data": [
        {
            "container_id": 5,
            "name": "The Matrix Trilogy",
            "spine_label": "THE MATRIX TRILOGY",
            "format": "Blu-ray Box Set",
            "edition": "Ultimate Collection",
            "region": "Region A",
            "condition": "Mint",
            "notes": "",
            "movie_count": 3
        }
    ]
}
```

#### `bulk_update_copies`

Batch-updates multiple copies in a single request.

**Request:**
```json
{
    "action": "bulk_update_copies",
    "updates": [
        {
            "copy_id": 42,
            "format": "4K",
            "edition": "Steelbook",
            "region": "Region A",
            "condition": "Mint",
            "notes": "Limited edition"
        },
        {
            "copy_id": 43,
            "format": "Blu-ray",
            "edition": "Standard",
            "region": "Region B",
            "condition": "Good",
            "notes": ""
        }
    ]
}
```

**Response:**
```json
{
    "ok": true,
    "data": {
        "updated": 2,
        "failed": 0
    }
}
```

#### `bulk_update_containers`

Batch-updates multiple box sets/containers in a single request.

**Request:**
```json
{
    "action": "bulk_update_containers",
    "updates": [
        {
            "container_id": 5,
            "format": "4K UHD Box Set",
            "edition": "Collector's Edition",
            "region": "Region A",
            "condition": "Mint",
            "notes": "Upgraded to 4K"
        }
    ]
}
```

### Change Tracking

The frontend tracks modifications in a `Map` keyed by copy/container ID. The "Save Changes" button displays the count of modified rows (e.g., "Save Changes (3)") so the user knows how many rows will be updated before committing.

### Fetch Missing Data

The "Fetch Missing Data" button iterates over all visible rows and identifies copies whose associated movies lack TMDB metadata (e.g., missing director, genre, actors). It then batch-fetches details from TMDB and updates the database. Individual per-row refresh buttons allow targeted fetching for a single entry.

---

## 8.7. Box Set AI Cover Scanning

### Overview

The Box Set AI Cover Scanning feature (v2.9.0+) adds a "Scan Cover" button to Box Set Step 1 (the creation form). It uses GPT-4o to analyze a photo of the box set's physical cover and detect text phrases, categorizing them into form fields.

### Architecture

```
┌────────────────────┐
│ Box Set Step 1     │
│ (Creation Form)    │
│                    │
│ [Scan Cover]       │  ← New button
└────────┬───────────┘
         │
         ▼ [User takes photo or selects image]
┌──────────────────────────────────┐
│ Image captured → base64 encoded  │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ POST /api/api.php                │
│ {                                │
│   action: 'scan_boxset_cover_    │
│            fields',              │
│   image: 'base64_jpeg_data...'   │
│ }                                │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Backend → GPT-4o Vision API      │
│ Prompt: Detect all text phrases  │
│ and categorize as Title, Spine,  │
│ Edition, Format, or Version      │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Response: Array of phrases with  │
│ suggested field assignments      │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Modal shows detected phrases     │
│ as clickable chips               │
│                                  │
│ [The Matrix Trilogy] ← Title     │
│ [4K Ultra HD]        ← Format    │
│ [Ultimate Ed.]       ← Edition   │
│                                  │
│ Click chip to cycle:             │
│ Title → Spine → Edition →        │
│ Format → Version → None          │
│                                  │
│ [Apply to Box Set Form]          │
└──────────────────────────────────┘
```

### API Endpoint

#### `scan_boxset_cover_fields`

Analyzes a box set cover image and returns detected text phrases with field categorizations.

**Request:**
```json
{
    "action": "scan_boxset_cover_fields",
    "image": "base64_jpeg_data..."
}
```

**Response:**
```json
{
    "ok": true,
    "data": {
        "phrases": [
            {"text": "The Matrix Trilogy", "field": "title"},
            {"text": "THE MATRIX TRILOGY", "field": "spine"},
            {"text": "Ultimate Collection", "field": "edition"},
            {"text": "4K Ultra HD", "field": "format"},
            {"text": "Remastered 2023", "field": "version"}
        ]
    }
}
```

### Field Assignment Cycling

Users can click any detected phrase chip to cycle its field assignment:

```
Title → Spine Label → Edition → Format → Version → None → Title → ...
```

Each field type is visually distinguished with a different color/badge in the modal. When the user clicks "Apply to Box Set Form", all assigned phrases populate the corresponding fields in the Box Set Step 1 form.

### Model & Cost

- **Model:** GPT-4o (full model, not mini — needed for accurate text detection and categorization)
- **Cost:** ~$0.02-0.05 per scan (higher than single-title scans due to richer prompt and response)

---

## 8.8. Box Set Movie Scanner

### Overview

The Box Set Movie Scanner (v2.9.0+) replaces the previous file-upload approach for adding movies to box sets with a camera-based Quick Scan experience. It matches the UX of the existing Quick Scan in the Add Movie tab.

### Architecture

```
┌────────────────────────────────────┐
│ Box Set Step 2 (Add Movies)        │
│                                    │
│ [Scan Titles]  ← Opens scanner    │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│ Camera Scanner Modal               │
│ ┌──────────────────────────────┐   │
│ │                              │   │
│ │      Live Camera Feed        │   │
│ │                              │   │
│ └──────────────────────────────┘   │
│ [Scan Cover]                       │
│                                    │
│ Scanned Titles:                    │
│ ✅ The Matrix (1999)               │
│ ✅ The Matrix Reloaded (2003)      │
│ ✅ The Matrix Revolutions (2003)   │
│                                    │
│ [Add All to Box Set]               │
└────────────────────────────────────┘
```

### Scanning Flow

```
1. User clicks "Scan Titles" → Camera scanner modal opens
   ↓
2. Live camera feed displayed (getUserMedia, rear camera preferred)
   ↓
3. User points camera at a movie cover → clicks "Scan Cover"
   ↓
4. Frame captured → base64 JPEG → POST scan_cover_image
   ↓
5. GPT-4o returns recognized movie title
   ↓
6. Title added to batch list in the modal
   ↓
7. Repeat steps 3-6 for each disc/movie in the box set
   ↓
8. User clicks "Add All to Box Set"
   ↓
9. For each title in the batch:
   a. Search TMDB for the title
   b. Take the top match
   c. Add movie to collection + link to current box set via add_movie_to_container
   ↓
10. Box set movie list updates with all newly added films
```

### Camera Handling

Reuses the same camera infrastructure as the existing Quick Scan feature in cover-scanner.js:

```javascript
// Camera initialization (shared with Quick Scan)
const stream = await navigator.mediaDevices.getUserMedia({
    video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
    }
});
```

**iOS Compatibility:**
- `playsinline` and `webkit-playsinline` attributes set on video element
- HTTPS required (Railway provides this)
- Camera permission required in Safari settings

**Android Compatibility:**
- Permission prompt on first use
- HTTPS required
- Standard Chrome camera API

### Batch Processing

Unlike the main Quick Scan (which adds to `unresolved_copies` for later resolution), the Box Set scanner immediately processes each title:

1. Searches TMDB for the scanned title
2. Takes the best match automatically
3. Creates a copy and links it to the current box set (`add_movie_to_container`)
4. Updates the box set movie list in real time

This eliminates the "resolve" step entirely, making box set population much faster.

### UX Advantages Over Previous Approach

The previous approach required:
1. Click "Scan" button
2. Select image file from gallery
3. Wait for AI processing
4. See result, confirm
5. Repeat for each movie

The new camera-based approach:
1. Click "Scan Titles" (opens modal once)
2. Point camera at cover, click "Scan Cover"
3. Title instantly added to batch list
4. Point at next cover, click again
5. Click "Add All to Box Set" when done

This reduces the number of taps/clicks from ~5 per movie to ~2 per movie, and eliminates repeated modal open/close cycles.

---

## 9. Development Setup

### Prerequisites

- PHP 8.0+
- SQLite 3
- Modern browser (Chrome, Firefox, Safari)
- Git

### Local Setup

```bash
# 1. Clone repository
git clone https://github.com/futuresrelic/cineshelf-final.git
cd cineshelf-final/cineshelf.futuresrelic.com

# 2. Set environment variables
export TMDB_API_KEY="8039283176a74ffd71a1658c6f84a051"
export OPENAI_API_KEY="sk-your-key"
export GOOGLE_CLIENT_ID="your-id"
export GOOGLE_CLIENT_SECRET="your-secret"
export GOOGLE_REDIRECT_URI="http://localhost:8000/api/auth.php"
export DEBUG_MODE="true"

# 3. Start PHP server
php -S localhost:8000

# 4. Open browser
open http://localhost:8000
```

### File Permissions

```bash
chmod 755 cineshelf.futuresrelic.com/
chmod 755 cineshelf.futuresrelic.com/data/
chmod 666 cineshelf.futuresrelic.com/data/cineshelf.sqlite
```

### Database Initialization

On first request, `config.php` auto-creates database:

```php
if (!file_exists(DB_PATH)) {
    $db = new PDO('sqlite:' . DB_PATH);
    $schema = file_get_contents(__DIR__ . '/../api/schema.sql');
    $db->exec($schema);
}
```

### Debugging

**Enable debug mode:**
```php
// config/config.php
define('DEBUG_MODE', true);
```

**Check error log:**
```bash
tail -f data/php-errors.log
```

**Browser console:**
```javascript
// All API calls logged
console.log('API Call:', action, data);
console.log('API Response:', result);
```

---

## 10. Deployment

### Railway Deployment

**Setup:**

1. Connect GitHub repo to Railway
2. Set environment variables in Railway dashboard
3. Configure custom domain (optional)
4. Deploy: Automatic on git push

**Environment Variables:**
```
TMDB_API_KEY=8039283176a74ffd71a1658c6f84a051
OPENAI_API_KEY=sk-your-key
GOOGLE_CLIENT_ID=your-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=https://your-domain.up.railway.app/api/auth.php
DEBUG_MODE=false
```

**Railway Configuration:**
- PHP 8.x runtime (auto-detected)
- Persistent volume for `data/` directory
- HTTPS provided automatically
- No build steps required

### Database Backups

**Automated script:**
```bash
#!/bin/bash
# backup-cineshelf.sh

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SOURCE="data/cineshelf.sqlite"
DEST="backups/cineshelf-${TIMESTAMP}.sqlite"

# Copy database
cp "$SOURCE" "$DEST"

# Compress
gzip "$DEST"

# Keep last 30 days
find backups/ -name "*.gz" -mtime +30 -delete

echo "Backup complete: $DEST.gz"
```

**Cron job (daily at 2 AM):**
```cron
0 2 * * * /path/to/backup-cineshelf.sh
```

---

## 11. API Reference

### Endpoint

All API calls go to `/api/api.php` via POST with JSON body.

### Request Format

```javascript
fetch('/api/api.php', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
        action: 'action_name',
        param1: 'value1',
        param2: 'value2'
    })
})
```

### Response Format

**Success:**
```json
{
    "ok": true,
    "data": { ... },
    "error": null
}
```

**Error:**
```json
{
    "ok": false,
    "data": null,
    "error": "Error message"
}
```

### Core Actions

| Action | Parameters | Description |
|--------|------------|-------------|
| `get_collection` | - | Get user's movie copies |
| `add_to_collection` | tmdb_id, format, edition, region, condition | Add movie |
| `edit_copy` | copy_id, format, edition, region, condition, notes | Edit copy |
| `delete_copy` | copy_id | Delete copy |
| `search_tmdb` | query | Search TMDB |
| `add_to_wishlist` | tmdb_id | Add to wishlist |
| `get_wishlist` | - | Get wishlist |
| `scan_cover_image` | image (base64) | AI scan |

### Bulk Editor Actions (v2.9.0+)

| Action | Parameters | Description |
|--------|------------|-------------|
| `list_all_copies_detailed` | - | Get all copies with full movie metadata for spreadsheet view |
| `list_all_containers_detailed` | - | Get all box sets with metadata for spreadsheet view |
| `bulk_update_copies` | updates (array of {copy_id, format, edition, region, condition, notes}) | Batch-update multiple copies |
| `bulk_update_containers` | updates (array of {container_id, format, edition, region, condition, notes}) | Batch-update multiple box sets |
| `scan_boxset_cover_fields` | image (base64) | AI scan box set cover, return detected text phrases with field assignments |

### Shelf Actions

| Action | Parameters | Description |
|--------|------------|-------------|
| `list_shelves` | - | Get all shelves |
| `create_shelf` | name, description, color, icon | Create shelf |
| `edit_shelf` | shelf_id, name, description, color, icon | Edit shelf |
| `delete_shelf` | shelf_id | Delete shelf |
| `get_shelf_contents` | shelf_id | Get movies on shelf |
| `assign_to_shelf` | shelf_id, copy_id | Assign movie |
| `remove_from_shelf` | copy_id | Remove from shelf |
| `get_unassigned_copies` | - | Get unassigned movies |

---

## 12. Troubleshooting

### Common Issues

#### 1. "Database connection failed"

**Cause:** Permission issues or missing SQLite extension

**Solution:**
```bash
# Check PHP has SQLite
php -m | grep sqlite

# Fix permissions
chmod 755 data/
chmod 666 data/cineshelf.sqlite
```

#### 2. Camera not working on iOS

**Cause:** iOS requires HTTPS and special attributes

**Solution:**
- Deploy on HTTPS (Railway provides this)
- Check `playsinline` attribute is set
- Grant permission in iOS Settings → Safari → Camera

#### 3. OAuth redirect error

**Cause:** Redirect URI mismatch

**Solution:**
1. Go to Google Cloud Console
2. Update Authorized redirect URIs to match exactly
3. No trailing slashes!

#### 4. Empty filter dropdowns

**Cause:** API not returning genre/studio fields

**Solution:**
- Check `get_unassigned_copies` includes all fields
- Run backfill metadata tool
- Verify CSV import includes actors/studio

#### 5. Rate limit exceeded

**Cause:** Too many TMDB requests

**Solution:**
- Backfill tool has built-in delays
- Use caching for searches
- Consider TMDB paid tier

### Debug Checklist

1. ✅ Check PHP error log: `data/php-errors.log`
2. ✅ Check browser console for JS errors
3. ✅ Verify API keys in environment variables
4. ✅ Test database: `/admin/database-tools/check-schema.php`
5. ✅ Check file permissions
6. ✅ Verify OAuth redirect URI matches exactly

---

## Support

- **Issues**: https://github.com/futuresrelic/cineshelf-final/issues
- **Email**: futuresrelic@gmail.com

---

**End of Developer Guide**
