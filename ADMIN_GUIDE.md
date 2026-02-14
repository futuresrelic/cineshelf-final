# CineShelf Administrator Guide

**Version:** 2.9.0
**Last Updated:** 2026-02-14
**Target Audience:** System administrators, maintainers, power users

---

## Table of Contents

1. [Administrator Overview](#administrator-overview)
2. [Admin Panel Access](#admin-panel-access)
3. [Admin Tools Reference](#admin-tools-reference)
4. [Database Management](#database-management)
5. [User Management](#user-management)
6. [Group Management](#group-management)
7. [Bulk Data Editor (v2.9.0)](#bulk-data-editor-v290)
8. [Data Maintenance](#data-maintenance)
9. [System Diagnostics](#system-diagnostics)
10. [Backup & Recovery](#backup--recovery)
11. [Performance Tuning](#performance-tuning)
12. [Troubleshooting Common Issues](#troubleshooting-common-issues)
13. [Security Best Practices](#security-best-practices)

---

## Administrator Overview

As a CineShelf administrator, you have access to 25+ specialized tools for managing the application, maintaining data quality, and troubleshooting issues. This guide covers all administrative functions.

### Admin Privileges

Administrators can:
- Access the admin panel (`/admin/`)
- View and manage all users and groups
- Run database migrations and maintenance scripts
- Modify system configuration
- Clear user collections and wishlists
- Resolve unmatched movies
- Generate diagnostic reports
- Manage UI presets and icons

### Who is an Admin?

Admin users are defined in `/config/config.php`:

```php
define('ADMIN_USERS', ['admin', 'klindakoil', 'default']);
```

Users in this list automatically receive `is_admin=1` status when they log in.

---

## Admin Panel Access

### Accessing the Admin Panel

1. **Login as Admin User**
   - Use one of the usernames in `ADMIN_USERS` list
   - Or login with Google account that maps to admin username

2. **Navigate to Admin Panel**
   - URL: `https://cineshelf.futuresrelic.com/admin/`
   - Or click "Admin Tools" in main app (admin users only)

3. **Admin Dashboard**
   - Organized by category:
     - Migration Tools
     - Data Tools
     - Database Tools
     - Test Tools
     - Admin Features
     - Utilities

### Admin Panel Security

- **No password protection** - Relies on admin user status
- **Recommend** setting up .htaccess protection for production:

```apache
# /admin/.htaccess
AuthType Basic
AuthName "CineShelf Admin"
AuthUserFile /path/to/.htpasswd
Require valid-user
```

---

## Admin Tools Reference

### Configuration Tools (`/admin/`)

#### **Splash Screen Settings** (`splash-settings.html`)
**Purpose:** Configure the app's loading splash screen
**Settings:**
- **Enable/Disable** — toggle the splash screen on or off
- **Duration** — how long the splash displays (0.5–10 seconds)
- **Title** — main heading shown on the splash (default: "CineShelf")
- **Tagline** — subtitle text (default: "Your Movie Collection")
- **Logo URL** — path or URL for the splash logo image
- **Background Color** — solid color override (default: dark gradient)

**How it works:**
1. Settings are saved to `/data/splash-config.json` on the server
2. The main app fetches this config on every page load
3. The splash screen displays with the configured settings, then fades out
4. Changes take effect immediately for all users (no cache bust needed)

**Usage:**
1. Go to Admin → Configuration → Splash Screen
2. Adjust settings — the live preview updates in real time
3. Click "Save Settings"
4. Open the app to see your changes

### Migration Tools (`/admin/migration-tools/`)

Tools for database schema changes and data migrations.

#### **migrate-v1-to-v2.php**
**Purpose:** Migrate from CineShelf v1.0 to v2.0 schema
**When to Use:** Upgrading from legacy version
**Usage:**
1. Backup database first!
2. Navigate to tool in browser
3. Click "Run Migration"
4. Verify success message
5. Check data integrity with view-database.php

**Changes:**
- Converts old schema to new structure
- Adds OAuth support fields
- Creates group tables
- Migrates existing copies

#### **migrate-add-groups.php**
**Purpose:** Add group/family collection tables
**Tables Created:**
- `groups`
- `group_members`
- `borrows`

**SQL Executed:**
```sql
CREATE TABLE groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);
-- ... and more
```

#### **migrate-add-group-invites.php**
**Purpose:** Add email invitation system for groups
**Table Created:** `group_invites`

**Features:**
- Email-based invitations
- Unique tokens for security
- Expiration dates
- Acceptance tracking

#### **allow-null-invited-email.php**
**Purpose:** Allow NULL email after invite acceptance
**Reason:** Email history can be lost once user accepts

#### **add-display-name.php**
**Purpose:** Add `display_name` column to users table
**Migration:**
```sql
ALTER TABLE users ADD COLUMN display_name TEXT;
```

#### **make-user-admin.php**
**Purpose:** Grant admin privileges to specific user
**Usage:**
1. Open tool in browser
2. Enter username
3. Click "Make Admin"
4. User receives `is_admin=1` status

**Security Note:** Changes database directly, bypassing config.php

#### **grant-admin-access.php**
**Purpose:** Alternative admin granting tool
**Difference:** Also updates `ADMIN_USERS` in config.php

---

### Data Tools (`/admin/data-tools/`)

Tools for cleaning and enhancing movie data.

#### **fix-unknown-titles-v2.php**
**Purpose:** Fix movies with "Unknown" or missing titles
**Problem:** TMDB API sometimes fails, leaving placeholder titles

**Features:**
- Finds all "Unknown" movies
- Re-fetches from TMDB using `tmdb_id`
- Updates title, poster, metadata
- Shows before/after comparison

**Usage:**
1. Open tool
2. View list of "Unknown" movies
3. Click "Fix All" or fix individually
4. Verify corrections

**SQL Query:**
```sql
SELECT id, tmdb_id, title, media_type
FROM movies
WHERE title = 'Unknown'
  AND poster_url IS NOT NULL
  AND tmdb_id NOT LIKE 'unresolved_%'
ORDER BY id
```

#### **fix-corrupted-titles.php**
**Purpose:** Fix encoding issues in movie titles
**Problem:** UTF-8 encoding errors from TMDB API

**Examples:**
- `CafÃ©` → `Café`
- `NaÃ¯ve` → `Naïve`
- `â€œQuotesâ€` → `"Quotes"`

**Usage:**
1. Run tool to detect corrupted titles
2. Review list of affected movies
3. Click "Fix All" to correct encoding
4. Re-fetch from TMDB if needed

#### **fill-directors-AUTO.php**
**Purpose:** Automatically fetch missing director information
**Process:**
1. Find movies with NULL director
2. Query TMDB API for movie details
3. Extract director from credits
4. Update database

**Features:**
- Batch processing (100 movies at a time)
- Progress bar
- Error handling for API failures
- Logs all updates

**Usage:**
```
1. Open tool
2. Click "Find Missing Directors"
3. Review list
4. Click "Auto-Fill Directors"
5. Wait for completion
```

**Rate Limiting:** Respects TMDB API limits (40 req/10s)

#### **fill-directors-certs.php**
**Purpose:** Fetch content ratings/certifications
**Data Fetched:**
- US certification (G, PG, PG-13, R, NC-17)
- MPAA ratings
- International ratings (optional)

**Usage:**
1. Open tool
2. Select region (default: US)
3. Click "Fill Certifications"
4. Updates `movies.certification`

#### **add-movie-metadata-columns.php**
**Purpose:** Add new metadata columns to movies table
**Use Case:** When schema adds new fields

**Example:**
```sql
ALTER TABLE movies ADD COLUMN backdrop_url TEXT;
ALTER TABLE movies ADD COLUMN imdb_id TEXT;
ALTER TABLE movies ADD COLUMN media_type TEXT DEFAULT 'movie';
```

**Post-Migration:** Run fill-directors-AUTO.php to populate new fields

---

### Database Tools (`/admin/database-tools/`)

Tools for inspecting and maintaining the database.

#### **view-database.php**
**Purpose:** Browse all tables and data
**Features:**
- Table list with record counts
- Schema viewer (PRAGMA table_info)
- Data browser with pagination
- Index viewer
- Foreign key relationships

**Usage:**
1. Open tool
2. Click table name to view data
3. Use pagination for large tables
4. Click "Show Schema" for structure

**Example Output:**
```
Table: movies (4,582 records)
Columns: id, tmdb_id, title, year, poster_url, ...
Indexes: idx_movies_tmdb_id, idx_movies_title

Table: copies (12,341 records)
Columns: id, user_id, movie_id, format, edition, ...
Foreign Keys: user_id → users(id), movie_id → movies(id)
```

#### **check-schema.php**
**Purpose:** Verify database schema matches schema.sql
**Checks:**
- All tables exist
- All columns present
- Correct data types
- Indexes created
- Foreign keys enabled

**Usage:**
1. Run tool
2. Review comparison report
3. If mismatches found:
   - Run missing migrations
   - Or manually ALTER tables

**Example Output:**
```
✅ Table 'movies' matches schema
✅ Table 'copies' matches schema
❌ Table 'wishlist' missing column 'max_price'
   → Run: ALTER TABLE wishlist ADD COLUMN max_price REAL;
```

#### **check-movie-data.php**
**Purpose:** Validate movie data quality
**Checks:**
- NULL or missing titles
- Missing poster URLs
- NULL years
- Duplicate TMDB IDs
- Orphaned copies (movie_id doesn't exist)

**Usage:**
1. Run tool
2. Review data quality report
3. Click "Fix Issues" for automated repairs
4. Manually fix complex issues

**Example Report:**
```
Data Quality Report:
- 23 movies with NULL poster_url
- 5 movies with title "Unknown"
- 2 duplicate TMDB IDs found
- 0 orphaned copies
- 147 movies missing director

Recommendations:
→ Run fill-directors-AUTO.php
→ Run fix-unknown-titles-v2.php
→ Run remove-duplicates.php
```

#### **remove-duplicates.php**
**Purpose:** Find and merge duplicate movies
**Problem:** Same movie added multiple times with different TMDB IDs

**Detection:**
- Exact title match
- Same year
- Similar poster URLs

**Merge Process:**
1. Identify duplicates
2. Choose primary record (most complete metadata)
3. Update all `copies.movie_id` to primary
4. Update all `wishlist.movie_id` to primary
5. Delete duplicate movie records

**Safety:** Creates backup before merge

**Usage:**
```
1. Open tool
2. Click "Find Duplicates"
3. Review matches (manual approval required)
4. Select primary record
5. Click "Merge Duplicates"
```

#### **clean-database.php**
**Purpose:** General database cleanup and optimization
**Actions:**
- Remove orphaned records
- Vacuum database (reclaim space)
- Rebuild indexes
- Update statistics

**Usage:**
1. **Backup first!**
2. Run tool
3. Click "Clean Database"
4. Wait for completion (may take 30s-2min)
5. Verify database size reduced

**SQL Executed:**
```sql
-- Remove orphaned copies
DELETE FROM copies WHERE movie_id NOT IN (SELECT id FROM movies);

-- Remove orphaned wishlist items
DELETE FROM wishlist WHERE movie_id NOT IN (SELECT id FROM movies);

-- Vacuum database
VACUUM;

-- Rebuild indexes
REINDEX;

-- Update statistics
ANALYZE;
```

---

### Test Tools (`/admin/test-tools/`)

Tools for testing and debugging the application.

#### **cache-diagnostic.html**
**Purpose:** Diagnose service worker and cache issues
**Features:**
- Service worker status
- Cache list viewer
- Cache size calculator
- Version checker
- Update detector

**Common Issues Diagnosed:**
- Stale cache preventing updates
- Service worker not registered
- Version mismatch
- Large cache size

**Actions:**
- Clear all caches
- Unregister service worker
- Force reload
- View cached resources

#### **clear-cache.html**
**Purpose:** Manually clear all app caches
**When to Use:**
- Users report seeing old version
- CSS/JS changes not reflecting
- After major updates

**Process:**
1. Click "Clear All Caches"
2. Unregisters service worker
3. Clears all CacheStorage
4. Clears localStorage
5. Refreshes page

**Warning:** Users will need to re-download all assets

#### **icon-generator.html**
**Purpose:** Generate PWA icons from source image
**Features:**
- Upload source image (512x512+ recommended)
- Generate multiple sizes: 192x192, 512x512
- Apply effects (rounded corners, shadows)
- Download as ZIP

**Usage:**
1. Upload high-res app icon
2. Preview generated sizes
3. Apply optional effects
4. Download icons
5. Replace `/app-icon*.png` files

#### **icon-editor.html**
**Purpose:** Edit and preview existing icons
**Features:**
- Crop, resize, rotate
- Apply filters
- Add text overlays
- Preview on different devices

---

### Admin Features (`/admin/`)

High-level administrative interfaces.

#### **icon-manager.html**
**Purpose:** Manage user-uploaded icons
**Features:**
- Upload new icons
- Browse existing icons
- Apply advanced effects:
  - Brightness, contrast, saturation
  - Blur, grayscale, sepia
  - Rotation, flip
  - Drop shadows
- Delete icons
- Set default icons

**Storage:** Icons saved to `/icons/` directory
**Naming:** `icon_username_timestamp.png`

**Usage:**
1. Open Icon Manager
2. Drag-and-drop image
3. Apply effects in preview
4. Click "Save Icon"
5. Icon accessible at `/icons/{filename}`

#### **group-manager.html**
**Purpose:** Manage all groups in system (admin-only view)
**Features:**
- List all groups
- View members
- Delete groups
- Remove members
- Send invitations
- View borrowing activity

**Usage:**
1. Open Group Manager
2. Select group from list
3. View member details
4. Manage membership
5. Monitor borrowing

**Permissions:** Only admins can delete groups or remove members

#### **preset-manager.html**
**Purpose:** Manage UI preset configurations
**Features:**
- Create UI presets
- Save current layout as preset
- Load saved presets
- Export/import presets
- Delete presets

**Preset Structure:**
```json
{
    "name": "Dark Mode Compact",
    "settings": {
        "theme": "dark",
        "viewMode": "list",
        "gridColumns": 5,
        "showMetadata": true,
        "sortBy": "title"
    }
}
```

**Storage:** `/data/presets.json`

#### **version-manager.html**
**Purpose:** Manage application version
**Features:**
- View current version
- Bump version (major, minor, patch)
- Update timestamp
- Trigger PWA cache invalidation

**Versioning:** Semantic Versioning (major.minor.patch)
- **Major:** Breaking changes (1.0.0 → 2.0.0)
- **Minor:** New features (2.0.0 → 2.1.0)
- **Patch:** Bug fixes (2.1.0 → 2.1.1)

**Usage:**
1. Open Version Manager
2. Click "Bump Patch" (or Minor/Major)
3. Version updated in `/version.json`
4. PWA checks for update
5. Users see "Update Available" notification

**Auto-Update Flow:**
```
User opens app
→ Check /get-version.php
→ Compare with localStorage version
→ If different: Clear caches, reload
→ Show "App Updated" message
```

#### **config-editor.html**
**Purpose:** Edit configuration files
**Files Editable:**
- `/config/config.php`
- `/config/oauth-config.php`

**Features:**
- Syntax highlighting
- Validation before save
- Backup creation
- Revert changes

**⚠️ WARNING:** Incorrect config can break app!

**Usage:**
1. Open Config Editor
2. Select file to edit
3. Make changes
4. Click "Validate"
5. If valid, click "Save"
6. Backup saved to `/config/config.php.backup.{timestamp}`

#### **user-data-manager.html**
**Purpose:** Manage user data (admin-only)
**Features:**
- List all users
- View user collections
- Export user data (JSON/CSV)
- Clear user collection
- Clear user wishlist
- Delete user account

**Usage:**

**Export User Data:**
1. Select user
2. Click "Export Data"
3. Choose format (JSON or CSV)
4. Download file

**Clear User Collection:**
1. Select user
2. Click "Clear Collection"
3. Confirm action
4. All copies deleted (movies remain)

**Delete User:**
1. Select user
2. Click "Delete User"
3. Confirm action
4. Cascading delete:
   - User record
   - All copies
   - All wishlist items
   - All group memberships
   - All sessions
   - All trivia games/stats

**Safety:** Cannot delete yourself (current admin user)

#### **list-extractor.html**
**Purpose:** Extract movie lists from web articles
**Use Case:** Import "Top 100 Movies" lists from websites

**Requirements:** OpenAI API key configured

**Process:**
1. Paste article HTML or URL
2. Click "Extract Movies"
3. AI analyzes content
4. Returns JSON list of movies with years
5. Review and edit results
6. Click "Import to Collection"

**Example Input:**
```html
<article>
  <h1>Top 10 Movies of 2024</h1>
  <ol>
    <li>Dune: Part Two (2024)</li>
    <li>Oppenheimer (2023)</li>
    ...
  </ol>
</article>
```

**Example Output:**
```json
{
  "movies": [
    {"title": "Dune: Part Two", "year": 2024},
    {"title": "Oppenheimer", "year": 2023}
  ]
}
```

**Cost:** ~$0.01 per article (using gpt-4o-mini)

#### **json-to-csv.html**
**Purpose:** Convert JSON exports to CSV format
**Use Case:** Import into spreadsheet software (Excel, Google Sheets)

**Usage:**
1. Export collection as JSON (from app)
2. Open JSON to CSV Converter
3. Paste JSON data
4. Click "Convert"
5. Download CSV file

---

### New in v2.9.0: Bulk Data Editor, AI Cover Scanning & Box Set Movie Scanner

These features were introduced in v2.9.0. Administrators should be aware of the configuration requirements and system impact.

#### **Bulk Data Editor (Spreadsheet View)**

**Purpose:** Allows users to view and edit all copies or box sets in a spreadsheet-style table within the Collection tab (📊 Spreadsheet pill button).

**What It Does:**
- Presents all copies or box sets as an editable table
- Supports inline editing of Format, Edition, Region, Condition, and Notes
- Provides title-based filtering
- Offers "Fetch TMDB Data" to fill in missing metadata for individual rows
- Saves all modified rows in a single bulk API call

**Admin Considerations:**

1. **API Load:**
   - Bulk saves send one API request per modified row (batched on the client)
   - Large collections with many simultaneous edits may increase API load briefly
   - The TMDB fetch button triggers individual API lookups — remind users of TMDB rate limits (40 req/10s)

2. **Database Impact:**
   - Bulk updates modify the `copies` or `box_sets` tables
   - Each save triggers individual UPDATE statements within a transaction
   - Monitor database write performance if users report slow saves on large batches

3. **Data Quality:**
   - The Spreadsheet view makes it easy for users to normalize inconsistent data (e.g., standardizing "BluRay" → "Blu-ray")
   - Admins can use this feature themselves to audit and clean up user data quickly

**Monitoring:**
```sql
-- Check recent bulk edits (copies updated in rapid succession by same user)
SELECT user_id, COUNT(*) as edits, MIN(updated_at) as started, MAX(updated_at) as finished
FROM copies
WHERE updated_at > datetime('now', '-1 hour')
GROUP BY user_id
HAVING edits > 10
ORDER BY edits DESC;
```

#### **Box Set AI Cover Scanning**

**Purpose:** When creating a box set, users can photograph the box set cover and have AI analyze the text on it, automatically suggesting field assignments (Title, Spine, Edition, Format, Version).

**How It Works:**
1. User clicks "Scan Cover" in the box set creation form
2. Camera captures or user uploads a cover photo
3. Image is sent to the AI vision API for text detection
4. Detected text is returned as labeled chips (Title, Spine, Edition, Format, Version)
5. User can click chips to reassign them to different fields
6. Confirmed values auto-fill the box set form

**Admin Considerations:**

1. **OpenAI API Dependency:**
   - This feature requires a valid OpenAI API key configured in the system
   - Verify the key is set in `/config/config.php` or environment variables:
     ```php
     define('OPENAI_API_KEY', getenv('OPENAI_API_KEY'));
     ```
   - If the key is missing or invalid, the "Scan Cover" button will fail silently or show an error

2. **API Costs:**
   - Each cover scan sends one image to the OpenAI vision API
   - Estimated cost: ~$0.01-0.03 per scan (depends on image size and model used)
   - Monitor usage via the OpenAI dashboard if costs are a concern

3. **Privacy:**
   - Cover images are sent to OpenAI's API for processing
   - No images are stored on the CineShelf server after processing
   - Inform users if your deployment has specific data handling policies

4. **Troubleshooting:**
   - If scans return no results, check the OpenAI API key validity
   - If field assignments are incorrect, users can reassign chips manually
   - Poor image quality (blurry, low light) reduces accuracy

**Error Log Monitoring:**
```bash
# Check for AI scanning errors
grep -i "openai\|cover.scan\|vision" /path/to/data/php-errors.log
```

#### **Box Set Movie Scanner (Camera-Based)**

**Purpose:** Users can scan multiple movie disc covers in sequence using their device camera, then batch-add all identified movies to a box set at once.

**How It Works:**
1. User clicks "Scan Covers" within a box set (new or existing)
2. Device camera opens directly (no file picker -- same as Quick Scan)
3. User scans disc covers one at a time; each is identified in real time
4. After scanning all discs, user reviews the matched movie list
5. User clicks "Add All to Box Set" to batch-add all identified movies

**Admin Considerations:**

1. **TMDB API Usage:**
   - Each scanned cover triggers a TMDB search to identify the movie
   - A box set with many discs (e.g., 25 movies in a James Bond collection) generates many API calls in quick succession
   - TMDB rate limit is 40 requests per 10 seconds -- the client-side code includes throttling, but monitor for 429 errors

2. **Camera Permissions:**
   - This feature requires camera access via the browser
   - Users on iOS Safari must grant camera permissions; some enterprise MDM policies may block this
   - If users report camera not opening, verify their browser supports `getUserMedia` API

3. **Image Processing:**
   - Cover recognition uses a combination of text detection and TMDB search
   - The OpenAI API may be used for cover text extraction (same key as AI Cover Scanning above)
   - Fallback: if AI recognition fails, users are prompted to search manually

4. **Performance:**
   - Rapid sequential scans create short bursts of API activity
   - Monitor server load during peak usage if many users scan simultaneously

**Monitoring:**
```sql
-- Check box sets with many movies added at once (likely from scanner)
SELECT bs.id, bs.name, COUNT(bsm.movie_id) as movie_count, bs.updated_at
FROM box_sets bs
JOIN box_set_movies bsm ON bs.id = bsm.box_set_id
GROUP BY bs.id
HAVING movie_count > 5
ORDER BY bs.updated_at DESC
LIMIT 20;
```

---

## Database Management

### Database Location

**Path:** `/data/cineshelf.sqlite`
**Size:** ~1-5 MB (varies by collection size)
**Format:** SQLite 3
**Mode:** WAL (Write-Ahead Logging)

### Database Configuration

Set in `/config/config.php`:

```php
define('DB_PATH', __DIR__ . '/../data/cineshelf.sqlite');
define('DATA_DIR', __DIR__ . '/../data');

// Performance settings
$db->exec('PRAGMA foreign_keys = ON');
$db->exec('PRAGMA journal_mode = WAL');
$db->exec('PRAGMA synchronous = NORMAL');
$db->exec('PRAGMA temp_store = MEMORY');
$db->exec('PRAGMA cache_size = 10000');
```

### Manual Database Access

**Using SQLite CLI:**
```bash
# Open database
sqlite3 /path/to/data/cineshelf.sqlite

# Common commands
.tables                    # List tables
.schema movies             # Show table structure
SELECT COUNT(*) FROM movies;  # Query data
.quit                      # Exit
```

**Using DB Browser (GUI):**
1. Download: https://sqlitebrowser.org/
2. Open → Select `cineshelf.sqlite`
3. Browse tables, run queries
4. Export data

### Database Backup

**Manual Backup:**
```bash
# Copy database file
cp data/cineshelf.sqlite data/cineshelf.sqlite.backup

# Or with timestamp
cp data/cineshelf.sqlite "data/cineshelf.backup.$(date +%Y%m%d_%H%M%S).sqlite"
```

**Automated Backup Script:**
```bash
#!/bin/bash
# backup-cineshelf.sh

BACKUP_DIR="/backups/cineshelf"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_PATH="/path/to/data/cineshelf.sqlite"

# Create backup directory
mkdir -p $BACKUP_DIR

# Copy database
cp $DB_PATH "$BACKUP_DIR/cineshelf.$TIMESTAMP.sqlite"

# Keep only last 7 days
find $BACKUP_DIR -name "cineshelf.*.sqlite" -mtime +7 -delete

echo "Backup completed: cineshelf.$TIMESTAMP.sqlite"
```

**Schedule with Cron:**
```cron
# Daily backup at 2 AM
0 2 * * * /path/to/backup-cineshelf.sh
```

### Database Restore

**From Backup:**
```bash
# Stop web server (if possible)
sudo service apache2 stop

# Replace database
cp data/cineshelf.backup.20240215.sqlite data/cineshelf.sqlite

# Set permissions
chmod 666 data/cineshelf.sqlite

# Start web server
sudo service apache2 start
```

### Database Optimization

**Manual Optimization:**
```sql
-- Remove orphaned records
DELETE FROM copies WHERE movie_id NOT IN (SELECT id FROM movies);
DELETE FROM wishlist WHERE movie_id NOT IN (SELECT id FROM movies);

-- Reclaim space
VACUUM;

-- Rebuild indexes
REINDEX;

-- Update statistics
ANALYZE;
```

**Performance Check:**
```sql
-- Check database size
SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size();

-- Check fragmentation
PRAGMA freelist_count;

-- Check index usage
PRAGMA index_list('movies');
```

---

## User Management

### Viewing Users

**Via Admin Panel:**
1. Open `/admin/user-data-manager.html`
2. View complete user list with:
   - Username
   - Email (if OAuth)
   - Display name
   - Admin status
   - Collection count
   - Last login

**Via Database:**
```sql
SELECT
    u.id,
    u.username,
    u.email,
    u.display_name,
    u.is_admin,
    u.oauth_provider,
    COUNT(DISTINCT c.id) as collection_count,
    COUNT(DISTINCT w.id) as wishlist_count,
    u.created_at,
    u.updated_at
FROM users u
LEFT JOIN copies c ON u.id = c.user_id
LEFT JOIN wishlist w ON u.id = w.user_id
GROUP BY u.id
ORDER BY u.created_at DESC;
```

### Creating Admin Users

**Method 1: Config File (Recommended)**
1. Edit `/config/config.php`
2. Add username to array:
   ```php
   define('ADMIN_USERS', ['admin', 'klindakoil', 'default', 'newadmin']);
   ```
3. Save file
4. User becomes admin on next login

**Method 2: Database Direct**
```sql
UPDATE users SET is_admin = 1 WHERE username = 'newadmin';
```

**Method 3: Admin Tool**
1. Open `/admin/migration-tools/make-user-admin.php`
2. Enter username
3. Click "Make Admin"

### Removing Admin Privileges

**Via Database:**
```sql
UPDATE users SET is_admin = 0 WHERE username = 'oldadmin';
```

**Via Config:**
1. Edit `/config/config.php`
2. Remove username from `ADMIN_USERS` array
3. User loses admin status on next login

### Deleting Users

**⚠️ WARNING:** Cascading delete removes all user data!

**Via Admin Panel:**
1. Open `/admin/user-data-manager.html`
2. Select user
3. Click "Delete User"
4. Confirm action

**Via Database:**
```sql
-- Cascading delete handles all related records
DELETE FROM users WHERE id = 123;
```

**What Gets Deleted:**
- User record
- All copies
- All wishlist items
- All sessions
- All group memberships
- All trivia games and stats
- All audit log entries

**What Doesn't Get Deleted:**
- Movies (shared across users)
- Groups created by user (reassigned to another admin)

---

## Group Management

### Viewing All Groups

**Via Admin Panel:**
1. Open `/admin/group-manager.html`
2. View all groups with:
   - Group name
   - Member count
   - Created by
   - Creation date

**Via API:**
```javascript
fetch('/api/api.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'admin_list_all_groups' })
}).then(r => r.json());
```

**Via Database:**
```sql
SELECT
    g.id,
    g.name,
    g.description,
    u.username as created_by,
    COUNT(gm.id) as member_count,
    g.created_at
FROM groups g
JOIN users u ON g.created_by = u.id
LEFT JOIN group_members gm ON g.id = gm.group_id
GROUP BY g.id
ORDER BY g.created_at DESC;
```

### Managing Group Membership

**Add Member:**
```sql
INSERT INTO group_members (group_id, user_id, role, joined_at)
VALUES (1, 123, 'member', CURRENT_TIMESTAMP);
```

**Remove Member:**
```sql
DELETE FROM group_members WHERE group_id = 1 AND user_id = 123;
```

**Change Role:**
```sql
UPDATE group_members SET role = 'admin' WHERE group_id = 1 AND user_id = 123;
```

### Deleting Groups

**Via Admin Panel:**
1. Open `/admin/group-manager.html`
2. Select group
3. Click "Delete Group"
4. Confirm action

**Via Database:**
```sql
-- Cascading delete handles all related records
DELETE FROM groups WHERE id = 1;
```

**What Gets Deleted:**
- Group record
- All group memberships
- All group invites
- All borrow records within group

### Monitoring Borrowing Activity

**Recent Borrows:**
```sql
SELECT
    b.id,
    m.title as movie,
    owner.username as owner,
    borrower.username as borrower,
    b.borrowed_at,
    b.due_date,
    b.returned_at
FROM borrows b
JOIN copies c ON b.copy_id = c.id
JOIN movies m ON c.movie_id = m.id
JOIN users owner ON b.owner_id = owner.id
JOIN users borrower ON b.borrower_id = borrower.id
ORDER BY b.borrowed_at DESC
LIMIT 20;
```

**Overdue Borrows:**
```sql
SELECT
    b.id,
    m.title,
    owner.username as owner,
    borrower.username as borrower,
    b.due_date,
    julianday('now') - julianday(b.due_date) as days_overdue
FROM borrows b
JOIN copies c ON b.copy_id = c.id
JOIN movies m ON c.movie_id = m.id
JOIN users owner ON b.owner_id = owner.id
JOIN users borrower ON b.borrower_id = borrower.id
WHERE b.returned_at IS NULL
  AND b.due_date < date('now')
ORDER BY days_overdue DESC;
```

---

## Bulk Data Editor (v2.9.0)

The Bulk Data Editor provides a spreadsheet-style interface for rapid inline editing of collection data. This is accessible to all users via the 📊 (Bulk Editor) sub-view in the Collection tab.

### New API Endpoints

| Endpoint | Purpose |
|---|---|
| `list_all_copies_detailed` | Fetches all copies with full movie metadata for the spreadsheet view |
| `list_all_containers_detailed` | Fetches all containers with movie counts for the spreadsheet view |
| `bulk_update_copies` | Batch-updates multiple copies at once (format, edition, region, condition, notes) |
| `bulk_update_containers` | Batch-updates multiple containers at once (format, edition, region, condition) |
| `scan_boxset_cover_fields` | AI-powered cover analysis for box set field detection (GPT-4o) |

### OpenAI API Usage Note

The `scan_boxset_cover_fields` endpoint makes an additional type of OpenAI Vision API call. It uses `gpt-4o` with `max_tokens: 800` and returns structured JSON with detected text phrases and suggested field mappings. Admins should monitor OpenAI API usage if cost is a concern.

### Audit Logging

Bulk updates are logged with action types `copy_bulk_updated` and `container_bulk_updated` in the `audit_log` table, with one entry per updated record.

### Admin Considerations for Bulk Editor

**Performance:** The `list_all_copies_detailed` endpoint performs a JOIN across `copies` and `movies` tables and returns all rows for a user. For users with very large collections (1000+ copies), this may be slow. Monitor the `php-errors.log` for any slow query warnings.

**Data Integrity:** The `bulk_update_copies` and `bulk_update_containers` endpoints validate each update independently. If one row fails (e.g., invalid copy_id), the others still succeed. The response includes counts of both successful and failed updates.

### Box Set AI Features (v2.9.0)

Two new AI-powered features use the OpenAI API and affect admin cost monitoring:

#### Box Set Cover Scanning (`scan_boxset_cover_fields`)

- **Model:** GPT-4o (full model, not mini)
- **Cost per scan:** ~$0.02-0.05 (higher than single-title scans due to richer prompt)
- **Purpose:** Analyzes a photo of a box set cover and detects text phrases, categorizing them into Title, Spine Label, Edition, Format, and Version fields
- **Monitoring:** Check OpenAI usage dashboard for `gpt-4o` calls. Each box set cover scan is a single API call.

#### Box Set Movie Scanner (Camera-Based)

- **Model:** GPT-4o-mini (same as existing Quick Scan)
- **Cost per scan:** ~$0.01-0.02 per movie cover
- **Purpose:** Sequential camera scanning of individual disc covers within a box set
- **Monitoring:** Multiple scans per box set (one per disc). A 10-movie box set = ~10 API calls = ~$0.10-0.20. Uses the existing `scan_cover_image` endpoint.

#### Cost Management Tips

- Monitor the OpenAI billing dashboard weekly if users are actively scanning
- Set a monthly spending limit on the OpenAI account to prevent runaway costs
- The cover scanner features only work when `OPENAI_API_KEY` is configured; remove the key to disable AI features entirely
- Consider setting a per-user daily scan limit in a future release if costs become a concern

---

## Data Maintenance

### Regular Maintenance Tasks

**Daily:**
- Monitor error logs (`/data/php-errors.log`)
- Check disk space
- Review new user signups

**Weekly:**
- Run `check-movie-data.php`
- Review orphaned records
- Check for duplicate movies

**Monthly:**
- Vacuum database (VACUUM)
- Update statistics (ANALYZE)
- Review and archive audit logs
- Backup database

**Quarterly:**
- Review admin user list
- Audit group memberships
- Clean up old sessions
- Review API key usage (TMDB)

### Data Quality Checks

**Missing Metadata:**
```sql
-- Movies without directors
SELECT COUNT(*) FROM movies WHERE director IS NULL OR director = '';

-- Movies without posters
SELECT COUNT(*) FROM movies WHERE poster_url IS NULL;

-- Movies with "Unknown" title
SELECT COUNT(*) FROM movies WHERE title = 'Unknown';
```

**Orphaned Records:**
```sql
-- Copies without movies
SELECT COUNT(*) FROM copies
WHERE movie_id NOT IN (SELECT id FROM movies);

-- Wishlist items without movies
SELECT COUNT(*) FROM wishlist
WHERE movie_id NOT IN (SELECT id FROM movies);

-- Group members without users
SELECT COUNT(*) FROM group_members
WHERE user_id NOT IN (SELECT id FROM users);
```

**Duplicate Detection:**
```sql
-- Duplicate TMDB IDs
SELECT tmdb_id, COUNT(*) as count
FROM movies
WHERE tmdb_id NOT LIKE 'unresolved_%'
GROUP BY tmdb_id
HAVING count > 1;

-- Duplicate titles + years
SELECT title, year, COUNT(*) as count
FROM movies
GROUP BY title, year
HAVING count > 1;
```

### Automated Cleanup Script

Create `/admin/maintenance/daily-cleanup.php`:

```php
<?php
require_once __DIR__ . '/../../config/config.php';

$db = getDb();

// Remove expired sessions (older than 30 days)
$stmt = $db->prepare("DELETE FROM sessions WHERE expires_at < datetime('now')");
$stmt->execute();
echo "Removed " . $stmt->rowCount() . " expired sessions\n";

// Remove expired invites (older than 7 days)
$stmt = $db->prepare("DELETE FROM group_invites WHERE expires_at < datetime('now') AND accepted_at IS NULL");
$stmt->execute();
echo "Removed " . $stmt->rowCount() . " expired invites\n";

// Clean up orphaned records
$stmt = $db->prepare("DELETE FROM copies WHERE movie_id NOT IN (SELECT id FROM movies)");
$stmt->execute();
echo "Removed " . $stmt->rowCount() . " orphaned copies\n";

$stmt = $db->prepare("DELETE FROM wishlist WHERE movie_id NOT IN (SELECT id FROM movies)");
$stmt->execute();
echo "Removed " . $stmt->rowCount() . " orphaned wishlist items\n";

echo "Daily cleanup completed\n";
```

Run via cron:
```cron
0 3 * * * /usr/bin/php /path/to/admin/maintenance/daily-cleanup.php >> /path/to/logs/cleanup.log 2>&1
```

---

## System Diagnostics

### Health Check

**Manual Check:**
1. Open `/admin/diagnostics/status-check.php`
2. View system health report

**Automated Check Script:**

```php
<?php
// /admin/diagnostics/health-check.php

require_once __DIR__ . '/../../config/config.php';

$health = [
    'status' => 'healthy',
    'checks' => []
];

// Database connection
try {
    $db = getDb();
    $health['checks']['database'] = 'OK';
} catch (Exception $e) {
    $health['status'] = 'unhealthy';
    $health['checks']['database'] = 'FAILED: ' . $e->getMessage();
}

// Database file permissions
if (is_writable(DB_PATH)) {
    $health['checks']['db_writable'] = 'OK';
} else {
    $health['status'] = 'warning';
    $health['checks']['db_writable'] = 'WARNING: Not writable';
}

// TMDB API
$response = @file_get_contents(TMDB_BASE_URL . '/movie/550?api_key=' . TMDB_API_KEY);
if ($response) {
    $health['checks']['tmdb_api'] = 'OK';
} else {
    $health['status'] = 'warning';
    $health['checks']['tmdb_api'] = 'WARNING: API unreachable';
}

// Disk space
$freeSpace = disk_free_space(DATA_DIR);
$totalSpace = disk_total_space(DATA_DIR);
$percentFree = ($freeSpace / $totalSpace) * 100;

if ($percentFree > 10) {
    $health['checks']['disk_space'] = 'OK (' . round($percentFree, 1) . '% free)';
} else {
    $health['status'] = 'warning';
    $health['checks']['disk_space'] = 'WARNING: Low disk space (' . round($percentFree, 1) . '%)';
}

// PHP version
$phpVersion = phpversion();
if (version_compare($phpVersion, '7.4', '>=')) {
    $health['checks']['php_version'] = 'OK (PHP ' . $phpVersion . ')';
} else {
    $health['status'] = 'warning';
    $health['checks']['php_version'] = 'WARNING: PHP ' . $phpVersion . ' (7.4+ recommended)';
}

header('Content-Type: application/json');
echo json_encode($health, JSON_PRETTY_PRINT);
```

### Monitoring Error Logs

**PHP Error Log:**
```bash
# View recent errors
tail -n 50 /path/to/data/php-errors.log

# Monitor in real-time
tail -f /path/to/data/php-errors.log

# Search for specific errors
grep "TMDB API" /path/to/data/php-errors.log
```

**Apache Error Log:**
```bash
# Ubuntu/Debian
tail -f /var/log/apache2/error.log

# CentOS/RHEL
tail -f /var/log/httpd/error_log
```

### Performance Monitoring

**Database Query Performance:**
```sql
-- Enable query logging
PRAGMA query_only = OFF;

-- Check slow queries (if logged)
SELECT * FROM audit_log WHERE action LIKE '%slow%';
```

**API Response Times:**

Add to `/api/api.php`:
```php
$startTime = microtime(true);

// ... API logic ...

$endTime = microtime(true);
$duration = ($endTime - $startTime) * 1000; // Convert to ms

if ($duration > 500) {
    error_log("Slow API call: $action took {$duration}ms");
}
```

---

## Backup & Recovery

### Full System Backup

**What to Backup:**
1. Database: `/data/cineshelf.sqlite`
2. User uploads: `/icons/`
3. Configuration: `/config/`
4. Presets: `/data/presets.json`
5. Version: `/version.json`

**Backup Script:**
```bash
#!/bin/bash
# full-backup.sh

BACKUP_DIR="/backups/cineshelf"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
APP_DIR="/var/www/cineshelf.futuresrelic.com"

# Create backup directory
mkdir -p "$BACKUP_DIR/$TIMESTAMP"

# Backup database
cp "$APP_DIR/data/cineshelf.sqlite" "$BACKUP_DIR/$TIMESTAMP/"

# Backup icons
cp -r "$APP_DIR/icons" "$BACKUP_DIR/$TIMESTAMP/"

# Backup config
cp -r "$APP_DIR/config" "$BACKUP_DIR/$TIMESTAMP/"

# Backup presets
cp "$APP_DIR/data/presets.json" "$BACKUP_DIR/$TIMESTAMP/"

# Backup version
cp "$APP_DIR/version.json" "$BACKUP_DIR/$TIMESTAMP/"

# Create archive
cd "$BACKUP_DIR"
tar -czf "cineshelf-backup-$TIMESTAMP.tar.gz" "$TIMESTAMP/"
rm -rf "$TIMESTAMP"

echo "Backup completed: cineshelf-backup-$TIMESTAMP.tar.gz"
```

### Disaster Recovery

**Complete Restore:**
```bash
#!/bin/bash
# restore.sh

BACKUP_FILE="/backups/cineshelf/cineshelf-backup-20240215_020000.tar.gz"
APP_DIR="/var/www/cineshelf.futuresrelic.com"

# Extract backup
cd /tmp
tar -xzf "$BACKUP_FILE"

# Stop web server
sudo service apache2 stop

# Restore files
cp -r /tmp/20240215_020000/data/* "$APP_DIR/data/"
cp -r /tmp/20240215_020000/icons/* "$APP_DIR/icons/"
cp -r /tmp/20240215_020000/config/* "$APP_DIR/config/"

# Set permissions
chown -R www-data:www-data "$APP_DIR/data"
chown -R www-data:www-data "$APP_DIR/icons"
chmod 666 "$APP_DIR/data/cineshelf.sqlite"

# Start web server
sudo service apache2 start

echo "Restore completed"
```

---

## Performance Tuning

### Database Optimization

**WAL Mode (Already Enabled):**
```sql
PRAGMA journal_mode = WAL;
```

**Benefits:**
- Better concurrency
- Faster writes
- Atomic commits

**Cache Size:**
```sql
-- Increase cache (default: 10000 pages ≈ 40MB)
PRAGMA cache_size = 20000;
```

**Synchronous Mode:**
```sql
-- NORMAL is good balance
PRAGMA synchronous = NORMAL;
-- FULL is slower but safer
-- OFF is faster but risky
```

### Apache/PHP Tuning

**PHP Settings** (`php.ini`):
```ini
; Increase memory limit
memory_limit = 256M

; Increase execution time
max_execution_time = 60

; Enable OPcache
opcache.enable=1
opcache.memory_consumption=128
opcache.max_accelerated_files=10000
```

**Apache Settings** (`.htaccess` or `httpd.conf`):
```apache
# Enable compression
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json
</IfModule>

# Browser caching
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType image/jpg "access plus 1 year"
    ExpiresByType image/jpeg "access plus 1 year"
    ExpiresByType image/gif "access plus 1 year"
    ExpiresByType image/png "access plus 1 year"
    ExpiresByType text/css "access plus 1 month"
    ExpiresByType application/javascript "access plus 1 month"
</IfModule>
```

---

## Troubleshooting Common Issues

### Issue: Database Locked

**Symptoms:**
- "Database is locked" errors
- API calls timing out

**Causes:**
- Long-running query
- WAL mode not enabled
- Insufficient permissions

**Solutions:**

1. **Check WAL mode:**
```sql
PRAGMA journal_mode;
-- Should return: wal
-- If not:
PRAGMA journal_mode = WAL;
```

2. **Check for long queries:**
```bash
# Find PHP processes
ps aux | grep php

# Kill long-running process
kill <PID>
```

3. **Check permissions:**
```bash
chmod 666 data/cineshelf.sqlite
chmod 755 data/
```

### Issue: API Returns 500 Error

**Symptoms:**
- API calls fail with 500 Internal Server Error
- Blank page

**Diagnosis:**

1. **Check PHP error log:**
```bash
tail -n 50 data/php-errors.log
```

2. **Enable debug mode:**
```php
// In config/config.php
define('DEBUG_MODE', true);
```

3. **Check Apache error log:**
```bash
tail -n 50 /var/log/apache2/error.log
```

**Common Causes:**
- PHP syntax error
- Missing database file
- Permission issues
- Missing PHP extension (PDO, SQLite)

### Issue: OAuth Login Fails

**Symptoms:**
- Redirect loop
- "Unauthorized" error
- Can't log in with Google

**Diagnosis:**

1. **Check OAuth credentials:**
```php
// In config/oauth-config.php
echo GOOGLE_CLIENT_ID; // Should not be empty
echo GOOGLE_CLIENT_SECRET; // Should not be empty
```

2. **Check redirect URI:**
- Must match exactly in Google Console
- Include `https://` (production) or `http://` (local)

3. **Check sessions table:**
```sql
SELECT * FROM sessions ORDER BY created_at DESC LIMIT 5;
```

4. **Check browser cookies:**
- Open DevTools → Application → Cookies
- Look for `cineshelf_auth_token`
- Should be httpOnly, SameSite=Lax

**Solutions:**

1. **Regenerate OAuth credentials:**
- Go to Google Cloud Console
- Create new OAuth 2.0 client
- Update `oauth-config.php`

2. **Clear sessions:**
```sql
DELETE FROM sessions;
```

3. **Check time synchronization:**
```bash
# Server time must be accurate for OAuth
date
# If wrong, sync with NTP
sudo ntpdate pool.ntp.org
```

### Issue: Movies Not Fetching from TMDB

**Symptoms:**
- Search returns no results
- Movies added as "Unknown"

**Diagnosis:**

1. **Test TMDB API:**
```bash
curl "https://api.themoviedb.org/3/movie/550?api_key=YOUR_API_KEY"
```

2. **Check error log:**
```bash
grep "TMDB" data/php-errors.log
```

**Common Causes:**
- Invalid API key
- Rate limit exceeded (40 req/10s)
- Network/firewall blocking TMDB

**Solutions:**

1. **Verify API key:**
```php
// In config/config.php
define('TMDB_API_KEY', '8039283176a74ffd71a1658c6f84a051');
```

2. **Check rate limiting:**
```php
// Add delay between requests
sleep(1); // Wait 1 second
```

3. **Use proxy (if blocked):**
```php
$context = stream_context_create([
    'http' => [
        'proxy' => 'tcp://proxy.example.com:8080',
        'request_fulluri' => true
    ]
]);
$response = file_get_contents($url, false, $context);
```

---

## Security Best Practices

### Secure Configuration

**Move secrets to environment variables:**
```php
// Instead of:
define('GOOGLE_CLIENT_SECRET', 'hardcoded-secret');

// Use:
define('GOOGLE_CLIENT_SECRET', getenv('GOOGLE_CLIENT_SECRET'));
```

**Set in Apache virtual host:**
```apache
<VirtualHost *:443>
    SetEnv GOOGLE_CLIENT_ID "your-client-id"
    SetEnv GOOGLE_CLIENT_SECRET "your-client-secret"
    SetEnv TMDB_API_KEY "your-tmdb-key"
    SetEnv OPENAI_API_KEY "your-openai-key"
</VirtualHost>
```

### Admin Panel Protection

**Add .htaccess to /admin/:**
```apache
AuthType Basic
AuthName "CineShelf Admin Area"
AuthUserFile /path/to/.htpasswd
Require valid-user
```

**Create .htpasswd:**
```bash
htpasswd -c /path/to/.htpasswd admin
# Enter password when prompted
```

### Regular Security Audits

**Monthly Checklist:**
- [ ] Review admin user list
- [ ] Check for SQL injection vulnerabilities
- [ ] Verify HTTPS is enforced
- [ ] Review session security settings
- [ ] Check file permissions
- [ ] Update dependencies (if any)
- [ ] Review error logs for suspicious activity
- [ ] Test backup restore procedure

---

## Appendix: Quick Reference

### Important File Locations

```
/config/config.php              - Main configuration
/config/oauth-config.php        - OAuth credentials
/data/cineshelf.sqlite          - Database
/data/php-errors.log            - Error log
/data/presets.json              - UI presets
/version.json                   - App version
/admin/                         - Admin panel
/api/api.php                    - Main API endpoint
```

### Important SQL Queries

```sql
-- User count
SELECT COUNT(*) FROM users;

-- Total movies
SELECT COUNT(*) FROM movies;

-- Total collection items
SELECT COUNT(*) FROM copies;

-- Active sessions
SELECT COUNT(*) FROM sessions WHERE expires_at > datetime('now');

-- Disk usage
SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size();
```

### Emergency Commands

```bash
# Restart Apache
sudo service apache2 restart

# Check Apache status
sudo service apache2 status

# View recent errors
tail -n 50 data/php-errors.log

# Backup database NOW
cp data/cineshelf.sqlite "data/emergency-backup-$(date +%Y%m%d_%H%M%S).sqlite"

# Restore from backup
cp data/cineshelf.backup.sqlite data/cineshelf.sqlite
```

---

**Document Version:** 1.1
**Last Updated:** 2026-02-14
**Support:** For technical assistance, contact the development team or consult the Dev Guide.
