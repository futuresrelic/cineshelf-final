# FEATURE_REGISTRY — CineShelf

Tracks which features exist, their status, and where their code lives.

## Core Features

| Feature | Status | Frontend | Backend |
|---------|--------|----------|---------|
| Movie/TV search (TMDB) | ✅ Live | `index.html` | `api.php` → `search_tmdb` |
| Add to collection | ✅ Live | `index.html` | `api.php` → `add_movie` |
| Copy management | ✅ Live | `index.html` | `api.php` → `add_copy`, `update_copy` |
| Box sets / containers | ✅ Live | `index.html` | `api.php` → `add_container` |
| Physical media editions | ✅ Live | `index.html` | `api.php` → `add_edition` |
| UMDB edition push | ✅ Live | `index.html` | `api.php` → `push_edition_to_umdb` |
| Wishlist | ✅ Live | `index.html` | `api.php` → `*_wishlist` actions |
| Groups / shared shelves | ✅ Live | `join-group.html` | `api.php` → `*_group` actions |
| Google OAuth login | ✅ Live | `login.html` | `api/auth.php` |
| AI cover scan (GPT-4o) | ✅ Live | `index.html` | `api.php` → `scan_boxset_cover_fields` |
| AI article extract | ✅ Live | `index.html` | `api.php` → `extract_article_with_ai` |
| Bulk editor | ✅ Live | `index.html` | `api.php` → `list_all_copies_detailed`, `bulk_update_copies` |
| TV show support | ✅ Live | `index.html` | `api.php` (TMDB multi-search) |
| PWA installability | ✅ Live | `service-worker.js`, `manifest.json` | — |
| Admin seed data | ✅ Live | — | `api.php` → `admin_seed_fight_club` |
| User data export | ✅ Live | `user-data-manager.html` | `api.php` |

## Optional / Conditional Features

| Feature | Requires | Graceful if missing? |
|---------|----------|----------------------|
| AI scanning | `OPENAI_API_KEY` | Yes — button hidden |
| UMDB push | `UMDB_API_KEY` | Yes — push disabled |
| Google login | `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | No — app requires auth |

## Versions (from CHANGELOG.md)

- v2.9.0 — Bulk editor, Box Set AI Cover Scanning, Camera Box Set Scanner
- v2.8.0 — TV show support
- v4.0.0 — Physical media editions system
- v4.1.0 — UMDB two-way linking
