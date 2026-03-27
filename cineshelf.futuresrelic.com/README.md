# CineShelf

A self-hosted physical media collection manager for films and TV.
Track your DVDs, Blu-rays, 4K UHDs, box sets, and wish list — with group screening logs, trivia, shelf layouts, and UMDB integration.

---

## Quick start

```bash
# Requires PHP 8.1+ with SQLite3 extension
php -S localhost:8080 -t cineshelf.futuresrelic.com/
# Open http://localhost:8080
```

On first load you are prompted to create a user account. The SQLite database is created automatically at `data/cineshelf.db`.

---

## Feature overview

### Collection
- Grid / Compact / List views with persistent preference
- **Sticky toolbar** — sub-navigation, inline title search, sort, and view controls stay visible while scrolling
- **Movies subview** — full-text search, genre/director/actor/studio filters, decade range slider, format badges, CineShelf ratings
- **Physical Media subview** — grouped by shelf or format, cover art, copy conditions, UMDB-linked editions with component checklists
- **Wishlist subview** — priority flags, target format, "📦 Own It Now" quick-add flow
- **Box Sets subview** — container management; drag-in/out of members
- **Shelf View** — visual spine-on-shelf browser
- **Bulk Editor** — spreadsheet-style inline editing

### Copy management
- Per-copy: format, edition, region, condition, package type, slipcover/booklet/bonus-disc flags, barcode, notes
- **Copy notes** field visible in both the copy manager and the "Your Copies" section of each movie
- Link copies to physical editions in the `media_editions` table; auto-populates component checklist

### Editions & UMDB
- Create local editions or push to / pull from UMDB (Universal Media Database)
- **Linking auto-imports components** — when you link an edition to a UMDB release ID, components are imported and copy checklists seeded immediately
- Edition cover image shown as thumbnail in copy manager; click to open full-size
- Sync ↓ / Update ↑ buttons on linked editions for two-way data flow

### Viewing logs & stats
- Log viewings with date, star rating (1–5), notes, and who watched (individual users or family members)
- **Stats modal** (Settings → 📊 View Statistics) shows:
  - KPIs: copies, unique titles, viewings, average rating, longest streak, wishlist count
  - Viewings by year (bar chart)
  - Collection by format (bar chart)
  - Most-rewatched titles

### Social / Groups
- Create groups; share wishlists and log group viewings
- Trivia mode with per-group leaderboards

### Theming
Seven built-in colour themes, selectable in **Settings → Display Settings**:

| Theme    | Accent colour        |
|----------|----------------------|
| Midnight | Purple-blue (default)|
| Slate    | Ocean blue           |
| Forest   | Green                |
| Crimson  | Rose-red             |
| Amber    | Golden orange        |
| Sepia    | Warm brown           |
| Ice      | Sky blue             |

Themes are stored in `localStorage` and applied immediately on next load.

---

## Directory layout

```
cineshelf.futuresrelic.com/
├── index.html          Main SPA shell
├── js/
│   └── app.js          All client-side logic (~14 000 lines)
├── css/
│   └── styles.css      All styles + theme variables
├── api/
│   ├── api.php         REST-style JSON API (action= dispatch)
│   └── schema.sql      SQLite schema + migration reference
├── config/
│   ├── config.php      DB init, auto-migrations, constants
│   └── secrets.php     API keys (not in VCS)
├── admin/
│   └── README.md       Admin tool docs
└── data/               SQLite DB files (gitignored)
```

---

## API surface (selected actions)

| Action | Method | Description |
|--------|--------|-------------|
| `get_collection` | GET | All copies for current user |
| `add_copy` | POST | Add a physical copy |
| `update_copy` | POST | Edit copy fields (incl. notes) |
| `delete_copy` | POST | Remove a copy |
| `get_stats` | GET | Collection + viewing stats |
| `log_view` | POST | Log a film viewing |
| `add_wishlist` | POST | Add to wishlist |
| `remove_wishlist` | POST | Remove from wishlist |
| `sync_edition_from_umdb` | POST | Pull edition data + components from UMDB |
| `link_edition_to_umdb` | POST | Link edition → UMDB (auto-imports components) |
| `push_edition_to_umdb` | POST | Create / update UMDB release |

All endpoints require session authentication. Responses are `{ "success": bool, "data": … }`.

---

## Known navigation patterns

- **Main tabs** (top bar, always visible): Collection · Groups · Shelves · Add · Calendar · Trivia · Settings
- **Collection sub-tabs** (sticky bar below main tabs): Physical · Movies · Wishlist · Box Sets · Shelf · Bulk
- **Inline search** in the Movies sub-tab is always visible; the ⚙️ button opens the advanced filter drawer (director, genre, decade, etc.)
- **Modals** use z-index 2000; secondary overlay modals (stats, quick-own) use 2150

---

## Settings reference

| Setting | Key | Values |
|---------|-----|--------|
| Color theme | `theme` | midnight · slate · forest · crimson · amber · sepia · ice |
| Default view | `defaultView` | grid · compact · list |
| Default sort | `defaultSort` | title · year · rating · created_at |
| Classification region | `certRegion` | US · GB · AU · DE … |
| Spine colour mode | `spineColorMode` | shelf · format · auto |
| Default disc region | `defaultPhysicalRegion` | Region 1–6 · Region A–C |

Settings are stored in `localStorage` under the key `cineshelf_settings`.
