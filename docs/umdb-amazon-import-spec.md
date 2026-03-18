# UMDB — Amazon Product Import Integration Spec

**Context:** CineShelf users can now paste an Amazon product URL into the
Copy Manager to import physical media metadata (cover images, languages, ASIN,
disc count, studio, etc.) and save it as a local `media_edition` record.
This document describes what UMDB should implement so CineShelf can share that
enriched data back to the universal database — and so UMDB itself can surface
the same Amazon-sourced data to all users.

---

## 1. What CineShelf already sends to UMDB (`push_edition_to_umdb`)

When a user pushes a local edition, CineShelf POSTs:

```json
{
  "action": "push_edition",
  "movie_tmdb_id": "...",
  "movie_imdb_id": "...",
  "edition": {
    "name": "Monty Python and the Holy Grail — Special Edition — DVD",
    "format": "DVD",
    "asin": "B00005O3VC",
    "barcode": "43396052765",
    "region": "Region 1 (US/CA)",
    "country": "USA",
    "distributor": "Sony Pictures Home Entertainment",
    "disc_count": 2,
    "release_date": "2001-10-23",
    "languages": "English, Japanese",
    "dubbed": "French, Portuguese",
    "subtitles": "English, French, Spanish",
    "audio_formats": "English (Dolby Digital 2.0 Mono), English (Dolby Digital 5.1), Japanese (Dolby Digital 2.0 Mono)",
    "cover_image_url": "https://m.media-amazon.com/images/I/51xxx._SL1200_.jpg",
    "cover_images": [
      { "type": "front",  "url": "https://m.media-amazon.com/images/I/51xxx._SL1200_.jpg" },
      { "type": "back",   "url": "https://m.media-amazon.com/images/I/52xxx._SL1200_.jpg" },
      { "type": "spine",  "url": "https://m.media-amazon.com/images/I/53xxx._SL1200_.jpg" },
      { "type": "inside", "url": "https://m.media-amazon.com/images/I/54xxx._SL1200_.jpg" }
    ],
    "amazon_url": "https://www.amazon.ca/Monty-Python-Grail-Special-Bilingual/dp/B00005O3VC/",
    "notes": ""
  }
}
```

---

## 2. Requested UMDB additions

### 2.1 Store `cover_images[]` array per release

Today UMDB stores a single `cover_image_url`. Amazon product pages expose up to
5 alternate images (front, back, spine, inside, disc art). UMDB should store all
of them so any CineShelf user can pick the view they want.

**Proposed schema addition:**

```sql
CREATE TABLE IF NOT EXISTS release_images (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    release_id   TEXT    NOT NULL REFERENCES releases(umdb_release_id),
    image_type   TEXT,   -- 'front' | 'back' | 'spine' | 'inside' | 'disc' | 'other'
    url          TEXT    NOT NULL,
    source       TEXT,   -- 'amazon' | 'user' | 'imdb' | ...
    width        INTEGER,
    height       INTEGER,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2.2 Store `asin` per release

ASIN is a stable unique key for a physical product on Amazon and its regional
variants. Store it on the release record so CineShelf can:
- Look up a release by ASIN
- Auto-match when a user pastes an Amazon URL

```sql
ALTER TABLE releases ADD COLUMN asin TEXT;
ALTER TABLE releases ADD COLUMN amazon_url TEXT;
CREATE INDEX IF NOT EXISTS idx_releases_asin ON releases(asin);
```

### 2.3 `GET /api/releases/by-asin/:asin` endpoint

CineShelf will call this before scraping Amazon, so if the product already exists
in UMDB the user gets instant results without hitting Amazon at all.

**Request:** `GET /api/releases/by-asin/B00005O3VC`

**Response:**
```json
{
  "ok": true,
  "release": {
    "umdb_release_id": "umdb_xxxx",
    "asin": "B00005O3VC",
    "name": "Monty Python and the Holy Grail — Special Edition",
    "format": "DVD",
    "region": "Region 1 (US/CA)",
    "distributor": "Sony Pictures Home Entertainment",
    "disc_count": 2,
    "languages": "English, Japanese",
    "subtitles": "English, French, Spanish",
    "audio_formats": "English (Dolby Digital 2.0 Mono), English (Dolby Digital 5.1)",
    "cover_image_url": "https://m.media-amazon.com/images/I/51xxx._SL1200_.jpg",
    "cover_images": [
      { "type": "front", "url": "..." },
      { "type": "back",  "url": "..." }
    ],
    "barcode": "43396052765",
    "release_date": "2001-10-23",
    "country": "USA",
    "amazon_url": "https://www.amazon.ca/.../dp/B00005O3VC/"
  }
}
```

If not found: `{ "ok": false, "error": "Not found" }` (HTTP 404)

### 2.4 Amazon data accepted on `POST /api/releases` (create/update)

When CineShelf pushes an edition that was imported from Amazon, all Amazon-
enriched fields should be accepted and stored:

| Field | Type | Notes |
|-------|------|-------|
| `asin` | string | 10-char Amazon identifier |
| `amazon_url` | string | Full product URL |
| `cover_images` | array | `[{type, url, source}]` |
| `languages` | string | Audio languages |
| `dubbed` | string | Languages available dubbed |
| `subtitles` | string | Subtitle languages |
| `audio_formats` | string | e.g. "Dolby Digital 5.1" |

### 2.5 `GET /api/releases/search?asin=…&barcode=…&q=…`

Extend the existing search endpoint to also accept `asin` and `barcode`
parameters so CineShelf can do a combined lookup:

```
GET /api/releases/search?asin=B00005O3VC
GET /api/releases/search?barcode=43396052765
```

---

## 3. CineShelf integration flow (once UMDB implements above)

```
User pastes Amazon URL
  │
  ├─► CineShelf extracts ASIN from URL
  │
  ├─► GET /api/releases/by-asin/:asin   (UMDB)
  │      ├── Found  → pre-fill form from UMDB data (no Amazon scrape needed)
  │      └── 404   → scrape Amazon page → pre-fill form from scraped data
  │
  ├─► User reviews / edits form
  │
  ├─► Save Edition (local DB)
  │
  └─► Optionally: Push to UMDB (POST /api/releases with all fields including
       amazon_url, asin, cover_images array)
```

---

## 4. Cover image handling on UMDB side

Amazon image URLs follow the pattern:
`https://m.media-amazon.com/images/I/{imageId}._SL{size}_.jpg`

Sizes: `SL150`, `SL500`, `SL1200`, `SL1500`

UMDB should:
- Store the base URL without size suffix: `https://m.media-amazon.com/images/I/{imageId}.jpg`
- Serve back with size hint: `cover_image_url_thumb` (e.g. `._SL300_.jpg`) and
  `cover_image_url` (e.g. `._SL1200_.jpg`)
- Or just store the `._SL1500_.jpg` variant as-is — both work

---

## 5. Priority order

| Priority | Feature |
|----------|---------|
| 🔴 High | `GET /api/releases/by-asin/:asin` lookup |
| 🔴 High | Accept `asin`, `amazon_url` on push |
| 🟡 Medium | `release_images` table with `cover_images[]` array |
| 🟡 Medium | Search by `asin` / `barcode` on existing search endpoint |
| 🟢 Nice-to-have | Thumbnail URL generation for cover images |

---

*Generated for UMDB integration — CineShelf v2.9.3*
