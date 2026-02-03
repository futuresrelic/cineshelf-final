# CineShelf Developer Guide

**Version:** 2.2.14
**Last Updated:** 2026-02-03
**Target Audience:** Developers maintaining, extending, or debugging CineShelf

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture & Design Patterns](#architecture--design-patterns)
4. [Development Environment Setup](#development-environment-setup)
5. [Code Structure](#code-structure)
6. [Database Schema & Relationships](#database-schema--relationships)
7. [API Documentation](#api-documentation)
8. [Frontend Architecture](#frontend-architecture)
9. [Authentication & Security](#authentication--security)
10. [External Integrations](#external-integrations)
11. [Testing & Debugging](#testing--debugging)
12. [Known Issues & Gotchas](#known-issues--gotchas)
13. [Development Workflow](#development-workflow)
14. [Code Style & Best Practices](#code-style--best-practices)

---

## Project Overview

**CineShelf** is a Progressive Web Application (PWA) for managing physical movie collections (DVDs, Blu-rays, 4K UHDs). It supports individual and family/group collections with social features like borrowing and trivia games.

### Key Features

- **Collection Management** - Track physical copies with metadata (format, edition, condition, location)
- **Wishlist System** - Track desired movies with priorities and target formats
- **Family Collections** - Create groups to share and view combined collections
- **Borrowing System** - Track who borrowed what and when
- **Trivia Game** - Quiz yourself on your collection with multiple modes
- **OAuth Authentication** - Google OAuth 2.0 with legacy username fallback
- **PWA Support** - Installable, offline-capable, mobile-friendly
- **TMDB Integration** - Automatic movie metadata fetching

### Repository Structure

```
cineshelf-final/
└── cineshelf.futuresrelic.com/   ← All code lives here!
    ├── api/                       ← Backend (PHP + SQLite)
    ├── config/                    ← Configuration files
    ├── js/                        ← Frontend (Vanilla JavaScript)
    ├── css/                       ← Styling
    ├── admin/                     ← Admin tools (25+ utilities)
    ├── data/                      ← SQLite database & logs
    ├── icons/                     ← User-uploaded icons
    ├── game/                      ← Trivia game interface
    ├── index.html                 ← Main app shell
    ├── login.html                 ← OAuth login page
    ├── manifest.php/json          ← PWA manifest
    ├── service-worker.js          ← Offline support
    └── version.json               ← Current app version
```

---

## Technology Stack

### Backend

- **PHP 7.4+** - Server-side logic
- **SQLite 3** - Database with WAL mode enabled
- **Session-based Auth** - 30-day token lifetime
- **RESTful JSON API** - Single endpoint (`/api/api.php`) with action-based routing

### Frontend

- **Vanilla JavaScript** - No frameworks! (~5,000 lines across 4 files)
- **HTML5** - Semantic markup, PWA structure
- **CSS3** - Custom responsive design (~3,000 lines)
- **PWA APIs** - Service Workers, Web App Manifest, installability

### Database

- **SQLite 3** at `/data/cineshelf.sqlite`
- **14 tables** with 28+ indexes
- **WAL mode** for better concurrency
- **Foreign keys enabled**

### External Services

- **TMDB API** - Movie metadata provider
  - API Key: `8039283176a74ffd71a1658c6f84a051`
  - Used for: search, posters, directors, ratings, certifications
- **Google OAuth 2.0** - User authentication
  - Credentials in `/config/oauth-config.php`
- **OpenAI API (Optional)** - Article content extraction
  - Model: gpt-4o-mini (cost-effective)

---

## Architecture & Design Patterns

### Clean Architecture

CineShelf follows clean architecture principles inspired by ChoreQuest:

1. **Separation of Concerns** - Clear boundaries between layers
2. **Single Responsibility** - Each module has one job
3. **Dependency Injection** - Configuration externalized
4. **Data Integrity** - Foreign keys, constraints, audit logs

### Frontend Pattern: IIFE Modules

The frontend uses Immediately Invoked Function Expressions (IIFEs) for modularization:

```javascript
const CollectionManager = (function() {
    // Private state
    let collection = [];

    // Private functions
    function loadMovies() { ... }

    // Public API
    return {
        init: function() { ... },
        refresh: function() { ... }
    };
})();
```

**Benefits:**
- Encapsulation - Private state and functions
- Namespace management - Avoid global pollution
- Clear public APIs

### Backend Pattern: Action Router

The API uses a single endpoint with action-based routing:

```php
$action = $input['action'] ?? '';

switch ($action) {
    case 'add_copy':
        // Handle add copy logic
        break;
    case 'list_collection':
        // Handle list collection logic
        break;
    // ... 48+ actions
}
```

**Request Format:**
```json
POST /api/api.php
{
    "action": "add_copy",
    "tmdb_id": 550,
    "format": "Blu-ray",
    "edition": "Special Edition"
}
```

**Response Format:**
```json
{
    "ok": true,
    "data": { "copy_id": 123 },
    "error": null
}
```

---

## Development Environment Setup

### Prerequisites

- **PHP 7.4+** with SQLite extension
- **Apache/Nginx** with mod_rewrite
- **Git** for version control
- **Modern browser** (Chrome, Firefox, Safari, Edge)

### Local Setup

1. **Clone Repository**
   ```bash
   git clone https://github.com/futuresrelic/cineshelf-final.git
   cd cineshelf-final/cineshelf.futuresrelic.com
   ```

2. **Configure Web Server**
   - Point document root to `/cineshelf-final/cineshelf.futuresrelic.com/`
   - Enable mod_rewrite (Apache) or configure URL rewriting (Nginx)

3. **Set Permissions**
   ```bash
   chmod 755 api/ config/ data/
   chmod 666 data/cineshelf.sqlite
   chmod 666 version.json
   ```

4. **Configure OAuth** (Optional for local dev)
   - Edit `/config/oauth-config.php`
   - Add your Google OAuth credentials
   - Or use legacy username auth for testing

5. **Configure TMDB API** (Required)
   - Already configured: `8039283176a74ffd71a1658c6f84a051`
   - Or get your own key from https://www.themoviedb.org/settings/api

6. **Configure OpenAI** (Optional)
   - Create `/config/secrets.php`:
     ```php
     <?php
     return [
         'OPENAI_API_KEY' => 'your-key-here'
     ];
     ```

7. **Initialize Database**
   - Database auto-creates on first run
   - Or manually: `php api/run-migration.php`

8. **Access Application**
   - Open `http://localhost/` in browser
   - Login with Google or use legacy username

### Development Tools

- **Admin Panel** - `http://localhost/admin/` (requires admin user)
- **API Tester** - `http://localhost/api/test-api.php`
- **Database Viewer** - `http://localhost/admin/database-tools/view-database.php`
- **Version Manager** - `http://localhost/admin/version-manager.html`

---

## Code Structure

### Backend Structure (`/api/`)

| File | Lines | Purpose |
|------|-------|---------|
| **api.php** | 2,600+ | Main API endpoint with 48+ actions |
| **auth.php** | ~400 | OAuth authentication flow |
| **auth-middleware.php** | ~200 | Session validation middleware |
| **schema.sql** | ~600 | Complete database schema |
| **test-api.php** | ~200 | API testing utility |

**Key Functions in api.php:**

```php
// Authentication
authenticateRequest()           // Validate session, return user object

// Movie Management
searchMovie($query)            // Search TMDB for movies
getMovieDetails($tmdbId)       // Fetch full movie metadata
addCopy($userId, $movieId, ...)  // Add to collection
updateCopy($copyId, ...)       // Edit copy details
deleteCopy($copyId)            // Remove from collection

// Wishlist
addWishlist($userId, $movieId, ...) // Add to wishlist
removeWishlist($wishlistId)    // Remove from wishlist

// Groups
createGroup($name, $description, $createdBy) // Create family group
addGroupMember($groupId, $userId, $role)     // Add member
listGroupCollection($groupId)  // Get combined collection

// Borrowing
borrowCopy($copyId, $borrowerId, $ownerId) // Borrow movie
returnCopy($borrowId)          // Return borrowed movie

// Trivia
triviaStartGame($userId, $mode, $scope)  // Initialize game
triviaSaveQuestion($gameId, ...)         // Save answer
triviaCompleteGame($gameId)              // Finalize stats
```

### Frontend Structure (`/js/`)

| File | Lines | Purpose |
|------|-------|---------|
| **app.js** | 5,000+ | Main application logic |
| **auth.js** | ~300 | Authentication & session management |
| **trivia.js** | 3,000+ | Trivia game system |
| **cover-scanner.js** | ~500 | Barcode & cover scanning |

**Key Modules in app.js:**

```javascript
App                     // Main app controller
├── init()              // Initialize app
├── apiCall()           // Generic API wrapper
├── loadCollection()    // Fetch user's movies
├── addCopy()           // Add to collection
├── editCopy()          // Edit copy details
├── deleteCopy()        // Remove from collection
├── switchTab()         // Navigation
└── switchView()        // Grid/list toggle

CollectionManager       // Collection tab logic
WishlistManager         // Wishlist tab logic
GroupsManager           // Groups tab logic
ResolveManager          // Admin resolve tool
SettingsManager         // Settings tab logic
TriviaManager           // Trivia game integration
```

### Configuration Files (`/config/`)

**config.php** - Main configuration
```php
// Database
define('DB_PATH', __DIR__ . '/../data/cineshelf.sqlite');
define('DATA_DIR', __DIR__ . '/../data');

// TMDB API
define('TMDB_API_KEY', '8039283176a74ffd71a1658c6f84a051');
define('TMDB_BASE_URL', 'https://api.themoviedb.org/3');
define('TMDB_IMAGE_BASE', 'https://image.tmdb.org/t/p/w500');

// OpenAI (Optional)
define('OPENAI_API_KEY', getenv('OPENAI_API_KEY') ?: '');
define('OPENAI_MODEL', 'gpt-4o-mini');

// App Settings
define('APP_VERSION', '2.2.14'); // Read from version.json
define('DEFAULT_USER', 'default');
define('ADMIN_USERS', ['admin', 'klindakoil', 'default']);

// Security
define('DEBUG_MODE', false); // false for production
```

**oauth-config.php** - Google OAuth credentials
```php
define('GOOGLE_CLIENT_ID', '754407099284-...');
define('GOOGLE_CLIENT_SECRET', 'GOCSPX-...');
define('GOOGLE_REDIRECT_URI', 'https://cineshelf.futuresrelic.com/api/auth.php');
define('SESSION_LIFETIME', 2592000); // 30 days
```

---

## Database Schema & Relationships

### Core Tables

#### **movies** (Global shared table)
```sql
CREATE TABLE movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdb_id TEXT UNIQUE NOT NULL,
    imdb_id TEXT,
    title TEXT NOT NULL,
    display_title TEXT,              -- User-customized title
    year INTEGER,
    poster_url TEXT,                 -- Full TMDB URL
    backdrop_url TEXT,
    overview TEXT,
    rating REAL,                     -- TMDB vote_average
    runtime INTEGER,                 -- Minutes
    director TEXT,
    genre TEXT,                      -- Comma-separated
    certification TEXT,              -- G, PG, PG-13, R, NC-17
    media_type TEXT DEFAULT 'movie', -- 'movie' or 'tv'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_movies_tmdb_id ON movies(tmdb_id);
CREATE INDEX idx_movies_title ON movies(title);
```

**Key Points:**
- One movie entry per film (shared across all users)
- `poster_url` stores full URL, not just path
- `display_title` allows custom names (e.g., "Star Wars IV" vs "Star Wars")

#### **copies** (Physical collection items)
```sql
CREATE TABLE copies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    movie_id INTEGER NOT NULL,
    format TEXT,                     -- DVD, Blu-ray, 4K UHD, etc
    edition TEXT,                    -- Special Edition, Director's Cut
    region TEXT,                     -- 1, 2, 3, A, B, C, All
    condition TEXT,                  -- Mint, Good, Fair, Poor
    location TEXT,                   -- Where stored
    purchase_date DATE,
    purchase_price REAL,
    notes TEXT,
    barcode TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
);
CREATE INDEX idx_copies_user_id ON copies(user_id);
CREATE INDEX idx_copies_movie_id ON copies(movie_id);
CREATE INDEX idx_copies_barcode ON copies(barcode);
```

**Relationships:**
- One user can have many copies
- One movie can have many copies (across different users)
- Cascading deletes: deleting a user deletes their copies

#### **wishlist** (Desired movies)
```sql
CREATE TABLE wishlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    movie_id INTEGER NOT NULL,
    priority INTEGER DEFAULT 5,      -- 0-10 scale
    target_format TEXT,              -- Desired format
    target_edition TEXT,             -- Looking for specific edition
    max_price REAL,                  -- Max willing to pay
    notes TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    UNIQUE(user_id, movie_id)        -- Can't wishlist same movie twice
);
CREATE INDEX idx_wishlist_user_id ON wishlist(user_id);
CREATE INDEX idx_wishlist_movie_id ON wishlist(movie_id);
```

#### **users** (User accounts)
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    display_name TEXT,
    is_admin INTEGER DEFAULT 0,
    profile_picture TEXT,
    oauth_provider TEXT DEFAULT 'legacy', -- 'google' or 'legacy'
    oauth_provider_id TEXT,              -- Google user ID
    settings_json TEXT,                  -- JSON: {defaultView, gridColumns}
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_oauth_provider_id ON users(oauth_provider_id);
```

### Group & Social Tables

#### **groups** (Family/friend collections)
```sql
CREATE TABLE groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);
```

#### **group_members** (Group membership)
```sql
CREATE TABLE group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'member',      -- 'admin' or 'member'
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(group_id, user_id)        -- Can't join same group twice
);
CREATE INDEX idx_group_members_group_id ON group_members(group_id);
CREATE INDEX idx_group_members_user_id ON group_members(user_id);
```

#### **borrows** (Borrowing system)
```sql
CREATE TABLE borrows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    copy_id INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,
    borrower_id INTEGER NOT NULL,
    borrowed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    due_date DATE,
    returned_at DATETIME,            -- NULL if still borrowed
    notes TEXT,
    FOREIGN KEY (copy_id) REFERENCES copies(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (borrower_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_borrows_copy_id ON borrows(copy_id);
CREATE INDEX idx_borrows_owner_id ON borrows(owner_id);
CREATE INDEX idx_borrows_borrower_id ON borrows(borrower_id);
```

### Trivia System Tables

#### **trivia_games** (Game sessions)
```sql
CREATE TABLE trivia_games (
    id TEXT PRIMARY KEY,             -- UUID
    user_id INTEGER NOT NULL,
    mode TEXT NOT NULL,              -- 'sprint', 'endless', 'survival'
    scope TEXT NOT NULL,             -- 'collection', 'wishlist', 'all', 'mix'
    questions_count INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    incorrect_count INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0,      -- Seconds
    completed INTEGER DEFAULT 0,     -- 0 or 1
    best_streak INTEGER DEFAULT 0,
    lives_remaining INTEGER,         -- For survival mode
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_trivia_games_user_id ON trivia_games(user_id);
CREATE INDEX idx_trivia_games_mode ON trivia_games(mode);
CREATE INDEX idx_trivia_games_score ON trivia_games(score);
```

#### **trivia_stats** (User statistics)
```sql
CREATE TABLE trivia_stats (
    user_id INTEGER PRIMARY KEY,
    total_games INTEGER DEFAULT 0,
    total_questions INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    incorrect_answers INTEGER DEFAULT 0,
    best_score INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    total_time_played INTEGER DEFAULT 0,
    -- By game mode
    sprint_games INTEGER DEFAULT 0,
    sprint_best_score INTEGER DEFAULT 0,
    sprint_wins INTEGER DEFAULT 0,
    endless_games INTEGER DEFAULT 0,
    endless_best_score INTEGER DEFAULT 0,
    endless_best_round INTEGER DEFAULT 0,
    survival_games INTEGER DEFAULT 0,
    survival_best_score INTEGER DEFAULT 0,
    survival_best_round INTEGER DEFAULT 0,
    -- By difficulty
    easy_correct INTEGER DEFAULT 0,
    easy_incorrect INTEGER DEFAULT 0,
    medium_correct INTEGER DEFAULT 0,
    medium_incorrect INTEGER DEFAULT 0,
    hard_correct INTEGER DEFAULT 0,
    hard_incorrect INTEGER DEFAULT 0,
    last_played_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Relationship Diagram

```
users (1) ──→ (many) copies ──→ (1) movies
  │
  ├──→ (many) wishlist ──→ (1) movies
  │
  ├──→ (many) sessions
  │
  ├──→ (many) group_members ──→ (1) groups ← (1) created_by
  │
  ├──→ (many) borrows → (1) copies
  │
  ├──→ (1) trivia_stats
  │
  └──→ (many) trivia_games ──→ (many) trivia_questions
```

---

## API Documentation

### API Endpoint

**Base URL:** `/api/api.php`
**Method:** POST
**Content-Type:** application/json
**Authentication:** Session cookie (`cineshelf_auth_token`) or Bearer token

### Request Format

```json
{
    "action": "action_name",
    "param1": "value1",
    "param2": "value2"
}
```

### Response Format

```json
{
    "ok": true,
    "data": { ... },
    "error": null
}
```

Or on error:

```json
{
    "ok": false,
    "data": null,
    "error": "Error message"
}
```

### API Actions Reference

#### Movie Search & Discovery

**search_movie** - Search TMDB for movies
```json
Request: { "action": "search_movie", "query": "Inception" }
Response: { "ok": true, "data": { "results": [ ... ] } }
```

**get_movie** - Get full movie details
```json
Request: { "action": "get_movie", "tmdb_id": "550" }
Response: { "ok": true, "data": { "title": "...", "poster_url": "...", ... } }
```

#### Collection Management

**add_copy** - Add physical copy to collection
```json
Request: {
    "action": "add_copy",
    "tmdb_id": "550",
    "format": "Blu-ray",
    "edition": "Special Edition",
    "region": "A",
    "condition": "Mint",
    "location": "Living Room Shelf",
    "purchase_date": "2024-01-15",
    "purchase_price": 19.99,
    "notes": "Got on sale"
}
Response: { "ok": true, "data": { "copy_id": 123 } }
```

**list_collection** - Get user's collection
```json
Request: { "action": "list_collection" }
Response: {
    "ok": true,
    "data": {
        "collection": [
            {
                "copy_id": 123,
                "movie_id": 45,
                "title": "Fight Club",
                "year": 1999,
                "poster_url": "https://image.tmdb.org/t/p/w500/...",
                "format": "Blu-ray",
                "edition": "Special Edition",
                ...
            }
        ]
    }
}
```

**update_copy** - Edit copy details
```json
Request: {
    "action": "update_copy",
    "copy_id": 123,
    "format": "4K UHD",
    "condition": "Good"
}
Response: { "ok": true }
```

**delete_copy** - Remove from collection
```json
Request: { "action": "delete_copy", "copy_id": 123 }
Response: { "ok": true }
```

#### Wishlist Management

**add_wishlist** - Add to wishlist
```json
Request: {
    "action": "add_wishlist",
    "tmdb_id": "550",
    "priority": 8,
    "target_format": "4K UHD",
    "max_price": 29.99
}
Response: { "ok": true, "data": { "wishlist_id": 456 } }
```

**list_wishlist** - Get user's wishlist
```json
Request: { "action": "list_wishlist" }
Response: { "ok": true, "data": { "wishlist": [ ... ] } }
```

#### Group Management

**create_group** - Create family group
```json
Request: {
    "action": "create_group",
    "name": "Family Collection",
    "description": "Our shared movie library"
}
Response: { "ok": true, "data": { "group_id": 789 } }
```

**list_group_collection** - Get combined group collection
```json
Request: { "action": "list_group_collection", "group_id": 789 }
Response: {
    "ok": true,
    "data": {
        "collection": [
            {
                "copy_id": 123,
                "owner_username": "alice",
                "title": "...",
                ...
            }
        ]
    }
}
```

**borrow_copy** - Borrow from group member
```json
Request: {
    "action": "borrow_copy",
    "copy_id": 123,
    "borrower_id": 456,
    "due_date": "2024-02-15",
    "notes": "For movie night"
}
Response: { "ok": true, "data": { "borrow_id": 999 } }
```

#### Trivia Game

**trivia_start_game** - Initialize game session
```json
Request: {
    "action": "trivia_start_game",
    "mode": "sprint",
    "scope": "collection"
}
Response: {
    "ok": true,
    "data": {
        "game_id": "uuid-...",
        "mode": "sprint",
        "scope": "collection"
    }
}
```

**trivia_save_question** - Save answered question
```json
Request: {
    "action": "trivia_save_question",
    "game_id": "uuid-...",
    "question": "What year was Inception released?",
    "user_answer": "2010",
    "correct_answer": "2010",
    "is_correct": true,
    "time_taken": 5,
    "points_earned": 150
}
Response: { "ok": true }
```

### Error Handling

All endpoints return structured errors:

```json
{
    "ok": false,
    "data": null,
    "error": "Movie not found in TMDB database"
}
```

Common errors:
- `"Unauthorized"` - Session expired or invalid
- `"Movie already in collection"` - Duplicate add attempt
- `"Copy not found"` - Invalid copy_id
- `"You are not a member of this group"` - Permission denied

---

## Frontend Architecture

### App Initialization

```javascript
// index.html loads scripts in order:
<script src="/js/auth.js"></script>     // 1. Auth first
<script src="/js/app.js"></script>      // 2. Main app
<script src="/js/trivia.js"></script>   // 3. Trivia game

// On DOMContentLoaded:
Auth.init()                  // Verify session
  .then(user => {
      App.init(user);        // Initialize app with user
      TriviaManager.init();  // Initialize trivia
  })
  .catch(err => {
      window.location = '/login.html'; // Redirect to login
  });
```

### State Management

App uses a singleton pattern with centralized state:

```javascript
const App = (function() {
    // Private state
    let currentUser = null;
    let currentTab = 'collection';
    let currentView = 'grid';
    let collection = [];
    let wishlist = [];
    let settings = {};

    // Public API
    return {
        init(user) {
            currentUser = user;
            loadSettings();
            loadCollection();
            setupEventListeners();
        },

        apiCall(action, data) {
            return fetch('/api/api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...data })
            }).then(r => r.json());
        }
    };
})();
```

### UI Rendering

**Grid View:**
```javascript
function renderCollectionGrid(movies) {
    const grid = document.getElementById('collectionGrid');
    grid.innerHTML = movies.map(movie => `
        <div class="movie-card" data-copy-id="${movie.copy_id}">
            <img src="${movie.poster_url || placeholderImage}" alt="${movie.title}">
            <div class="movie-card-info">
                <h3>${movie.title} (${movie.year})</h3>
                <p>${movie.format}</p>
            </div>
        </div>
    `).join('');
}
```

**List View:**
```javascript
function renderCollectionList(movies) {
    const list = document.getElementById('collectionList');
    list.innerHTML = movies.map(movie => `
        <div class="movie-list-item" data-copy-id="${movie.copy_id}">
            <img src="${movie.poster_url}" class="list-poster">
            <div class="list-details">
                <h3>${movie.title} (${movie.year})</h3>
                <p>Format: ${movie.format} | Edition: ${movie.edition}</p>
                <p>Director: ${movie.director} | Rating: ${movie.rating}/10</p>
            </div>
        </div>
    `).join('');
}
```

### Event Handling

Delegated event listeners for performance:

```javascript
document.getElementById('collectionGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.movie-card');
    if (!card) return;

    const copyId = card.dataset.copyId;
    if (e.target.classList.contains('btn-edit')) {
        editCopy(copyId);
    } else if (e.target.classList.contains('btn-delete')) {
        deleteCopy(copyId);
    } else {
        showMovieDetails(copyId);
    }
});
```

---

## Authentication & Security

### OAuth Flow

1. **Login Initiation**
   ```
   User clicks "Sign in with Google"
   → GET /api/auth.php?action=login
   → Generates CSRF state token
   → Redirects to Google OAuth consent
   ```

2. **OAuth Callback**
   ```
   Google redirects back with auth code
   → GET /api/auth.php?action=callback&code=...&state=...
   → Verify state token (CSRF protection)
   → Exchange code for access token
   → Fetch user info (email, name, picture)
   → Create or update user in database
   → Create session record
   → Set httpOnly cookie: cineshelf_auth_token
   → Redirect to /index.html
   ```

3. **Session Validation**
   ```
   Every API call:
   → Read cineshelf_auth_token from cookie
   → Query sessions table
   → Verify token and expiration
   → Return authenticated user object
   → Fallback to legacy username auth if no token
   ```

### Security Measures

**SQL Injection Prevention:**
```php
// ✅ CORRECT - Always use prepared statements
$stmt = $db->prepare("SELECT * FROM movies WHERE id = ?");
$stmt->execute([$id]);

// ❌ WRONG - Never concatenate user input!
$result = $db->query("SELECT * FROM movies WHERE id = $id");
```

**XSS Prevention:**
```php
// Sanitize output
function sanitize($str, $maxLength = 255) {
    $str = trim($str);
    $str = strip_tags($str);
    return substr($str, 0, $maxLength);
}
```

**CSRF Protection:**
- OAuth state parameter
- SameSite=Lax cookie attribute
- httpOnly flag on auth cookie
- Secure flag for HTTPS

**Session Security:**
```php
// Session configuration
ini_set('session.cookie_httponly', 1);  // Prevent JS access
ini_set('session.cookie_samesite', 'Lax'); // CSRF protection
ini_set('session.cookie_secure', 1);    // HTTPS only (production)

// Session lifetime: 30 days
define('SESSION_LIFETIME', 2592000);
```

---

## External Integrations

### TMDB API

**Base URL:** `https://api.themoviedb.org/3`
**Authentication:** API key in URL parameter
**Rate Limit:** 40 requests per 10 seconds (free tier)

**Common Endpoints:**

```php
// Search for movies
GET /search/movie?query=Inception&api_key=...

// Get movie details
GET /movie/550?api_key=...&append_to_response=release_dates,credits

// Get movie images
GET /movie/550/images?api_key=...
```

**Implementation:**
```php
function fetchMovieFromTMDB($tmdbId) {
    $url = TMDB_BASE_URL . "/movie/{$tmdbId}?api_key=" . TMDB_API_KEY
         . "&append_to_response=release_dates,credits";

    $response = file_get_contents($url);
    $data = json_decode($response, true);

    return [
        'title' => $data['title'],
        'year' => substr($data['release_date'], 0, 4),
        'poster_url' => isset($data['poster_path'])
            ? TMDB_IMAGE_BASE . $data['poster_path']
            : null,
        'director' => extractDirector($data['credits']['crew']),
        'rating' => $data['vote_average'],
        ...
    ];
}
```

### Google OAuth 2.0

**Configuration:**
```php
define('GOOGLE_CLIENT_ID', '754407099284-...');
define('GOOGLE_CLIENT_SECRET', 'GOCSPX-...');
define('GOOGLE_REDIRECT_URI', 'https://cineshelf.futuresrelic.com/api/auth.php');
```

**OAuth Endpoints:**
- Auth: `https://accounts.google.com/o/oauth2/v2/auth`
- Token: `https://oauth2.googleapis.com/token`
- UserInfo: `https://www.googleapis.com/oauth2/v2/userinfo`

**Implementation in auth.php:**
```php
// Step 1: Redirect to Google
function handleLogin() {
    $state = bin2hex(random_bytes(16)); // CSRF token
    $_SESSION['oauth_state'] = $state;

    $params = [
        'client_id' => GOOGLE_CLIENT_ID,
        'redirect_uri' => GOOGLE_REDIRECT_URI,
        'response_type' => 'code',
        'scope' => 'email profile',
        'access_type' => 'offline',
        'prompt' => 'select_account',
        'state' => $state
    ];

    $url = 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params);
    header('Location: ' . $url);
    exit;
}

// Step 2: Exchange code for token
function exchangeCodeForToken($code) {
    $data = [
        'code' => $code,
        'client_id' => GOOGLE_CLIENT_ID,
        'client_secret' => GOOGLE_CLIENT_SECRET,
        'redirect_uri' => GOOGLE_REDIRECT_URI,
        'grant_type' => 'authorization_code'
    ];

    $response = file_get_contents('https://oauth2.googleapis.com/token', false,
        stream_context_create(['http' => [
            'method' => 'POST',
            'header' => 'Content-Type: application/x-www-form-urlencoded',
            'content' => http_build_query($data)
        ]])
    );

    return json_decode($response, true);
}
```

### OpenAI API (Optional)

**Purpose:** Extract movie lists from web articles
**Model:** gpt-4o-mini (cost-effective, ~$0.01 per article)

**Configuration:**
```php
// In config/config.php
$openaiKey = getenv('OPENAI_API_KEY');
if (!$openaiKey && file_exists(__DIR__ . '/secrets.php')) {
    $secrets = include __DIR__ . '/secrets.php';
    $openaiKey = $secrets['OPENAI_API_KEY'] ?? '';
}
define('OPENAI_API_KEY', $openaiKey ?: '');
```

**Usage in api.php:**
```php
function extractMoviesWithAI($htmlContent, $articleTitle = '') {
    if (empty(OPENAI_API_KEY)) {
        return ['error' => 'OpenAI API key not configured'];
    }

    // Clean HTML, extract text
    $cleanedContent = cleanArticleHtml($htmlContent);

    // Send to OpenAI
    $response = callOpenAI([
        'model' => 'gpt-4o-mini',
        'messages' => [
            ['role' => 'system', 'content' => 'Extract movie titles and years from article'],
            ['role' => 'user', 'content' => $cleanedContent]
        ]
    ]);

    return json_decode($response['choices'][0]['message']['content'], true);
}
```

---

## Testing & Debugging

### Testing Tools

**API Tester** (`/api/test-api.php`)
- Test any API endpoint
- View request/response
- Check authentication
- Debug SQL queries

**Database Viewer** (`/admin/database-tools/view-database.php`)
- Browse all tables
- View schema
- Check indexes
- See record counts

**Cache Diagnostic** (`/admin/test-tools/cache-diagnostic.html`)
- Check service worker status
- View cached assets
- Clear caches
- Force update

### Debugging Techniques

**Enable Debug Mode:**
```php
// In config/config.php
define('DEBUG_MODE', true);

// Shows detailed errors in browser
error_reporting(E_ALL);
ini_set('display_errors', 1);
```

**Log API Calls:**
```php
// In api.php
error_log("API Call: " . $action);
error_log("Request Data: " . json_encode($input));
error_log("User ID: " . $user['id']);
```

**Browser Console:**
```javascript
// In app.js
async apiCall(action, data) {
    console.log(`API Call: ${action}`, data);
    const response = await fetch('/api/api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data })
    });
    const result = await response.json();
    console.log(`API Response:`, result);
    return result;
}
```

**Network Tab:**
- Open DevTools → Network
- Filter by "api.php"
- Click request → Preview/Response
- Check headers, cookies, timing

### Common Debugging Scenarios

**Issue: API returns empty data**
1. Check browser console for errors
2. Check Network tab for API response
3. Add `error_log()` in api.php
4. Verify SQL query with test-api.php
5. Check user_id is correct

**Issue: Movies not displaying**
1. Check `poster_url` field in database
2. Verify JOIN with movies table
3. Check frontend field name (`poster_url` vs `poster_path`)
4. Inspect element HTML
5. Check image URL in browser

**Issue: OAuth not working**
1. Verify OAuth credentials in oauth-config.php
2. Check redirect URI matches Google Console
3. Look for errors in browser console
4. Check sessions table for token
5. Verify cookie is set (DevTools → Application → Cookies)

---

## Known Issues & Gotchas

### Field Naming Inconsistencies

**Issue:** `poster_path` vs `poster_url`
- **TMDB API** returns `poster_path` (e.g., `/xyz.jpg`)
- **Database** stores `poster_url` (full URL: `https://image.tmdb.org/t/p/w500/xyz.jpg`)
- **Frontend** should use `poster_url` from database

**Fix:**
```javascript
// ✅ CORRECT
const posterUrl = movie.poster_url;

// ❌ WRONG - poster_path doesn't exist in DB
const posterUrl = movie.poster_path;
```

### User Identity Fields

**Issue:** Multiple user identifiers
- `users.username` - Login username
- `users.email` - OAuth email
- `users.display_name` - User's chosen name

**Display Logic:**
```javascript
// Use fallback chain
const displayName = user.display_name || user.username || user.email;
```

### Response Format Differences

**Issue:** `ok` vs `success` in API responses
- **Most endpoints** use `{ ok: true, data, error }`
- **Auth endpoints** use `{ success: true, data, error }`

**Fix:**
```javascript
// Handle both formats
function handleResponse(response) {
    if (response.ok || response.success) {
        return response.data;
    }
    throw new Error(response.error);
}
```

### Admin User Management

**Issue:** Hardcoded admin list vs database flag
- `config.php` has `ADMIN_USERS = ['admin', 'klindakoil', 'default']`
- Database has `users.is_admin` column
- Users in hardcoded list auto-marked admin on first login

**Behavior:**
```php
// On user creation/login
$isAdmin = in_array($username, ADMIN_USERS) ? 1 : 0;
```

### TV Show Support

**Issue:** Incomplete TV show handling
- Database has `movies.media_type = 'tv'`
- TMDB integration fetches TV shows
- UI doesn't fully support TV-specific fields (seasons, episodes)

**Current State:** TV shows can be added but display like movies

### Barcode Duplicates

**Issue:** No uniqueness constraint on `copies.barcode`
- Same barcode can be added multiple times
- No validation at database level

**Workaround:** Check for duplicates in application code

### Security Concerns

**⚠️ WARNING:** Secrets exposed in code
- `GOOGLE_CLIENT_SECRET` in `/config/oauth-config.php`
- `TMDB_API_KEY` in `/config/config.php`

**Recommendation:** Move to environment variables
```php
define('GOOGLE_CLIENT_SECRET', getenv('GOOGLE_CLIENT_SECRET'));
define('TMDB_API_KEY', getenv('TMDB_API_KEY'));
```

---

## Development Workflow

### Making Changes

#### Backend Changes (PHP)

1. **Edit files** in `/api/`
2. **Add new API actions** in `api.php` switch statement
3. **Test with** `/admin/test-tools/test-api.php`
4. **Check logs** at `/data/php-errors.log`

**Example: Adding new API action**
```php
// In api.php
case 'my_new_action':
    $movieId = $input['movie_id'] ?? null;
    if (!$movieId) {
        jsonResponse(false, null, 'movie_id required');
    }

    $stmt = $db->prepare("SELECT * FROM movies WHERE id = ?");
    $stmt->execute([$movieId]);
    $movie = $stmt->fetch();

    if (!$movie) {
        jsonResponse(false, null, 'Movie not found');
    }

    jsonResponse(true, ['movie' => $movie]);
    break;
```

#### Frontend Changes (JavaScript)

1. **Edit files** in `/js/`
2. **No build step** needed (vanilla JS)
3. **Test in browser**, check console
4. **Clear cache** if not seeing changes

**Example: Adding new UI feature**
```javascript
// In app.js
App.myNewFeature = function() {
    App.apiCall('my_new_action', { movie_id: 123 })
        .then(result => {
            if (result.ok) {
                console.log('Movie:', result.data.movie);
                renderMovie(result.data.movie);
            } else {
                alert('Error: ' + result.error);
            }
        });
};
```

#### Database Changes

1. **Edit** `/api/schema.sql` (canonical schema)
2. **Create migration** `/api/migration_*.sql`
3. **Run migration** via `/admin/migration-tools/`
4. **Verify** with `/admin/database-tools/view-database.php`

**Example: Adding new column**
```sql
-- migration_add_custom_field.sql
ALTER TABLE movies ADD COLUMN custom_field TEXT;

-- Run via:
-- php /api/run-migration.php migration_add_custom_field.sql
```

### Committing Changes

```bash
# Stage changes
git add <files>

# Commit with descriptive message
git commit -m "Fix: Correct poster_url field usage in group wishlist"

# Push to branch (must start with 'claude/' + session ID)
git push -u origin claude/my-feature-01XYZ123
```

### Version Bumping

Use the Version Manager tool:

1. Open `/admin/version-manager.html`
2. Click "Bump Patch" (2.2.14 → 2.2.15)
3. Updates `/version.json`
4. Triggers PWA cache invalidation
5. Users see update notification

---

## Code Style & Best Practices

### PHP Best Practices

**Always use prepared statements:**
```php
// ✅ GOOD
$stmt = $db->prepare("SELECT * FROM movies WHERE title = ?");
$stmt->execute([$title]);

// ❌ BAD - SQL injection vulnerability!
$result = $db->query("SELECT * FROM movies WHERE title = '$title'");
```

**Use jsonResponse helper:**
```php
// ✅ GOOD
jsonResponse(true, ['movies' => $movies]);

// ❌ BAD - Inconsistent format
echo json_encode(['movies' => $movies]);
```

**Sanitize user input:**
```php
// ✅ GOOD
$title = sanitize($input['title'] ?? '', 255);

// ❌ BAD - Unsanitized input
$title = $input['title'];
```

**Log actions for audit:**
```php
logAction($db, $userId, 'copy_added', 'copy', $copyId, [
    'movie_title' => $title,
    'format' => $format
]);
```

### JavaScript Best Practices

**Use async/await:**
```javascript
// ✅ GOOD
async function loadCollection() {
    const result = await App.apiCall('list_collection');
    if (result.ok) {
        renderCollection(result.data.collection);
    }
}

// ❌ BAD - Callback hell
App.apiCall('list_collection', {}, function(result) {
    if (result.ok) {
        renderCollection(result.data.collection);
    }
});
```

**Use template literals for HTML:**
```javascript
// ✅ GOOD
const html = `
    <div class="movie-card">
        <h3>${movie.title}</h3>
        <p>${movie.year}</p>
    </div>
`;

// ❌ BAD - String concatenation
const html = '<div class="movie-card">' +
    '<h3>' + movie.title + '</h3>' +
    '<p>' + movie.year + '</p>' +
    '</div>';
```

**Delegate events for performance:**
```javascript
// ✅ GOOD - One listener for all cards
container.addEventListener('click', (e) => {
    const card = e.target.closest('.movie-card');
    if (card) handleCardClick(card);
});

// ❌ BAD - Listener per card
cards.forEach(card => {
    card.addEventListener('click', handleCardClick);
});
```

### SQL Best Practices

**Always JOIN movies table for metadata:**
```sql
-- ✅ GOOD
SELECT c.*, m.title, m.poster_url, m.year
FROM copies c
JOIN movies m ON c.movie_id = m.id
WHERE c.user_id = ?

-- ❌ BAD - Missing movie data
SELECT * FROM copies WHERE user_id = ?
```

**Use meaningful aliases:**
```sql
-- ✅ GOOD
SELECT c.id as copy_id, m.id as movie_id, m.title
FROM copies c
JOIN movies m ON c.movie_id = m.id

-- ❌ BAD - Ambiguous columns
SELECT c.id, m.id, m.title
FROM copies c, movies m
WHERE c.movie_id = m.id
```

**Use indexes for frequent queries:**
```sql
-- If querying by barcode often:
CREATE INDEX idx_copies_barcode ON copies(barcode);

-- If searching by title often:
CREATE INDEX idx_movies_title ON movies(title);
```

---

## Appendix: Useful Commands

### Git Commands

```bash
# Check current branch
git branch

# Fetch latest changes
git fetch --all

# See what changed
git log --oneline -10

# Compare with main
git diff origin/main...HEAD

# Commit and push
git add .
git commit -m "Your message"
git push -u origin claude/branch-name-sessionID
```

### PHP Commands

```bash
# Check PHP version
php -v

# Run migration
php api/run-migration.php migration_file.sql

# Check syntax
php -l api/api.php

# Start local server
php -S localhost:8000
```

### Database Commands

```bash
# Open database
sqlite3 data/cineshelf.sqlite

# Show tables
.tables

# Describe table
.schema movies

# Query
SELECT COUNT(*) FROM movies;

# Exit
.quit
```

### Debugging Commands

```bash
# Tail PHP error log
tail -f data/php-errors.log

# Clear service worker cache
# (Run in browser console)
navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => registration.unregister());
});
```

---

**Document Version:** 1.0
**Last Updated:** 2026-02-03
**Author:** CineShelf Development Team

For questions or issues, please refer to the Admin Guide or create an issue in the GitHub repository.
