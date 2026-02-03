# CineShelf Administrator Guide

**Version:** 2.2.14
**Last Updated:** 2026-02-03
**Target Audience:** System administrators, maintainers, power users

---

## Table of Contents

1. [Administrator Overview](#administrator-overview)
2. [Admin Panel Access](#admin-panel-access)
3. [Admin Tools Reference](#admin-tools-reference)
4. [Database Management](#database-management)
5. [User Management](#user-management)
6. [Group Management](#group-management)
7. [Data Maintenance](#data-maintenance)
8. [System Diagnostics](#system-diagnostics)
9. [Backup & Recovery](#backup--recovery)
10. [Performance Tuning](#performance-tuning)
11. [Troubleshooting Common Issues](#troubleshooting-common-issues)
12. [Security Best Practices](#security-best-practices)

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

**Document Version:** 1.0
**Last Updated:** 2026-02-03
**Support:** For technical assistance, contact the development team or consult the Dev Guide.
