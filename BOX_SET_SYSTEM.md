# CineShelf Box Set / Multi-Movie Container System

**Version:** 2.2.15
**Date:** 2026-02-09
**Status:** ✅ Phase 1 Complete, 🚧 Phase 2-7 In Development

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Use Cases](#use-cases)
3. [Database Architecture](#database-architecture)
4. [API Endpoints](#api-endpoints)
5. [UI/UX Design](#uiux-design)
6. [Implementation Phases](#implementation-phases)
7. [Migration Guide](#migration-guide)

---

## Overview

The Box Set System allows users to represent physical media that contains multiple movies in a single case (box sets, double features, trilogy packs, etc.) while maintaining individual movie tracking in the collection.

### Key Features

✅ **Flexible Containers** - Support any number of movies per physical case
✅ **Dual Representation** - Movies show individually in Collection, as one unit in Shelves
✅ **Missing Disc Tracking** - Mark individual discs as missing/present
✅ **Custom Spine Images** - Upload photos of actual DVD spines
✅ **Smart Search** - Find box sets AND individual movies
✅ **Bidirectional Linking** - Navigate from movie → box set and box set → movies

---

## Use Cases

### Scenario 1: Trilogy Box Set
**Physical Item:** "The Lord of the Rings Extended Edition" (1 box, 3 movies)

**Collection Tab Shows:**
- The Fellowship of the Ring (📦 Part of: LOTR Extended)
- The Two Towers (📦 Part of: LOTR Extended)
- The Return of the King (📦 Part of: LOTR Extended)

**Shelf Tab Shows:**
- ONE spine labeled "THE LORD OF THE RINGS"
- Badge: "3 movies"
- Click → See all 3 movies inside

### Scenario 2: Double Feature
**Physical Item:** "Alien / Aliens Double Feature" (1 case, 2 movies)

**Collection Tab Shows:**
- Alien (📦 Part of: Alien/Aliens Double)
- Aliens (📦 Part of: Alien/Aliens Double)

**Shelf Tab Shows:**
- ONE spine with custom image
- Badge: "2 movies"

###Scenario 3: Missing Disc
**Physical Item:** "The Matrix Trilogy" but Disc 2 is missing

**Collection Tab Shows:**
- The Matrix (✅ Present)
- The Matrix Reloaded (❌ Missing since 2024-01-15)
- The Matrix Revolutions (✅ Present)

**Shelf Tab Shows:**
- ONE spine with warning badge "⚠️ 1 missing"
- Click → Shows which disc is missing

### Scenario 4: Mixed Shelf
**Shelf Contains:**
- 5 standalone movies
- 2 box sets (Matrix Trilogy + LOTR Extended)
- Total: 11 movie spines

**Visual Shelf Shows:**
- 7 spines (5 individual + 2 containers)
- Realistic physical representation

---

## Database Architecture

### Table: `containers`

Represents the physical box set/container.

```sql
CREATE TABLE containers (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,                    -- "The Matrix Trilogy"
    spine_label TEXT,                      -- "THE MATRIX TRILOGY"
    spine_image_type TEXT DEFAULT 'color', -- 'custom' | 'first_movie' | 'color'
    spine_image_url TEXT,                  -- URL to uploaded spine image
    spine_color TEXT DEFAULT '#667eea',    -- HEX color for plain spine
    format TEXT,                           -- "Blu-ray Box Set"
    edition TEXT,                          -- "Ultimate Collection"
    region TEXT,                           -- "Region A"
    condition TEXT,                        -- "Mint" | "Like New" | "Good" | "Fair" | "Poor"
    purchase_date TEXT,
    purchase_price REAL,
    notes TEXT,
    created_at TEXT,
    updated_at TEXT
);
```

### Table: `container_contents`

Links movies (copies) to containers.

```sql
CREATE TABLE container_contents (
    id INTEGER PRIMARY KEY,
    container_id INTEGER NOT NULL,
    copy_id INTEGER NOT NULL,              -- FK to copies table
    disc_number INTEGER DEFAULT 1,         -- Disc 1, 2, 3, etc.
    disc_label TEXT,                       -- "Disc 1: The Matrix"
    is_present BOOLEAN DEFAULT 1,          -- 1 = have it, 0 = missing
    missing_since TEXT,                    -- ISO date when marked missing
    missing_notes TEXT,                    -- "Lent to friend", "Lost"
    position_in_container INTEGER,         -- Display order
    created_at TEXT
);
```

### Table: `shelf_assignments` (Updated)

Now supports BOTH individual copies AND containers.

```sql
ALTER TABLE shelf_assignments
    ADD COLUMN container_id INTEGER,
    ADD COLUMN is_container BOOLEAN DEFAULT 0;

-- Either copy_id OR container_id is set (not both)
```

### View: `containers_with_counts`

Pre-calculated statistics for containers.

```sql
CREATE VIEW containers_with_counts AS
SELECT
    c.*,
    COUNT(cc.id) as total_movies,
    SUM(CASE WHEN cc.is_present = 1 THEN 1 ELSE 0 END) as present_movies,
    SUM(CASE WHEN cc.is_present = 0 THEN 1 ELSE 0 END) as missing_movies
FROM containers c
LEFT JOIN container_contents cc ON c.id = cc.container_id
GROUP BY c.id;
```

---

## API Endpoints

### Container Management

#### `create_container`
**Purpose:** Create a new box set
**Input:**
```json
{
    "action": "create_container",
    "name": "The Matrix Trilogy",
    "spine_label": "THE MATRIX TRILOGY",
    "spine_image_type": "color",
    "spine_color": "#667eea",
    "format": "Blu-ray Box Set",
    "edition": "Ultimate Collection",
    "region": "Region A",
    "condition": "Mint",
    "purchase_date": "2024-01-15",
    "purchase_price": 49.99,
    "notes": "4K restoration"
}
```
**Output:**
```json
{
    "ok": true,
    "container_id": 1,
    "message": "Container created successfully"
}
```

#### `add_movie_to_container`
**Purpose:** Add a movie to an existing box set
**Input:**
```json
{
    "action": "add_movie_to_container",
    "container_id": 1,
    "copy_id": 42,
    "disc_number": 1,
    "disc_label": "Disc 1: The Matrix",
    "is_present": true
}
```

#### `remove_movie_from_container`
**Purpose:** Remove a movie from a box set (keeps the copy in collection)
**Input:**
```json
{
    "action": "remove_movie_from_container",
    "container_id": 1,
    "copy_id": 42
}
```

#### `update_container`
**Purpose:** Edit container details
**Input:**
```json
{
    "action": "update_container",
    "container_id": 1,
    "name": "The Matrix Collection",
    "spine_label": "MATRIX COLLECTION",
    "condition": "Good"
}
```

#### `delete_container`
**Purpose:** Delete a box set (keeps movies in collection)
**Input:**
```json
{
    "action": "delete_container",
    "container_id": 1
}
```

#### `get_container_contents`
**Purpose:** Get all movies in a container with full details
**Input:**
```json
{
    "action": "get_container_contents",
    "container_id": 1
}
```
**Output:**
```json
{
    "ok": true,
    "container": {
        "id": 1,
        "name": "The Matrix Trilogy",
        "spine_label": "THE MATRIX TRILOGY",
        "total_movies": 3,
        "present_movies": 2,
        "missing_movies": 1
    },
    "movies": [
        {
            "content_id": 1,
            "disc_number": 1,
            "disc_label": "Disc 1: The Matrix",
            "is_present": true,
            "copy_id": 42,
            "movie_id": 15,
            "title": "The Matrix",
            "year": 1999,
            "poster_url": "..."
        }
    ]
}
```

#### `mark_disc_missing`
**Purpose:** Mark a disc as missing/present
**Input:**
```json
{
    "action": "mark_disc_missing",
    "content_id": 1,
    "is_present": false,
    "missing_notes": "Lent to friend"
}
```

#### `list_containers`
**Purpose:** Get all containers for current user
**Output:**
```json
{
    "ok": true,
    "containers": [
        {
            "id": 1,
            "name": "The Matrix Trilogy",
            "total_movies": 3,
            "missing_movies": 1,
            "format": "Blu-ray Box Set"
        }
    ]
}
```

#### `get_movie_container`
**Purpose:** Find which container (if any) a movie belongs to
**Input:**
```json
{
    "action": "get_movie_container",
    "copy_id": 42
}
```
**Output:**
```json
{
    "ok": true,
    "container": {
        "id": 1,
        "name": "The Matrix Trilogy",
        "disc_number": 1
    }
}
```

#### `upload_spine_image`
**Purpose:** Upload custom spine image
**Input:** Multipart form data with image file
**Output:**
```json
{
    "ok": true,
    "image_url": "/uploads/spines/container_1_spine.jpg"
}
```

### Shelf Integration

#### `assign_container_to_shelf`
**Purpose:** Place container on a shelf
**Input:**
```json
{
    "action": "assign_to_shelf",
    "container_id": 1,
    "shelf_id": 5,
    "position_in_shelf": 3
}
```

#### `get_shelf_contents` (Updated)
**Purpose:** Get shelf contents including containers
**Output:** Now includes `is_container` flag and container details

---

## UI/UX Design

### Add Box Set Flow

**Step 1: Choose Add Type**
```
┌─────────────────────────────────────┐
│  Add to Collection                  │
├─────────────────────────────────────┤
│  [📀 Add Single Movie]              │
│  [📦 Add Box Set / Multi-Feature]   │ ← NEW
└─────────────────────────────────────┘
```

**Step 2: Box Set Details**
```
┌─────────────────────────────────────┐
│  Create Box Set                     │
├─────────────────────────────────────┤
│  Name: [The Matrix Trilogy        ] │
│  Spine Label: [THE MATRIX TRILOGY ] │
│                                     │
│  Spine Appearance:                  │
│  ○ Plain colored spine             │
│  ○ Use first movie's poster        │
│  ○ Upload custom spine photo 📸    │
│                                     │
│  Format: [Blu-ray Box Set ▼]       │
│  Condition: [Mint ▼]               │
│                                     │
│  [Continue →]                       │
└─────────────────────────────────────┘
```

**Step 3: Add Movies**
```
┌─────────────────────────────────────┐
│  Add Movies to Box Set              │
├─────────────────────────────────────┤
│  Search: [matrix____________] 🔍    │
│                                     │
│  Selected Movies:                   │
│  ┌───────────────────────────────┐ │
│  │ 1. The Matrix (1999)          │ │
│  │    [✓ Present] [Remove]       │ │
│  ├───────────────────────────────┤ │
│  │ 2. The Matrix Reloaded (2003) │ │
│  │    [✓ Present] [Remove]       │ │
│  └───────────────────────────────┘ │
│                                     │
│  [+ Add Another Movie]              │
│  [Save Box Set]                     │
└─────────────────────────────────────┘
```

### Collection Tab Display

**Movie Card with Container Badge:**
```
┌─────────────────────────┐
│  [Poster Image]         │
│  The Matrix             │
│  1999 | ⭐ 8.7          │
│  📦 The Matrix Trilogy  │ ← Click to view container
│     Disc 1 of 3         │
└─────────────────────────┘
```

**Missing Disc Indicator:**
```
┌─────────────────────────┐
│  [Poster Image]         │
│  The Matrix Reloaded    │
│  2003 | ⭐ 7.2          │
│  ❌ Missing             │ ← Red indicator
│  📦 The Matrix Trilogy  │
│     Disc 2 of 3         │
│  Missing since Jan 2024 │
└─────────────────────────┘
```

### Container Details Modal

```
┌──────────────────────────────────────────────┐
│  The Matrix Trilogy (Blu-ray Box Set)        │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                              │
│  📀 Disc 1: The Matrix (1999)          [✓]  │
│  📀 Disc 2: The Matrix Reloaded (2003) [❌] │
│  📀 Disc 3: The Matrix Revolutions     [✓]  │
│                                              │
│  Status: 2 of 3 discs present                │
│  ⚠️ Missing Disc 2 since Jan 15, 2024       │
│                                              │
│  Format: Blu-ray Box Set                     │
│  Condition: Mint                             │
│  Purchased: Jan 2024 ($49.99)                │
│                                              │
│  Location: Living Room Shelf (Position 3)    │
│                                              │
│  [Edit Container] [Mark Disc Status]         │
│  [Remove from Shelf] [Delete Box Set]        │
└──────────────────────────────────────────────┘
```

### Shelf Visual View (Updated)

**Container Spine:**
```
┌────┐
│ M  │
│ A  │
│ T  │
│ R  │
│ I  │  ← Single spine for entire box set
│ X  │
│    │
│ ③  │  ← Badge showing 3 movies
│ ⚠️ │  ← Warning if any disc missing
└────┘
```

**Spine Options:**

1. **Custom Photo Spine:**
   - User uploads actual DVD spine photo
   - Cropped and fitted to spine dimensions
   - Realistic representation

2. **First Movie Poster:**
   - Uses first movie's poster
   - Automatically cropped/rotated
   - "3 movies" badge overlay

3. **Plain Colored Spine:**
   - Solid color background
   - Vertical text label
   - User-selectable color

---

## Implementation Phases

### Phase 1: Foundation ✅ COMPLETE (Feb 9, 2026)
- [x] Database schema design (`containers` + `container_contents` tables)
- [x] Migration script (`add_box_sets.sql`)
- [x] API endpoints implemented:
  - [x] `create_container`
  - [x] `add_movie_to_container`
  - [x] `get_container_contents`
  - [x] `update_container`
  - [x] `delete_container`
  - [x] `list_containers`
- [x] State management pattern established

### Phase 2: Core APIs ✅ COMPLETE (Feb 9, 2026)
- [x] Container CRUD operations fully functional
- [x] Container contents management with real-time updates
- [x] Movie linking via copy_id
- [x] Get/create movie integration with TMDB

### Phase 3: UI - Add/Manage ✅ COMPLETE (Feb 9, 2026)
- [x] "Add Box Set" two-step flow
- [x] Movie search and selection interface
- [x] Real-time movie list display during creation
- [x] Container details modal with full movie list
- [x] Edit functionality (continue adding movies)
- [x] Delete functionality
- [x] View Box Set Details button
- [x] State preservation during creation
- [x] Clean search result management

### Phase 3.5: Bug Fixes & Polish ✅ COMPLETE (Feb 9, 2026)
- [x] Fixed state management issues during creation
- [x] Fixed "No container selected" error
- [x] Implemented full edit mode with existing movie loading
- [x] Fixed search results persistence
- [x] Enhanced debugging for movie list display
- [x] Fixed closeBoxSetDetails() clearing state prematurely

### Phase 4: Collection Integration (Week 2)
- [ ] Container badges on movie cards
- [ ] "Part of container" indicator
- [ ] Click-through to container details
- [ ] Missing disc visual indicators

### Phase 5: Shelf Integration (Week 3)
- [ ] Render containers in visual view
- [ ] Container spine options (color/poster/custom)
- [ ] Badge overlay (count + missing)
- [ ] Click to expand contents

### Phase 6: Advanced Features (Week 3-4)
- [ ] Custom spine image upload
- [ ] Camera capture for spine photos
- [ ] Image cropping tool
- [ ] Missing disc tracking and filtering
- [ ] Container search and filters

### Phase 7: Testing & Polish (Week 4)
- [ ] End-to-end testing
- [ ] Mobile responsiveness
- [ ] Performance optimization
- [ ] Documentation
- [ ] User guide updates

---

## Migration Guide

### Running the Migration

**On Development:**
```bash
cd /path/to/cineshelf.futuresrelic.com/migrations
php run_migration.php add_box_sets.sql
```

**On Railway (Production):**
1. SSH into Railway container or use Railway CLI
2. Run migration script
3. Verify tables created:
   ```sql
   sqlite3 data/cineshelf.db ".tables"
   ```

### Rollback (If Needed)

```sql
-- Rollback script (if migration fails)
DROP TABLE IF EXISTS container_contents;
DROP TABLE IF EXISTS containers;
DROP VIEW IF EXISTS containers_with_counts;

ALTER TABLE shelf_assignments DROP COLUMN container_id;
ALTER TABLE shelf_assignments DROP COLUMN is_container;
```

### Data Migration (Future)

No existing data needs migration. This is a new feature with empty tables.

Users will manually create containers and assign existing movies to them.

---

## Notes for Developers

### Important Considerations

1. **Copy vs Container in Shelf:**
   - `shelf_assignments.copy_id` for standalone movies
   - `shelf_assignments.container_id` for box sets
   - NEVER both set for same assignment
   - Use `is_container` flag for quick filtering

2. **Missing Disc Logic:**
   - `is_present = 0` means disc is missing
   - Movie still shows in collection (grayed out)
   - Container shows on shelf with warning badge
   - User can filter collection by "missing discs"

3. **Search Behavior:**
   - Searching "Matrix" finds:
     - Individual movie: "The Matrix"
     - Container: "The Matrix Trilogy"
   - Both results shown with distinct badges

4. **Spine Image Storage:**
   - Store in `/uploads/spines/container_{id}_spine.jpg`
   - Max size: 2MB
   - Recommended dimensions: 200x800px (portrait)
   - Auto-resize/crop if needed

5. **Performance:**
   - Use `containers_with_counts` view for list displays
   - Index on `container_contents.is_present` for missing disc queries
   - Lazy-load spine images

---

## Future Enhancements

### Potential Features (Post v2.3.0)

- **Bulk Operations**: Mark entire container as missing
- **Barcode Scanner**: Scan box set UPC to auto-populate
- **Cover Flow View**: Swipe through box set contents
- **Lending Tracking**: Track which friend has which disc
- **Insurance Mode**: Calculate box set value for insurance
- **Duplicate Detection**: Warn if adding movie already in collection
- **Smart Suggestions**: "These 3 movies are often sold as trilogy, create container?"

---

**End of Documentation**
*Last Updated: 2026-02-08*
