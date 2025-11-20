# CineShelf Admin Panel

Welcome to the CineShelf administration tools! This directory contains all the utilities needed to manage, maintain, and troubleshoot your CineShelf movie collection.

## 🚀 Quick Start

Access the admin panel at: **`/admin/index.html`**

The main dashboard provides quick access to all tools organized by category.

---

## 📁 Directory Structure

```
admin/
├── index.html              # Main admin dashboard
├── config-editor.html      # Configuration viewer
├── database-tools/         # Database management utilities
├── data-tools/             # Data enhancement utilities
├── migration-tools/        # Database migration scripts
├── diagnostics/            # System diagnostics
└── test-tools/             # Development & testing tools
```

---

## 🛠️ Tools Overview

### ⚙️ Configuration

#### **Configuration Editor** (`config-editor.html`)
- View current app settings and configuration
- Displays API keys (masked), admin users, and paths
- Read-only interface for security
- **Note:** To modify settings, edit `config/config.php` directly

#### **Version Manager** (`version-manager.html`)
- View and manage app version number
- Force cache refresh for all users
- Update version in `version.json`

#### **Bump Version** (`bump-version.php`)
- Automatically increment version number
- Useful for forcing PWA updates

#### **Group Manager** (`group-manager.html`)
- View all groups and their members
- Edit group names and descriptions
- Delete groups (removes members, preserves movies)
- Remove individual members from groups
- Search and filter groups
- **Permissions:** Only group admins can edit/delete groups

---

### 🗄️ Database Tools

All database tools require password authentication (`?pass=indeed` by default - **change this!**)

#### **View Database** (`database-tools/view-database.php`)
- Browse all database tables and records
- Shows up to 50 rows per table
- Displays table schema and row counts
- **Usage:** `view-database.php?pass=your_password`

#### **Check Schema** (`database-tools/check-schema.php`)
- Verify database structure integrity
- Check for missing tables or columns
- Validate foreign key constraints
- Useful after migrations

#### **Clean Database** (`database-tools/clean-database.php`)
- Remove duplicate entries
- Optimize database performance
- Vacuum and analyze SQLite database
- **Warning:** Creates backup before cleaning

#### **Remove Duplicates** (`database-tools/remove-duplicates.php`)
- Find and remove duplicate movie entries
- Based on TMDB ID matching
- Interactive removal process
- Shows preview before deletion

#### **Check Movie Data** (`database-tools/check-movie-data.php`)
- Validate movie metadata completeness
- Find movies with missing information
- Check for broken poster URLs
- Generate data quality report

---

### 📊 Data Tools

These tools enhance and fix movie metadata:

#### **Auto-Fill Directors** (`data-tools/fill-directors-AUTO.php`)
- Automatically fetch missing director information
- Uses TMDB API to populate director field
- Processes movies in batches
- Rate-limited to avoid API throttling (300ms delay)
- **Usage:** Run via browser, monitors progress automatically

#### **Fill Certifications** (`data-tools/fill-directors-certs.php`)
- Add missing movie certifications (ratings)
- Fetches US certifications from TMDB
- Updates movies without certification data
- Rate-limited API calls

#### **Fix Corrupted Titles** (`data-tools/fix-corrupted-titles.php`)
- Repair malformed or damaged movie titles
- Fixes encoding issues
- Removes invalid characters
- Shows before/after comparison

#### **Fix Unknown Titles** (`data-tools/fix-unknown-titles-v2.php`)
- Resolve movies marked as "Unknown"
- Attempts to match via TMDB search
- Interactive correction process
- Version 2 includes better matching algorithms

#### **Add Metadata Columns** (`data-tools/add-movie-metadata-columns.php`)
- Upgrade database schema with new fields
- Add columns for additional metadata
- Safe migration with rollback support
- **Use when:** Adding new features requiring database changes

---

### 🔄 Migration Tools

**⚠️ Warning:** Always backup your database before running migrations!

#### **Migrate V1 to V2** (`migration-tools/migrate-v1-to-v2.php`)
- Upgrade from CineShelf v1.x to v2.x
- Restructures database schema
- Preserves all existing data
- Adds new v2 features (groups, enhanced metadata)
- **Backup automatically created**

#### **Batch Migration** (`migration-tools/migrate-simple-batch.php`)
- Alternative migration approach
- Processes data in smaller batches
- Better for large collections (500+ movies)
- Lower memory usage
- Rate-limited for stability

#### **Add Groups Support** (`migration-tools/migrate-add-groups.php`)
- Add group/family sharing functionality
- Creates groups tables and relationships
- Migrates existing data to support groups
- **Run after:** V1 to V2 migration

---

### 🔍 Diagnostics

#### **Status Check** (`diagnostics/status-check.php`)
- Comprehensive system health check
- Tests database connectivity
- Verifies file permissions
- Checks API configuration
- Shows disk usage and PHP version
- **Use for:** Troubleshooting issues

#### **Ultra Debug** (`diagnostics/ultra-debug.php`)
- Detailed diagnostic information
- Dumps full configuration
- Shows environment variables
- Lists all database tables with counts
- Displays recent error logs
- **Use for:** Deep troubleshooting

---

### 🧪 Test & Development Tools

#### **Test Database** (`test-tools/test-database.php`)
- Interactive database testing interface
- Run custom SQL queries
- Test API endpoints
- Validate data integrity
- Shows sample data from each table

#### **Test Configuration** (`test-tools/test-config.php`)
- Verify config.php is properly loaded
- Test database connection
- Check file paths
- Validate settings
- **Use when:** Setting up new environment

#### **Test API Errors** (`test-tools/test-api-error.php`)
- Simulate API error conditions
- Test error handling
- Validate error messages
- **Development use only**

#### **Test Groups Backend** (`test-tools/test-groups-backend.html`)
- Test group functionality
- Create test groups
- Verify group permissions
- Test sharing features

#### **Cache Diagnostic** (`test-tools/cache-diagnostic.html`)
- Inspect service worker cache
- View cached files and versions
- Check cache status
- Debug PWA caching issues

#### **Clear Cache** (`test-tools/clear-cache.html`)
- Manually clear service worker cache
- Force cache refresh
- Unregister service worker
- **Use when:** Testing updates or fixing cache issues

#### **Icon Editor** (`test-tools/icon-editor.html`)
- Edit and preview PWA icons
- Test different icon sizes
- Generate icon variants
- Preview on different backgrounds

#### **Icon Generator** (`test-tools/icon-generator.html`)
- Generate PWA icons in multiple sizes
- Create from base image
- Export all required sizes
- Includes maskable icon support

---

## 🔐 Security Notes

### Password Protection

Many tools use basic password protection:
- **Default password:** `indeed`
- **⚠️ CHANGE THIS** in each PHP file before deploying
- Look for: `$password = 'indeed';`

### Best Practices

1. **Use `.htpasswd`** for production environments instead of PHP passwords
2. **Restrict admin directory** via web server configuration
3. **Keep API keys** in environment variables (not in config.php)
4. **Backup regularly** before running any migrations or cleanup tools
5. **Review `.gitignore`** to ensure sensitive data isn't committed

---

## 📖 Common Workflows

### Setting Up a New Installation

1. Run **Test Configuration** to verify setup
2. Run **Status Check** for health verification
3. Use **Check Schema** to validate database structure
4. Access main app and add movies!

### Upgrading from V1 to V2

1. **Backup your database** (copy `data/cineshelf.sqlite`)
2. Run **Migrate V1 to V2**
3. Run **Add Groups Support** (if you want groups)
4. Run **Status Check** to verify migration
5. Use **View Database** to inspect results

### Fixing Data Quality Issues

1. Run **Check Movie Data** to identify issues
2. Use **Fix Unknown Titles** for missing titles
3. Run **Fix Corrupted Titles** for encoding issues
4. Use **Auto-Fill Directors** for missing director info
5. Run **Fill Certifications** for missing ratings
6. Verify with **View Database**

### Optimizing Database

1. Run **Check Movie Data** to find issues
2. Use **Remove Duplicates** to clean duplicates
3. Run **Clean Database** to optimize
4. Verify with **Status Check**

### Troubleshooting

1. Start with **Status Check**
2. If config issues → **Test Configuration**
3. If cache issues → **Cache Diagnostic** → **Clear Cache**
4. If data issues → **Check Movie Data**
5. For deep issues → **Ultra Debug**

---

## 🚨 Important Warnings

### Before Running Migrations
- **Always backup** `data/cineshelf.sqlite` first
- Test on a copy if possible
- Migrations cannot be easily reversed

### Before Cleaning Database
- Review what will be deleted
- Tools create backups, but verify they exist
- Don't run multiple cleanup tools simultaneously

### API Rate Limiting
- TMDB API has rate limits (40 requests per 10 seconds)
- Auto-fill tools include delays
- Don't run multiple data-fetching tools at once
- If rate-limited, wait 10 minutes before retrying

---

## 💡 Tips & Tricks

- **Use Query Parameters:** Most PHP tools support `?pass=your_password`
- **Check Logs:** Server error logs contain detailed PHP errors
- **Browser Console:** Many HTML tools log to browser console
- **Version Bumping:** Increment version after major changes to force PWA refresh
- **Regular Maintenance:** Run Check Movie Data monthly to maintain quality

---

## 🆘 Getting Help

If you encounter issues:

1. Check **Status Check** and **Ultra Debug** outputs
2. Review browser console for JavaScript errors
3. Check server error logs for PHP errors
4. Verify file permissions (755 for directories, 644 for files)
5. Ensure `data/` directory is writable

---

## 📝 Development

### Adding New Tools

1. Create new PHP/HTML file in appropriate subdirectory
2. Include config: `require_once __DIR__ . '/../../config/config.php';`
3. Add back button to admin panel
4. Update `admin/index.html` with new tool card
5. Document in this README

### Tool Template

```php
<?php
require_once __DIR__ . '/../../config/config.php';

// Password protection
$password = 'indeed'; // CHANGE THIS!
if (!isset($_GET['pass']) || $_GET['pass'] !== $password) {
    die('Access denied. Use: ?pass=your_password');
}

// Your tool code here
?>
```

---

## 📊 Statistics

- **Total Tools:** 25+
- **Configuration Tools:** 4 (Config Editor, Version Manager, Bump Version, Group Manager)
- **Database Tools:** 5
- **Data Enhancement Tools:** 5
- **Migration Scripts:** 3
- **Diagnostic Tools:** 2
- **Test Tools:** 8+

---

*Last Updated: 2024*
*CineShelf v2.1+*
