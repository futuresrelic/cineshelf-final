# CineShelf × UMDB — Partner App Integration Brief

*This document is for UMDB Claude to implement the CineShelf listing in UMDB's website and admin panel.*

---

## 1. What Is CineShelf

CineShelf is a free, offline-first Progressive Web App (PWA) for physical media collectors. Users catalog their Blu-rays, DVDs, LaserDiscs, VHS, steelbooks, and other physical formats. It runs on any device (iOS, Android, desktop) without an app store.

- **Live URL:** https://cineshelf.ca
- **About/Install page:** https://cineshelf.ca/about
- **App icon (512×512):** https://cineshelf.ca/app-icon.png
- **App icon (192×192):** https://cineshelf.ca/app-icon-192.png
- **Theme color:** `#667eea`
- **Background color:** `#0f0f0f`
- **Category:** Entertainment / Lifestyle / Physical Media

---

## 2. CineShelf App Metadata (for UMDB Partner Listing)

```json
{
  "name": "CineShelf",
  "tagline": "Your physical media collection, beautifully organized.",
  "short_description": "Free app to catalog Blu-rays, DVDs, VHS and more. Barcode scanning, shelf views, wishlists, UMDB sync.",
  "long_description": "CineShelf is the ultimate tool for physical media collectors. Catalog every disc in your collection with full metadata from TMDB and UMDB — format, edition, publisher, barcode, disc count, region, packaging extras and more. View your library as a real bookshelf with spine art, a poster grid, or a detailed spreadsheet. Scan barcodes to auto-fill edition details, import top-10 lists from any website, build a wishlist with target formats, and quiz yourself on your own collection. Works offline, syncs to UMDB, and is free forever.",
  "platforms": ["iOS (PWA)", "Android (PWA)", "Desktop Web"],
  "install_url": "https://cineshelf.ca/about",
  "open_url": "https://cineshelf.ca",
  "icon_url": "https://cineshelf.ca/app-icon.png",
  "icon_192_url": "https://cineshelf.ca/app-icon-192.png",
  "price": "Free",
  "requires_account": true,
  "account_type": "Google Sign-In",
  "umdb_integrated": true,
  "features": [
    "Barcode scanning with UMDB edition lookup",
    "Shelf view with spine art",
    "Poster grid, compact, list, and gallery views",
    "Wishlist with target format tracking",
    "Web list scraper (import any top-10 article)",
    "Physical copy details (edition, publisher, steelbook, slipcover, etc.)",
    "Box set management",
    "Family and group collection sharing",
    "Collection trivia game",
    "UMDB two-way sync for physical copies",
    "10 visual themes",
    "Offline-first (PWA)"
  ]
}
```

---

## 3. UMDB API Integration Points (Already Built in CineShelf)

CineShelf currently calls these UMDB endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /api/physical-copies/fetch-barcode/:barcode` | Barcode lookup → prefill add-copy form |
| `POST /api/v1/movies` | Create/verify movie in UMDB (idempotent by tmdb_id) |
| `POST /api/v1/releases` | Push physical copy to UMDB |
| `GET /movie/:id` | Fetch movie metadata |
| `GET /search/multi?query=` | Search for movies/shows |
| `GET /api/v1/box-sets` | Box set data |

Authentication: `X-API-Key` header using `UMDB_API_KEY` environment variable.

---

## 4. What UMDB's Website Should Add

### 4a. Partner Apps Section (new page or section)

UMDB needs a **"Get the App"** or **"Partner Apps"** section accessible from the main nav. For CineShelf specifically:

- **Headline:** "Manage your physical collection with CineShelf"
- **Body:** Short description + feature bullets
- **CTA button:** "Install CineShelf →" linking to `https://cineshelf.ca/about`
- **Platform badges:** iOS · Android · Desktop
- **App icon:** Displayed prominently

### 4b. Admin Panel — Partner App Configuration

UMDB's admin panel should add a **"Partner Apps"** management section with the following configurable fields per app:

```
App Name            (text, required)
Tagline             (text, short)
Description         (textarea, rich text or markdown)
Icon URL            (image upload or URL field, displayed as square icon)
Install URL         (URL — what the CTA button links to)
Open URL            (URL — direct link to the live app)
Platform Support    (checkboxes: iOS PWA / Android PWA / Desktop / App Store / Play Store)
Price               (text: "Free", "$4.99", etc.)
Screenshots         (image gallery upload, up to 6 images, 9:16 aspect ratio recommended)
Promo Video URL     (YouTube or Vimeo embed URL)
Features List       (dynamic list — add/remove bullet points)
UMDB Integration    (checkbox: "This app syncs with UMDB")
Integration Notes   (textarea: describes what data is synced)
Status              (select: Active / Coming Soon / Deprecated)
Featured            (boolean toggle: show on homepage/discovery section)
Sort Order          (integer: for ordering multiple partner apps)
```

**Screenshots for CineShelf** (admin can upload these):
- Shelf view (physical media on a bookshelf)
- Poster grid view
- Add copy form with barcode scan
- Wishlist view
- Collection trivia game
- Settings / themes screen

**Promo video:** (to be recorded by user — show barcode scan → auto-fill → save to collection)

### 4c. Discovery Integration

Where UMDB should surface CineShelf links:

1. **Movie detail page** → "Track this in your collection" → CineShelf deep link
   - Link format: `https://cineshelf.ca/?add=<tmdb_id>&title=<encoded_title>`
   - (CineShelf's add-film flow can accept URL params to pre-fill search)

2. **Release/edition detail page** → "Add to CineShelf collection" button

3. **User profile page** → "Apps connected" section listing CineShelf

4. **Barcode search result** → "View in CineShelf" if user has CineShelf linked

---

## 5. Suggested UMDB Database Schema for Partner Apps

```sql
CREATE TABLE partner_apps (
  id              TEXT PRIMARY KEY,        -- e.g. "cineshelf"
  name            TEXT NOT NULL,
  tagline         TEXT,
  description     TEXT,
  icon_url        TEXT,
  install_url     TEXT,
  open_url        TEXT,
  platforms       TEXT,                    -- JSON array
  price           TEXT DEFAULT 'Free',
  features        TEXT,                    -- JSON array of strings
  promo_video_url TEXT,
  integration_notes TEXT,
  is_umdb_integrated BOOLEAN DEFAULT FALSE,
  is_featured     BOOLEAN DEFAULT FALSE,
  status          TEXT DEFAULT 'active',   -- active / coming_soon / deprecated
  sort_order      INTEGER DEFAULT 0,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE partner_app_screenshots (
  id              SERIAL PRIMARY KEY,
  app_id          TEXT REFERENCES partner_apps(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  caption         TEXT,
  sort_order      INTEGER DEFAULT 0
);
```

---

## 6. Pre-Filled CineShelf Data for UMDB Admin

When the admin panel is ready, use this data to create the CineShelf listing:

| Field | Value |
|---|---|
| ID | `cineshelf` |
| Name | `CineShelf` |
| Tagline | `Your physical media collection, beautifully organized.` |
| Icon URL | `https://cineshelf.ca/app-icon.png` |
| Install URL | `https://cineshelf.ca/about` |
| Open URL | `https://cineshelf.ca` |
| Platforms | `iOS PWA, Android PWA, Desktop Web` |
| Price | `Free` |
| UMDB Integrated | `true` |
| Status | `active` |
| Featured | `true` |

---

## 7. Future: Deep-Link Protocol (Not Yet Built — for Discussion)

When a UMDB user clicks "Track this in CineShelf", CineShelf should accept URL parameters to pre-fill the add flow:

```
https://cineshelf.ca/?action=add&tmdb_id=123&title=The+Godfather&year=1972
https://cineshelf.ca/?action=add_copy&umdb_release_id=rel-abc123&barcode=0123456789012
```

CineShelf would then:
1. Check if user is logged in (redirect to login if not)
2. Open the add-film flow with the fields pre-filled
3. On save, push back to UMDB

This requires changes on both sides — flagged here for future coordination.
