# CineShelf Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.5.2] - 2026-02-11

### Fixed
- **Shelf Wizard now auto-populates shelves with matching films** — previously, the wizard created empty shelves and told users to assign films manually. Now it:
  - Fetches all unassigned copies (excluding films already on a shelf or inside box sets)
  - Matches copies by director (exact), studio (exact + production companies), or genre (substring)
  - Assigns each matching copy to the newly created shelf via the `assign_to_shelf` API
  - Tracks copies assigned during the run to prevent double-assignment across shelves
  - Shows a summary of shelves created and films assigned on the completion screen
  - Progress feedback during creation ("Creating...", "Populating... (N films)")

---

## [2.5.1] - 2026-02-11

### Added
- **Box set custom cover / poster** — open any box set → click the thumbnail (or "📸 Change Cover" button) to launch a full crop modal:
  - Choose a photo from gallery or take one live with the camera
  - Canvas-based crop editor: drag to pan, zoom slider, 2:3 poster aspect ratio frame with corner guides
  - Crops client-side then uploads to `/data/uploads/covers/` (Railway persistent volume)
  - Cover replaces the auto-generated movie-poster grid in both the box sets grid and detail modal
- **Box set badge on collection cards** — movies whose copies are inside a box set show a small 📦 badge in the corner; hover shows the box set name
- **Confirmed**: `get_unassigned_copies` already filters out container-linked copies (`cc.id IS NULL`), so box-set films never appear in the shelf placement pool

### Changed
- Box set detail modal redesigned: cover thumbnail left, title/format/stats/actions right; clicking thumbnail opens the crop modal

---

## [2.5.0] - 2026-02-11

### Added
- **Swipe / arrow navigation everywhere** — the prev/next movie nav (previously shelf-view-only) now works in all views:
  - Collection grid and list view: click any movie → ‹ › arrows, keyboard ←/→, touch swipe
  - Wishlist grid and list view: click any movie → same nav; wishlist cards are now clickable to view full details
  - Wishlist detail view falls back to wishlist metadata when the item is not yet in the collection; shows "Add to Collection" button directly from the modal
- **Shelf Setup Wizard** (`🧙 Setup Wizard` button in Shelves tab):
  - Step 1 — choose organization style: Directors, Studios, Genres, or Mixed (all three)
  - Optionally nest all new shelves under an existing parent shelf
  - Step 2 — smart checklist: top directors/studios/genres from your collection, sorted by film count; top 10 pre-checked, "Show N more ▾" to reveal the rest (unchecked)
  - Step 3 — review list with category color coding (blue = director, gold = studio, green = genre)
  - Bulk creates all selected shelves in one click; progress and error reporting included
  - Done screen with direct shortcut back to Shelves tab
- **PWA Install buttons** in Settings tab (Android one-tap install, iOS step-by-step guide)
- `version.json` synced to v2.4.2 to match codebase

### Changed
- Wishlist cards in grid/list view now have an eye icon (👁️) + click-to-view alongside the existing Add/Remove buttons

---

## [2.4.1] - 2026-02-10

### Added
- **Spine view** for Shelf View parent/aggregate levels
  - Each shelf section is shown as a row with a horizontal scrollable strip of spine labels
  - Spines are narrow vertical strips, color-coded by format (4K gold, Blu-ray blue, DVD red, VHS green, etc.)
  - Box set spines are wider with a purple gradient and film-count badge
  - Hover any spine to expand it and reveal the title in horizontal readable text
  - At the leaf (deepest) shelf level, switches to poster grid view

### Changed
- Shelf View now pre-fetches ALL shelf contents in parallel on entry (faster navigation, no per-level loading)
- All movies from child shelves appear in the parent spine row (recursive aggregation) — "zoom in" effect

### Fixed
- Box set cards in Shelf View showed "0 films" — JS was reading `movie_count` but API returns `container_movie_count`

---

## [2.4.0] - 2026-02-10

### Added
- **Shelf View** sub-panel inside Collection tab — hierarchical shelf browser
  - Starts at "All Shelves" (top-level shelves listed as clickable cards)
  - Click any shelf to drill in and see child sections + movies directly on that shelf
  - Breadcrumb trail shows full navigation path; click any crumb to jump back
  - Back button zooms out one level
  - Movies shown as poster grid; box sets shown as 2×2 poster stack
  - Clicking a movie opens the movie detail modal; clicking a box set opens the box set modal

### Changed
- Renamed **Physical Media** sub-view to **Box Sets** (cleaner, more accurate name)
- `data-subview="physical"` → `data-subview="boxsets"`, panel ID `subviewPhysical` → `subviewBoxSets`

### Fixed
- **Box set modal not showing films** — Duplicate `id="boxSetMoviesList"` existed in both the creation panel and the details modal; `getElementById` was returning the wrong element. Fixed by renaming the modal's list element to `id="boxSetDetailsMoviesList"`.
- **Version number reset after Railway deploy** — Bumped version was written to `version.json` (source-controlled, overwritten on every deploy). Now `bump-version.php` writes to `data/version.json` on the Railway persistent volume. All version-reading PHP files check the volume location first, then fall back to the source file.

---

## [2.3.0] - 2026-02-10

### Added
- **Consolidated Collection tab** with three sub-views switchable by pill-style navigation buttons
  - **Movies** sub-view: existing collection grid with all filter/sort/view controls
  - **Wishlist** sub-view: wishlist grid with Browse Lists button
  - **Physical Media** sub-view: box sets / containers list with Create Box Set button
- `switchCollectionView(view)` function to switch between Movies | Wishlist | Physical Media
- `currentCollectionSubview` state variable tracking the active sub-view
- CSS pill-style sub-navigation (`.collection-subview-nav`, `.subview-btn`, `.subview-panel`, `.subview-toolbar`)
- Badge counts on sub-navigation buttons (collection count on Movies, wishlist count on Wishlist)

### Changed
- Removed **Wishlist** and **Box Sets** tabs from main navigation bar — both now live inside the Collection tab
- `switchTab('wishlist')` redirects to Collection → Wishlist sub-view
- `switchTab('boxsets')` redirects to Collection → Physical Media sub-view
- After adding a movie to wishlist, app now navigates to Collection → Wishlist sub-view
- `updateBadges()` now updates the collection header based on the active sub-view
- Shelf filter, sort dropdown, and filter bar are hidden when Wishlist or Physical Media sub-view is active

### Fixed
- `wishlistHeader` stale DOM reference in `updateBadges()` — replaced with context-aware header update

---

## [2.2.15] - 2026-02-09

### Added
- **Box Set System (Phase 1)** - Multi-movie containers for box sets and collections
  - Create box sets that group multiple movies into a single physical unit
  - Two-step creation: Define box set → Add movies by searching TMDB
  - Supports any number of movies per box set
  - Format selection (Blu-ray Box Set, DVD Box Set, 4K Box Set, etc.)
  - Notes field for edition details
  - Visual spine labels for shelf representation

### Fixed
- **Box Set State Management** - Critical fixes for creation and editing flow
  - Fixed `closeBoxSetDetails()` clearing `currentContainerId` during creation
  - Now checks if Step 2 (movie adding) is visible before clearing state
  - Users can view box set details mid-creation and return to adding movies
  - No more "ERROR: No container selected" when continuing creation
- **Box Set Edit Functionality** - Complete rewrite for seamless editing
  - Edit button now opens box set in Step 2 with existing movies loaded
  - Pre-populates `boxSetMovies` array from `get_container_contents` API
  - User can continue adding movies to existing box sets
  - Eliminates need to delete and recreate box sets
  - Shows "(Editing)" label in header to indicate edit mode
- **View Box Set Details Button** - Implemented proper functionality
  - Replaced placeholder "coming soon" with actual `showBoxSetDetails()` call
  - Opens details modal showing box set name, format, movie count
  - Displays all movies in the box set with posters
  - Edit and delete buttons fully functional
- **Box Set Search Results Persistence** - Fixed leftover results appearing
  - Search input and results now clear when transitioning to Step 2
  - Clean slate when creating new box sets
  - No confusion from previous box set's search history
- **Movie List Display During Creation** - Enhanced debugging
  - Added comprehensive console logging to `updateBoxSetMoviesList()`
  - Tracks when function is called and state of DOM elements
  - Helps diagnose timing issues with element availability
  - Logs `boxSetMovies` array contents and count

### Changed
- **Box Set Creation Flow** - Improved state preservation
  - `currentContainerId` persists throughout entire creation workflow
  - State only cleared when explicitly navigating away or completing
  - Better separation between creation mode and viewing mode
- **Box Set Edit Mode** - Enhanced user experience
  - Fetches existing movies from backend on edit
  - Shows movie count in real-time as you add more
  - Maintains disc number sequence
  - Clears search to prevent confusion

---

## [2.2.14] - 2026-02-08

### Added
- **Hierarchical Shelves** - Unlimited nesting levels for complex organization
  - Parent/child shelf relationships via `parent_shelf_id` foreign key
  - Recursive aggregation - parent shelves show all movies from descendants
  - Visual indentation in UI to show hierarchy
  - Example: "Directors" → "Kubrick" → "2001 Films"
- **Collection Tab Shelf Filtering** - Filter collection view by shelf
  - Dropdown in Collection tab (before Sort dropdown)
  - Shows "All Movies" by default
  - Select any shelf to filter collection to that shelf's movies
  - Hierarchical support - parent shelves show all child movies
  - Automatic deduplication when same movie in multiple children
  - Maintains sort order and view mode when filtering
- **Icon-Only Navigation Tabs** - Cleaner, more spacious UI
  - Tab labels hidden, icons only shown
  - Active tab name appears as page heading
  - Responsive sizing for mobile/tablet/desktop
  - Badge notifications positioned absolutely
  - Larger icons (1.5rem) for better touch targets

### Fixed
- **Shelf Deduplication Bug** - Fixed critical bug causing movie loss
  - Was using `movie.id` (undefined) instead of `movie.movie_id`
  - Caused 8 movies to become 1 movie after deduplication
  - All parent shelves now show correct movie counts
- **Shelf Dropdown Empty on Load** - Shelves now load on app initialization
  - Added `loadShelves()` to init() function
  - Dropdown populates immediately on page load
  - No longer requires visiting Shelves tab first
- **List View Layout Issues** - Improved spacing and readability
  - Removed director and genre emojis (too cluttered)
  - Fixed title cutoff at top of cards
  - Better vertical alignment (`align-items: center`)
  - Increased font size to 1.05rem
  - Improved padding and gap spacing
  - Action buttons stack vertically on right side
- **Tab Text Overlapping** - Fixed tabs overflowing on small screens
  - Removed text labels (icon-only design)
  - Responsive padding adjustments at 768px and 480px breakpoints
  - Tabs no longer overlap regardless of screen size

### Changed
- **List View Simplified** - Essential metadata only
  - Removed: Director name, Genre emojis
  - Kept: Title, Year, Rating, Runtime, Certification
  - Cleaner, more scannable layout
  - Easier to find specific information quickly
- **Tab Design** - Icon-centric navigation
  - Padding reduced from 0.75rem 1.5rem to 0.75rem
  - Min-width: 50px for consistent sizing
  - Font-size increased to 1.5rem for icons
  - Badge positioning absolute (top-right corner)
- **Documentation Updates**
  - DEV_GUIDE.md: Added hierarchical shelves + filtering sections
  - USER_GUIDE.md: Added shelf filtering + icon navigation sections
  - ADMIN_GUIDE.md: Updated last modified date
  - All guides now reflect v2.2.14 features

---

## [2.2.14] - 2026-02-07

### Added
- **Studio Filter** in shelf assignment modal
  - Filter unassigned movies by production studio
  - Works alongside Director and Genre filters
  - Dynamically populates from collection metadata
- **Comprehensive Developer Guide** (DEV_GUIDE.md)
  - Complete API keys documentation
  - AI Cover Scanner technical details
  - Movie Matching System architecture
  - Shelf Management implementation guide
- **Changelog** (this file)

### Fixed
- **Dropdown Visibility** - White-on-white text issue
  - Added global CSS for select elements
  - Dark background with white text
  - Proper hover and focus states
  - Consistent styling across all dropdowns
- **Broken Reorder Button** - Removed non-functional button from shelf contents modal
- **API Metadata Fields** - genre, studio, actors now returned in:
  - `get_unassigned_copies` endpoint
  - `get_shelf_contents` endpoint
  - Fixes empty Genre and Studio filter dropdowns
- **Backfill Tool Infinite Loop** - Movies not found in TMDB (404) now marked as "N/A"
  - Prevents endless retries of non-existent titles
  - Tool completes successfully instead of hanging
- **Auto-Refresh Issues** in shelf management
  - Shelves now refresh automatically after create/edit/delete
  - Unassigned modal resets filters and refreshes after assignment
  - Visual view updates without manual page reload
- **"Select All" Bug** - Now only selects currently filtered/visible movies
  - Created `filteredUnassignedMovies` tracking array
  - Respects active filters (Director, Genre, Studio)

### Changed
- **Backfill Metadata Tool** now includes genre updates
  - Previously only updated: actors, studio, director
  - Now updates: actors, studio, director, **AND** genre
  - Fetches genres from TMDB `genres` array
- **Filter State Management** improved
  - Filters properly reset after movie assignment
  - UI controls clear automatically
  - Better state synchronization

---

## [2.2.13] - 2026-02-06

### Added
- **Visual Shelf View** - Bookshelf visualization
  - Toggle between List and Visual views
  - Movie "spines" with vertical text (CSS `writing-mode`)
  - Color-coded by shelf
  - Hover effects and tooltips
- **Multi-Select for Shelf Assignment**
  - Checkbox system for bulk selection
  - "Select All" and "Deselect All" buttons
  - Bulk assign multiple movies to shelves at once
- **Filter System for Unassigned Movies**
  - Filter by Director
  - Filter by Genre
  - Sort by Title, Year, or Director
  - Search by title
  - Filters work together (combinable)

### Fixed
- **Shelf Modal CSS** - Modal not opening due to class mismatch
  - Changed from `.show` to `.active` class
  - Fixed 9 instances across shelf management
- **CSV Import Metadata** - Missing actors and studio fields
  - Updated `admin_import_user_csv` to fetch:
    - Top 5 actors from TMDB credits
    - First production company as studio
    - Genres as comma-separated list

### Changed
- **Shelf Assignment Workflow** redesigned
  - From: Add movies one-by-one
  - To: Filter → Multi-select → Bulk assign
  - Massive UX improvement for organizing large collections

---

## [2.2.12] - 2026-02-05

### Added
- **Physical Shelf Management System**
  - Create custom shelves (name, color, icon)
  - Assign movies to shelves
  - Track physical organization
  - Position tracking (left-to-right order)
- **Database Tables**:
  - `shelves` - Shelf definitions
  - `shelf_assignments` - Movie-to-shelf mapping

### Fixed
- OAuth authentication issues after Railway migration
- Session persistence on page reload

---

## [2.2.10] - 2026-02-03

### Added
- **Railway Deployment**
  - Migrated from DreamHost to Railway
  - Environment variable configuration
  - Persistent volume for database
  - Auto-deploy on git push
- **Admin Backfill Tool** (`/admin/backfill-metadata.php`)
  - Batch fetch missing metadata from TMDB
  - Rate-limited (40 req/10s)
  - Progress bar UI
  - Handles 404 errors gracefully

### Changed
- Configuration system to use environment variables
- Database path configurable via `DB_PATH`
- API keys loaded from environment (fallback to hardcoded)

---

## [2.2.0] - 2026-01-29

### Added
- **AI Cover Scanner** using OpenAI Vision API
  - Scan DVD/Blu-ray covers with phone camera
  - Batch scanning mode
  - Supports iOS and Android
  - Auto-retry on camera failure
- **Batch Processing**
  - Scan multiple covers
  - Review batch list
  - Process all at once
  - localStorage persistence
- **Unresolved Copies System**
  - `unresolved_copies` table
  - TMDB matching workflow
  - Top 5 match suggestions

### Fixed
- iOS camera permissions and video playback
- Camera constraints for older devices

---

## [2.1.0] - 2026-01-20

### Added
- **CSV Bulk Import**
  - Upload CSV file
  - Parse with PHP `fgetcsv()`
  - TMDB match confirmation
  - Batch import summary
- **Movie Matching Improvements**
  - Show top 5 TMDB results with posters
  - Confidence scoring
  - Manual override option

### Changed
- Import workflow redesigned for better UX
- TMDB search improved with year filtering

---

## [2.0.0] - 2026-01-15

### Added
- **Google OAuth Authentication**
  - Replace username-based auth
  - Secure token-based sessions
  - 30-day session lifetime
  - Avatar and display name support
- **PWA Support**
  - Service worker for offline mode
  - Installable on mobile
  - App manifest
  - App icons
- **Movie Trivia Game**
  - AI-generated questions
  - Multiple difficulty modes
  - Leaderboard
  - Session tracking
- **Group Collections**
  - Create family groups
  - Share collections
  - View combined library
  - Borrowing system

### Changed
- Complete UI redesign (Netflix-inspired)
- Dark theme by default
- Responsive grid layout
- Touch-optimized for mobile

---

## [1.5.0] - 2025-12-20

### Added
- **Wishlist System**
  - Track desired movies
  - Priority levels (High, Medium, Low)
  - Target format selection
  - Move to collection button
- **Copy Details**
  - Format (DVD, Blu-ray, 4K, Digital)
  - Edition (Special, Director's Cut, etc.)
  - Region (A, B, C, 1-6)
  - Condition (New, Like New, Good, Fair, Poor)
  - Purchase date and price
  - Notes field

### Fixed
- TMDB poster loading issues
- Database locking under concurrent access

---

## [1.0.0] - 2025-12-01

### Added
- **Initial Release**
- Basic collection management
- TMDB integration
- SQLite database
- User authentication (username-based)
- Grid and list views
- Search and sort

---

## Version Numbering

**Format:** MAJOR.MINOR.PATCH

- **MAJOR**: Breaking changes, major feature overhauls
- **MINOR**: New features, non-breaking changes
- **PATCH**: Bug fixes, small improvements

**Current Version:** 2.2.14

---

## Upgrade Notes

### Upgrading to 2.2.14

No database migrations required. Just deploy new code.

**Environment Variables Required:**
- `TMDB_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

### Upgrading to 2.2.0

**Database Migration:**
```sql
-- Add unresolved_copies table
CREATE TABLE IF NOT EXISTS unresolved_copies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    format TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Upgrading to 2.0.0

**Database Migration:**
```sql
-- Add OAuth fields to users
ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- Add groups tables
CREATE TABLE groups (...);
CREATE TABLE group_members (...);

-- Add trivia tables
CREATE TABLE trivia_sessions (...);
CREATE TABLE trivia_questions (...);
```

**OAuth Setup Required:**
1. Create Google Cloud project
2. Set up OAuth credentials
3. Configure redirect URI
4. Set environment variables

---

## Roadmap

### Planned Features

#### v2.3.0 (Q1 2026)
- [ ] Multi-source metadata fallback (TMDB → OMDb → UMDB)
- [ ] OMDb API integration
- [ ] UMDB.ca API integration
- [ ] User-submitted metadata for obscure titles
- [ ] Advanced search (cast, crew, year range)
- [ ] Collection statistics and charts

#### v2.4.0 (Q2 2026)
- [ ] Barcode scanner for UPC lookup
- [ ] Integration with UPC database
- [ ] Automatic price tracking (eBay, Amazon)
- [ ] Collection value estimation
- [ ] Export to PDF/Excel
- [ ] Print shelf labels

#### v3.0.0 (Q3 2026)
- [ ] Mobile native apps (iOS, Android)
- [ ] Cloud sync across devices
- [ ] Social features (follow users, share lists)
- [ ] Movie recommendations
- [ ] Watch history tracking
- [ ] Integration with streaming services

### Under Consideration
- Import from Letterboxd
- Integration with Blu-ray.com
- 4K/HDR metadata support
- Extended edition tracking
- Lending library system
- Collection insurance integration

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Support

- **Issues**: https://github.com/futuresrelic/cineshelf-final/issues
- **Email**: futuresrelic@gmail.com
- **Documentation**: [DEV_GUIDE.md](DEV_GUIDE.md), [USER_GUIDE.md](USER_GUIDE.md), [ADMIN_GUIDE.md](ADMIN_GUIDE.md)

---

**Maintained by**: futuresrelic  
**License**: MIT  
**Repository**: https://github.com/futuresrelic/cineshelf-final
