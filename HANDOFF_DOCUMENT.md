# CineShelf Project - Handoff Document for Next Claude

**Date Created**: 2025-11-21
**Current Version**: v2.2.1
**Branch**: `claude/fix-execution-errors-017M9Joi6oEyYC6QX2bPYfG8`
**Repository**: futuresrelic/cineshelf-final

---

## CRITICAL INFORMATION FOR NEXT CLAUDE

**THE USER DOES NOT CODE** - You will be doing ALL coding work. The user is non-technical and relies entirely on you to understand, diagnose, fix, and implement everything.

**PROJECT LOCATION**: All actual code is in `/home/user/cineshelf-final/cineshelf.futuresrelic.com/` subdirectory. Don't get confused by the parent directory.

**GIT WORKFLOW**:
- Always develop on branches starting with `claude/` and ending with the session ID
- Use `git push -u origin <branch-name>` for pushing
- If push fails with 403, verify branch name format: `claude/*-<SESSION_ID>`
- Retry network failures up to 4 times with exponential backoff (2s, 4s, 8s, 16s)

---

## PROJECT OVERVIEW

**CineShelf** is a Progressive Web Application (PWA) for managing physical movie collections (DVDs, Blu-rays, 4K UHDs, etc.). It's a personal/family collection manager with social features.

### Key Features
1. **Movie Collection Management** - Track physical copies with formats, editions, conditions, locations
2. **Wishlist System** - Track wanted movies with priority, target formats, price limits
3. **Family/Group Collections** - Create groups to share and view collections together
4. **Borrowing System** - Track who borrowed what and when
5. **Movie Trivia Game** - Quiz yourself on your collection with 3 game modes
6. **OAuth Authentication** - Google OAuth 2.0 with legacy username fallback
7. **PWA Features** - Installable, offline support, mobile-friendly
8. **TMDB Integration** - Auto-fetch movie metadata, posters, directors, ratings

---

## PROJECT STRUCTURE

```
cineshelf-final/
└── cineshelf.futuresrelic.com/          ← ALL CODE IS HERE!
    ├── api/                              ← Backend (PHP + SQLite)
    │   ├── api.php                       ← Main API endpoint (1,945 lines, 48+ actions)
    │   ├── auth.php                      ← OAuth flow handler
    │   ├── auth-middleware.php           ← Session validation
    │   ├── schema.sql                    ← Complete database schema
    │   └── migrations/                   ← Database migration scripts
    │
    ├── config/                           ← Configuration
    │   ├── config.php                    ← DB path, TMDB API key, admin users
    │   └── oauth-config.php              ← Google OAuth credentials
    │
    ├── js/                               ← Frontend (Vanilla JavaScript)
    │   ├── app.js                        ← Main app logic (4,230 lines)
    │   ├── auth.js                       ← OAuth frontend (156 lines)
    │   ├── trivia.js                     ← Trivia game engine (708 lines)
    │   └── cover-scanner.js              ← Barcode/image scanning (397 lines)
    │
    ├── css/
    │   └── styles.css                    ← Main stylesheet (2,932 lines)
    │
    ├── data/
    │   └── cineshelf.sqlite              ← SQLite database (~888KB)
    │
    ├── admin/                            ← 25+ admin/dev tools
    │   ├── database-tools/               ← DB management
    │   ├── data-tools/                   ← Data enhancement
    │   ├── migration-tools/              ← Schema migrations
    │   ├── diagnostics/                  ← Health checks
    │   └── test-tools/                   ← Testing utilities
    │
    ├── game/                             ← Trivia game HTML
    ├── index.html                        ← Main app (1,022 lines)
    ├── login.html                        ← Login page
    ├── manifest.json                     ← PWA manifest
    └── service-worker.js                 ← Offline support
```

---

## TECHNOLOGY STACK

### Frontend
- **Pure JavaScript** (no frameworks!) - 5,491 lines across 4 files
- **HTML5** - Semantic markup, PWA structure
- **CSS3** - Custom responsive design, 2,932 lines
- **PWA APIs** - Service Workers, Web App Manifest, installability

### Backend
- **PHP 7.4+** - Server-side logic
- **SQLite 3** - Database with WAL mode enabled
- **Session-based auth** - 30-day token lifetime
- **RESTful JSON API** - Single endpoint with action-based routing

### External Services
- **TMDB API** - Movie metadata provider
  - API Key: `8039283176a74ffd71a1658c6f84a051`
  - Used for: search, posters, directors, ratings, certifications
- **Google OAuth 2.0** - User authentication
  - Credentials in `/config/oauth-config.php`

### Database
- **SQLite 3** at `/data/cineshelf.sqlite`
- **14 tables** with 28+ indexes
- **WAL mode** for better concurrency
- **Foreign keys enabled**

---

## DATABASE SCHEMA (14 TABLES)

### Authentication & Users
1. **users** - User accounts (OAuth + legacy)
   - Fields: id, username, email, oauth_provider, oauth_provider_id, profile_picture, display_name, is_admin, settings_json

2. **sessions** - Active auth sessions
   - Fields: id, user_id, token, oauth_access_token, oauth_refresh_token, expires_at, created_at, last_used_at

### Core Movie Data
3. **movies** - Global movie database (shared across all users)
   - Fields: id, tmdb_id, imdb_id, title, display_title, year, poster_url, backdrop_url, overview, rating, runtime, director, genre, certification, media_type
   - **Important**: One movie entry per film, referenced by all users

4. **copies** - Physical movie copies owned by users
   - Fields: id, user_id, movie_id, format, edition, region, condition, location, barcode, purchase_date, purchase_price, notes
   - **Relationship**: Links users to movies with ownership details

5. **wishlist** - Movies users want to acquire
   - Fields: id, user_id, movie_id, priority, target_format, target_edition, max_price, notes, added_at
   - **Constraint**: UNIQUE(user_id, movie_id)

### Groups & Sharing
6. **groups** - Family/friend collections
   - Fields: id, name, description, created_by, created_at

7. **group_members** - Group membership
   - Fields: id, group_id, user_id, role (admin/member), joined_at
   - **Constraint**: UNIQUE(group_id, user_id)

8. **group_invites** - Email-based invitations
   - Fields: id, group_id, invited_email, invite_token, invited_by, created_at, expires_at, accepted_at, accepted_by

9. **borrows** - Movie lending tracker
   - Fields: id, copy_id, owner_id, borrower_id, borrowed_at, due_date, returned_at, notes

### Trivia Game System
10. **trivia_games** - Game sessions
    - Fields: id (TEXT), user_id, mode (sprint/endless/survival), scope (collection/wishlist/all/mix), questions_count, correct_count, incorrect_count, score, duration, best_streak, lives_remaining, completed, created_at, completed_at

11. **trivia_questions** - Question history
    - Fields: id (TEXT), game_id, user_id, round_number, question, type, difficulty, template_id, choices_json, correct_answer, user_answer, is_correct, time_taken, points_earned, streak_at_time, question_hash, metadata_json

12. **trivia_stats** - User statistics
    - Fields: user_id, total_games, total_questions, correct_answers, incorrect_answers, best_score, longest_streak, total_time_played, sprint_games, sprint_best_score, sprint_wins, endless_games, endless_best_score, endless_best_round, survival_games, survival_best_score, survival_best_round, easy/medium/hard_correct/incorrect, last_played_at

### Supporting Tables
13. **custom_editions** - User-defined edition types
14. **audit_log** - Action tracking for admin
15. **settings** - Global app settings (key-value store)

---

## API STRUCTURE (/api/api.php)

### How the API Works
- **Single Endpoint**: POST requests to `/api/api.php`
- **Request Format**: JSON body with `{"action": "action_name", ...params}`
- **Response Format**: `{"ok": true/false, "data": {...}, "error": "message"}`
- **Authentication**: Session token in cookie (`cineshelf_auth_token`) or Bearer header
- **Validation**: Middleware checks token, loads user, handles legacy auth

### API Actions (48+ endpoints)

#### Movie Search & Metadata (5 actions)
- `search_movie` - Search TMDB by title
- `search_multi` - Search movies + TV shows
- `get_movie` - Get movie details by TMDB ID
- `get_movie_posters` - Fetch alternative posters
- `update_movie_poster` - Change movie's poster

#### Collection Management (8 actions)
- `add_copy` - Add physical copy to collection
- `list_collection` - Get user's collection with filters/sorting
- `delete_copy` - Remove copy from collection
- `update_copy` - Edit copy details
- `get_movie_copies` - Get all copies of a specific movie
- `update_display_title` - Change how a movie title is displayed
- `list_unresolved` - Get movies needing TMDB matching
- `resolve_movie` - Match unresolved movie to TMDB
- `add_unresolved` - Add movie without TMDB match (manual entry)

#### Wishlist (4 actions)
- `add_wishlist` - Add movie to wishlist
- `list_wishlist` - Get user's wishlist
- `remove_wishlist` - Remove from wishlist
- `get_user_wishlist` - View another user's wishlist (for group members)

#### Groups/Family Collections (12 actions)
- `create_group` - Create new group
- `list_groups` - Get user's groups
- `get_group` - Get group details + members
- `update_group` - Edit group name/description
- `delete_group` - Delete group (admin only)
- `add_group_member` - Add member to group (invite by email)
- `remove_group_member` - Remove member (admin only)
- `list_group_members` - Get all members
- `list_group_collection` - Get combined group collection
- `list_member_collection` - Get specific member's collection
- `create_group_invite` - Generate invite token
- `accept_group_invite` - Join group via invite
- `list_group_invites` - Get pending invites
- `cancel_group_invite` - Revoke invite (admin only)

#### Borrowing System (4 actions)
- `borrow_copy` - Borrow a movie from group member
- `return_copy` - Return borrowed movie
- `list_borrowed` - Get movies you borrowed
- `list_lent` - Get movies you lent out

#### Trivia Game (9 actions)
- `trivia_start_game` - Initialize new game session
- `trivia_save_question` - Save answered question
- `trivia_update_game` - Update game state
- `trivia_complete_game` - Finish game, calculate final score
- `trivia_get_stats` - Get user's trivia statistics
- `trivia_get_history` - Get recent games
- `trivia_group_leaderboard` - Get group rankings
- `trivia_global_leaderboard` - Get global rankings
- `trivia_get_recent_games` - Get recent games for leaderboard

#### User Management (4 actions)
- `get_user_settings` - Get user preferences
- `save_user_settings` - Update preferences
- `update_profile` - Change display name, profile picture
- `get_stats` - Get collection statistics

#### Admin (1 action)
- `admin_list_all_groups` - List all groups (admin only)

---

## FRONTEND ARCHITECTURE (/js/app.js - 4,230 lines)

### Module Pattern
Uses IIFE (Immediately Invoked Function Expression) pattern for namespacing:
```javascript
const CollectionManager = (function() { ... })();
const WishlistManager = (function() { ... })();
const GroupsManager = (function() { ... })();
```

### Key Modules

#### 1. **App** - Main application controller
- Tab switching
- UI initialization
- State management
- Error handling

#### 2. **CollectionManager** - Collection tab
- Movie search (TMDB)
- Add/edit/delete copies
- Filters (format, genre, rating, year, director, actors, studio)
- Sorting (title, year, rating, date added)
- Grid/list view toggle
- Statistics display

#### 3. **WishlistManager** - Wishlist tab
- Add/remove wishlist items
- Priority levels
- Target format/edition
- Quick-add to collection
- View other users' wishlists

#### 4. **GroupsManager** - Groups tab
- Create/manage groups
- Invite members via email
- View group collection
- View member collections
- **Group Wishlist** - See all members' wishlists together
- Borrowing interface

#### 5. **ResolveManager** - Admin tool
- View unresolved movies (no TMDB match)
- Search and match to TMDB
- Manual title entry
- Compact list layout (added in v2.2.0)

#### 6. **SettingsManager** - Settings tab
- User preferences
- Display name/profile picture
- OAuth status
- Data export (CSV)
- Data import (CSV with auto-TMDB matching)

#### 7. **TriviaManager** (/js/trivia.js - 708 lines)
- **3 Game Modes**:
  - Sprint: 10 questions, timed (60s per question)
  - Endless: Infinite questions, no time limit
  - Survival: 3 lives, lose one per wrong answer
- **4 Scopes**: Collection, Wishlist, All movies, Mix (collection + wishlist)
- **Difficulty Scaling**: Easy (rounds 1-5), Medium (6-15), Hard (16+)
- **20+ Question Templates**: year, director, genre, rating, runtime, etc.
- **Scoring**: Base points + time bonus + streak multiplier
- **Leaderboards**: Personal stats, group rankings, global top scores

#### 8. **CoverScanner** (/js/cover-scanner.js - 397 lines)
- Barcode scanning (UPC/EAN)
- Cover image recognition
- Camera access (front/back)
- iPhone compatibility (added in v2.2.0)
- Google Books API integration
- Fallback to manual search

---

## RECENT FIXES & VERSION HISTORY

### Current State (v2.2.1)
The app is currently stable with recent fixes for:

**Last 5 Commits (Most Recent First)**:
1. ✅ **Fix group wishlist posters** - Use `poster_url` field correctly
2. ✅ **Fix placeholder image** - Missing posters show placeholder in group wishlist
3. ✅ **Fix SQL error in get_user_wishlist** - Removed non-existent `release_date` column
4. ✅ **Fix group wishlist loading** - Added JOIN with movies table
5. ✅ **Fix group wishlist variable names** - Corrected API variable names

### Recent Feature Additions (v2.2.0)
- ✅ Group Wishlist view - See all members' wishlists in one place
- ✅ Trivia Leaderboards - Personal, group, and global rankings
- ✅ Advanced filters - Filter by actors, director, studio
- ✅ Compact Resolve tab - Redesigned for better usability
- ✅ iPhone camera support - Fixed Cover Scanner for iOS

### Recent Bug Fixes (Last 20 Commits)
- ✅ CSV import for large files with progress tracking
- ✅ CSV parser handles quoted fields correctly
- ✅ Trivia leaderboard SQL query fixes
- ✅ TMDB API key error in CSV import (now uses backend)
- ✅ Multiple execution errors fixed

---

## COMMON ISSUES & DEBUGGING

### Issue 1: Database Errors
**Symptom**: SQL errors in console, data not loading
**Common Causes**:
- Column doesn't exist (check schema.sql vs actual table)
- Missing JOIN in query
- Wrong table alias

**How to Debug**:
1. Check `/admin/database-tools/view-database.php` to see actual schema
2. Look at `/api/schema.sql` for canonical schema
3. Check if migrations were run (look for migration_*.sql files)
4. Enable error logging in api.php: `error_log("SQL: $sql")`

### Issue 2: API Returns Empty Data
**Symptom**: Frontend shows "No movies found" but database has data
**Common Causes**:
- Wrong user_id in query
- Missing foreign key JOIN
- Wrong field name in SELECT

**How to Debug**:
1. Check browser console for API response
2. Look at Network tab for actual JSON response
3. Add `error_log(print_r($result, true))` in api.php
4. Verify query with `/admin/test-tools/test-api.php`

### Issue 3: Group Features Not Working
**Symptom**: Group collection/wishlist empty or errors
**Common Causes**:
- Missing JOIN with movies table
- Wrong field name (poster_url vs poster_path)
- User not in group (check group_members table)

**How to Fix**:
1. All group collection queries NEED: `JOIN movies m ON c.movie_id = m.id`
2. Use `poster_url` not `poster_path`
3. Check `group_members` table for user membership

### Issue 4: OAuth Not Working
**Symptom**: Can't log in, redirect fails
**Common Causes**:
- OAuth credentials expired/wrong
- Redirect URI mismatch
- Session table issues

**How to Debug**:
1. Check `/config/oauth-config.php` credentials
2. Verify redirect URI matches Google Console exactly
3. Check sessions table for token
4. Look at `/api/auth.php` error logs

### Issue 5: Images Not Loading
**Symptom**: Broken poster images
**Common Causes**:
- poster_url is NULL or empty
- TMDB image path incorrect
- Missing image base URL

**How to Fix**:
1. Check if `poster_url` field exists and has data
2. TMDB images use: `https://image.tmdb.org/t/p/w500${poster_path}`
3. Fallback to placeholder: `/api/placeholder.php?text=No+Poster`
4. Use `/admin/data-tools/fix-titles-and-posters.php` to batch fix

---

## DEVELOPMENT WORKFLOW

### Making Changes

#### Backend Changes (PHP)
1. Edit files in `/cineshelf.futuresrelic.com/api/`
2. For new API actions: Add to `api.php` in the switch statement
3. For schema changes: Create migration SQL file, run via admin tools
4. Test with `/admin/test-tools/test-api.php`

#### Frontend Changes (JavaScript)
1. Edit files in `/cineshelf.futuresrelic.com/js/`
2. Main app logic in `app.js`
3. No build step needed - pure vanilla JS
4. Test in browser, check console for errors

#### Database Changes
1. Edit `/api/schema.sql` for canonical schema
2. Create `/api/migration_*.sql` for existing databases
3. Run migration via `/admin/migration-tools/`
4. Verify with `/admin/database-tools/view-database.php`

### Testing Changes
1. **Local Testing**: Open in browser, check console
2. **API Testing**: Use `/admin/test-tools/test-api.php`
3. **Database Inspection**: Use `/admin/database-tools/view-database.php`
4. **Error Logs**: Check PHP error logs, browser console

### Committing & Pushing
```bash
# Stage changes
git add <files>

# Commit with clear message
git commit -m "Fix: description of what was fixed"

# Push to branch (must start with 'claude/' and end with session ID)
git push -u origin claude/<branch-name>
```

---

## CONFIGURATION FILES

### /config/config.php
```php
// Database path
define('DB_PATH', dirname(__DIR__) . '/data/cineshelf.sqlite');

// TMDB API (for movie metadata)
define('TMDB_API_KEY', '8039283176a74ffd71a1658c6f84a051');

// App version
define('APP_VERSION', '2.2.1');

// Admin users (can access admin tools)
$admin_users = ['admin', 'klindakoil', 'default'];
```

**Key Functions**:
- `getDb()` - Get database connection, auto-creates if missing
- `isAdmin($username)` - Check if user is admin
- `sanitize($input)` - Clean user input
- `jsonResponse($ok, $data, $error)` - Standard API response

### /config/oauth-config.php
- Google OAuth 2.0 client ID and secret
- Redirect URI
- Scope: email, profile, openid
- Session lifetime: 30 days

---

## IMPORTANT PATTERNS & CONVENTIONS

### Database Queries - ALWAYS USE PREPARED STATEMENTS
```php
// CORRECT - Prevents SQL injection
$stmt = $db->prepare("SELECT * FROM movies WHERE id = ?");
$stmt->execute([$id]);

// WRONG - SQL injection vulnerability!
$result = $db->query("SELECT * FROM movies WHERE id = $id");
```

### API Responses - Use jsonResponse()
```php
// Success
jsonResponse(true, ['movies' => $movies], null);

// Error
jsonResponse(false, null, "Movie not found");
```

### Frontend API Calls - Use fetch()
```javascript
const response = await fetch('/api/api.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'list_collection', user_id: userId })
});
const result = await response.json();
if (result.ok) {
    // Use result.data
} else {
    // Handle result.error
}
```

### Group Collection Queries - Always JOIN movies
```sql
-- CORRECT - Gets movie metadata
SELECT c.*, m.title, m.poster_url, m.year
FROM copies c
JOIN movies m ON c.movie_id = m.id
WHERE c.user_id = ?

-- WRONG - Missing movie data!
SELECT * FROM copies WHERE user_id = ?
```

### Image URLs - Use poster_url, not poster_path
```javascript
// CORRECT
<img src="${movie.poster_url}" />

// WRONG - poster_path is legacy/wrong field
<img src="${movie.poster_path}" />
```

---

## ADMIN TOOLS DIRECTORY

The `/admin/` directory has 25+ tools for development and maintenance:

### Database Tools
- `view-database.php` - Browse all tables, see schema
- `check-schema.php` - Verify schema matches schema.sql
- `clean-database.php` - Remove orphaned records
- `remove-duplicates.php` - Find and merge duplicate movies

### Data Tools
- `autofill-directors.php` - Fetch directors from TMDB
- `fix-titles-and-posters.php` - Fix missing metadata
- `add-missing-fields.php` - Backfill new columns

### Migration Tools
- `migrate-v1-to-v2.php` - Upgrade from v1 database
- `migrate-to-oauth.php` - Convert username to OAuth
- `add-groups-support.php` - Add group tables

### Diagnostics
- `status.php` - System health check
- `debug-*.php` - Various debug utilities

### Test Tools
- `test-api.php` - Test API endpoints
- `generate-icons.php` - Create PWA icons
- `clear-cache.php` - Reset service worker cache

---

## TMDB INTEGRATION

### API Key
`8039283176a74ffd71a1658c6f84a051`

### Common Endpoints Used
- Search: `https://api.themoviedb.org/3/search/movie?api_key=...&query=...`
- Details: `https://api.themoviedb.org/3/movie/{id}?api_key=...`
- Posters: `https://api.themoviedb.org/3/movie/{id}/images?api_key=...`

### Image URLs
- Poster: `https://image.tmdb.org/t/p/w500${poster_path}`
- Backdrop: `https://image.tmdb.org/t/p/w1280${backdrop_path}`

### Stored Fields
When adding a movie, fetch and store:
- tmdb_id, imdb_id, title, year
- poster_url, backdrop_url, overview
- rating, runtime, director
- genre, certification

---

## SECURITY NOTES

### Authentication Flow
1. User clicks "Sign in with Google" → `/api/auth.php?action=login`
2. Redirect to Google OAuth consent screen
3. Google redirects back → `/api/auth.php?action=callback`
4. Create session, set cookie
5. Cookie sent with all API requests

### Session Validation
- Middleware checks `cineshelf_auth_token` cookie
- Validates against `sessions` table
- Loads user from `users` table
- Sets `$user_id` variable for queries

### Admin Access
- Hardcoded admin usernames in config.php
- Check with `isAdmin($username)` function
- Used for: group management, admin tools, resolve tab

### SQL Injection Prevention
- ALWAYS use prepared statements with `?` placeholders
- NEVER concatenate user input into SQL
- Use `sanitize()` for display output

### XSS Prevention
- Use `htmlspecialchars()` when outputting user input
- Sanitize with `sanitize()` function
- JSON responses auto-escape

---

## KNOWN LIMITATIONS & FUTURE WORK

### Current Limitations
1. **Single TMDB API Key** - Shared across all users, rate limited
2. **SQLite Database** - May not scale to 10,000+ users (but fine for personal/family use)
3. **No Image Uploads** - All posters from TMDB, can't upload custom covers
4. **Email Invites Don't Send** - Invite tokens generated but no email sent
5. **No Push Notifications** - Borrowing reminders only in-app

### Areas for Improvement
1. **Search Performance** - Add full-text search index for titles
2. **Mobile UX** - Some forms cramped on small screens
3. **Batch Operations** - Can't delete/edit multiple copies at once
4. **Export Format** - CSV is basic, could add JSON/Excel
5. **Trivia Questions** - Only 20 templates, could use more variety

### Feature Requests to Expect
- Custom tags/collections
- Lending history/statistics
- Duplicate detection (same movie, different formats)
- Watchlist (separate from wishlist)
- Integration with other APIs (IMDb, Letterboxd)

---

## DEBUGGING CHECKLIST

When user reports an issue:

1. **Ask for Error Message**
   - Check browser console (F12 → Console)
   - Check Network tab for API errors
   - Ask for screenshot

2. **Check Recent Changes**
   - Run `git log --oneline -10`
   - Look for related commits
   - Check if new feature was added

3. **Verify Database**
   - Check `/admin/database-tools/view-database.php`
   - Look for missing columns
   - Check for NULL values

4. **Test API Directly**
   - Use `/admin/test-tools/test-api.php`
   - Verify request/response format
   - Check authentication

5. **Check File Permissions**
   - Database file must be writable
   - Data directory must be writable
   - Apache/PHP user must have access

6. **Look for Typos**
   - Field name mismatches (poster_url vs poster_path)
   - Table name typos
   - Variable name errors

---

## QUICK REFERENCE - FILES TO CHECK FIRST

### Frontend Issues
1. `/cineshelf.futuresrelic.com/js/app.js` - Main logic
2. `/cineshelf.futuresrelic.com/index.html` - UI structure
3. `/cineshelf.futuresrelic.com/css/styles.css` - Styling

### Backend Issues
1. `/cineshelf.futuresrelic.com/api/api.php` - All API logic
2. `/cineshelf.futuresrelic.com/config/config.php` - Configuration
3. `/cineshelf.futuresrelic.com/api/schema.sql` - Database schema

### Database Issues
1. `/cineshelf.futuresrelic.com/data/cineshelf.sqlite` - Actual database
2. `/cineshelf.futuresrelic.com/admin/database-tools/view-database.php` - Schema viewer
3. `/cineshelf.futuresrelic.com/api/schema.sql` - Canonical schema

### Authentication Issues
1. `/cineshelf.futuresrelic.com/api/auth.php` - OAuth flow
2. `/cineshelf.futuresrelic.com/config/oauth-config.php` - OAuth credentials
3. `/cineshelf.futuresrelic.com/api/auth-middleware.php` - Session validation

---

## CRITICAL REMINDERS

### When Fixing SQL Errors
1. ✅ Check if column exists in schema.sql
2. ✅ Verify query has correct JOINs
3. ✅ Use prepared statements (never concatenate)
4. ✅ Test query in view-database.php first

### When Adding API Actions
1. ✅ Add to switch statement in api.php
2. ✅ Validate input parameters
3. ✅ Use prepared statements
4. ✅ Return jsonResponse()
5. ✅ Test with test-api.php

### When Modifying Frontend
1. ✅ Check browser console for errors
2. ✅ Verify API response in Network tab
3. ✅ Update both display and data logic
4. ✅ Test on mobile viewport

### When Changing Database
1. ✅ Update schema.sql first
2. ✅ Create migration script for existing databases
3. ✅ Run migration via admin tools
4. ✅ Verify with view-database.php

---

## CONTACT & RESOURCES

### User's Preferences
- **Non-technical** - Explain everything clearly
- **Hands-off** - You do all the coding
- **Wants working software** - Test before committing

### Documentation
- TMDB API: https://developers.themoviedb.org/3
- SQLite: https://www.sqlite.org/docs.html
- Google OAuth: https://developers.google.com/identity/protocols/oauth2
- PWA: https://web.dev/progressive-web-apps/

### Admin Tools
All accessible at `/admin/` (requires admin user):
- Database viewer
- API tester
- Schema checker
- Data quality tools

---

## FINAL NOTES FOR NEXT CLAUDE

You are inheriting a **working, stable application** in v2.2.1. Recent fixes have addressed:
- Group wishlist loading
- Poster display issues
- SQL query errors
- CSV import problems

The codebase is **well-structured** with:
- Clear separation of concerns
- Comprehensive admin tools
- Good error handling
- Security best practices

Common tasks you'll do:
1. **Fix bugs** - Usually SQL queries, field name mismatches, missing JOINs
2. **Add features** - Extend API, update frontend, modify database
3. **Improve UX** - Refine UI, add filters, improve performance
4. **Data quality** - Fix missing metadata, merge duplicates, clean data

**Remember**: The user doesn't code. You are their full-stack developer. Be thorough, test everything, and commit working code.

Good luck! 🎬

---

**Document Version**: 1.0
**Last Updated**: 2025-11-21
**Next Update**: When significant changes are made to architecture or major features added
